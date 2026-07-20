import { randomUUID } from "node:crypto"

import type { AgentRuntimeEvent, AgentRuntimeInput, CloudflareOpenCodeRunRequest, OpenCodeProviderConfig } from "@/lib/ai-runtime/contracts"

type FetchLike = typeof fetch

export type CloudflareSandboxClientOptions = {
  runnerUrl?: string | null
  secret?: string | null
  railway?: boolean
  timeoutMs?: number
  fetchImpl?: FetchLike
  signal?: AbortSignal
  provider?: OpenCodeProviderConfig
}

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function sha256(value: string) {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)))
}

export async function createRunnerAuthHeaders(input: {
  body: string
  runId: string
  secret: string
  timestamp?: number
  nonce?: string
}) {
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000)
  const nonce = input.nonce || randomUUID()
  const bodyHash = await sha256(input.body)
  const signature = await hmac(input.secret, `${timestamp}.${nonce}.${bodyHash}`)
  return {
    "Content-Type": "application/json",
    "X-Agent-Runner-Timestamp": String(timestamp),
    "X-Agent-Runner-Nonce": nonce,
    "X-Agent-Runner-Body-SHA256": bodyHash,
    "X-Agent-Runner-Signature": signature,
    "X-Idempotency-Key": input.runId,
  }
}

function parseSseFrame(frame: string) {
  let eventName = "message"
  const dataLines: string[] = []
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim()
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart())
  }
  const data = dataLines.join("\n")
  if (!data) return null
  try {
    return { eventName, payload: JSON.parse(data) as unknown }
  } catch {
    return { eventName, payload: null }
  }
}

function isRuntimeEvent(value: unknown): value is AgentRuntimeEvent {
  if (!value || typeof value !== "object") return false
  const event = (value as { event?: unknown }).event
  return event === "session_ready" || event === "runtime_selected" || event === "runtime_started" || event === "agent_resolved" || event === "skill_activated" || event === "skill_completed" || event === "skill_failed" || event === "text_delta" || event === "tool_event" || event === "usage" || event === "artifact_payload" || event === "runtime_warning" || event === "runtime_error" || event === "done"
}

async function cancelRun(input: {
  runnerUrl: string
  runId: string
  secret: string
  fetchImpl: FetchLike
  railway?: boolean
}) {
  const body = JSON.stringify({ runId: input.runId })
  const headers = input.railway
    ? { "Content-Type": "application/json", Authorization: `Bearer ${input.secret}` }
    : await createRunnerAuthHeaders({ body, runId: input.runId, secret: input.secret })
  await input.fetchImpl(`${input.runnerUrl}/runs/${encodeURIComponent(input.runId)}/cancel`, {
    method: "POST",
    headers,
    body,
  }).catch(() => undefined)
}

