import { and, eq, inArray } from "drizzle-orm"

import type { AuthUser } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { platformTaskRuns } from "@/lib/db/schema"
import type { PlatformExecutionProxyTarget } from "@/lib/platform/execute"
import {
  platformTaskRunStore,
  type HydratedPlatformTaskRun,
  type PlatformTaskRunStatus,
  type PlatformTaskRunStore,
} from "@/lib/platform/task-run-store"

type EnterpriseAuthUser = AuthUser & { enterpriseId: number }

type WorkflowRunPersistence = Pick<
  PlatformTaskRunStore,
  | "createPlatformTaskRun"
  | "appendPlatformRunEvent"
  | "getPlatformTaskRun"
  | "savePlatformArtifact"
  | "promotePlatformArtifactToWorkItem"
> & {
  patchPlatformTaskRun?: (runId: number, patch: PlatformWorkflowRunPatch) => Promise<boolean | void>
}

export type PlatformWorkflowRunPatch = {
  status?: PlatformTaskRunStatus
  /** Optional compare-and-set guard used by retry/cancel orchestration. */
  expectedStatus?: PlatformTaskRunStatus | readonly PlatformTaskRunStatus[]
  normalizedResult?: Record<string, unknown> | null
  externalSystem?: string | null
  externalRunId?: string | null
  startedAt?: Date | null
  finishedAt?: Date | null
}

type CreatePlatformWorkflowRunInput = {
  currentUser: AuthUser
  slug: string
  action?: string | null
  bindingTarget?: string | null
  inputPayload?: Record<string, unknown> | null
  store?: WorkflowRunPersistence
}

type UpdatePlatformWorkflowRunInput = {
  runId: number
  patch: PlatformWorkflowRunPatch
  event?:
    | {
        level: "info" | "warn" | "error"
        message: string
        payload?: Record<string, unknown> | null
      }
    | undefined
  store?: WorkflowRunPersistence
}

type GetPlatformWorkflowRunDetailInput = {
  runId: number
  currentUser: AuthUser
  store?: WorkflowRunPersistence
}

type RecordPlatformWorkflowProxyResultInput = {
  runId: number
  response: Response
  target: PlatformExecutionProxyTarget
  bindingTarget: string
  store?: WorkflowRunPersistence
}

type RecordPlatformWorkflowProxyFailureInput = {
  runId: number
  error: unknown
  target: PlatformExecutionProxyTarget
  bindingTarget: string
  store?: WorkflowRunPersistence
}

function resolveWorkflowRunStore(store?: WorkflowRunPersistence): WorkflowRunPersistence {
  return store ?? platformTaskRunStore
}

async function patchPlatformWorkflowRunRecord(runId: number, patch: PlatformWorkflowRunPatch) {
  const nextValues: Partial<typeof platformTaskRuns.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  }

  if (patch.status !== undefined) nextValues.status = patch.status
  if (patch.normalizedResult !== undefined) nextValues.normalizedResult = patch.normalizedResult
  if (patch.externalSystem !== undefined) nextValues.externalSystem = patch.externalSystem
  if (patch.externalRunId !== undefined) nextValues.externalRunId = patch.externalRunId
  if (patch.startedAt !== undefined) nextValues.startedAt = patch.startedAt
  if (patch.finishedAt !== undefined) nextValues.finishedAt = patch.finishedAt

  const terminalStatus = patch.status === "succeeded" || patch.status === "failed" || patch.status === "cancelled"
  const allowedStatuses = patch.status === "cancelled"
    ? ["queued", "running", "cancel_requested"] as const
    : terminalStatus
      ? ["queued", "running"] as const
      : null
  const expectedStatuses = patch.expectedStatus === undefined
    ? null
    : Array.isArray(patch.expectedStatus)
      ? patch.expectedStatus
      : [patch.expectedStatus]
  // An explicit expectedStatus is a caller-owned compare-and-set contract.
  // Never replace it with the broad terminal transition guard: doing so lets a
  // late worker completion overwrite a cancellation request.  The default
  // allowedStatuses guard remains for legacy callers that do not provide CAS.
  const statusPredicate = expectedStatuses
    ? inArray(platformTaskRuns.status, expectedStatuses)
    : allowedStatuses
      ? inArray(platformTaskRuns.status, allowedStatuses)
      : null
  const [updated] = await db
    .update(platformTaskRuns)
    .set(nextValues)
    .where(statusPredicate ? and(eq(platformTaskRuns.id, runId), statusPredicate) : eq(platformTaskRuns.id, runId))
    .returning({ id: platformTaskRuns.id })
  if (!updated && patch.expectedStatus !== undefined) return false
  return true
}

