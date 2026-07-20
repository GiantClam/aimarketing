import { createOpencode } from "@cloudflare/sandbox/opencode"
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import type { AgentRuntimeEvent, AgentRuntimeInputV2, OpenCodeProviderConfig } from "../../../../lib/ai-runtime/contracts"
import { buildOpenCodeSystemPrompt, buildOpenCodeUserPrompt } from "../../../../lib/ai-runtime/opencode-prompt"
import { runOpenCode } from "./opencode"
import { buildRuntimeConfig } from "./opencode-runtime-config"
import { providerRuntimeKey } from "./opencode-provider"

type OpenCodeSandbox = Parameters<typeof createOpencode>[0]

function promptTools(input: AgentRuntimeInputV2) {
  if (input.agentId !== "executive-presentation-ppt") return undefined
  return {
    bash: true,
    read: true,
    write: true,
    edit: true,
    glob: true,
    grep: true,
    list: true,
    skill: true,
    question: false,
    todowrite: true,
    lsp: true,
    doom_loop: true,
    websearch: input.policy.allowNetwork,
    webfetch: input.policy.allowNetwork,
  }
}

function sessionEventId(value: unknown) {
  const payload = eventPayload(value)
  if (!payload) return ""
  const properties = payload.properties
  if (!properties || typeof properties !== "object") return ""
  const direct = (properties as { sessionID?: unknown }).sessionID
  if (typeof direct === "string") return direct
  const part = (properties as { part?: unknown }).part
  if (part && typeof part === "object" && typeof (part as { sessionID?: unknown }).sessionID === "string") {
    return String((part as { sessionID: string }).sessionID)
  }
  const info = (properties as { info?: unknown }).info
  if (info && typeof info === "object" && typeof (info as { sessionID?: unknown }).sessionID === "string") {
    return String((info as { sessionID: string }).sessionID)
  }
  return ""
}

function eventPayload(value: unknown) {
  if (!value || typeof value !== "object") return null
  const rawData = (value as { data?: unknown }).data
  const parsedData = typeof rawData === "string" ? (() => {
    try { return JSON.parse(rawData) as unknown } catch { return null }
  })() : rawData
  const candidate = parsedData && typeof parsedData === "object" ? parsedData : value
  const direct = candidate as { type?: unknown; properties?: unknown }
  if (typeof direct.type === "string" && direct.properties && typeof direct.properties === "object") return direct as { type?: unknown; properties?: unknown }
  const payload = (candidate as { payload?: unknown }).payload
  return payload && typeof payload === "object" ? payload as { type?: unknown; properties?: unknown } : null
}

function resolvedSkillId(input: AgentRuntimeInputV2, part: Record<string, unknown>) {
  const selected = new Set(input.sharedSkillSetSelection?.skills.map((skill) => skill.id) || [])
  if (selected.size === 0) return null
  const state = part.state && typeof part.state === "object" ? part.state as Record<string, unknown> : {}
  const candidates = [part.input, part.args, state.input, state.args]
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue
    const record = candidate as Record<string, unknown>
    const value = typeof record.name === "string" ? record.name : typeof record.skillId === "string" ? record.skillId : ""
    if (selected.has(value)) return value
  }
  return null
}

function responseDiagnostic(value: unknown) {
  if (!value || typeof value !== "object") return "unknown"
  const record = value as { response?: { status?: unknown }; error?: unknown }
  const status = typeof record.response?.status === "number" ? `status=${record.response.status}` : "status=unknown"
  const error = record.error
  if (!error) return status
  if (typeof error === "string") return `${status} error=${error.slice(0, 240)}`
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string") return `${status} error=${message.slice(0, 240)}`
    try {
      const details = JSON.stringify(error, (key, nested) => /key|secret|token|password/i.test(key) ? "[redacted]" : nested)
      return `${status} error=${details.slice(0, 240)}`
    } catch {
      return `${status} error=provider_response_error`
    }
  }
  return `${status} error=provider_response_error`
}

export class OpenCodeServerSession {
  private result: Awaited<ReturnType<typeof createOpencode<OpencodeClient>>> | null = null
  private sessionId: string | null = null
  private directory: string | null = null
  private sandbox: OpenCodeSandbox | null = null
  private provider: OpenCodeProviderConfig | null = null
  private turnAbortController: AbortController | null = null
  private cliContinuation = false
  private readonly partText = new Map<string, string>()
  private readonly toolParts = new Set<string>()
  private readonly skillToolPhases = new Map<string, "started" | "completed" | "failed">()

