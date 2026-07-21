import { createHash } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"

import type { RuntimeArtifactPayload } from "@/lib/ai-runtime/contracts"
import { runtimeArtifactExtensions } from "@/lib/ai-entry/runtime/artifact-policy"
import { selectFinalRuntimeArtifacts, validateRuntimeArtifactPayload } from "@/lib/ai-entry/runtime/artifact-detector"
import { buildRuntimeAssistantMessage } from "@/lib/ai-entry/runtime/assistant-message"
import { appendAiEntryMessage, recordAiEntryRuntimeArtifactContext, recordAiEntryRuntimeProjectSnapshot } from "@/lib/ai-entry/repository"
import { isRailwayRuntimeTerminal, platformTaskStatusFromRailway } from "@/lib/ai-entry/runtime/railway-task-status"
import { isValidRuntimeProjectSnapshot } from "@/lib/ai-runtime/contracts"
import { estimateTextCredits } from "@/lib/billing/costing"
import { finalizeReservedCredits, releaseReservedCredits, type BillingReservation } from "@/lib/billing/runtime"
import { isPlatformArtifactR2Available, uploadPlatformArtifactBufferToR2 } from "@/lib/platform/artifact-storage"
import { displayRuntimeArtifactFileName } from "@/lib/ai-entry/runtime/artifact-detector"
import { filterTaskProgressEvents, isTaskProgressEvent } from "@/lib/ai-entry/runtime/runtime-events"
import {
  appendRailwayOpenCodeRuntimeEvent,
  getOpenCodeRuntimeRunByRuntimeId,
  getRailwayOpenCodeRuntimeState,
  updateRailwayOpenCodeRuntimeState,
  updateOpenCodeRuntimeRun,
  type OpenCodeRuntimeRunStatus,
} from "@/lib/platform/opencode-runtime-store"
import {
  appendPlatformRunEvent,
  getPlatformTaskRun,
  savePlatformArtifact,
  updatePlatformTaskRun,
} from "@/lib/platform/task-run-store"

function authorized(request: NextRequest) {
  const expected = process.env.RUNTIME_STATE_TOKEN?.trim() || process.env.OPENCODE_RUNTIME_STATE_TOKEN?.trim() || ""
  return Boolean(expected) && request.headers.get("authorization") === `Bearer ${expected}`
}

function validRunId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/iu.test(value)
}