async function* recoverRailwayRun(input: {
  runnerUrl: string
  runId: string
  secret: string
  fetchImpl: FetchLike
  signal?: AbortSignal
  timeoutMs: number
  receivedEventCount: number
}): AsyncGenerator<AgentRuntimeEvent> {
  const startedAt = Date.now()
  let offset = input.receivedEventCount
  let lastStatusError = "status_fetch_failed"
  let lastHeartbeatAt = startedAt
  while (Date.now() - startedAt < input.timeoutMs) {
    if (input.signal?.aborted) throw new Error("opencode_runner_aborted")
    let status: { status?: unknown; events?: unknown }
    try {
      const response = await input.fetchImpl(`${input.runnerUrl}/runs/${encodeURIComponent(input.runId)}`, {
        headers: { Authorization: `Bearer ${input.secret}` },
      })
      if (!response.ok) throw new Error(`opencode_runner_status_http_${response.status}`)
      status = await response.json() as { status?: unknown; events?: unknown }
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      lastStatusError = /^opencode_runner_status_http_\d+$/u.test(message) ? message : "status_fetch_failed"
      if (Date.now() - startedAt >= input.timeoutMs) {
        throw new Error(`opencode_runner_railway_recovery_failed:${input.runId}:${lastStatusError}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000))
      continue
    }
    const events = Array.isArray(status.events) ? status.events : []
    for (const candidate of events.slice(offset)) {
      if (!isRuntimeEvent(candidate)) continue
      offset += 1
      yield candidate
    }
    if (status.status === "succeeded") return
    if (status.status === "failed" || status.status === "cancelled") {
      const message = typeof (status as { error?: unknown }).error === "string"
        ? String((status as { error: string }).error)
        : "opencode_runner_run_failed"
      throw new Error(message)
    }
    if (Date.now() - lastHeartbeatAt >= 15_000) {
      lastHeartbeatAt = Date.now()
      yield {
        event: "runtime_warning",
        code: "railway_recovery_waiting",
        message: "OpenCode run is still active on Railway.",
        runId: input.runId,
      }
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 2_000)
      input.signal?.addEventListener("abort", () => {
        clearTimeout(timer)
        reject(new Error("opencode_runner_aborted"))
      }, { once: true })
    })
  }
  throw new Error(`opencode_runner_railway_recovery_failed:${input.runId}:${lastStatusError}`)
}

export async function* streamCloudflareOpenCode(input: AgentRuntimeInput, options: CloudflareSandboxClientOptions = {}): AsyncGenerator<AgentRuntimeEvent> {
  if (!options.provider) throw new Error("opencode_provider_required")
  const railway = options.railway === true || (!options.runnerUrl && Boolean(process.env.RAILWAY_OPENCODE_RUNTIME_URL?.trim()))
  const runnerUrl = (options.runnerUrl || (railway ? process.env.RAILWAY_OPENCODE_RUNTIME_URL : process.env.CLOUDFLARE_OPENCODE_RUNNER_URL) || "").trim().replace(/\/+$/, "")
  const secret = (options.secret || (railway ? process.env.RAILWAY_OPENCODE_RUNTIME_TOKEN : process.env.CLOUDFLARE_OPENCODE_RUNNER_HMAC_SECRET) || "").trim()
  const fetchImpl = options.fetchImpl || fetch
  if (!runnerUrl || !secret) throw new Error("opencode_runner_not_configured")

  const requestBody: CloudflareOpenCodeRunRequest = {
    runId: input.runId,
    input,
    timeoutMs: options.timeoutMs || Number.parseInt(process.env.CLOUDFLARE_OPENCODE_TIMEOUT_MS || "180000", 10),
    provider: options.provider,
  }
  const body = JSON.stringify(requestBody)
  const headers = railway
    ? { "Content-Type": "application/json", Authorization: `Bearer ${secret}`, "X-Idempotency-Key": input.runId, Prefer: "respond-async" }
    : await createRunnerAuthHeaders({ body, runId: input.runId, secret })
  let cancelStarted = false
  const onAbort = () => {
    if (cancelStarted) return
    cancelStarted = true
    void cancelRun({ runnerUrl, runId: input.runId, secret, fetchImpl, railway })
  }
  if (!railway) options.signal?.addEventListener("abort", onAbort, { once: true })

  let terminalSeen = false
  let receivedEventCount = 0
  try {
    try {
      const response = await fetchImpl(`${runnerUrl}/runs`, {
        method: "POST",
        headers,
        body,
        signal: undefined,
      })
      if (railway && response.status === 202) {
        const accepted = await response.json().catch(() => null) as { runId?: unknown } | null
        if (accepted?.runId !== input.runId) throw new Error("opencode_runner_async_accept_invalid")
        throw new Error("opencode_runner_async_accepted")
      }
      if (!response.ok || !response.body) {
        const detail = (await response.text().catch(() => "")).slice(0, 512)
        throw new Error(`opencode_runner_http_${response.status}${detail ? `:${detail}` : ""}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (true) {
        const result = await reader.read()
        buffer += decoder.decode(result.value || new Uint8Array(), { stream: !result.done })
        let boundary = buffer.indexOf("\n\n")
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const parsed = parseSseFrame(frame)
          if (parsed?.payload && isRuntimeEvent(parsed.payload)) {
            const event = parsed.payload
            if (event.runId !== input.runId || terminalSeen) {
              boundary = buffer.indexOf("\n\n")
              continue
            }
            receivedEventCount += 1
            if (event.event === "done" || event.event === "runtime_error") terminalSeen = true
            yield event
          } else if (parsed?.payload === null) {
            throw new Error("opencode_runner_malformed_sse")
          }
          boundary = buffer.indexOf("\n\n")
        }
        if (result.done) break
      }
      if (!terminalSeen) throw new Error("opencode_runner_stream_incomplete")
    } catch (error) {
      if (!railway) throw error
      for await (const event of recoverRailwayRun({
        runnerUrl,
        runId: input.runId,
        secret,
        fetchImpl,
        signal: undefined,
        timeoutMs: options.timeoutMs || Number.parseInt(process.env.RAILWAY_OPENCODE_TIMEOUT_MS || "3600000", 10),
        receivedEventCount,
      })) {
        if (event.event === "done" || event.event === "runtime_error") terminalSeen = true
        yield event
      }
    }
    if (!terminalSeen) throw new Error("opencode_runner_stream_incomplete")
  } finally {
    if (!railway) options.signal?.removeEventListener("abort", onAbort)
  }
}
