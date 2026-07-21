import { createHash } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"

import { appendAiEntryMessage, recordAiEntryRuntimeArtifactContext } from "@/lib/ai-entry/repository"
import { runtimeArtifactExtensions } from "@/lib/ai-entry/runtime/artifact-policy"
import { buildRuntimeAssistantMessage } from "@/lib/ai-entry/runtime/assistant-message"
import {
  displayRuntimeArtifactFileName,
  validateRuntimeArtifactPayload,
  validateRuntimeArtifactReference,
} from "@/lib/ai-entry/runtime/artifact-detector"
import { verifyRuntimeCallback } from "@/lib/ai-entry/runtime/callback-signature"
import type {
  RuntimeArtifactPayload,
  RuntimeArtifactReference,
} from "@/lib/ai-runtime/contracts"
import { estimateTextCredits } from "@/lib/billing/costing"
import { finalizeReservedCredits, releaseReservedCredits, type BillingReservation } from "@/lib/billing/runtime"
import { isPlatformArtifactR2Available, uploadPlatformArtifactBufferToR2 } from "@/lib/platform/artifact-storage"
import { appendPlatformRunEvent, getPlatformTaskRun, savePlatformArtifact, updatePlatformTaskRun } from "@/lib/platform/task-run-store"
import { getOpenCodeRuntimeRunByRuntimeId, updateOpenCodeRuntimeRun } from "@/lib/platform/opencode-runtime-store"
import { selectFinalRuntimeArtifacts } from "@/lib/ai-entry/runtime/artifact-detector"
import { filterTaskProgressEvents } from "@/lib/ai-entry/runtime/runtime-events"
import type { HydratedPlatformTaskRun } from "@/lib/platform/task-run-store"

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

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function artifactContractForRun(taskInput: Record<string, unknown>, agentId: string | null) {
  const configured = asRecord(taskInput.artifactContract)
  const allowedExtensions = Array.isArray(configured?.allowedExtensions)
    ? configured.allowedExtensions.filter((value): value is string => typeof value === "string")
    : runtimeArtifactExtensions(agentId, taskInput.selectedSkillIds)
  return {
    maxArtifacts:
      typeof configured?.maxArtifacts === "number"
        ? configured.maxArtifacts
        : Number.parseInt(process.env.RAILWAY_OPENCODE_MAX_ARTIFACTS || "24", 10),
    maxArtifactBytes:
      typeof configured?.maxArtifactBytes === "number"
        ? configured.maxArtifactBytes
        : Number.parseInt(
            process.env.RAILWAY_OPENCODE_MAX_ARTIFACT_BYTES || String(2 * 1024 * 1024),
            10,
          ),
    maxArtifactTotalBytes:
      typeof configured?.maxArtifactTotalBytes === "number"
        ? configured.maxArtifactTotalBytes
        : Number.parseInt(
            process.env.RAILWAY_OPENCODE_MAX_ARTIFACT_TOTAL_BYTES || String(16 * 1024 * 1024),
            10,
          ),
    allowedExtensions,
  }
}

