import type { AgentRuntimeEvent, AgentRuntimeInput, AgentRuntimeInputV2, OpenCodeProviderConfig } from "@/lib/ai-runtime/contracts"

type FetchLike = typeof fetch

export type RailwaySessionClientOptions = {
  runnerUrl?: string | null
  secret?: string | null
  fetchImpl?: FetchLike
  signal?: AbortSignal
  timeoutMs?: number
}

function endpoint(options: RailwaySessionClientOptions) {
  const runnerUrl = (options.runnerUrl || process.env.RAILWAY_OPENCODE_RUNTIME_URL || "").trim().replace(/\/+$/u, "")
  const secret = (options.secret || process.env.RAILWAY_OPENCODE_RUNTIME_TOKEN || "").trim()
  if (!runnerUrl || !secret) throw new Error("railway_opencode_runtime_not_configured")
  return { runnerUrl, secret, fetchImpl: options.fetchImpl || fetch }
}

function isRuntimeEvent(value: unknown): value is AgentRuntimeEvent {
  if (!value || typeof value !== "object") return false
  const event = (value as { event?: unknown }).event
  return event === "session_ready" || event === "runtime_warning" || event === "runtime_selected" || event === "runtime_started" || event === "agent_resolved" || event === "skill_activated" || event === "skill_completed" || event === "skill_failed" || event === "text_delta" || event === "tool_event" || event === "usage" || event === "artifact_payload" || event === "artifact_reference" || event === "checkpoint_saved" || event === "runtime_error" || event === "done"
}

function parseFrame(frame: string) {
  const data = frame
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
  if (!data) return null
  try {
    return JSON.parse(data) as unknown
  } catch {
    throw new Error("railway_opencode_malformed_sse")
  }
}

async function parseJson<T>(response: Response) {
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`railway_opencode_http_${response.status}:${JSON.stringify(payload).slice(0, 512)}`)
  return payload as T
}

export async function prepareRailwaySession(
  request: { runId: string; sessionKey: string; input: AgentRuntimeInput | AgentRuntimeInputV2; provider: OpenCodeProviderConfig },
  options: RailwaySessionClientOptions = {},
) {
  const { runnerUrl, secret, fetchImpl } = endpoint(options)
  const response = await fetchImpl(`${runnerUrl}/sessions/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify(request),
    signal: options.signal,
  })
  return parseJson<{ prepared: boolean; sessionReady: boolean; sessionKey: string; bundleVersion?: string; contextHash?: string; expiresAt?: string }>(response)
}

export async function enqueueRailwaySessionRun(
  request: { runId: string; sessionKey: string; input: AgentRuntimeInput | AgentRuntimeInputV2; provider: OpenCodeProviderConfig },
  options: RailwaySessionClientOptions = {},
) {
  const { runnerUrl, secret, fetchImpl } = endpoint(options)
  const response = await fetchImpl(`${runnerUrl}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}`, Prefer: "respond-async", "X-Idempotency-Key": request.runId },
    body: JSON.stringify({ input: request.input, provider: request.provider }),
    signal: options.signal,
  })
  return parseJson<{ runId: string; status: "queued" | "running" | "succeeded" | "failed" | "cancelled" }>(response)
}

async function* recoverRun(input: {
  runnerUrl: string
  secret: string
  runId: string
  fetchImpl: FetchLike
  signal?: AbortSignal
  timeoutMs: number
  offset: number
}): AsyncGenerator<AgentRuntimeEvent> {
  const startedAt = Date.now()
  let offset = input.offset
  while (Date.now() - startedAt < input.timeoutMs) {
    if (input.signal?.aborted) throw new Error("railway_opencode_aborted")
    const response = await input.fetchImpl(`${input.runnerUrl}/runs/${encodeURIComponent(input.runId)}`, {
      headers: { Authorization: `Bearer ${input.secret}` },
      signal: input.signal,
    })
    const status = await parseJson<{ status: string; events?: unknown[]; error?: string | null }>(response)
    const events = Array.isArray(status.events) ? status.events : []
    for (const candidate of events.slice(offset)) {
      offset += 1
      if (isRuntimeEvent(candidate)) yield candidate
    }
    if (status.status === "succeeded") return
    if (status.status === "failed" || status.status === "cancelled") throw new Error(status.error || "railway_opencode_run_failed")
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 1_000)
      input.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("railway_opencode_aborted")) }, { once: true })
    })
  }
  throw new Error(`railway_opencode_recovery_timeout:${input.runId}`)
}

export async function* streamRailwaySessionRun(
  input: AgentRuntimeInput | AgentRuntimeInputV2,
  provider: OpenCodeProviderConfig,
  options: RailwaySessionClientOptions = {},
): AsyncGenerator<AgentRuntimeEvent> {
  const { runnerUrl, secret, fetchImpl } = endpoint(options)
  const timeoutMs = options.timeoutMs || Number.parseInt(process.env.RAILWAY_OPENCODE_TIMEOUT_MS || "3600000", 10)
  const response = await fetchImpl(`${runnerUrl}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}`, "X-Idempotency-Key": input.runId },
    body: JSON.stringify({ input, provider }),
    signal: options.signal,
  })
  if (!response.ok || !response.body) throw new Error(`railway_opencode_sse_http_${response.status}`)

  let offset = 0
  let buffer = ""
  let terminalSeen = false
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  try {
    while (true) {
      const result = await reader.read()
      buffer += decoder.decode(result.value || new Uint8Array(), { stream: !result.done })
      let boundary = buffer.indexOf("\n\n")
      while (boundary >= 0) {
        const value = parseFrame(buffer.slice(0, boundary))
        buffer = buffer.slice(boundary + 2)
        if (isRuntimeEvent(value)) {
          offset += 1
          if (value.event === "done" || value.event === "runtime_error") terminalSeen = true
          yield value
        }
        boundary = buffer.indexOf("\n\n")
      }
      if (result.done) break
    }
  } catch (error) {
    if (options.signal?.aborted) throw error
    for await (const event of recoverRun({ runnerUrl, secret, runId: input.runId, fetchImpl, signal: options.signal, timeoutMs, offset })) {
      if (event.event === "done" || event.event === "runtime_error") terminalSeen = true
      yield event
    }
  }
  if (!terminalSeen) {
    for await (const event of recoverRun({ runnerUrl, secret, runId: input.runId, fetchImpl, signal: options.signal, timeoutMs, offset })) {
      if (event.event === "done" || event.event === "runtime_error") terminalSeen = true
      yield event
    }
  }
  if (!terminalSeen) throw new Error("railway_opencode_sse_incomplete")
}