function assertEnterpriseUser(currentUser: AuthUser): asserts currentUser is EnterpriseAuthUser {
  if (!currentUser?.id) {
    throw new Error("workflow_run_user_required")
  }

  if (!currentUser.enterpriseId) {
    throw new Error("workflow_run_enterprise_required")
  }
}

function serializeDate(value: Date | null | undefined) {
  return value instanceof Date ? value.toISOString() : null
}

function serializeRecordWithDates<T extends Record<string, unknown>>(record: T) {
  return JSON.parse(JSON.stringify(record)) as T
}

function normalizeUnknownForStorage(value: unknown): Record<string, unknown> | null {
  if (value == null) return null
  if (Array.isArray(value)) {
    return {
      kind: "array",
      items: value.slice(0, 10),
      totalItems: value.length,
      truncated: value.length > 10,
    }
  }
  if (typeof value === "object") {
    return serializeRecordWithDates(value as Record<string, unknown>)
  }
  if (typeof value === "string") {
    return {
      kind: "text",
      text: value.slice(0, 4000),
      truncated: value.length > 4000,
    }
  }
  return {
    kind: typeof value,
    value,
  }
}

async function summarizeProxyResponse(response: Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? null
  const cloned = response.clone()
  let payload: unknown = null

  if (contentType?.includes("application/json")) {
    try {
      payload = await cloned.json()
    } catch {
      payload = null
    }
  } else if (!contentType || contentType.startsWith("text/")) {
    try {
      payload = await cloned.text()
    } catch {
      payload = null
    }
  }

  return {
    contentType,
    payload,
  }
}

const EXTERNAL_RUN_ID_KEYS = ["runId", "run_id", "taskId", "task_id", "jobId", "job_id"] as const

function extractExternalRunId(candidate: unknown, depth = 0): string | null {
  if (!candidate || typeof candidate !== "object" || depth > 3) return null

  if (Array.isArray(candidate)) {
    for (const item of candidate) {
      const nested = extractExternalRunId(item, depth + 1)
      if (nested) return nested
    }
    return null
  }

  const record = candidate as Record<string, unknown>
  for (const key of EXTERNAL_RUN_ID_KEYS) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }

  for (const value of Object.values(record)) {
    const nested = extractExternalRunId(value, depth + 1)
    if (nested) return nested
  }

  return null
}

function inferExternalSystem(target: PlatformExecutionProxyTarget) {
  if (target.downstreamPath.startsWith("/api/writer/")) return "writer"
  if (target.downstreamPath.startsWith("/api/video-agent/")) return "video-agent"
  if (target.downstreamPath.startsWith("/api/tools/ai-ppt-preview/")) return "ai-ppt"
  if (target.downstreamPath.startsWith("/api/platform/media/")) return "media"
  if (target.downstreamPath.startsWith("/api/ai/")) return "ai-entry"
  return "platform"
}

function inferWorkflowArtifactTitle(bindingTarget: string) {
  if (bindingTarget === "campaign-launch") return "Campaign launch output"
  if (bindingTarget === "content-repurpose") return "Content repurpose output"
  if (bindingTarget === "visual-ad-pipeline") return "Visual ad pipeline output"
  if (bindingTarget === "knowledge-base") return "Knowledge workflow output"
  return `${bindingTarget} output`
}

function inferWorkflowArtifactMimeType(contentType: string | null) {
  if (!contentType) return "application/json"
  return contentType.split(";")[0]?.trim() || "application/json"
}

function inferWorkflowWorkItemType(bindingTarget: string) {
  if (bindingTarget === "campaign-launch") return "deck" as const
  if (bindingTarget === "content-repurpose") return "article" as const
  return "document" as const
}