function artifactReferenceEvent(artifact: Record<string, unknown>, reference: Record<string, unknown>) {
  return {
    event: "artifact_reference",
    artifact: {
      provider: reference.provider || "platform",
      bucket: reference.bucket || "platform-artifacts",
      key: reference.key || `platform:${reference.artifactId || "unknown"}`,
      publicUrl: reference.publicUrl || null,
      fileName:
        typeof artifact.path === "string"
          ? displayRuntimeArtifactFileName(artifact.path.replace(/^artifacts\//u, ""))
          : typeof artifact.fileName === "string" && artifact.fileName.trim()
            ? displayRuntimeArtifactFileName(artifact.fileName)
            : typeof artifact.title === "string" && artifact.title.trim()
              ? displayRuntimeArtifactFileName(artifact.title)
              : "artifact",
      title: typeof artifact.title === "string" ? artifact.title : "OpenCode artifact",
      kind: typeof artifact.kind === "string" ? artifact.kind : "file",
      mimeType:
        typeof artifact.mimeType === "string"
          ? artifact.mimeType
          : "application/octet-stream",
      sizeBytes: typeof artifact.sizeBytes === "number" ? artifact.sizeBytes : 0,
      checksumSha256: reference.checksumSha256 || null,
      artifactId: reference.artifactId || null,
    },
  } satisfies Record<string, unknown>
}

async function persistRuntimeArtifactForCallback(input: {
  runtimeRunId: string
  taskRun: HydratedPlatformTaskRun
  artifact: RuntimeArtifactPayload | RuntimeArtifactReference
}) {
  const taskInput = asRecord(input.taskRun.inputPayload) || {}
  const agentId = typeof taskInput.agentId === "string" ? taskInput.agentId : null
  const currentTotalBytes = input.taskRun.artifacts.reduce(
    (total, item) => total + (Number(asRecord(item.payload)?.runtimeSizeBytes) || 0),
    0,
  )
  const contract = artifactContractForRun(taskInput, agentId)
  const referenceLike =
    "provider" in input.artifact &&
    typeof (input.artifact as { provider?: unknown }).provider === "string"

  if (referenceLike) {
    const validated = validateRuntimeArtifactReference(
      input.artifact as RuntimeArtifactReference,
      contract,
      currentTotalBytes,
    )
    const existing = input.taskRun.artifacts.find((item) => {
      const payload = asRecord(item.payload)
      const existingName =
        typeof payload?.fileName === "string"
          ? payload.fileName
          : typeof payload?.runtimePath === "string"
            ? payload.runtimePath
            : ""
      return (
        payload?.runtimeRunId === input.runtimeRunId &&
        (item.storageKey === validated.storageKey ||
          payload?.checksumSha256 === validated.checksumSha256 ||
          displayRuntimeArtifactFileName(existingName).toLowerCase() ===
            validated.fileName.toLowerCase())
      )
    })
    if (existing) {
      return artifactReferenceEvent(validated as unknown as Record<string, unknown>, {
        provider: existing.storageKey ? "r2" : "platform",
        bucket: existing.storageKey
          ? process.env.R2_BUCKET_NAME || "platform-artifacts"
          : "database",
        key: existing.storageKey || `platform:${existing.id}`,
        publicUrl: existing.externalUrl,
        artifactId: existing.id,
        checksumSha256: validated.checksumSha256,
      })
    }
    const saved = await savePlatformArtifact({
      runId: input.taskRun.id,
      enterpriseId: input.taskRun.enterpriseId,
      ownerUserId: input.taskRun.userId,
      kind: "file",
      title: validated.title,
      mimeType: validated.mimeType,
      storageKey: validated.storageKey,
      externalUrl: validated.publicUrl,
      payload: {
        runtimeRunId: input.runtimeRunId,
        runtimePath: `artifacts/${validated.fileName}`,
        runtimeSizeBytes: validated.sizeBytes,
        checksumSha256: validated.checksumSha256,
        fileName: validated.fileName,
      },
      source: "generated",
    })
    const conversationId =
      typeof taskInput.conversationId === "string" ? taskInput.conversationId : null
    if (conversationId) {
      await recordAiEntryRuntimeArtifactContext({
        userId: input.taskRun.userId,
        conversationId,
        agentId,
        artifact: {
          artifactId: saved.id,
          title: saved.title,
          kind: validated.extension,
          summary: `${validated.fileName} (${validated.mimeType})`,
        },
        ...(validated.extension === "pptx"
          ? { exportContext: { previewSessionId: input.runtimeRunId } }
          : {}),
      }).catch(() => undefined)
    }
    return artifactReferenceEvent(validated as unknown as Record<string, unknown>, {
      provider: "r2",
      bucket: process.env.R2_BUCKET_NAME || "platform-artifacts",
      key: validated.storageKey,
      publicUrl: validated.publicUrl,
      artifactId: saved.id,
      checksumSha256: validated.checksumSha256,
    })
  }

  const validated = validateRuntimeArtifactPayload(
    input.artifact as RuntimeArtifactPayload,
    contract,
    currentTotalBytes,
  )
  const checksumSha256 = createHash("sha256")
    .update(validated.contentBase64, "base64")
    .digest("hex")
  const existing = input.taskRun.artifacts.find((item) => {
    const payload = asRecord(item.payload)
    const existingName =
      typeof payload?.fileName === "string"
        ? payload.fileName
        : typeof payload?.runtimePath === "string"
          ? payload.runtimePath
          : ""
    return (
      payload?.runtimeRunId === input.runtimeRunId &&
      (payload?.runtimePath === validated.path ||
        payload?.checksumSha256 === checksumSha256 ||
        displayRuntimeArtifactFileName(existingName).toLowerCase() ===
          validated.fileName.toLowerCase())
    )
  })
  if (existing) {
    return artifactReferenceEvent(validated as unknown as Record<string, unknown>, {
      provider: existing.storageKey ? "r2" : "platform",
      bucket: existing.storageKey
        ? process.env.R2_BUCKET_NAME || "platform-artifacts"
        : "database",
      key: existing.storageKey || `platform:${existing.id}`,
      publicUrl: existing.externalUrl,
      artifactId: existing.id,
      checksumSha256,
    })
  }

  const buffer = Buffer.from(validated.contentBase64, "base64")
  let storageKey: string | null = null
  let publicUrl: string | null = null
  let payload: Record<string, unknown> = {
    runtimeRunId: input.runtimeRunId,
    runtimePath: validated.path,
    runtimeSizeBytes: validated.sizeBytes,
    checksumSha256,
    fileName: validated.fileName,
  }
  if (isPlatformArtifactR2Available()) {
    const uploaded = await uploadPlatformArtifactBufferToR2({
      buffer,
      enterpriseId: input.taskRun.enterpriseId,
      runId: input.taskRun.id,
      provider: "opencode",
      fileName: validated.fileName,
      contentType: validated.mimeType,
    })
    storageKey = uploaded.storageKey
    publicUrl = uploaded.publicUrl
  } else {
    payload = { ...payload, embeddedContentBase64: validated.contentBase64 }
  }
  const saved = await savePlatformArtifact({
    runId: input.taskRun.id,
    enterpriseId: input.taskRun.enterpriseId,
    ownerUserId: input.taskRun.userId,
    kind: "file",
    title: validated.title,
    mimeType: validated.mimeType,
    storageKey,
    externalUrl: publicUrl,
    payload,
    source: "generated",
  })
  const conversationId =
    typeof taskInput.conversationId === "string" ? taskInput.conversationId : null
  if (conversationId) {
    await recordAiEntryRuntimeArtifactContext({
      userId: input.taskRun.userId,
      conversationId,
      agentId,
      artifact: {
        artifactId: saved.id,
        title: saved.title,
        kind: validated.extension,
        summary: `${validated.fileName} (${validated.mimeType})`,
      },
      ...(validated.extension === "pptx"
        ? { exportContext: { previewSessionId: input.runtimeRunId } }
        : {}),
    }).catch(() => undefined)
  }
  return artifactReferenceEvent(validated as unknown as Record<string, unknown>, {
    provider: storageKey ? "r2" : "platform",
    bucket: storageKey ? process.env.R2_BUCKET_NAME || "platform-artifacts" : "database",
    key: storageKey || `platform:${saved.id}`,
    publicUrl,
    artifactId: saved.id,
    checksumSha256,
  })
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
    if (event.event !== "text_delta") {
      await appendPlatformRunEvent(runtimeRun.taskRunId, { level: event.event === "runtime_error" ? "error" : "info", message: typeof event.event === "string" ? event.event : "runtime_event", payload: event })
    }
  }
  const textDelta = newEvents.map((item) => item.event).filter((event) => event.event === "text_delta" && typeof event.delta === "string").map((event) => String(event.delta)).join("")
  const previousText = typeof previous.runtimeText === "string" ? previous.runtimeText : ""
  const text = `${previousText}${textDelta}`.slice(-200_000)
  const taskInput = (platformRun.inputPayload || {}) as Record<string, unknown>
  const conversationId = typeof taskInput.conversationId === "string" ? taskInput.conversationId : null
  const normalizedArtifactEvents: Array<Record<string, unknown>> = []
  let savedArtifactCount = 0
  const callbackArtifacts = selectFinalRuntimeArtifacts(newEvents
    .map((item) => item.event || {})
    .filter((event) =>
      (event.event === "artifact_reference" || event.event === "artifact_payload") &&
      event.artifact &&
      typeof event.artifact === "object",
    )
    .map((event) => event.artifact as RuntimeArtifactPayload | RuntimeArtifactReference))
  for (const artifact of callbackArtifacts) {
    const normalizedEvent = await persistRuntimeArtifactForCallback({
      runtimeRunId: payload.runId,
      taskRun: platformRun,
      artifact,
    })
    normalizedArtifactEvents.push(normalizedEvent)
    savedArtifactCount += 1
  }
  const artifacts = selectFinalRuntimeArtifacts(
    normalizedArtifactEvents
      .map((event) => asRecord(event.artifact))
      .filter((artifact): artifact is Record<string, unknown> => Boolean(artifact)),
  )
  const assistantContent = buildRuntimeAssistantMessage(text, artifacts)
  let assistantMessagePersisted = previous.assistantMessagePersisted === true
  if (payload.status === "succeeded" && assistantContent && conversationId && !assistantMessagePersisted) {
    await appendAiEntryMessage({ userId: platformRun.userId, conversationId, role: "assistant", content: assistantContent, idempotencyKey: `opencode:${payload.runId}:assistant`, agentId: typeof taskInput.agentId === "string" ? taskInput.agentId : null })
    assistantMessagePersisted = true
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
  const normalizedEvents = filterTaskProgressEvents([
    ...events
      .map((item) => item.event)
      .filter((event) => event?.event !== "artifact_payload"),
    ...normalizedArtifactEvents,
  ]).map((event) => {
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
  await updatePlatformTaskRun(runtimeRun.taskRunId, { status: taskStatus(payload.status), normalizedResult: nextResult, startedAt: payload.status === "running" && !platformRun.startedAt ? new Date() : undefined, finishedAt: ["succeeded", "failed", "cancelled", "timed_out"].includes(payload.status) ? new Date() : undefined })
  return NextResponse.json({ ok: true, runtimeRunId: payload.runId, status: payload.status })
}
