import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { platformTaskRuns } from "@/lib/db/schema"
import {
  appendPlatformRunEvent,
  createPlatformTaskRun,
  getPlatformTaskRun,
  type HydratedPlatformTaskRun,
  type PlatformTaskRunStatus,
} from "@/lib/platform/task-run-store"
import { settleVideoBillingForRun } from "@/lib/platform/video-billing-settlement"
import { buildBailianUrl, getBailianConfig, isBailianConfigured, type BailianConfig } from "@/lib/platform/bailian"

type BailianRuntimeUser = { id: number; enterpriseId: number | null }
type BailianVideoFeatureId = "text-to-video"
type BailianVideoResult = { url?: string | null; outputType?: string | null; text?: string | null; title?: string | null }

export type BailianVideoTask = {
  taskId: string
  mediaTarget: "ai-video"
  requestedTarget: BailianVideoFeatureId
  provider: "bailian"
  status: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED"
  results: BailianVideoResult[]
  extra?: Record<string, unknown> | null
  raw?: Record<string, unknown> | null
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function numberValue(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function mapStatus(value: unknown): BailianVideoTask["status"] {
  const normalized = text(value).toUpperCase()
  if (normalized === "SUCCEEDED" || normalized === "SUCCESS") return "SUCCESS"
  if (normalized === "FAILED" || normalized === "CANCELED" || normalized === "CANCELLED") return "FAILED"
  if (normalized === "PENDING" || normalized === "QUEUED") return "QUEUED"
  return "RUNNING"
}

export function getBailianVideoConfig(): BailianConfig {
  return getBailianConfig()
}

export function isBailianVideoConfigured(config = getBailianConfig()) {
  return isBailianConfigured(config)
}

export function buildBailianVideoCreateBody(params: Record<string, unknown>, model: string) {
  const prompt = text(params.prompt)
  if (!prompt) throw new Error("video_prompt_required")
  const resolution = text(params.resolution).toUpperCase()
  const ratio = text(params.ratio)
  return {
    model,
    input: { prompt },
    parameters: {
      resolution: resolution === "720P" ? "720P" : "1080P",
      ratio: ratio || "16:9",
      duration: Math.max(3, Math.min(15, numberValue(params.duration, 5))),
    },
  }
}

async function requestBailian<T>(path: string, init: { method: "GET" | "POST"; body?: Record<string, unknown>; config?: BailianConfig; asyncRequest?: boolean }) {
  const config = init.config || getBailianConfig()
  if (!isBailianConfigured(config)) throw new Error("bailian_not_configured")
  const response = await fetch(buildBailianUrl(config.baseUrl, path), {
    method: init.method,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...(init.asyncRequest ? { "X-DashScope-Async": "enable" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  })
  const payload = (await response.json().catch(() => null)) as T & Record<string, unknown> | null
  if (!response.ok) throw new Error(text(payload?.message) || text(payload?.code) || "bailian_video_request_failed")
  return payload || ({} as T)
}

async function createUpstreamTask(params: Record<string, unknown>, config: BailianConfig, model: string) {
  const payload = await requestBailian<Record<string, unknown>>("/api/v1/services/aigc/video-generation/video-synthesis", {
    method: "POST",
    config,
    asyncRequest: true,
    body: buildBailianVideoCreateBody(params, model),
  })
  const output = payload.output && typeof payload.output === "object" ? (payload.output as Record<string, unknown>) : payload
  const taskId = text(output.task_id) || text(payload.task_id)
  if (!taskId) throw new Error("bailian_video_missing_task_id")
  return { taskId, raw: payload }
}

async function queryUpstreamTask(taskId: string, config: BailianConfig) {
  const payload = await requestBailian<Record<string, unknown>>(`/api/v1/tasks/${encodeURIComponent(taskId)}`, {
    method: "GET",
    config,
  })
  const output = payload.output && typeof payload.output === "object" ? (payload.output as Record<string, unknown>) : {}
  const videoUrl = text(output.video_url)
  const status = mapStatus(output.task_status || payload.task_status)
  return { status, providerStatus: text(output.task_status || payload.task_status), videoUrl, raw: payload }
}

function requireEnterpriseId(user: BailianRuntimeUser) {
  if (typeof user.enterpriseId !== "number") throw new Error("platform_media_enterprise_required")
  return user.enterpriseId
}

async function patchRun(runId: number, patch: { status?: PlatformTaskRunStatus; normalizedResult?: Record<string, unknown>; externalRunId?: string; startedAt?: Date; finishedAt?: Date }) {
  await db.update(platformTaskRuns).set({ ...patch, externalSystem: "bailian", updatedAt: new Date() }).where(eq(platformTaskRuns.id, runId))
  const detail = await getPlatformTaskRun(runId)
  if (!detail) throw new Error("platform_media_run_not_found_after_update")
  return detail
}

function requestedTarget(_run: HydratedPlatformTaskRun): BailianVideoFeatureId {
  return "text-to-video"
}

function taskFromRun(run: HydratedPlatformTaskRun): BailianVideoTask {
  const result = run.normalizedResult && typeof run.normalizedResult === "object" ? run.normalizedResult : {}
  const results = Array.isArray(result.results) ? result.results as BailianVideoResult[] : []
  return {
    taskId: String(run.id),
    mediaTarget: "ai-video",
    requestedTarget: requestedTarget(run),
    provider: "bailian",
    status: run.status === "succeeded" ? "SUCCESS" : run.status === "failed" ? "FAILED" : run.status === "queued" ? "QUEUED" : "RUNNING",
    results,
    extra: result.extra && typeof result.extra === "object" ? result.extra as Record<string, unknown> : null,
    raw: result.raw && typeof result.raw === "object" ? result.raw as Record<string, unknown> : null,
  }
}

export async function executeBailianVideoFeature(input: { currentUser: BailianRuntimeUser; params: Record<string, unknown>; config?: BailianConfig; model: string }) {
  const enterpriseId = requireEnterpriseId(input.currentUser)
  const run = await createPlatformTaskRun({ enterpriseId, userId: input.currentUser.id, kind: "media", itemType: "capability", itemSlug: "text-to-video", status: "queued", inputPayload: input.params })
  await appendPlatformRunEvent(run.id, { level: "info", message: "media_queued", payload: { provider: "bailian", featureId: "text-to-video" } })
  const task = await createUpstreamTask(input.params, input.config || getBailianConfig(), input.model)
  const detail = await patchRun(run.id, {
    status: "running",
    externalRunId: task.taskId,
    startedAt: new Date(),
    normalizedResult: { requestedTarget: "text-to-video", provider: "bailian", status: "RUNNING", results: [], extra: { providerTaskId: task.taskId }, raw: task.raw },
  })
  return taskFromRun(detail)
}

export async function queryBailianVideoTask(input: { currentUser: BailianRuntimeUser; runId: number; config?: BailianConfig }) {
  const enterpriseId = requireEnterpriseId(input.currentUser)
  const [row] = await db.select().from(platformTaskRuns).where(and(eq(platformTaskRuns.id, input.runId), eq(platformTaskRuns.enterpriseId, enterpriseId)))
  if (!row) throw new Error("platform_media_task_not_found")
  const run = await getPlatformTaskRun(input.runId)
  if (!run) throw new Error("platform_media_task_not_found")
  if (!run.externalRunId || ["succeeded", "failed", "cancelled"].includes(run.status)) return taskFromRun(run)

  const query = await queryUpstreamTask(run.externalRunId, input.config || getBailianConfig())
  const nextStatus: PlatformTaskRunStatus = query.status === "SUCCESS" ? "succeeded" : query.status === "FAILED" ? "failed" : query.status === "QUEUED" ? "queued" : "running"
  const current = run.normalizedResult && typeof run.normalizedResult === "object" ? run.normalizedResult : {}
  const detail = await patchRun(run.id, {
    status: nextStatus,
    externalRunId: run.externalRunId,
    finishedAt: nextStatus === "succeeded" || nextStatus === "failed" ? new Date() : undefined,
    normalizedResult: {
      ...current,
      requestedTarget: "text-to-video",
      provider: "bailian",
      status: query.status,
      results: query.videoUrl ? [{ url: query.videoUrl, outputType: "video/mp4", text: "Bailian HappyHorse video result", title: "happyhorse-video.mp4" }] : [],
      extra: { ...(current.extra && typeof current.extra === "object" ? current.extra : {}), providerTaskId: run.externalRunId, providerStatus: query.providerStatus },
      raw: query.raw,
    },
  })
  if (nextStatus === "succeeded" || nextStatus === "failed") {
    await settleVideoBillingForRun(detail).catch((error) => console.warn("platform.bailian-video.billing.settle_failed", { runId: detail.id, message: error instanceof Error ? error.message : String(error) }))
  }
  return taskFromRun(detail)
}