  private *skillEvents(input: AgentRuntimeInputV2, part: Record<string, unknown>, phase: "started" | "completed" | "failed") : Generator<AgentRuntimeEvent> {
    if (part.tool !== "skill" || typeof part.id !== "string") return
    const skillId = resolvedSkillId(input, part)
    if (!skillId || this.skillToolPhases.get(part.id) === phase) return
    this.skillToolPhases.set(part.id, phase)
    if (phase === "started") yield { event: "skill_activated", skillId, runId: input.runId }
    else if (phase === "completed") yield { event: "skill_completed", skillId, runId: input.runId }
    else yield { event: "skill_failed", skillId, message: "OpenCode skill invocation failed.", runId: input.runId }
  }

  get currentSessionId() {
    return this.sessionId
  }

  async ensure(
    sandbox: OpenCodeSandbox,
    input: AgentRuntimeInputV2,
    directory: string,
    storedSessionId: string | null,
    provider: OpenCodeProviderConfig,
  ) {
    this.provider = provider

    // Dashi uses the same CLI surface as the known-good Railway runtime. Do
    // not boot a second SDK server in front of it: both processes would share
    // the same OpenCode HOME/session database and can block each other.
    if (input.agentId === "executive-presentation-ppt") {
      this.directory = directory
      this.sandbox = sandbox
      this.cliContinuation = storedSessionId === "cli"
      this.sessionId = null
      return "cli"
    }

    // `createOpencode()` closes its HTTP proxy over the Sandbox handle passed
    // at construction. A restored Durable Object gets a fresh handle for the
    // same session key; reusing the old client then proxies to a container
    // that may have slept or been replaced, producing a false :4096 failure.
    // Close the old OpenCode process before recreating: the SDK otherwise
    // trusts a process table entry as healthy without rechecking its port.
    const clientStale = Boolean(this.result) && (this.directory !== directory || this.sandbox !== sandbox)
    if (clientStale) {
      await this.result!.server.close().catch(() => undefined)
      this.result = null
    }
    if (!this.result) {
      const runtimeProvider = providerRuntimeKey(provider.providerId)
      this.result = await createOpencode<OpencodeClient>(sandbox, {
        directory,
          // The SDK's generated Config subpath is not exported by all pinned
          // package builds. The pure config builder is covered independently.
          config: buildRuntimeConfig(input, provider) as never,
        env: {
          HOME: `${directory}/runtime-home`,
          TMPDIR: `${directory}/runtime-home/tmp`,
          OPENCODE_DISABLE_MODELS_FETCH: "true",
          OPENCODE_DISABLE_AUTOUPDATE: "true",
          OPENCODE_ENABLE_EXA: input.agentId === "executive-presentation-ppt" && input.policy.allowNetwork ? "true" : "false",
          [runtimeProvider.envKey]: provider.apiKey,
        },
      })
      this.directory = directory
      this.sandbox = sandbox
    }
    if (storedSessionId) {
      this.sessionId = storedSessionId
      return this.sessionId
    }
    if (!this.sessionId) {
      const created = await this.result.client.session.create({ directory })
      const session = created.data
      if (!session || typeof session !== "object" || typeof session.id !== "string") throw new Error(`opencode_session_create_failed:${responseDiagnostic(created)}`)
      this.sessionId = session.id
    }
    return this.sessionId
  }

