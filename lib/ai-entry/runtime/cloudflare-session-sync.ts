import { createHash } from "node:crypto"

import { appendAiEntryMessage, recordAiEntryRuntimeArtifactContext, upsertAiEntryMessageParts } from "@/lib/ai-entry/repository"
import { buildRuntimeAssistantMessage, buildRuntimeAssistantParts } from "./assistant-message"
import { getCloudflareSessionEventTicket, getCloudflareSessionRun, subscribeCloudflareSessionRun } from "./cloudflare-session-client"
import { getRailwaySessionRun } from "./railway-session-client"
import { getOpenCodeRuntimeRunByTaskRunId, updateOpenCodeRuntimeRun } from "@/lib/platform/opencode-runtime-store"
import { appendPlatformRunEvent, getPlatformTaskRun, updatePlatformTaskRun } from "@/lib/platform/task-run-store"
import { savePlatformArtifact } from "@/lib/platform/task-run-store"
import { selectFinalRuntimeArtifacts, validateRuntimeArtifactPayload, validateRuntimeArtifactReference } from "./artifact-detector"
import { filterTaskProgressEvents } from "./runtime-events"
import { resolveRuntimeArtifactLimits, runtimeArtifactExtensions } from "./artifact-policy"
import type { RuntimeArtifactPayload, RuntimeArtifactReference } from "@/lib/ai-runtime/contracts"
import { releaseReservedCredits, type BillingReservation } from "@/lib/billing/runtime"

type RuntimeEvent = { event?: string; delta?: string; message?: string; code?: string; artifact?: Record<string, unknown> }

function isTerminal(status: string) {
  return status === "succeeded" || status === "failed" || status === "cancelled" || status === "timed_out"
}

const reconciliationLocks = new Map<number, Promise<boolean>>()

