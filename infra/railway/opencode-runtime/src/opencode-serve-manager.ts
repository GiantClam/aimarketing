import { spawn, type ChildProcess } from "node:child_process"

import { mkdir } from "node:fs/promises"

import type { AgentRuntimeEvent, AgentRuntimeInput, AgentRuntimeInputV2, OpenCodeProviderConfig } from "../../../../lib/ai-runtime/contracts.js"

type JsonRecord = Record<string, unknown>

type PendingRun = {
  runId: string
  sessionId: string
  emit: (event: AgentRuntimeEvent) => void
  resolve: (completed: boolean) => void
  timer: ReturnType<typeof setTimeout>
  done: boolean
  messageRoles: Map<string, string>
  textLengths: Map<string, number>
}

type OpenCodeServeManagerOptions = {
  runtimeDir: string
  bundleDir: string
  bundleVersion: string
  requestTimeoutMs: number
  command?: string
  port?: number
  hostname?: string
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" ? value as JsonRecord : null
}

function stringValue(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() || ""
}

function diagnostic(value: unknown, fallback: string) {
  const record = asRecord(value)
  const data = asRecord(record?.data)
  const message = stringValue(record?.message, data?.message, record?.name, value)
  return [...(message || fallback)].map((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? " " : character
  }).join("").slice(0, 1024)
}

export class OpenCodeServeManager {
  private readonly options: Required<OpenCodeServeManagerOptions>
  private readonly pending = new Map<string, PendingRun>()
  private child: ChildProcess | null = null
  private eventReady: Promise<void> | null = null
  private eventResolve: (() => void) | null = null
  private started = false
  private childExited = false
  private stopping = false

  constructor(options: OpenCodeServeManagerOptions) {
    this.options = {
      command: "opencode",
      port: 4096,
      hostname: "127.0.0.1",
      ...options,
    }
  }

  private get baseUrl() {
    return `http://${this.options.hostname}:${this.options.port}`
  }

  private directoryQuery(directory: string) {
    return `?directory=${encodeURIComponent(directory)}`
  }