export function buildPlatformWorkflowRunInputPayload(rawBody: string, contentType?: string | null) {
  const trimmed = rawBody.trim()
  if (!trimmed) return null

  if (contentType?.toLowerCase().includes("application/json")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      return normalizeUnknownForStorage(parsed)
    } catch {
      return {
        kind: "invalid_json",
        rawText: trimmed.slice(0, 4000),
        truncated: trimmed.length > 4000,
      }
    }
  }

  return {
    kind: "raw_text",
    rawText: trimmed.slice(0, 4000),
    truncated: trimmed.length > 4000,
  }
}

export function buildPlatformWorkflowRunDetailPath(runId: number) {
  return `/api/platform/workflows/runs/${runId}`
}

export function serializePlatformWorkflowRun(run: HydratedPlatformTaskRun) {
  return {
    id: run.id,
    enterpriseId: run.enterpriseId,
    userId: run.userId,
    kind: run.kind,
    itemType: run.itemType,
    itemSlug: run.itemSlug,
    externalRunId: run.externalRunId,
    externalSystem: run.externalSystem,
    status: run.status,
    inputPayload: run.inputPayload,
    normalizedResult: run.normalizedResult,
    startedAt: serializeDate(run.startedAt),
    finishedAt: serializeDate(run.finishedAt),
    createdAt: serializeDate(run.createdAt),
    updatedAt: serializeDate(run.updatedAt),
    events: run.events.map((event) => ({
      id: event.id,
      runId: event.runId,
      level: event.level,
      message: event.message,
      payload: event.payload,
      createdAt: serializeDate(event.createdAt),
    })),
    artifacts: run.artifacts.map((artifact) => ({
      ...artifact,
      createdAt: serializeDate(artifact.createdAt),
    })),
    workItems: run.workItems.map((workItem) => ({
      ...workItem,
      createdAt: serializeDate(workItem.createdAt),
      updatedAt: serializeDate(workItem.updatedAt),
    })),
    knowledgeSaveJobs: run.knowledgeSaveJobs.map((job) => ({
      ...job,
      createdAt: serializeDate(job.createdAt),
      updatedAt: serializeDate(job.updatedAt),
    })),
  }
}

export function serializePlatformWorkflowRunStatus(run: HydratedPlatformTaskRun) {
  return {
    id: run.id,
    enterpriseId: run.enterpriseId,
    userId: run.userId,
    kind: run.kind,
    itemType: run.itemType,
    itemSlug: run.itemSlug,
    externalRunId: run.externalRunId,
    externalSystem: run.externalSystem,
    status: run.status,
    inputPayload: run.inputPayload,
    normalizedResult: run.normalizedResult,
    startedAt: serializeDate(run.startedAt),
    finishedAt: serializeDate(run.finishedAt),
    createdAt: serializeDate(run.createdAt),
    updatedAt: serializeDate(run.updatedAt),
  }
}

export async function createPlatformWorkflowRun(input: CreatePlatformWorkflowRunInput) {
  const store = resolveWorkflowRunStore(input.store)
  assertEnterpriseUser(input.currentUser)

  const run = await store.createPlatformTaskRun({
    enterpriseId: input.currentUser.enterpriseId,
    userId: input.currentUser.id,
    kind: "workflow",
    itemType: "workflow",
    itemSlug: input.slug,
    status: "queued",
    inputPayload: input.inputPayload ?? null,
  })

  await store.appendPlatformRunEvent(run.id, {
    level: "info",
    message: "workflow_queued",
    payload: {
      action: input.action?.trim() || "execute",
      bindingTarget: input.bindingTarget?.trim() || input.slug,
    },
  })

  const detail = await store.getPlatformTaskRun(run.id)
  if (!detail) {
    throw new Error("workflow_run_not_found_after_create")
  }

  return detail
}

export async function updatePlatformWorkflowRun(input: UpdatePlatformWorkflowRunInput) {
  const store = resolveWorkflowRunStore(input.store)
  const patchRun = store.patchPlatformTaskRun ?? patchPlatformWorkflowRunRecord

  const patched = await patchRun(input.runId, input.patch)
  if (patched === false) throw new Error("workflow_run_transition_conflict")
  if (input.event) {
    await store.appendPlatformRunEvent(input.runId, input.event)
  }

  const detail = await store.getPlatformTaskRun(input.runId)
  if (!detail) {
    throw new Error("workflow_run_not_found_after_update")
  }

  return detail
}