function validStatus(value: unknown): value is OpenCodeRuntimeRunStatus {
  return value === "queued" || value === "running" || value === "waiting" || value === "succeeded" || value === "failed" || value === "cancelled" || value === "timed_out"
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function artifactContractForRun(inputPayload: Record<string, unknown>, agentId: string | null) {
  const configured = asRecord(inputPayload.artifactContract)
  const allowedExtensions = Array.isArray(configured?.allowedExtensions)
    ? configured.allowedExtensions.filter((value): value is string => typeof value === "string")
    : runtimeArtifactExtensions(agentId, inputPayload.selectedSkillIds)
  return {
    maxArtifacts: typeof configured?.maxArtifacts === "number" ? configured.maxArtifacts : Number.parseInt(process.env.RAILWAY_OPENCODE_MAX_ARTIFACTS || "24", 10),
    maxArtifactBytes: typeof configured?.maxArtifactBytes === "number" ? configured.maxArtifactBytes : Number.parseInt(process.env.RAILWAY_OPENCODE_MAX_ARTIFACT_BYTES || String(2 * 1024 * 1024), 10),
    maxArtifactTotalBytes: typeof configured?.maxArtifactTotalBytes === "number" ? configured.maxArtifactTotalBytes : Number.parseInt(process.env.RAILWAY_OPENCODE_MAX_ARTIFACT_TOTAL_BYTES || String(16 * 1024 * 1024), 10),
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
      fileName: typeof artifact.path === "string"
        ? displayRuntimeArtifactFileName(artifact.path.replace(/^artifacts\//u, ""))
        : typeof artifact.title === "string" && artifact.title.trim() ? displayRuntimeArtifactFileName(artifact.title) : "artifact",
      title: typeof artifact.title === "string" ? artifact.title : "OpenCode artifact",
      kind: typeof artifact.kind === "string" ? artifact.kind : "file",
      mimeType: typeof artifact.mimeType === "string" ? artifact.mimeType : "application/octet-stream",
      sizeBytes: typeof artifact.sizeBytes === "number" ? artifact.sizeBytes : 0,
      checksumSha256: reference.checksumSha256 || null,
      artifactId: reference.artifactId || null,
    },
  } satisfies Record<string, unknown>
}

async function persistRailwayArtifact(input: {
  runtimeRunId: string
  taskRun: Awaited<ReturnType<typeof getPlatformTaskRun>>
  artifact: RuntimeArtifactPayload
}) {
  if (!input.taskRun) throw new Error("opencode_runtime_task_run_not_found")
  const taskInput = asRecord(input.taskRun.inputPayload) || {}
  const incomingFileName = typeof input.artifact.path === "string" ? input.artifact.path : ""
  const existing = input.taskRun.artifacts.find((item) => {
    const payload = asRecord(item.payload)
    const existingName = typeof payload?.fileName === "string" ? payload.fileName : typeof payload?.runtimePath === "string" ? payload.runtimePath : ""
    return payload?.runtimeRunId === input.runtimeRunId && (payload.runtimePath === input.artifact.path || displayRuntimeArtifactFileName(existingName).toLowerCase() === displayRuntimeArtifactFileName(incomingFileName).toLowerCase())
  })
  if (existing) return artifactReferenceEvent(input.artifact as unknown as Record<string, unknown>, {
    provider: existing.storageKey ? "r2" : "platform",
    bucket: existing.storageKey ? (process.env.R2_BUCKET_NAME || "platform-artifacts") : "database",
    key: existing.storageKey || `platform:${existing.id}`,
    publicUrl: existing.externalUrl,
    artifactId: existing.id,
  })

  const contract = artifactContractForRun(taskInput, typeof taskInput.agentId === "string" ? taskInput.agentId : null)
  const currentTotalBytes = input.taskRun.artifacts.reduce((total, item) => total + (Number(asRecord(item.payload)?.runtimeSizeBytes) || 0), 0)
  const validated = validateRuntimeArtifactPayload(input.artifact, contract, currentTotalBytes)
  const buffer = Buffer.from(validated.contentBase64, "base64")
  const checksumSha256 = createHash("sha256").update(validated.contentBase64, "base64").digest("hex")
  const sameContent = input.taskRun.artifacts.find((item) => {
    const payload = asRecord(item.payload)
    return payload?.runtimeRunId === input.runtimeRunId && payload?.checksumSha256 === checksumSha256
  })
  if (sameContent) return artifactReferenceEvent(input.artifact as unknown as Record<string, unknown>, {
    provider: sameContent.storageKey ? "r2" : "platform",
    bucket: sameContent.storageKey ? (process.env.R2_BUCKET_NAME || "platform-artifacts") : "database",
    key: sameContent.storageKey || `platform:${sameContent.id}`,
    publicUrl: sameContent.externalUrl,
    artifactId: sameContent.id,
    checksumSha256,
  })
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
    source: "chat",
  })
  const conversationId = typeof taskInput.conversationId === "string" ? taskInput.conversationId : null
  if (conversationId) {
    const extension = validated.fileName.includes(".") ? validated.fileName.split(".").at(-1) || "file" : "file"
    await recordAiEntryRuntimeArtifactContext({
      userId: input.taskRun.userId,
      conversationId,
      agentId: typeof taskInput.agentId === "string" ? taskInput.agentId : null,
      artifact: { artifactId: saved.id, title: saved.title, kind: extension, summary: `${validated.fileName} (${validated.mimeType})` },
      ...(extension === "pptx" ? { exportContext: { previewSessionId: input.runtimeRunId } } : {}),
    }).catch(() => undefined)
  }
  return artifactReferenceEvent(input.artifact as unknown as Record<string, unknown>, {
    provider: storageKey ? "r2" : "platform",
    bucket: storageKey ? (process.env.R2_BUCKET_NAME || "platform-artifacts") : "database",
    key: storageKey || `platform:${saved.id}`,
    publicUrl,
    artifactId: saved.id,
    checksumSha256,
  })
}

