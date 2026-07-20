import { randomUUID } from "node:crypto"

import type { AgentRuntimeEvent, CloudflareSessionPrepareRequest, CloudflareSessionRunRequest } from "@/lib/ai-runtime/contracts"
import { createRunnerAuthHeaders } from "./cloudflare-sandbox-client"

type FetchLike = typeof fetch

export type CloudflareSessionClientOptions = {
  runnerUrl?: string | null
  secret?: string | null
  fetchImpl?: FetchLike
  signal?: AbortSignal
}

type SessionAcceptedResponse = { accepted: boolean; runId: string; sessionKey: string; status: string }
type EventTicketResponse = { eventsUrl: string; eventToken: string; expiresAt: string }
export type CloudflareSessionRunStatus = {
  runId: string
  sessionKey: string
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out"
  error?: string
}

const RUNNER_RETRY_DELAYS_MS = [200, 500, 1_000]

function isRetryableRunnerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const causeCode = error && typeof error === "object" && "cause" in error
    ? String((error as { cause?: { code?: unknown } }).cause?.code || "")
    : ""
  return (
    ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "EAI_AGAIN"].includes(causeCode) ||
    /(?:fetch failed|network|timeout|connection reset|connection refused|socket)/iu.test(message) ||
    /opencode_runner_http_(?:429|502|503|504):/u.test(message)
  )
}

async function sleepBeforeRunnerRetry(delayMs: number, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError")
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs)
    signal?.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(new DOMException("The operation was aborted", "AbortError"))
    }, { once: true })
  })
}

async function withRunnerRetry<T>(operation: () => Promise<T>, signal?: AbortSignal) {
  let lastError: unknown
  for (let attempt = 0; attempt <= RUNNER_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt >= RUNNER_RETRY_DELAYS_MS.length || !isRetryableRunnerError(error)) throw error
      await sleepBeforeRunnerRetry(RUNNER_RETRY_DELAYS_MS[attempt], signal)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function endpoint(options: CloudflareSessionClientOptions) {
  const runnerUrl = (options.runnerUrl || process.env.CLOUDFLARE_OPENCODE_RUNNER_URL || "").trim().replace(/\/+$/, "")
  const secret = (options.secret || process.env.CLOUDFLARE_OPENCODE_RUNNER_HMAC_SECRET || "").trim()
  if (!runnerUrl || !secret) throw new Error("opencode_runner_not_configured")
  return { runnerUrl, secret, fetchImpl: options.fetchImpl || fetch }
}

async function parseJson<T>(response: Response) {
  const value = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`opencode_runner_http_${response.status}:${JSON.stringify(value).slice(0, 512)}`)
  return value as T
}

function isRuntimeEvent(value: unknown): value is AgentRuntimeEvent {
  if (!value || typeof value !== "object") return false
  const event = (value as { event?: unknown }).event
  return event === "run_queued" || event === "session_ready" || event === "runtime_selected" || event === "runtime_started" || event === "agent_resolved" || event === "skill_activated" || event === "skill_completed" || event === "skill_failed" || event === "text_delta" || event === "tool_event" || event === "usage" || event === "artifact_payload" || event === "artifact_reference" || event === "checkpoint_saved" || event === "runtime_warning" || event === "runtime_error" || event === "done"
}

function parseSseFrame(frame: string) {
  let id = ""
  const data: string[] = []
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith("id:")) id = line.slice(3).trim()
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart())
  }
  if (data.length === 0) return null
  try { return { id, value: JSON.parse(data.join("\n")) as unknown } } catch { throw new Error("opencode_runner_malformed_sse") }
}

export async function enqueueCloudflareSessionRun(request: CloudflareSessionRunRequest, options: CloudflareSessionClientOptions = {}) {
  const { runnerUrl, secret, fetchImpl } = endpoint(options)
  const body = JSON.stringify(request)
  return withRunnerRetry(async () => {
    const headers = await createRunnerAuthHeaders({ body, runId: request.runId, secret, nonce: randomUUID() })
    const response = await fetchImpl(`${runnerUrl}/v2/runs`, { method: "POST", headers, body, signal: options.signal })
    return parseJson<SessionAcceptedResponse>(response)
  }, options.signal)
}