async function reconcileOpenCodeRuntimeTaskOnce(taskRunId: number, userId: number) {
  const platformRun = await getPlatformTaskRun(taskRunId)
  if (!platformRun || platformRun.userId !== userId || !platformRun.externalRunId) return false
  const persistedResult = (platformRun.normalizedResult || {}) as Record<string, unknown>
  if (isTerminal(platformRun.status) && persistedResult.billingFinalized === true) return false

  const runtimeRun = await getOpenCodeRuntimeRunByTaskRunId(taskRunId)
  if (!runtimeRun) return false

  const railway = runtimeRun.backend === "railway-opencode"
  const events: RuntimeEvent[] = []
  let remoteStatus: string
  let remoteError: string | null
  if (railway) {
    // Async Railway runs are intentionally detached from the POST response.
    // Read the authoritative remote run record here instead of relying on an
    // optional callback URL, which is not available in every local/dev setup.
    const remote = await getRailwaySessionRun(platformRun.externalRunId)
    if (!remote || !isTerminal(remote.status)) {
      if (runtimeRun.deadlineAt > new Date()) return false
      const taskInput = (platformRun.inputPayload || {}) as Record<string, unknown>
      const reservation = taskInput.billingReservation && typeof taskInput.billingReservation === "object"
        ? taskInput.billingReservation as BillingReservation
        : null
      let billingFinalized = false
      let billingFinalizationError: string | null = null
      try {
        await releaseReservedCredits({
          reservation,
          userId: platformRun.userId,
          enterpriseId: platformRun.enterpriseId,
          idempotencyKey: `ai-entry:${platformRun.externalRunId}:release`,
          reason: "opencode_runtime_deadline_exceeded",
        })
        billingFinalized = true
      } catch (error) {
        billingFinalizationError = error instanceof Error ? error.message : String(error)
        console.error("ai-entry.billing.release.failed", { runtimeRunId: platformRun.externalRunId, message: billingFinalizationError })
      }
      const errorMessage = "opencode_runtime_deadline_exceeded"
      await updateOpenCodeRuntimeRun(platformRun.externalRunId, {
        status: "timed_out",
        lastErrorCode: "opencode_runtime_deadline_exceeded",
        lastErrorMessage: errorMessage,
        clearLease: true,
        finishedAt: new Date(),
      })
      await updatePlatformTaskRun(taskRunId, {
        status: "failed",
        normalizedResult: {
          ...((platformRun.normalizedResult || {}) as Record<string, unknown>),
          error: errorMessage,
          errorCode: "opencode_runtime_deadline_exceeded",
          errorMessage,
          billingFinalized,
          billingFinalizationError,
          lastHeartbeatAt: Math.floor(Date.now() / 1000),
        },
        finishedAt: new Date(),
      })
      return true
    }
    remoteStatus = remote.status
    remoteError = remote.error || null
    for (const event of Array.isArray(remote.events) ? remote.events : []) {
      if (event && typeof event === "object") events.push(event as RuntimeEvent)
    }
  } else {
    const remote = await getCloudflareSessionRun({ runId: platformRun.externalRunId })
    if (!isTerminal(remote.status)) return false
    remoteStatus = remote.status
    remoteError = remote.error || null
    const ticket = await getCloudflareSessionEventTicket({
      runId: platformRun.externalRunId,
      sessionKey: runtimeRun.sessionKey,
    })
    for await (const event of subscribeCloudflareSessionRun(ticket)) events.push(event)
  }

  const text = events
    .filter((event) => event.event === "text_delta" && typeof event.delta === "string")
    .map((event) => event.delta || "")
    .join("")
  const previous = (platformRun.normalizedResult || {}) as Record<string, unknown>
  const taskInput = (platformRun.inputPayload || {}) as Record<string, unknown>
  const taskArtifactContract = taskInput.artifactContract && typeof taskInput.artifactContract === "object"
    ? taskInput.artifactContract as Record<string, unknown>
    : {}
  const artifactLimits = resolveRuntimeArtifactLimits({
    agentId: taskInput.agentId,
    selectedSkillIds: taskInput.selectedSkillIds,
    maxArtifacts: Number.isInteger(taskArtifactContract.maxArtifacts) ? Number(taskArtifactContract.maxArtifacts) : 24,
    maxArtifactBytes: Number.isInteger(taskArtifactContract.maxArtifactBytes) ? Number(taskArtifactContract.maxArtifactBytes) : 4 * 1024 * 1024,
    maxArtifactTotalBytes: Number.isInteger(taskArtifactContract.maxArtifactTotalBytes) ? Number(taskArtifactContract.maxArtifactTotalBytes) : 16 * 1024 * 1024,
  })
  const allowedArtifactExtensions = runtimeArtifactExtensions(taskInput.agentId, taskInput.selectedSkillIds)
  const conversationId = typeof taskInput.conversationId === "string" ? taskInput.conversationId : null
  const turnId = typeof taskInput.turnId === "string" ? taskInput.turnId : null
  const assistantMessageIdempotencyKey = typeof taskInput.assistantMessageIdempotencyKey === "string"
    ? taskInput.assistantMessageIdempotencyKey
    : null
  const artifacts = selectFinalRuntimeArtifacts(events
    .filter((event) => (event.event === "artifact_reference" || event.event === "artifact_payload") && event.artifact)
    .map((event) => event.artifact as Record<string, unknown>))
  const assistantContent = buildRuntimeAssistantMessage(text, artifacts)
  const assistantParts = buildRuntimeAssistantParts(text, artifacts)
  let assistantMessagePersisted = previous.assistantMessagePersisted === true

  if (railway) {
    const seen = new Set(Array.isArray(previous.railwayArtifactPaths) ? previous.railwayArtifactPaths.filter((value): value is string => typeof value === "string") : [])
    for (const artifact of artifacts) {
      if (typeof artifact.contentBase64 !== "string" || typeof artifact.path !== "string" || seen.has(artifact.path)) continue
      const validated = validateRuntimeArtifactPayload(artifact as RuntimeArtifactPayload, {
        maxArtifacts: artifactLimits.maxArtifacts,
        maxArtifactBytes: artifactLimits.maxArtifactBytes,
        maxArtifactTotalBytes: artifactLimits.maxArtifactTotalBytes,
        allowedExtensions: allowedArtifactExtensions,
      })
      const saved = await savePlatformArtifact({
        runId: taskRunId,
        enterpriseId: platformRun.enterpriseId,
        ownerUserId: platformRun.userId,
        kind: "file",
        title: validated.title,
        mimeType: validated.mimeType,
        storageKey: null,
        externalUrl: null,
      payload: {
        embeddedContentBase64: validated.contentBase64,
        fileName: validated.fileName,
        runtimeRunId: platformRun.externalRunId,
        runtimePath: validated.path,
        runtimeSizeBytes: validated.sizeBytes,
        checksumSha256: createHash("sha256").update(validated.contentBase64, "base64").digest("hex"),
        source: "opencode",
      },
      source: "chat",
    })
      seen.add(artifact.path)
      if (conversationId) {
        await recordAiEntryRuntimeArtifactContext({
          userId,
          conversationId,
          artifact: { artifactId: saved.id, title: saved.title, kind: "file", summary: `${validated.fileName} (${validated.mimeType})` },
        }).catch(() => undefined)
      }
    }
    previous.railwayArtifactPaths = [...seen]
  } else {
    const seen = new Set(Array.isArray(previous.cloudflareArtifactKeys) ? previous.cloudflareArtifactKeys.filter((value): value is string => typeof value === "string") : [])
    let totalBytes = 0
    for (const artifact of artifacts) {
      if (typeof artifact.contentBase64 === "string" || typeof artifact.key !== "string" || seen.has(artifact.key)) continue
      const validated = validateRuntimeArtifactReference(artifact as RuntimeArtifactReference, {
        maxArtifacts: artifactLimits.maxArtifacts,
        maxArtifactBytes: artifactLimits.maxArtifactBytes,
        maxArtifactTotalBytes: artifactLimits.maxArtifactTotalBytes,
        allowedExtensions: allowedArtifactExtensions,
      }, totalBytes)
      totalBytes += validated.sizeBytes
      const saved = await savePlatformArtifact({
        runId: taskRunId,
        enterpriseId: platformRun.enterpriseId,
        ownerUserId: platformRun.userId,
        kind: "file",
        title: validated.title,
        mimeType: validated.mimeType,
        storageKey: validated.storageKey,
        externalUrl: validated.publicUrl,
        payload: { fileName: validated.fileName, source: "opencode-cloudflare", checksumSha256: validated.checksumSha256 },
        source: "chat",
      })
      seen.add(validated.storageKey)
      if (conversationId) {
        await recordAiEntryRuntimeArtifactContext({
          userId,
          conversationId,
          artifact: { artifactId: saved.id, title: saved.title, kind: "file", summary: `${validated.fileName} (${validated.mimeType})` },
        }).catch(() => undefined)
      }
    }
    previous.cloudflareArtifactKeys = [...seen]
  }

  if (remoteStatus === "succeeded" && assistantContent && conversationId && !assistantMessagePersisted) {
    const messageParams = {
      userId,
      conversationId,
      role: "assistant",
      content: assistantContent,
      parts: assistantParts,
      metadata: turnId ? { turnId } : null,
      idempotencyKey: assistantMessageIdempotencyKey || `opencode:${platformRun.externalRunId}:assistant`,
      agentId: typeof taskInput.agentId === "string" ? taskInput.agentId : null,
    } as const
    if (assistantMessageIdempotencyKey) {
      await upsertAiEntryMessageParts(messageParams)
    } else {
      await appendAiEntryMessage(messageParams)
    }
    assistantMessagePersisted = true
  }

  for (const event of filterTaskProgressEvents(events)) {
    if (!event.event) continue
    await appendPlatformRunEvent(taskRunId, {
      level: event.event === "runtime_error" ? "error" : "info",
      message: event.event,
      payload: event,
    })
  }

  const failed = remoteStatus !== "succeeded"
  const nextResult = {
    ...previous,
    runtimeRunId: platformRun.externalRunId,
    assistantMessagePersisted,
    fallbackSynced: true,
    events: filterTaskProgressEvents(events).slice(-100).map((event) => ({
      type: event.event || "runtime_event",
      label: event.event || "runtime_event",
      detail: event.message || event.delta?.slice(0, 240),
      status: event.event === "runtime_error" ? "failed" : event.event === "done" ? "completed" : "running",
      at: Math.floor(Date.now() / 1000),
    })),
    error: remoteError,
    lastHeartbeatAt: Math.floor(Date.now() / 1000),
  }

  await updateOpenCodeRuntimeRun(platformRun.externalRunId, {
    status: remoteStatus as "succeeded" | "failed" | "cancelled" | "timed_out",
    lastErrorMessage: remoteError,
    clearLease: true,
    finishedAt: new Date(),
  })
  await updatePlatformTaskRun(taskRunId, {
    status: failed ? "failed" : "succeeded",
    normalizedResult: nextResult,
    finishedAt: new Date(),
  })
  return true
}

export async function reconcileOpenCodeRuntimeTask(taskRunId: number, userId: number) {
  const active = reconciliationLocks.get(taskRunId)
  if (active) return active
  const work = reconcileOpenCodeRuntimeTaskOnce(taskRunId, userId)
  reconciliationLocks.set(taskRunId, work)
  try {
    return await work
  } finally {
    if (reconciliationLocks.get(taskRunId) === work) reconciliationLocks.delete(taskRunId)
  }
}
