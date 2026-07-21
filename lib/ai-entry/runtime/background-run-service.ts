import type { AuthUser } from "@/lib/auth/session"
import type { AgentRuntimeInput, AgentRuntimeInputV2, OpenCodeProviderConfig } from "@/lib/ai-runtime/contracts"
import { buildAgentRuntimeSessionKey } from "@/lib/ai-runtime/session-key"
import { createPlatformTaskRun, updatePlatformTaskRun } from "@/lib/platform/task-run-store"
import { createOpenCodeRuntimeRun, updateOpenCodeRuntimeRun } from "@/lib/platform/opencode-runtime-store"
import { enqueueCloudflareSessionRun, prepareCloudflareSession } from "./cloudflare-session-client"
import { enqueueRailwaySessionRun } from "./railway-session-client"
import type { BillingReservation } from "@/lib/billing/runtime"

export async function createBackgroundOpenCodeRun(input: {
  currentUser: AuthUser
  runtimeInput: AgentRuntimeInput
  functionId?: string | null
  selectedSkillIds?: string[]
  selectedMcpServerIds?: string[]
  traceId: string
  billingReservation: BillingReservation | null
  provider: OpenCodeProviderConfig
  backend?: "cloudflare-opencode-session" | "railway-opencode"
}) {
  if (!input.currentUser.enterpriseId) throw new Error("opencode_runtime_enterprise_required")
  const sessionKey = await buildAgentRuntimeSessionKey({ enterpriseId: input.currentUser.enterpriseId, userId: input.currentUser.id, conversationId: input.runtimeInput.conversationId, agentId: input.runtimeInput.agentId })
  const v2Input: AgentRuntimeInputV2 = {
    ...input.runtimeInput,
    protocolVersion: 2,
    sessionKey,
    functionId: input.functionId || null,
    selectedSkillIds: [...new Set(input.selectedSkillIds || [])],
    selectedMcpServerIds: [...new Set(input.selectedMcpServerIds || [])],
    attachmentObjects: [],
    checkpoint: null,
  }
  const request = { runId: input.runtimeInput.runId, sessionKey, input: v2Input, deadlineMs: 3_600_000 as const, provider: input.provider }
  const backend = input.backend || "railway-opencode"
  const taskRun = await createPlatformTaskRun({
    enterpriseId: input.currentUser.enterpriseId,
    userId: input.currentUser.id,
    kind: "agent",
    itemType: "ai_entry_opencode",
    itemSlug: input.runtimeInput.conversationId || input.runtimeInput.runId,
    status: "queued",
    externalSystem: "opencode-v2",
    externalRunId: input.runtimeInput.runId,
    inputPayload: {
      conversationId: input.runtimeInput.conversationId,
      agentId: input.runtimeInput.agentId,
      selectedSkillIds: v2Input.selectedSkillIds,
      artifactContract: v2Input.artifactContract,
      traceId: input.traceId,
      billingReservation: input.billingReservation,
    },
  })
  await createOpenCodeRuntimeRun({ backend, taskRunId: taskRun.id, runtimeRunId: request.runId, sessionKey, conversationId: request.input.conversationId, agentId: request.input.agentId, functionId: request.input.functionId, deadlineAt: new Date(Date.now() + 3_600_000), billingPayload: input.billingReservation })
  try {
    if (backend === "cloudflare-opencode-session") {
      const prepared = await prepareCloudflareSession(request)
      if (!prepared.prepared) throw new Error("cloudflare_opencode_session_not_ready")
      const accepted = await enqueueCloudflareSessionRun(request)
      if (!accepted.accepted || accepted.runId !== request.runId) throw new Error("cloudflare_opencode_async_accept_invalid")
    } else {
      await enqueueRailwaySessionRun(request)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    await updateOpenCodeRuntimeRun(request.runId, { status: "failed", lastErrorCode: "dispatch_failed", lastErrorMessage: errorMessage, finishedAt: new Date(), clearLease: true })
    await updatePlatformTaskRun(taskRun.id, { status: "failed", normalizedResult: { error: "dispatch_failed", errorMessage: errorMessage.slice(0, 1024) }, finishedAt: new Date() })
    throw error
  }
  return { taskRunId: taskRun.id, runtimeRunId: request.runId, sessionKey, status: "queued" as const }
}