export async function prepareCloudflareSession(request: CloudflareSessionPrepareRequest, options: CloudflareSessionClientOptions = {}) {
  const { runnerUrl, secret, fetchImpl } = endpoint(options)
  const body = JSON.stringify(request)
  return withRunnerRetry(async () => {
    const headers = await createRunnerAuthHeaders({ body, runId: request.runId, secret, nonce: randomUUID() })
    const response = await fetchImpl(`${runnerUrl}/v2/sessions/prepare`, { method: "POST", headers, body, signal: options.signal })
    return parseJson<{
      prepared: boolean
      sessionKey: string
      sharedSkillSet?: { cacheHit: boolean; r2Read: boolean }
    }>(response)
  }, options.signal)
}

export async function getCloudflareSessionRun(input: { runId: string }, options: CloudflareSessionClientOptions = {}) {
  const { runnerUrl, fetchImpl } = endpoint(options)
  return withRunnerRetry(async () => {
    const response = await fetchImpl(`${runnerUrl}/v2/runs/${encodeURIComponent(input.runId)}`, { signal: options.signal })
    return parseJson<CloudflareSessionRunStatus>(response)
  }, options.signal)
}

export async function getCloudflareSessionEventTicket(input: { runId: string; sessionKey: string }, options: CloudflareSessionClientOptions = {}) {
  const { runnerUrl, secret, fetchImpl } = endpoint(options)
  const body = JSON.stringify(input)
  return withRunnerRetry(async () => {
    const headers = await createRunnerAuthHeaders({ body, runId: input.runId, secret, nonce: randomUUID() })
    const response = await fetchImpl(`${runnerUrl}/v2/runs/${encodeURIComponent(input.runId)}/event-ticket`, { method: "POST", headers, body, signal: options.signal })
    return parseJson<EventTicketResponse>(response)
  }, options.signal)
}

export async function* subscribeCloudflareSessionRun(ticket: EventTicketResponse, options: { fetchImpl?: FetchLike; signal?: AbortSignal; lastEventId?: string } = {}): AsyncGenerator<AgentRuntimeEvent> {
  const response = await withRunnerRetry(() => (options.fetchImpl || fetch)(ticket.eventsUrl, { headers: { Authorization: `Bearer ${ticket.eventToken}`, ...(options.lastEventId ? { "Last-Event-ID": options.lastEventId } : {}) }, signal: options.signal }), options.signal)
  if (!response.ok || !response.body) throw new Error(`opencode_runner_events_http_${response.status}`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const result = await reader.read()
    buffer += decoder.decode(result.value || new Uint8Array(), { stream: !result.done })
    let boundary = buffer.indexOf("\n\n")
    while (boundary >= 0) {
      const frame = parseSseFrame(buffer.slice(0, boundary))
      buffer = buffer.slice(boundary + 2)
      if (frame && isRuntimeEvent(frame.value)) yield frame.value
      boundary = buffer.indexOf("\n\n")
    }
    if (result.done) break
  }
}

export async function cancelCloudflareSessionRun(input: { runId: string; sessionKey: string }, options: CloudflareSessionClientOptions = {}) {
  const { runnerUrl, secret, fetchImpl } = endpoint(options)
  const body = JSON.stringify(input)
  return withRunnerRetry(async () => {
    const headers = await createRunnerAuthHeaders({ body, runId: input.runId, secret, nonce: randomUUID() })
    const response = await fetchImpl(`${runnerUrl}/v2/runs/${encodeURIComponent(input.runId)}/cancel`, { method: "POST", headers, body, signal: options.signal })
    return parseJson<{ ok: boolean; runId: string; status: string }>(response)
  }, options.signal)
}
