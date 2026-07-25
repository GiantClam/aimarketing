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
export type BailianVideoFeatureId = "text-to-video" | "image-to-video" | "reference-to-video" | "video-edit"
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

function nonNegativeInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

function booleanValue(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    if (value.trim().toLowerCase() === "true") return true
    if (value.trim().toLowerCase() === "false") return false
  }
  return fallback
}

function mediaUrls(value: unknown) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : []))
  }
  if (typeof value !== "string") return []
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)
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

function buildBailianVideoUrl(baseUrl: string, path: string) {
  const videoBaseUrl = baseUrl.replace(/\/compatible-mode\/v1\/?$/i, "")
  return buildBailianUrl(videoBaseUrl, path)
}

export function buildBailianVideoCreateBody(
  params: Record<string, unknown>,
  model: string,
  featureId: BailianVideoFeatureId = model.endsWith("-i2v")
    ? "image-to-video"
    : model.endsWith("-r2v")
      ? "reference-to-video"
      : model.endsWith("-video-edit")
        ? "video-edit"
        : "text-to-video",
) {
  const prompt = text(params.prompt)
  if (!prompt && featureId !== "image-to-video") throw new Error("video_prompt_required")

  const resolution = text(params.resolution).toUpperCase()
  const parameters: Record<string, unknown> = {
    resolution: resolution === "720P" ? "720P" : "1080P",
  }
  if (featureId !== "video-edit") {
    parameters.ratio = text(params.ratio) || "16:9"
    parameters.duration = Math.max(3, Math.min(15, numberValue(params.duration, 5)))
  }
  if (params.watermark !== undefined) parameters.watermark = booleanValue(params.watermark, true)
  const seed = nonNegativeInteger(params.seed)
  if (seed !== null) parameters.seed = seed

  if (featureId === "video-edit") {
    const sourceVideoUrl = text(params.sourceVideoUrl) || text(params.videoUrl)
    if (!sourceVideoUrl) throw new Error("video_source_required")
    const references = mediaUrls(params.referenceImageUrls ?? params.referenceImages ?? params.referenceUrls)
    parameters.audio_setting = text(params.audioSetting) || "auto"
    return {
      model,
      input: {
        prompt,
        media: [
          { type: "video", url: sourceVideoUrl },
          ...references.map((url) => ({ type: "reference_image", url })),
        ],
      },
      parameters,
    }
  }

  if (featureId === "image-to-video") {
    const firstFrameUrl = text(params.firstFrameUrl) || text(params.inputImageUrl)
    if (!firstFrameUrl) throw new Error("video_first_frame_required")
    return {
      model,
      input: {
        ...(prompt ? { prompt } : {}),
        media: [{ type: "first_frame", url: firstFrameUrl }],
      },
      parameters,
    }
  }

  if (featureId === "reference-to-video") {
    const references = mediaUrls(params.referenceImageUrls ?? params.referenceImages ?? params.referenceUrls)
    if (references.length === 0) throw new Error("video_reference_image_required")
    return {
      model,
      input: {
        prompt,
        media: references.map((url) => ({ type: "reference_image", url })),
      },
      parameters,
    }
  }

  return {
    model,
    input: { prompt },
    parameters,
  }
}

async function requestBailian<T>(path: string, init: { method: "GET" | "POST"; body?: Record<string, unknown>; config?: BailianConfig; asyncRequest?: boolean }) {
  const config = init.config || getBailianConfig()
  if (!isBailianConfigured(config)) throw new Error("bailian_not_configured")
  const response = await fetch(buildBailianVideoUrl(config.baseUrl, path), {
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

async function createUpstreamTask(
  params: Record<string, unknown>,
  config: BailianConfig,
  model: string,
  featureId: BailianVideoFeatureId,
) {
  const payload = await requestBailian<Record<string, unknown>>("/api/v1/services/aigc/video-generation/video-synthesis", {
    method: "POST",
    config,
    asyncRequest: true,
    body: buildBailianVideoCreateBody(params, model, featureId),
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

function requestedTarget(run: HydratedPlatformTaskRun): BailianVideoFeatureId {
  if (run.itemSlug === "image-to-video" || run.itemSlug === "reference-to-video" || run.itemSlug === "video-edit") {
    return run.itemSlug
  }
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

export async function executeBailianVideoFeature(input: {
  currentUser: BailianRuntimeUser
  featureId: BailianVideoFeatureId
  params: Record<string, unknown>
  config?: BailianConfig
  model: string
}) {
  const enterpriseId = requireEnterpriseId(input.currentUser)
  const run = await createPlatformTaskRun({ enterpriseId, userId: input.currentUser.id, kind: "media", itemType: "capability", itemSlug: input.featureId, status: "queued", inputPayload: input.params })
  await appendPlatformRunEvent(run.id, { level: "info", message: "media_queued", payload: { provider: "bailian", featureId: input.featureId } })
  const task = await createUpstreamTask(input.params, input.config || getBailianConfig(), input.model, input.featureId)
  const detail = await patchRun(run.id, {
    status: "running",
    externalRunId: task.taskId,
    startedAt: new Date(),
    normalizedResult: { requestedTarget: input.featureId, provider: "bailian", status: "RUNNING", results: [], extra: { providerTaskId: task.taskId }, raw: task.raw },
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
      requestedTarget: requestedTarget(run),
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
