import type { AgentRuntimeEvent, AgentRuntimeInput, AgentRuntimeInputV2, OpenCodeProviderConfig } from "@/lib/ai-runtime/contracts"
import { enqueueCloudflareSessionRun, getCloudflareSessionEventTicket, prepareCloudflareSession, subscribeCloudflareSessionRun } from "./cloudflare-session-client"
import { prepareRailwaySession, streamRailwaySessionRun } from "./railway-session-client"
import { buildAgentRuntimeSessionKey } from "@/lib/ai-runtime/session-key"

export type RunOpenCodeAgentOptions = {
  runnerUrl?: string | null
  secret?: string | null
  backend?: "cloudflare-opencode-session" | "railway-opencode"
  railway?: boolean
  timeoutMs?: number
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  provider?: OpenCodeProviderConfig
  session?: boolean
}

async function* streamCloudflareSession(
  input: AgentRuntimeInputV2,
  provider: OpenCodeProviderConfig,
  options: RunOpenCodeAgentOptions,
) {
  const request = {
    runId: input.runId,
    sessionKey: input.sessionKey,
    input,
    deadlineMs: 3_600_000 as const,
    provider,
  }
  const prepared = await prepareCloudflareSession(request, options)
  if (!prepared.prepared) throw new Error("cloudflare_opencode_session_not_ready")
  yield { event: "session_ready", runId: input.runId, sessionKey: input.sessionKey } satisfies AgentRuntimeEvent
  const accepted = await enqueueCloudflareSessionRun(request, options)
  if (!accepted.accepted || accepted.runId !== input.runId) throw new Error("cloudflare_opencode_async_accept_invalid")
  const ticket = await getCloudflareSessionEventTicket({ runId: input.runId, sessionKey: input.sessionKey }, options)
  for await (const event of subscribeCloudflareSessionRun(ticket, options)) {
    if (event.event === "runtime_error") {
      const error = new Error(event.message)
      ;(error as Error & { aiEntryRetryable?: boolean }).aiEntryRetryable = event.retryable
      throw error
    }
    yield event
  }
}

export async function* runOpenCodeAgent(input: AgentRuntimeInput, options: RunOpenCodeAgentOptions = {}): AsyncGenerator<AgentRuntimeEvent> {
  if (!options.provider) throw new Error("opencode_provider_required")
  const backend = options.backend || (options.railway === false ? "cloudflare-opencode-session" : "railway-opencode")
  // The application owns provider selection and credentials. Preserve the
  // exact request-scoped config through both runtime transports.
  const runtimeProvider = options.provider
  if (options.session) {
    const sessionKey = await buildAgentRuntimeSessionKey({ enterpriseId: input.enterpriseId, userId: input.userId, conversationId: input.conversationId, agentId: input.agentId })
    const sessionInput: AgentRuntimeInputV2 = {
      ...input,
      protocolVersion: 2,
      sessionKey,
      functionId: input.agentId,
      selectedSkillIds: [...new Set(input.selectedSkillIds || [])],
      selectedMcpServerIds: [],
      attachmentObjects: [],
      checkpoint: null,
      credentialRef: runtimeProvider.apiKey.startsWith("proxy:") ? runtimeProvider.apiKey : null,
    }
    yield { event: "runtime_selected", provider: "opencode", backend, runId: input.runId }
    yield { event: "runtime_started", runId: input.runId }
    const events = backend === "cloudflare-opencode-session"
      ? streamCloudflareSession(sessionInput, runtimeProvider, options)
      : streamRailwaySessionRun(sessionInput, runtimeProvider, options)
    if (backend === "railway-opencode") {
      const prepared = await prepareRailwaySession({ runId: input.runId, sessionKey, input: sessionInput, provider: runtimeProvider }, options)
      if (!prepared.sessionReady) throw new Error("railway_opencode_session_not_ready")
      yield { event: "session_ready", runId: input.runId, sessionKey }
    }
    for await (const event of events) {
      if (event.event === "runtime_error") {
        const error = new Error(event.message)
        ;(error as Error & { aiEntryRetryable?: boolean }).aiEntryRetryable = event.retryable
        throw error
      }
      yield event
    }
    return
  }
  if (backend === "cloudflare-opencode-session") throw new Error("cloudflare_opencode_session_required")
  yield { event: "runtime_selected", provider: "opencode", backend, runId: input.runId }
  yield { event: "runtime_started", runId: input.runId }
  for await (const event of streamRailwaySessionRun(input, runtimeProvider, options)) {
    yield event
    if (event.event === "runtime_error") {
      const error = new Error(event.message)
      ;(error as Error & { aiEntryRetryable?: boolean }).aiEntryRetryable = event.retryable
      throw error
    }
  }
}