async function syncRailwayTask(input: { runtimeRunId: string; status: OpenCodeRuntimeRunStatus; state: Awaited<ReturnType<typeof getRailwayOpenCodeRuntimeState>> }) {
  if (!input.state) return
  const runtimeRun = await getOpenCodeRuntimeRunByRuntimeId(input.runtimeRunId)
  if (!runtimeRun) return
  const platformRun = await getPlatformTaskRun(runtimeRun.taskRunId)
  if (!platformRun) return
  const previous = asRecord(platformRun.normalizedResult) || {}
  const seenSequences = new Set(Array.isArray(previous.railwayEventSequences) ? previous.railwayEventSequences.map(Number).filter(Number.isFinite) : [])
  const newEvents = input.state.events.filter((item) => !seenSequences.has(item.sequence))
  for (const item of newEvents) {
    seenSequences.add(item.sequence)
    const event = asRecord(item.event) || {}
    if (!isTaskProgressEvent(event)) continue
    await appendPlatformRunEvent(runtimeRun.taskRunId, {
      level: event.event === "runtime_error" ? "error" : "info",
      message: typeof event.event === "string" ? event.event : "runtime_event",
      payload: event,
    })
  }
  const allEvents = input.state.events.map((item) => asRecord(item.event)).filter((event): event is Record<string, unknown> => Boolean(event))
  const text = allEvents.filter((event) => event.event === "text_delta" && typeof event.delta === "string").map((event) => String(event.delta)).join("").slice(-200_000)
  const artifactEvents = selectFinalRuntimeArtifacts(allEvents
    .filter((event) => event.event === "artifact_reference" && asRecord(event.artifact))
    .map((event) => asRecord(event.artifact) || {}))
  const taskInput = asRecord(platformRun.inputPayload) || {}
  const conversationId = typeof taskInput.conversationId === "string" ? taskInput.conversationId : null
  const terminalNow = isRailwayRuntimeTerminal(input.status)
  let assistantMessagePersisted = previous.assistantMessagePersisted === true
  if (input.status === "succeeded" && conversationId && !assistantMessagePersisted) {
    const assistantMessage = buildRuntimeAssistantMessage(text, artifactEvents)
    if (assistantMessage) {
      await appendAiEntryMessage({ userId: platformRun.userId, conversationId, role: "assistant", content: assistantMessage, idempotencyKey: `opencode:${input.runtimeRunId}:assistant`, agentId: typeof taskInput.agentId === "string" ? taskInput.agentId : null })
      assistantMessagePersisted = true
    }
  }
  const reservation = asRecord(taskInput.billingReservation) as BillingReservation | null
  let billingFinalized = previous.billingFinalized === true
  if (terminalNow && !billingFinalized) {
    if (input.status === "succeeded") {
      const usage = allEvents.filter((event) => event.event === "usage").at(-1)
      const actual = estimateTextCredits({ featureKey: "ai_entry_chat", inputTokens: typeof usage?.inputTokens === "number" ? usage.inputTokens : Math.max(1, Math.ceil(text.length / 4)), outputTokens: typeof usage?.outputTokens === "number" ? usage.outputTokens : Math.max(1, Math.ceil(text.length / 4)), provider: "opencode", model: "opencode" })
      await finalizeReservedCredits({ reservation, userId: platformRun.userId, enterpriseId: platformRun.enterpriseId, actualAmount: actual.credits, idempotencyKey: `ai-entry:${input.runtimeRunId}:debit`, provider: "opencode", model: "opencode", officialCostUsd: actual.officialCostUsd, costBasisUsd: actual.costBasisUsd, usagePayload: actual.metadata, metadata: { runtimeRunId: input.runtimeRunId } }).catch(() => undefined)
    } else {
      await releaseReservedCredits({ reservation, userId: platformRun.userId, enterpriseId: platformRun.enterpriseId, idempotencyKey: `ai-entry:${input.runtimeRunId}:release`, reason: `opencode_v2_${input.status}` }).catch(() => undefined)
    }
    billingFinalized = true
  }
  const normalizedEvents = filterTaskProgressEvents(allEvents).slice(-100).map((event) => {
    const type = typeof event.event === "string" ? event.event : "runtime_event"
    return { type, label: type, detail: typeof event.message === "string" ? event.message : typeof event.delta === "string" ? event.delta.slice(0, 240) : undefined, status: type === "runtime_error" ? "failed" : ["done", "artifact_reference", "checkpoint_saved"].includes(type) ? "completed" : "running", at: typeof event.at === "number" ? event.at : Math.floor(Date.now() / 1000) }
  })
  const nextResult = {
    ...previous,
    railwayEventSequences: [...seenSequences].slice(-500),
    runtimeRunId: input.runtimeRunId,
    assistantMessagePersisted,
    runtimeText: assistantMessagePersisted ? undefined : text,
    billingFinalized,
    artifacts: artifactEvents.length,
    events: normalizedEvents,
    stage: input.status === "queued" ? "runtime_queued" : input.status === "succeeded" ? "runtime_publishing" : terminalNow ? "runtime_failed" : "runtime_running",
    lastHeartbeatAt: Math.floor(Date.now() / 1000),
  }
  const checkpoint = allEvents.filter((event) => event.event === "checkpoint_saved").at(-1)?.checkpoint
  await updateOpenCodeRuntimeRun(input.runtimeRunId, {
    status: input.status,
    workspaceBackup: asRecord(checkpoint),
    clearLease: terminalNow,
    finishedAt: terminalNow ? new Date() : undefined,
  })
  await updatePlatformTaskRun(runtimeRun.taskRunId, {
    status: platformTaskStatusFromRailway(input.status),
    normalizedResult: nextResult,
    startedAt: input.status === "running" && !platformRun.startedAt ? new Date() : undefined,
    finishedAt: terminalNow ? new Date() : undefined,
  })
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "runtime_state_unauthorized" }, { status: 401 })
  let payload: { runId?: unknown; status?: unknown; event?: unknown; error?: unknown }
  try { payload = await request.json() as typeof payload } catch { return NextResponse.json({ error: "runtime_state_invalid_json" }, { status: 400 }) }
  if (!validRunId(payload.runId)) return NextResponse.json({ error: "runtime_state_run_id_invalid" }, { status: 400 })
  if (payload.status !== undefined && !validStatus(payload.status)) return NextResponse.json({ error: "runtime_state_status_invalid" }, { status: 400 })
  const status = payload.status as OpenCodeRuntimeRunStatus | undefined
  if (payload.event !== undefined && (!payload.event || typeof payload.event !== "object" || Array.isArray(payload.event))) return NextResponse.json({ error: "runtime_state_event_invalid" }, { status: 400 })
  try {
    const runtimeRun = await getOpenCodeRuntimeRunByRuntimeId(payload.runId)
    const platformRun = runtimeRun ? await getPlatformTaskRun(runtimeRun.taskRunId) : null
    let event = payload.event as Record<string, unknown> | undefined
    if (event?.event === "artifact_payload" && event.artifact && platformRun) {
      event = await persistRailwayArtifact({ runtimeRunId: payload.runId, taskRun: platformRun, artifact: event.artifact as RuntimeArtifactPayload })
    }
    if (!payload.event) {
      const state = await updateRailwayOpenCodeRuntimeState(payload.runId, { status, error: typeof payload.error === "string" ? payload.error : payload.error === null ? null : undefined })
      const currentState = await getRailwayOpenCodeRuntimeState(payload.runId, 0)
      await syncRailwayTask({ runtimeRunId: payload.runId, status: currentState?.status || status || "running", state: currentState || state })
      return NextResponse.json({ ok: true, state })
    }
    const state = await appendRailwayOpenCodeRuntimeEvent({
      runtimeRunId: payload.runId,
      event: event || {},
      status,
      error: typeof payload.error === "string" ? payload.error : payload.error === null ? null : undefined,
    })
    const checkpoint = (payload.event as Record<string, unknown>).checkpoint
    const projectSnapshot = checkpoint && typeof checkpoint === "object" && !Array.isArray(checkpoint)
      ? (checkpoint as Record<string, unknown>).projectSnapshot
      : null
    if (isValidRuntimeProjectSnapshot(projectSnapshot)) {
      const runtimeRun = await getOpenCodeRuntimeRunByRuntimeId(payload.runId)
      const platformRun = runtimeRun ? await getPlatformTaskRun(runtimeRun.taskRunId) : null
      if (runtimeRun?.conversationId && platformRun) {
        await recordAiEntryRuntimeProjectSnapshot({
          userId: platformRun.userId,
          conversationId: runtimeRun.conversationId,
          projectSnapshot,
          scope: "chat",
          agentId: runtimeRun.agentId,
        }).catch((error) => {
          console.warn("opencode-runtime.project_snapshot.persist_failed", {
            runId: payload.runId,
            conversationId: runtimeRun.conversationId,
            message: error instanceof Error ? error.message : String(error),
          })
        })
      }
    }
    const currentState = await getRailwayOpenCodeRuntimeState(payload.runId, 0)
    await syncRailwayTask({ runtimeRunId: payload.runId, status: currentState?.status || status || "running", state: currentState || state })
    return NextResponse.json({ ok: true, state })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "runtime_state_write_failed" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "runtime_state_unauthorized" }, { status: 401 })
  const runId = request.nextUrl.searchParams.get("runId")
  const after = Number.parseInt(request.nextUrl.searchParams.get("after") || "0", 10)
  if (!validRunId(runId)) return NextResponse.json({ error: "runtime_state_run_id_invalid" }, { status: 400 })
  const state = await getRailwayOpenCodeRuntimeState(runId, Number.isFinite(after) ? after : 0)
  if (!state) return NextResponse.json({ error: "run_not_found" }, { status: 404 })
  return NextResponse.json(state)
}
