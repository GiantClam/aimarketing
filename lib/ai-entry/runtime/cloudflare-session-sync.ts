import { appendAiEntryMessage, recordAiEntryRuntimeArtifactContext } from "@/lib/ai-entry/repository"
import { buildRuntimeAssistantMessage } from "./assistant-message"
import { getCloudflareSessionEventTicket, getCloudflareSessionRun, subscribeCloudflareSessionRun } from "./cloudflare-session-client"
import { getOpenCodeRuntimeRunByTaskRunId, getRailwayOpenCodeRuntimeState, updateOpenCodeRuntimeRun } from "@/lib/platform/opencode-runtime-store"
import { appendPlatformRunEvent, getPlatformTaskRun, updatePlatformTaskRun } from "@/lib/platform/task-run-store"
import { savePlatformArtifact } from "@/lib/platform/task-run-store"
import { validateRuntimeArtifactPayload, validateRuntimeArtifactReference } from "./artifact-detector"
import type { RuntimeArtifactPayload, RuntimeArtifactReference } from "@/lib/ai-runtime/contracts"

type RuntimeEvent = { event?: string; delta?: string; message?: string; code?: string; artifact?: Record<string, unknown> }

function isTerminal(status: string) {
  return status === "succeeded" || status === "failed" || status === "cancelled" || status === "timed_out"
}

export async function reconcileOpenCodeRuntimeTask(taskRunId: number, userId: number) {
  const platformRun = await getPlatformTaskRun(taskRunId)
  if (!platformRun || platformRun.userId !== userId || !platformRun.externalRunId) return false

  const runtimeRun = await getOpenCodeRuntimeRunByTaskRunId(taskRunId)
  if (!runtimeRun) return false

  const railway = runtimeRun.backend === "railway-opencode"
  const events: RuntimeEvent[] = []
  let remoteStatus: string
  let remoteError: string | null
  if (railway) {
    const remote = await getRailwayOpenCodeRuntimeState(platformRun.externalRunId)
    if (!remote || !isTerminal(remote.status)) return false
    remoteStatus = remote.status
    remoteError = remote.error
    for (const item of remote.events) events.push(item.event as RuntimeEvent)
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
  const conversationId = typeof taskInput.conversationId === "string" ? taskInput.conversationId : null
  const artifacts = events
    .filter((event) => (event.event === "artifact_reference" || event.event === "artifact_payload") && event.artifact)
    .map((event) => event.artifact as Record<string, unknown>)
  const assistantContent = buildRuntimeAssistantMessage(text, artifacts)
  let assistantMessagePersisted = previous.assistantMessagePersisted === true

  if (railway) {
    const seen = new Set(Array.isArray(previous.railwayArtifactPaths) ? previous.railwayArtifactPaths.filter((value): value is string => typeof value === "string") : [])
    for (const artifact of artifacts) {
      if (typeof artifact.contentBase64 !== "string" || typeof artifact.path !== "string" || seen.has(artifact.path)) continue
      const validated = validateRuntimeArtifactPayload(artifact as RuntimeArtifactPayload, {
        maxArtifacts: 24,
        maxArtifactBytes: 4 * 1024 * 1024,
        maxArtifactTotalBytes: 16 * 1024 * 1024,
        allowedExtensions: [".md", ".markdown", ".txt", ".json", ".csv", ".html", ".pdf", ".docx", ".xlsx", ".pptx", ".svg", ".png", ".jpg", ".jpeg", ".webp"],
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
        payload: { embeddedContentBase64: validated.contentBase64, fileName: validated.fileName, source: "opencode" },
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
        maxArtifacts: 24,
        maxArtifactBytes: 4 * 1024 * 1024,
        maxArtifactTotalBytes: 16 * 1024 * 1024,
        allowedExtensions: [".md", ".markdown", ".txt", ".json", ".csv", ".html", ".pdf", ".docx", ".xlsx", ".pptx", ".svg", ".png", ".jpg", ".jpeg", ".webp"],
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
    await appendAiEntryMessage({
      userId,
      conversationId,
      role: "assistant",
      content: assistantContent,
      agentId: typeof taskInput.agentId === "string" ? taskInput.agentId : null,
    })
    assistantMessagePersisted = true
  }

  for (const event of events) {
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
    events: events.slice(-100).map((event) => ({
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