  async *executeTurn(input: AgentRuntimeInputV2): AsyncGenerator<AgentRuntimeEvent> {
    if (!this.directory || !this.sandbox) throw new Error("opencode_session_not_ready")
    if (input.agentId !== "executive-presentation-ppt" && (!this.result || !this.sessionId)) throw new Error("opencode_session_not_ready")
    const sessionId = this.sessionId
    const directory = this.directory

    // The Cloudflare SDK session transport can keep a Grok-compatible
    // `/session/{id}/message` request open without forwarding any events. The
    // known-good Railway path and the Cloudflare Dashi canary both use the
    // OpenCode CLI, so keep Dashi on that same execution surface while the
    // SDK remains available for ordinary conversational turns.
    if (input.agentId === "executive-presentation-ppt") {
      if (!this.sandbox) throw new Error("opencode_sandbox_not_ready")
      const controller = new AbortController()
      this.turnAbortController = controller
      try {
        const runDir = `${directory}/turns/${input.runId}`
        yield* runOpenCode(
          this.sandbox,
          runDir,
          input,
          controller.signal,
          3_600_000,
          this.provider!,
          {
            workingDir: directory,
            promptPath: `${runDir}/prompt.md`,
            homeDir: `${directory}/runtime-home`,
            sessionId,
            continueSession: this.cliContinuation,
            agent: "build",
            skipPermissions: true,
          },
        )
        this.cliContinuation = true
      } finally {
        this.turnAbortController = null
      }
      return
    }

    const result = this.result
    if (!result || !sessionId) throw new Error("opencode_session_not_ready")
    let idleSeen = false
    let turnStarted = false
    let sessionErrorSeen = false
    const deadline = Date.now() + 3_600_000
    // Subscribe before submitting the prompt. Tool calls can begin immediately
    // after the request starts, so a late subscription can miss Dashi's
    // render/QA events and make a completed run appear artifact-less.
    let events = await result.client.event.subscribe({ directory }, { sseMaxRetryAttempts: 0 })
    // Start the synchronous message request without awaiting it here.  This
    // gives us the reliable completion semantics of `/message` while the SSE
    // subscription below continues forwarding text/tool progress.
    const prompt = result.client.session.prompt({
      sessionID: sessionId,
      directory,
      model: { providerID: providerRuntimeKey(this.provider!.providerId).configKey, modelID: this.provider!.modelId },
      agent: input.agentId === "executive-presentation-ppt" ? "build" : undefined,
      system: buildOpenCodeSystemPrompt(input),
      tools: promptTools(input),
      // Keep the session transport, but send the runtime contract through the
      // native system field and the current request as the user text. The old
      // wrapper put both into one user message, weakening instruction
      // precedence and duplicating the current request in runtime context.
      parts: [{ type: "text", text: buildOpenCodeUserPrompt(input) }],
    })
    let promptFinished = false
    let promptFailure: unknown = null
    void prompt.then(() => {
      promptFinished = true
      // Completion of the synchronous endpoint proves this is not the
      // pre-prompt idle state, even if the event stream dropped intermediate
      // status messages.
      turnStarted = true
    }).catch((error) => {
      promptFinished = true
      promptFailure = error
    })
    while ((!idleSeen || !promptFinished) && !sessionErrorSeen && Date.now() < deadline) {
      const iterator = events.stream[Symbol.asyncIterator]()
      let nextEvent = iterator.next()
      let streamTimedOut = false
      while (true) {
        const next = await Promise.race([
          nextEvent,
          new Promise<IteratorResult<unknown>>((resolve) => setTimeout(() => resolve({ value: undefined, done: true }), 1_000)),
        ])
        if (next.done && !promptFinished) streamTimedOut = true
        if (next.done) break
        const payload = eventPayload(next.value)
        const eventSessionId = sessionEventId(next.value)
        // Some OpenCode event transports omit sessionID on global/tool events.
        // A SessionCoordinator owns one OpenCode session, so retain those
        // events instead of silently dropping tool progress.
        if ((eventSessionId && eventSessionId !== sessionId) || !payload) {
          nextEvent = iterator.next()
          continue
        }
        const properties = payload.properties && typeof payload.properties === "object" ? payload.properties as Record<string, unknown> : {}
        if (payload.type === "message.part.updated") {
          turnStarted = true
          const part = properties.part && typeof properties.part === "object" ? properties.part as Record<string, unknown> : null
          const partId = typeof part?.id === "string" ? part.id : ""
          if (part?.type === "text" && partId) {
            const fullText = typeof part.text === "string" ? part.text : ""
            const previous = this.partText.get(partId) || ""
            const delta = typeof properties.delta === "string" ? properties.delta : fullText.slice(previous.length)
            this.partText.set(partId, fullText)
            if (delta) yield { event: "text_delta", delta, runId: input.runId }
          }
          if (part?.type === "tool" && typeof part.tool === "string") {
            if (partId) this.toolParts.add(partId)
            const state = part.state && typeof part.state === "object" ? part.state as Record<string, unknown> : {}
            const phase = state.status === "completed" ? "completed" : state.status === "error" ? "failed" : "started"
            const title = typeof state.title === "string" ? state.title.trim().slice(0, 240) : ""
            yield { event: "tool_event", tool: part.tool, phase, ...(title ? { message: title } : {}), runId: input.runId }
            yield* this.skillEvents(input, part, phase)
          }
        } else if (payload.type === "message.updated") {
          turnStarted = true
          const info = properties.info && typeof properties.info === "object" ? properties.info as Record<string, unknown> : {}
          const tokens = info.tokens && typeof info.tokens === "object" ? info.tokens as Record<string, unknown> : {}
          if (typeof tokens.input === "number" || typeof tokens.output === "number" || typeof info.cost === "number") {
            yield { event: "usage", inputTokens: typeof tokens.input === "number" ? tokens.input : undefined, outputTokens: typeof tokens.output === "number" ? tokens.output : undefined, costUsd: typeof info.cost === "number" ? info.cost : undefined, runId: input.runId }
          }
        } else if (payload.type === "session.error") {
          turnStarted = true
          const error = properties.error && typeof properties.error === "object" ? properties.error as Record<string, unknown> : {}
          const details = error.data && typeof error.data === "object" ? error.data as Record<string, unknown> : error
          yield { event: "runtime_error", code: "opencode_session_error", message: typeof details.message === "string" ? details.message.slice(0, 1024) : "OpenCode session error.", retryable: true, runId: input.runId }
          sessionErrorSeen = true
          break
        } else if (payload.type === "session.status") {
          const status = properties.status && typeof properties.status === "object" ? properties.status as Record<string, unknown> : {}
          if (status.type !== "idle") turnStarted = true
          if (status.type === "idle" && turnStarted && promptFinished) {
            idleSeen = true
            break
          }
        } else if (payload.type === "session.idle") {
          if (turnStarted && promptFinished) {
            idleSeen = true
            break
          }
        }
        nextEvent = iterator.next()
      }
      if (streamTimedOut && iterator.return) await iterator.return(undefined).catch(() => undefined)
      if (idleSeen || sessionErrorSeen) break
      events = await result.client.event.subscribe({ directory }, { sseMaxRetryAttempts: 0 })
      try {
        const status = await result.client.session.status({ directory })
        const current = status.data && typeof status.data === "object" ? (status.data as Record<string, unknown>)[sessionId] : null
        if (current && typeof current === "object") {
          const statusType = (current as { type?: unknown }).type
          if (statusType !== "idle") turnStarted = true
          if (statusType === "idle" && turnStarted && promptFinished) idleSeen = true
        }
      } catch {
        // A transient container fetch failure is handled by reconnecting.
      }
      if (!idleSeen) {
        try {
          const history = await result.client.session.messages({ sessionID: sessionId, directory, limit: 20 })
          const items = Array.isArray(history.data) ? history.data : []
          if (turnStarted && promptFinished && items.some((item) => {
            const record = item as { info?: { role?: unknown; time?: { completed?: unknown } } }
            return record.info?.role === "assistant" && typeof record.info.time?.completed === "number"
          })) idleSeen = true
        } catch {
          // History may be temporarily unavailable while the container reconnects.
        }
      }
      if (!idleSeen) await new Promise((resolve) => setTimeout(resolve, 500))
    }
    if (promptFailure) throw promptFailure instanceof Error ? promptFailure : new Error("opencode_prompt_failed")
    if (!idleSeen && !sessionErrorSeen) throw new Error("opencode_session_event_stream_incomplete")
    if (idleSeen) {
      const messages = await result.client.session.messages({ sessionID: sessionId, directory, limit: 20 }).catch(() => ({ data: [] }))
      const items = Array.isArray(messages.data) ? messages.data : []
      for (const item of items) {
        const record = item as { info?: { role?: unknown }; parts?: unknown[] }
        if (record.info?.role !== "assistant" || !Array.isArray(record.parts)) continue
        for (const rawPart of record.parts) {
          const part = rawPart && typeof rawPart === "object" ? rawPart as { id?: unknown; type?: unknown; text?: unknown; tool?: unknown; state?: unknown } : {}
          if (part.type === "tool" && typeof part.id === "string" && typeof part.tool === "string" && !this.toolParts.has(part.id)) {
            const state = part.state && typeof part.state === "object" ? part.state as { status?: unknown; title?: unknown } : {}
            const phase = state.status === "completed" ? "completed" : state.status === "error" ? "failed" : "started"
            const title = typeof state.title === "string" ? state.title.trim().slice(0, 240) : ""
            this.toolParts.add(part.id)
            yield { event: "tool_event", tool: part.tool, phase, ...(title ? { message: title } : {}), runId: input.runId }
            yield* this.skillEvents(input, part, phase)
            continue
          }
          if (part.type !== "text" || typeof part.id !== "string" || typeof part.text !== "string") continue
          const previous = this.partText.get(part.id) || ""
          const delta = part.text.slice(previous.length)
          this.partText.set(part.id, part.text)
          if (delta) yield { event: "text_delta", delta, runId: input.runId }
        }
      }
    }
  }

  async abort() {
    this.turnAbortController?.abort()
    if (!this.result || !this.sessionId) return
    await this.result.client.session.abort({ sessionID: this.sessionId, directory: this.directory || undefined })
  }
}
