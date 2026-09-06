import { spawn, type ChildProcess } from "node:child_process"

import { mkdir } from "node:fs/promises"

import type { AgentRuntimeEvent, AgentRuntimeInput, AgentRuntimeInputV2, OpenCodeProviderConfig } from "../../../../lib/ai-runtime/contracts.js"
import { createOpenCodeServeEventState, createOpenCodeServePromptPayload, createOpenCodeServeSessionPayload, normalizeOpenCodeServeEvent, openCodeServeSessionPath, openCodeServeSessionsPath, readOpenCodeServeSessionId, type OpenCodeServeEventState } from "@coworkany/runtime-contracts/opencode"

type JsonRecord = Record<string, unknown>

type PendingRun = {
  runId: string
  sessionId: string
  sessionKey?: string
  emit: (event: AgentRuntimeEvent) => void
  resolve: (completed: boolean) => void
  timer: ReturnType<typeof setTimeout>
  done: boolean
  serveEvents: OpenCodeServeEventState
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
  private readonly persistentSessions = new Map<string, string>()
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
    const response = await this.request(openCodeServeSessionsPath(sessionDir), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(createOpenCodeServeSessionPayload({
        title: `CoworkAny ${input.agentId || "agent"} ${input.runId}`,
        metadata: {
          aiMarketingRunId: input.runId,
          bundleVersion: this.options.bundleVersion,
          agentId: input.agentId || null,
          bundleKey: input.sharedSkillSetSelection?.bundleKey || null,
          transient: true,
        },
        providerId: provider.providerId,
        modelId: provider.modelId,
      })),
    })
    const payload = await this.readJson(response)
    const sessionId = readOpenCodeServeSessionId(payload)
    if (!response.ok || !sessionId) throw new Error(`opencode_session_create_failed:${diagnostic(payload, response.statusText)}`)
    return sessionId
  }

  async createPersistentSession(input: AgentRuntimeInput | AgentRuntimeInputV2, sessionDir: string, provider: OpenCodeProviderConfig) {
    await this.start()
    const sessionKey = input.sessionKey
    if (!sessionKey) throw new Error("opencode_persistent_session_key_missing")
    const cached = this.persistentSessions.get(sessionKey)
    if (cached) return cached

    const listed = await this.request(openCodeServeSessionsPath(sessionDir), {
      method: "GET",
      headers: { Accept: "application/json" },
    }).then((response) => this.readJson(response).catch(() => null)).catch(() => null)
    const sessions = Array.isArray(listed) ? listed : asRecord(listed)?.data
    if (Array.isArray(sessions)) {
      const existing = sessions.find((item) => {
        const record = asRecord(item)
        const metadata = asRecord(record?.metadata)
        return metadata?.aiMarketingSessionKey === sessionKey
      })
      const existingId = asRecord(existing)?.id
      if (typeof existingId === "string" && existingId) {
        this.persistentSessions.set(sessionKey, existingId)
        return existingId
      }
    }

    const response = await this.request(openCodeServeSessionsPath(sessionDir), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(createOpenCodeServeSessionPayload({
        title: `CoworkAny Writer ${sessionKey}`,
        metadata: {
          aiMarketingSessionKey: sessionKey,
          aiMarketingRunId: input.runId,
          bundleVersion: this.options.bundleVersion,
          agentId: input.agentId || "writer",
          bundleKey: input.sharedSkillSetSelection?.bundleKey || null,
          transient: false,
        },
        providerId: provider.providerId,
        modelId: provider.modelId,
      })),
    })
    const payload = await this.readJson(response)
    const sessionId = readOpenCodeServeSessionId(payload)
    if (!response.ok || !sessionId) throw new Error(`opencode_session_create_failed:${diagnostic(payload, response.statusText)}`)
    this.persistentSessions.set(sessionKey, sessionId)
    return sessionId
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
        sessionKey: input.agentId === "writer" ? input.sessionKey || undefined : undefined,
        emit,
        resolve,
        timer,
        done: false,
        serveEvents: createOpenCodeServeEventState(),
      })
    })
    let response: Response
    try {
      // Use the synchronous message endpoint as the run completion barrier.
      // `prompt_async` returns before the turn finishes, so a missed
      // session.idle event can leave the in-memory session lock held until
      // the one-hour watchdog expires. The message endpoint keeps the HTTP
      // request open until OpenCode has completed the turn, while the global
      // event stream above continues forwarding progress events.
      response = await this.request(openCodeServeSessionPath(sessionId, sessionDir, "message"), {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(createOpenCodeServePromptPayload({ providerId: provider.providerId, modelId: provider.modelId, systemPrompt, prompt: userPrompt })),
      }, this.options.requestTimeoutMs)
    } catch (error) {
      const run = this.pending.get(input.runId)
      if (run) this.finishRun(run, false, { code: "opencode_prompt_request_failed", message: error instanceof Error ? error.message : String(error) })
      return completed
    }
    if (!response.ok && response.status !== 204) {
      const payload = await this.readJson(response)
      const run = this.pending.get(input.runId)
      if (run) this.finishRun(run, false, { code: "opencode_prompt_failed", message: diagnostic(payload, response.statusText) })
    } else {
      // A successful synchronous response is authoritative. Do not wait for
      // SSE idle: that event may be dropped, delayed, or represent the
      // pre-prompt idle state of a persistent session.
      const run = this.pending.get(input.runId)
      if (run) this.finishRun(run, true)
    }
    return completed
  }

  async abort(sessionId: string) {
    const response = await this.request(openCodeServeSessionPath(sessionId, undefined, "abort"), { method: "POST", headers: { Accept: "application/json" } })
    return response.ok || response.status === 404
  }

  async disposeTransientSession(sessionId: string, sessionDir: string) {
    // OpenCode versions that support DELETE release native session state. A
    // missing endpoint is harmless: the session is still never referenced by
    // the platform after run completion.
    await this.request(openCodeServeSessionPath(sessionId, sessionDir), { method: "DELETE", headers: { Accept: "application/json" } }).catch(() => undefined)
  }

  private async request(path: string, init: RequestInit = {}, timeoutMs = Math.min(this.options.requestTimeoutMs, 30_000)) {
    return fetch(`${this.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(Math.min(timeoutMs, this.options.requestTimeoutMs)) })
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
    const normalized = normalizeOpenCodeServeEvent(run.runId, payload, run.serveEvents)
    for (const event of normalized.events) {
      if (event.event === "tool_event") {
        run.emit({ ...event, phase: event.phase === "progress" ? "started" : event.phase })
      } else {
        run.emit(event)
      }
    }
    if (normalized.terminalError) this.finishRun(run, false, normalized.terminalError)
    // Completion is resolved by the synchronous `/message` response. An idle
    // event alone is not sufficient because a reconnect can report stale idle.
  }

  private finishRun(run: PendingRun, completed: boolean, error?: { code: string; message: string }) {
    if (run.done) return
    run.done = true
    clearTimeout(run.timer)
    this.pending.delete(run.runId)
    if (error && run.sessionKey && this.persistentSessions.get(run.sessionKey) === run.sessionId) {
      this.persistentSessions.delete(run.sessionKey)
    }
    if (error) run.emit({ event: "runtime_error", code: error.code, message: error.message, retryable: true, runId: run.runId })
    run.resolve(completed && !error)
  }

}