  async start() {
    if (this.started) return
    this.started = true
    await mkdir(this.options.runtimeDir, { recursive: true })
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key !== "OPENCODE_CONFIG_CONTENT" && key !== "OPENCODE_MODEL_HINT" && !/(?:API_KEY|BASE_URL|MODEL|PROVIDER)$/u.test(key)),
    ) as NodeJS.ProcessEnv
    env.OPENCODE_DISABLE_MODELS_FETCH = "true"
    env.OPENCODE_DISABLE_AUTOUPDATE = "true"
    const child = spawn(process.env.OPENCODE_BIN || this.options.command, [
      "serve",
      "--hostname",
      this.options.hostname,
      "--port",
      String(this.options.port),
    ], {
      cwd: this.options.runtimeDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    this.child = child
    this.childExited = false
    child.stdout?.on("data", (chunk: Buffer) => console.log(JSON.stringify({ event: "opencode_serve_stdout", message: chunk.toString("utf8").trim().slice(-1024) })))
    child.stderr?.on("data", (chunk: Buffer) => console.warn(JSON.stringify({ event: "opencode_serve_stderr", message: chunk.toString("utf8").trim().slice(-1024) })))
    child.once("close", (exitCode, signal) => {
      this.childExited = true
      if (!this.stopping) console.error(JSON.stringify({ event: "opencode_serve_exited", exitCode, signal }))
      for (const run of this.pending.values()) this.finishRun(run, false, { code: "opencode_serve_exited", message: "OpenCode serve exited." })
    })
    await this.waitForHealth()
    this.startEventStream()
    await Promise.race([
      this.eventReady,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("opencode_event_stream_timeout")), 15_000)),
    ])
    console.log(JSON.stringify({ event: "opencode_serve_ready", baseUrl: this.baseUrl, port: this.options.port }))
  }

  async stop() {
    this.stopping = true
    for (const run of this.pending.values()) this.finishRun(run, false, { code: "opencode_serve_stopped", message: "OpenCode serve is stopping." })
    this.child?.kill("SIGTERM")
    this.child = null
  }

  isReady() {
    return Boolean(this.child && !this.childExited && this.eventResolve === null && !this.stopping)
  }

  /**
   * Create one native OpenCode session for one platform run. The platform
   * sessionKey is intentionally not used as a persistence key: Supabase owns
   * conversation state and a native session must never survive a run.
   */
  async createTransientSession(input: AgentRuntimeInput | AgentRuntimeInputV2, sessionDir: string, provider: OpenCodeProviderConfig) {
    await this.start()
    const response = await this.request(`/session${this.directoryQuery(sessionDir)}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `AI Marketing ${input.agentId || "agent"} ${input.runId}`,
        agent: "build",
        model: { id: provider.modelId, providerID: provider.providerId },
        metadata: {
          aiMarketingRunId: input.runId,
          bundleVersion: this.options.bundleVersion,
          agentId: input.agentId || null,
          bundleKey: input.sharedSkillSetSelection?.bundleKey || null,
          transient: true,
        },
      }),
    })
    const payload = await this.readJson(response)
    if (!response.ok || !asRecord(payload)?.id) throw new Error(`opencode_session_create_failed:${diagnostic(payload, response.statusText)}`)
    return String(asRecord(payload)?.id)
  }

  async prompt(input: AgentRuntimeInput | AgentRuntimeInputV2, sessionId: string, sessionDir: string, provider: OpenCodeProviderConfig, systemPrompt: string, userPrompt: string, emit: (event: AgentRuntimeEvent) => void) {
    await this.start()
    if (this.pending.values().some((run) => run.sessionId === sessionId)) throw new Error("opencode_session_busy")
    const completed = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        const run = this.pending.get(input.runId)
        if (run) this.finishRun(run, false, { code: "opencode_prompt_timeout", message: "OpenCode session timed out." })
      }, this.options.requestTimeoutMs)
      this.pending.set(input.runId, {
        runId: input.runId,
        sessionId,
        emit,
        resolve,
        timer,
        done: false,
        messageRoles: new Map(),
        textLengths: new Map(),
      })
    })
    let response: Response
    try {
      response = await this.request(`/session/${encodeURIComponent(sessionId)}/prompt_async${this.directoryQuery(sessionDir)}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "build",
          model: { providerID: provider.providerId, modelID: provider.modelId },
          system: systemPrompt,
          parts: [{ type: "text", text: userPrompt }],
        }),
      })
    } catch (error) {
      const run = this.pending.get(input.runId)
      if (run) this.finishRun(run, false, { code: "opencode_prompt_request_failed", message: error instanceof Error ? error.message : String(error) })
      return completed
    }
    if (!response.ok && response.status !== 204) {
      const payload = await this.readJson(response)
      const run = this.pending.get(input.runId)
      if (run) this.finishRun(run, false, { code: "opencode_prompt_failed", message: diagnostic(payload, response.statusText) })
    }
    return completed
  }

  async abort(sessionId: string) {
    const response = await this.request(`/session/${encodeURIComponent(sessionId)}/abort`, { method: "POST", headers: { Accept: "application/json" } })
    return response.ok || response.status === 404
  }

  async disposeTransientSession(sessionId: string, sessionDir: string) {
    // OpenCode versions that support DELETE release native session state. A
    // missing endpoint is harmless: the session is still never referenced by
    // the platform after run completion.
    await this.request(`/session/${encodeURIComponent(sessionId)}${this.directoryQuery(sessionDir)}`, { method: "DELETE", headers: { Accept: "application/json" } }).catch(() => undefined)
  }

  private async request(path: string, init: RequestInit = {}) {
    return fetch(`${this.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(Math.min(this.options.requestTimeoutMs, 30_000)) })
  }

  private async readJson(response: Response) {
    return response.json().catch(() => null) as Promise<unknown>
  }

  private async waitForHealth() {
    const deadline = Date.now() + Math.min(this.options.requestTimeoutMs, 60_000)
    let lastError = "unknown"
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${this.baseUrl}/global/health`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(2_000) })
        const payload = await this.readJson(response)
        if (response.ok && asRecord(payload)?.healthy === true) return
        lastError = diagnostic(payload, response.statusText)
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error(`opencode_serve_health_timeout:${lastError}`)
  }

  private startEventStream() {
    if (this.eventReady) return
    this.eventReady = new Promise<void>((resolve) => { this.eventResolve = resolve })
    void this.eventLoop()
  }

  private async eventLoop() {
    while (!this.stopping) {
      try {
        const response = await fetch(`${this.baseUrl}/global/event`, { headers: { Accept: "text/event-stream" }, signal: AbortSignal.timeout(this.options.requestTimeoutMs) })
        if (!response.ok || !response.body) throw new Error(`opencode_event_http_${response.status}`)
        this.eventResolve?.()
        this.eventResolve = null
        let buffer = ""
        const reader = response.body.getReader()
        while (!this.stopping) {
          const chunk = await reader.read()
          buffer += new TextDecoder().decode(chunk.value || new Uint8Array(), { stream: !chunk.done })
          let boundary = buffer.indexOf("\n\n")
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            this.handleEventFrame(frame)
            boundary = buffer.indexOf("\n\n")
          }
          if (chunk.done) break
        }
      } catch (error) {
        if (!this.stopping) console.warn(JSON.stringify({ event: "opencode_event_stream_retry", message: error instanceof Error ? error.message : String(error) }))
      }
      if (!this.stopping) await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  private handleEventFrame(frame: string) {
    const data = frame.split(/\r?\n/u).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n")
    if (!data) return
    let payload: unknown
    try { payload = JSON.parse(data) } catch { return }
    const envelope = asRecord(payload)
    const record = asRecord(envelope?.payload) || envelope
    const properties = asRecord(record?.properties)
    const sessionId = stringValue(properties?.sessionID)
    if (!sessionId) return
    const run = [...this.pending.values()].find((candidate) => candidate.sessionId === sessionId)
    if (!run) return
    const type = stringValue(record?.type)
    if (type === "message.updated") {
      const info = asRecord(properties?.info)
      const messageId = stringValue(info?.id)
      if (messageId) run.messageRoles.set(messageId, stringValue(info?.role))
      return
    }
    if (type === "message.part.updated") {
      const part = asRecord(properties?.part)
      const messageId = stringValue(part?.messageID)
      if (messageId && run.messageRoles.get(messageId) === "user") return
      const partType = stringValue(part?.type)
      if (partType === "text") {
        const text = typeof part?.text === "string" ? part.text : ""
        const id = stringValue(part?.id) || messageId || "text"
        const previousLength = run.textLengths.get(id) || 0
        const delta = text.startsWith(text.slice(0, previousLength)) ? text.slice(previousLength) : text
        run.textLengths.set(id, text.length)
        if (delta) run.emit({ event: "text_delta", delta, runId: run.runId })
        return
      }
      if (partType === "tool") {
        const state = asRecord(part?.state)
        const status = stringValue(state?.status, part?.status).toLowerCase()
        const phase = status === "error" || status === "failed" ? "failed" : status === "completed" || status === "success" ? "completed" : "started"
        run.emit({ event: "tool_event", tool: stringValue(part?.tool, part?.name) || "tool", phase, ...(stringValue(state?.title, state?.message) ? { message: diagnostic(stringValue(state?.title, state?.message), "") } : {}), runId: run.runId })
        return
      }
      if (partType === "step-finish" || partType === "step_finish") {
        const tokens = asRecord(part?.tokens)
        const inputTokens = typeof tokens?.input === "number" ? tokens.input : undefined
        const outputTokens = typeof tokens?.output === "number" ? tokens.output : undefined
        const costUsd = typeof part?.cost === "number" ? part.cost : undefined
        if (inputTokens !== undefined || outputTokens !== undefined || costUsd !== undefined) run.emit({ event: "usage", ...(inputTokens === undefined ? {} : { inputTokens }), ...(outputTokens === undefined ? {} : { outputTokens }), ...(costUsd === undefined ? {} : { costUsd }), runId: run.runId })
        return
      }
      return
    }
    if (type === "session.error") {
      this.finishRun(run, false, { code: "opencode_error", message: diagnostic(properties?.error, "OpenCode runtime failed.") })
      return
    }
    if (type === "session.idle") {
      this.finishRun(run, true)
      return
    }
    if (type === "session.status") {
      const status = asRecord(properties?.status)
      if (stringValue(status?.type).toLowerCase() === "idle") this.finishRun(run, true)
    }
  }

  private finishRun(run: PendingRun, completed: boolean, error?: { code: string; message: string }) {
    if (run.done) return
    run.done = true
    clearTimeout(run.timer)
    this.pending.delete(run.runId)
    if (error) run.emit({ event: "runtime_error", code: error.code, message: error.message, retryable: true, runId: run.runId })
    run.resolve(completed && !error)
  }

}