export async function recordPlatformWorkflowProxyResult(input: RecordPlatformWorkflowProxyResultInput) {
  const summary = await summarizeProxyResponse(input.response)
  const externalRunId = extractExternalRunId(summary.payload)
  const nextStatus: PlatformTaskRunStatus = input.response.ok
    ? (externalRunId ? "running" : "succeeded")
    : "failed"

  const detail = await updatePlatformWorkflowRun({
    runId: input.runId,
    store: input.store,
    patch: {
      status: nextStatus,
      expectedStatus: ["queued", "running"],
      externalRunId,
      externalSystem: inferExternalSystem(input.target),
      normalizedResult: {
        ok: input.response.ok,
        bindingTarget: input.bindingTarget,
        action: input.target.action,
        downstreamPath: input.target.downstreamPath,
        downstreamStatus: input.response.status,
        contentType: summary.contentType,
        externalRunId,
        response: normalizeUnknownForStorage(summary.payload),
      },
      finishedAt: nextStatus === "running" ? null : new Date(),
    },
    event: {
      level: input.response.ok ? "info" : "error",
      message:
        nextStatus === "running"
          ? "workflow_dispatched"
          : nextStatus === "succeeded"
            ? "workflow_succeeded"
            : "workflow_failed",
      payload: {
        bindingTarget: input.bindingTarget,
        downstreamPath: input.target.downstreamPath,
        downstreamStatus: input.response.status,
        externalRunId,
      },
    },
  })

  if (!input.response.ok) {
    return detail
  }

  const store = resolveWorkflowRunStore(input.store)
  const artifact = await store.savePlatformArtifact({
    runId: detail.id,
    enterpriseId: detail.enterpriseId,
    ownerUserId: detail.userId,
    kind: "json",
    title: inferWorkflowArtifactTitle(input.bindingTarget),
    mimeType: inferWorkflowArtifactMimeType(summary.contentType),
    payload: {
      bindingTarget: input.bindingTarget,
      action: input.target.action,
      downstreamPath: input.target.downstreamPath,
      downstreamStatus: input.response.status,
      externalRunId,
      response: normalizeUnknownForStorage(summary.payload),
    },
  })

  if (!externalRunId && detail.status === "succeeded") {
    await store.promotePlatformArtifactToWorkItem({
      sourceArtifactId: artifact.id,
      enterpriseId: detail.enterpriseId,
      ownerUserId: detail.userId,
      type: inferWorkflowWorkItemType(input.bindingTarget),
      title: artifact.title,
      metadata: {
        artifactId: artifact.id,
        runId: detail.id,
        bindingTarget: input.bindingTarget,
      },
    })
  }

  return (await store.getPlatformTaskRun(detail.id)) ?? detail
}

export async function recordPlatformWorkflowProxyFailure(input: RecordPlatformWorkflowProxyFailureInput) {
  return updatePlatformWorkflowRun({
    runId: input.runId,
    store: input.store,
    patch: {
      status: "failed",
      expectedStatus: ["queued", "running"],
      externalSystem: inferExternalSystem(input.target),
      normalizedResult: {
        ok: false,
        bindingTarget: input.bindingTarget,
        action: input.target.action,
        downstreamPath: input.target.downstreamPath,
        error:
          input.error instanceof Error
            ? input.error.message
            : typeof input.error === "string"
              ? input.error
              : "workflow_proxy_failed",
      },
      finishedAt: new Date(),
    },
    event: {
      level: "error",
      message: "workflow_dispatch_failed",
      payload: {
        bindingTarget: input.bindingTarget,
        downstreamPath: input.target.downstreamPath,
        error:
          input.error instanceof Error
            ? input.error.message
            : typeof input.error === "string"
              ? input.error
              : "workflow_proxy_failed",
      },
    },
  })
}

export async function getPlatformWorkflowRunDetail(input: GetPlatformWorkflowRunDetailInput) {
  const store = resolveWorkflowRunStore(input.store)
  assertEnterpriseUser(input.currentUser)

  const detail = await store.getPlatformTaskRun(input.runId)
  if (!detail) return null
  if (detail.kind !== "workflow" || detail.itemType !== "workflow") return null
  if (detail.enterpriseId !== input.currentUser.enterpriseId) return null

  return detail
}
