import { NextRequest, NextResponse } from "next/server"

import { appendAiEntryMessage, recordAiEntryRuntimeArtifactContext } from "@/lib/ai-entry/repository"
import { buildRuntimeAssistantMessage } from "@/lib/ai-entry/runtime/assistant-message"
import { verifyRuntimeCallback } from "@/lib/ai-entry/runtime/callback-signature"
import { estimateTextCredits } from "@/lib/billing/costing"
import { finalizeReservedCredits, releaseReservedCredits, type BillingReservation } from "@/lib/billing/runtime"
import { appendPlatformRunEvent, getPlatformTaskRun, savePlatformArtifact, updatePlatformTaskRun } from "@/lib/platform/task-run-store"
import { getOpenCodeRuntimeRunByRuntimeId, updateOpenCodeRuntimeRun } from "@/lib/platform/opencode-runtime-store"

type CallbackPayload = {
  version: 1
  runId: string
  sessionKey: string
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out"
  events?: Array<{ id: number; event: Record<string, unknown> }>
  checkpoint?: Record<string, unknown> | null
}

function taskStatus(status: CallbackPayload["status"]): "queued" | "running" | "succeeded" | "failed" | "cancelled" {
  return status === "timed_out" ? "failed" : status
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const secret = process.env.CLOUDFLARE_OPENCODE_CALLBACK_SECRET?.trim() || ""
  if (!secret || !await verifyRuntimeCallback({ body, headers: request.headers, secret })) return NextResponse.json({ error: "callback_unauthorized" }, { status: 401 })
  let payload: CallbackPayload
  try { payload = JSON.parse(body) as CallbackPayload } catch { return NextResponse.json({ error: "callback_invalid_json" }, { status: 400 }) }
  if (payload.version !== 1 || typeof payload.runId !== "string") return NextResponse.json({ error: "callback_invalid_payload" }, { status: 400 })
  const runtimeRun = await getOpenCodeRuntimeRunByRuntimeId(payload.runId)
  if (!runtimeRun) return NextResponse.json({ ok: true, ignored: "runtime_run_not_found" })
  const platformRun = await getPlatformTaskRun(runtimeRun.taskRunId)
  if (!platformRun) return NextResponse.json({ ok: true, ignored: "task_run_not_found" })
  const previous = (platformRun.normalizedResult || {}) as Record<string, unknown>
  const seenEventIds = new Set(Array.isArray(previous.callbackEventIds) ? previous.callbackEventIds.map((value) => Number(value)).filter(Number.isFinite) : [])
  const events = Array.isArray(payload.events) ? payload.events : []
  const newEvents: typeof events = []
  for (const item of events) {
    if (!Number.isFinite(item.id) || seenEventIds.has(item.id)) continue
    seenEventIds.add(item.id)
    newEvents.push(item)
    const event = item.event || {}
    await appendPlatformRunEvent(runtimeRun.taskRunId, { level: event.event === "runtime_error" ? "error" : "info", message: typeof event.event === "string" ? event.event : "runtime_event", payload: event })
  }
  const textDelta = newEvents.map((item) => item.event).filter((event) => event.event === "text_delta" && typeof event.delta === "string").map((event) => String(event.delta)).join("")
  const previousText = typeof previous.runtimeText === "string" ? previous.runtimeText : ""
  const text = `${previousText}${textDelta}`.slice(-200_000)
  const taskInput = (platformRun.inputPayload || {}) as Record<string, unknown>
  const conversationId = typeof taskInput.conversationId === "string" ? taskInput.conversationId : null
  const artifacts = newEvents.map((item) => item.event).filter((event) => event.event === "artifact_reference" && event.artifact && typeof event.artifact === "object").map((event) => event.artifact as Record<string, unknown>)
  const assistantContent = buildRuntimeAssistantMessage(text, artifacts)
  let assistantMessagePersisted = previous.assistantMessagePersisted === true
  if (payload.status === "succeeded" && assistantContent && conversationId && !assistantMessagePersisted) {
    await appendAiEntryMessage({ userId: platformRun.userId, conversationId, role: "assistant", content: assistantContent, agentId: typeof taskInput.agentId === "string" ? taskInput.agentId : null })
    assistantMessagePersisted = true
  }
  let savedArtifactCount = 0
  for (const artifact of artifacts) {
    const key = typeof artifact.key === "string" ? artifact.key : null
    if (!key || platformRun.artifacts.some((existing) => existing.storageKey === key)) continue
    const savedArtifact = await savePlatformArtifact({ runId: runtimeRun.taskRunId, enterpriseId: platformRun.enterpriseId, ownerUserId: platformRun.userId, kind: "file", title: typeof artifact.title === "string" ? artifact.title : "OpenCode artifact", mimeType: typeof artifact.mimeType === "string" ? artifact.mimeType : null, storageKey: key, externalUrl: typeof artifact.publicUrl === "string" ? artifact.publicUrl : null, payload: { runtimeRunId: payload.runId, checksumSha256: artifact.checksumSha256 || null }, source: "generated" })
    savedArtifactCount += 1
    if (conversationId) {
      await recordAiEntryRuntimeArtifactContext({
        userId: platformRun.userId,
        conversationId,
        artifact: {
          artifactId: savedArtifact.id,
          title: savedArtifact.title,
          kind: "file",
          summary: `${savedArtifact.title}${savedArtifact.mimeType ? ` (${savedArtifact.mimeType})` : ""}`,
        },
      }).catch(() => undefined)
    }
  }
  const reservation = taskInput.billingReservation && typeof taskInput.billingReservation === "object" ? taskInput.billingReservation as BillingReservation : null
  const terminal = ["succeeded", "failed", "cancelled", "timed_out"].includes(payload.status)
  let billingFinalized = previous.billingFinalized === true
  if (terminal && !billingFinalized) {
    if (payload.status === "succeeded") {
      const usage = events.map((item) => item.event).filter((event) => event.event === "usage").at(-1)
      const actual = estimateTextCredits({ featureKey: "ai_entry_chat", inputTokens: typeof usage?.inputTokens === "number" ? usage.inputTokens : Math.max(1, Math.ceil(text.length / 4)), outputTokens: typeof usage?.outputTokens === "number" ? usage.outputTokens : Math.max(1, Math.ceil(text.length / 4)), provider: "opencode", model: "opencode" })
      await finalizeReservedCredits({ reservation, userId: platformRun.userId, enterpriseId: platformRun.enterpriseId, actualAmount: actual.credits, idempotencyKey: `ai-entry:${payload.runId}:debit`, provider: "opencode", model: "opencode", officialCostUsd: actual.officialCostUsd, costBasisUsd: actual.costBasisUsd, usagePayload: actual.metadata, metadata: { runtimeRunId: payload.runId } }).catch(() => undefined)
    } else {
      await releaseReservedCredits({ reservation, userId: platformRun.userId, enterpriseId: platformRun.enterpriseId, idempotencyKey: `ai-entry:${payload.runId}:release`, reason: `opencode_v2_${payload.status}` }).catch(() => undefined)
    }
    billingFinalized = true
  }
  const normalizedEvents = events.map((item) => {
    const event = item.event || {}
    const type = typeof event.event === "string" ? event.event : "runtime_event"
    return {
      type,
      label: type,
      detail: typeof event.message === "string" ? event.message : typeof event.delta === "string" ? event.delta.slice(0, 240) : undefined,
      status: type === "runtime_error" ? "failed" : ["done", "artifact_reference", "checkpoint_saved"].includes(type) ? "completed" : "running",
      at: typeof event.at === "number" ? event.at : Math.floor(Date.now() / 1000),
    }
  })
  const nextResult = {
    ...previous,
    callbackEventIds: [...seenEventIds].slice(-500),
    runtimeRunId: payload.runId,
    assistantMessagePersisted,
    runtimeText: assistantMessagePersisted ? undefined : text,
    billingFinalized,
    artifacts: Math.max(Number(previous.artifacts) || 0, platformRun.artifacts.length + savedArtifactCount),
    events: normalizedEvents.slice(-100),
    stage: payload.status === "queued" ? "runtime_queued" : payload.status === "succeeded" ? "runtime_publishing" : "runtime_running",
    lastHeartbeatAt: Math.floor(Date.now() / 1000),
  }
  await updateOpenCodeRuntimeRun(payload.runId, { status: payload.status === "succeeded" ? "succeeded" : payload.status === "cancelled" ? "cancelled" : payload.status === "timed_out" ? "timed_out" : payload.status === "failed" ? "failed" : "running", workspaceBackup: payload.checkpoint || undefined, clearLease: ["succeeded", "failed", "cancelled", "timed_out"].includes(payload.status), finishedAt: ["succeeded", "failed", "cancelled", "timed_out"].includes(payload.status) ? new Date() : undefined })
  await updatePlatformTaskRun(runtimeRun.taskRunId, { status: taskStatus(payload.status), normalizedResult: nextResult, startedAt: payload.status === "running" ? new Date() : undefined, finishedAt: ["succeeded", "failed", "cancelled", "timed_out"].includes(payload.status) ? new Date() : undefined })
  return NextResponse.json({ ok: true, runtimeRunId: payload.runId, status: payload.status })
}
