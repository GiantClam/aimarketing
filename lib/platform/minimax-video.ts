import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { platformTaskRuns } from "@/lib/db/schema"
import {
  resolvePlatformArtifactSourceUrl,
} from "@/lib/platform/artifact-actions"
import {
  isPlatformArtifactR2Available,
  mirrorPlatformArtifactToR2,
} from "@/lib/platform/artifact-storage"
import {
  appendPlatformRunEvent,
  createPlatformTaskRun,
  getPlatformTaskRun,
  savePlatformArtifact,
  type HydratedPlatformTaskRun,
  type PlatformTaskRunStatus,
} from "@/lib/platform/task-run-store"
import type { MiniMaxAudioConfig } from "@/lib/platform/minimax-audio"
import { getMiniMaxAudioConfig, isMiniMaxAudioConfigured } from "@/lib/platform/minimax-audio"
import {
  DEFAULT_MINIMAX_VIDEO_MODEL,
  resolveMiniMaxVideoModelOption,
  type MiniMaxVideoFeatureId,
} from "@/lib/platform/minimax-video-options"

export type MiniMaxVideoConfig = MiniMaxAudioConfig

export type MiniMaxVideoResult = {
  url?: string | null
  outputType?: string | null
  text?: string | null
  title?: string | null
}

export type MiniMaxVideoTask = {
  taskId: string
  mediaTarget: "ai-video"
  requestedTarget: MiniMaxVideoFeatureId
  provider: "minimax"
  status: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED"
  results: MiniMaxVideoResult[]
  extra?: Record<string, unknown> | null
  raw?: Record<string, unknown> | null
}

type MiniMaxVideoRuntimeUser = {
  id: number
  enterpriseId: number | null
}

type MiniMaxBaseResp = {
  status_code?: number
  status_msg?: string
}

type MiniMaxVideoCreateResponse = {
  task_id?: string
  base_resp?: MiniMaxBaseResp
}

type MiniMaxVideoQueryResponse = {
  task_id?: string
  status?: string
  file_id?: string
  base_resp?: MiniMaxBaseResp
}

type MiniMaxFileRetrieveResponse = {
  file?: {
    file_id?: string | number
    bytes?: number
    filename?: string
    download_url?: string
  }
  base_resp?: MiniMaxBaseResp
}

type UpdateMiniMaxVideoRunPatch = {
  status?: PlatformTaskRunStatus
  normalizedResult?: Record<string, unknown> | null
  externalSystem?: string | null
  externalRunId?: string | null
  startedAt?: Date | null
  finishedAt?: Date | null
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeMiniMaxBaseUrl(value: string | undefined) {
  const trimmed = value?.trim() || "https://api.minimaxi.com/v1"
  return trimmed.replace(/\/+$/, "")
}

function toMiniMaxPath(path: string) {
  return path.startsWith("/") ? path : `/${path}`
}

function assertMiniMaxSuccess(payload: { base_resp?: MiniMaxBaseResp } | null | undefined, fallback: string) {
  const statusCode = payload?.base_resp?.status_code
  if (statusCode === undefined || statusCode === 0) return
  throw new Error(payload?.base_resp?.status_msg || fallback)
}

function createMiniMaxHeaders(config: MiniMaxVideoConfig, contentType?: string) {
  const headers = new Headers()
  headers.set("Authorization", `Bearer ${config.apiKey}`)
  if (contentType) headers.set("Content-Type", contentType)
  return headers
}

function coerceStringId(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "string" && value.trim()) return value.trim()
  return null
}

function normalizeMiniMaxDuration(value: unknown, resolutionMode: "hailuo" | "legacy") {
  if (resolutionMode === "legacy") return 6
  const normalized = normalizeOptionalText(value)
  if (normalized === "10") return 10
  return 6
}

export function normalizeMiniMaxVideoResolution(value: unknown, resolutionMode: "hailuo" | "legacy" = "hailuo") {
  if (resolutionMode === "legacy") return "720P"
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "1080p" || normalized === "1080") return "1080P"
  return "768P"
}

export function mapMiniMaxVideoStatus(value: string | null | undefined): MiniMaxVideoTask["status"] {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "success") return "SUCCESS"
  if (normalized === "fail" || normalized.includes("fail") || normalized.includes("error")) return "FAILED"
  if (normalized === "queueing" || normalized.includes("queue")) return "QUEUED"
  return "RUNNING"
}

function buildMiniMaxVideoDownloadPath(fileId: string) {
  return `/api/platform/minimax/video-files/${encodeURIComponent(fileId)}/download`
}

export function getMiniMaxVideoConfig(): MiniMaxVideoConfig {
  const shared = getMiniMaxAudioConfig()
  return {
    baseUrl: normalizeMiniMaxBaseUrl(process.env.LEAD_TOOLS_MINIMAX_BASE_URL || shared.baseUrl),
    apiKey: process.env.LEAD_TOOLS_MINIMAX_API_KEY?.trim() || shared.apiKey,
  }
}

export function isMiniMaxVideoConfigured(config = getMiniMaxVideoConfig()) {
  return isMiniMaxAudioConfigured(config)
}

async function requestMiniMaxVideoJson<T>(
  path: string,
  init: {
    method?: "GET" | "POST"
    query?: Record<string, string | number | null | undefined>
    body?: Record<string, unknown> | null
    config?: MiniMaxVideoConfig
  },
) {
  const config = init.config ?? getMiniMaxVideoConfig()
  if (!isMiniMaxVideoConfigured(config)) {
    throw new Error("minimax_not_configured")
  }

  const url = new URL(`${config.baseUrl}${toMiniMaxPath(path)}`)
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value === null || value === undefined || value === "") continue
    url.searchParams.set(key, String(value))
  }

  const response = await fetch(url, {
    method: init.method ?? "POST",
    headers: createMiniMaxHeaders(config, "application/json"),
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => null)) as T | null
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "base_resp" in payload
        ? ((payload as { base_resp?: MiniMaxBaseResp }).base_resp?.status_msg ?? "minimax_video_request_failed")
        : "minimax_video_request_failed"
    throw new Error(message)
  }

  return payload
}

export function buildMiniMaxVideoCreateBody(input: {
  featureId: MiniMaxVideoFeatureId
  params: Record<string, unknown>
  defaultModel?: string | null
}) {
  const prompt = normalizeOptionalText(input.params.prompt)
  const firstFrameImage = normalizeOptionalText(input.params.firstFrameUrl)

  if (!prompt && input.featureId === "text-to-video") {
    throw new Error("video_prompt_required")
  }
  if (!firstFrameImage && input.featureId === "image-to-video") {
    throw new Error("video_first_frame_required")
  }

  const modelOption = resolveMiniMaxVideoModelOption(
    input.featureId,
    normalizeOptionalText(input.params.model) || normalizeOptionalText(input.defaultModel) || DEFAULT_MINIMAX_VIDEO_MODEL,
  )

  const body: Record<string, unknown> = {
    model: modelOption.value,
    prompt: prompt || "Create a polished marketing video with smooth cinematic motion.",
    duration: normalizeMiniMaxDuration(input.params.duration, modelOption.resolutionMode),
    resolution: normalizeMiniMaxVideoResolution(input.params.resolution, modelOption.resolutionMode),
    prompt_optimizer: true,
  }

  if (input.featureId === "image-to-video" && firstFrameImage) {
    body.first_frame_image = firstFrameImage
  }

  return body
}

export async function createMiniMaxVideoGenerationTask(input: {
  featureId: MiniMaxVideoFeatureId
  params: Record<string, unknown>
  config?: MiniMaxVideoConfig
  defaultModel?: string | null
}) {
  const body = buildMiniMaxVideoCreateBody({
    featureId: input.featureId,
    params: input.params,
    defaultModel: input.defaultModel,
  })
  const payload = await requestMiniMaxVideoJson<MiniMaxVideoCreateResponse>("/video_generation", {
    body,
    config: input.config,
  })
  assertMiniMaxSuccess(payload, "minimax_video_generation_failed")

  const taskId = coerceStringId(payload?.task_id)
  if (!taskId) {
    throw new Error("minimax_video_missing_task_id")
  }

  return {
    taskId,
    body,
    raw: payload,
  }
}

export async function queryMiniMaxVideoGenerationTask(taskId: string, config = getMiniMaxVideoConfig()) {
  const payload = await requestMiniMaxVideoJson<MiniMaxVideoQueryResponse>("/query/video_generation", {
    method: "GET",
    query: { task_id: taskId },
    config,
  })
  assertMiniMaxSuccess(payload, "minimax_video_query_failed")
  return {
    taskId: coerceStringId(payload?.task_id) || taskId,
    fileId: coerceStringId(payload?.file_id),
    status: mapMiniMaxVideoStatus(payload?.status),
    providerStatus: normalizeOptionalText(payload?.status),
    raw: payload,
  }
}

export async function retrieveMiniMaxVideoFile(fileId: string, config = getMiniMaxVideoConfig()) {
  const payload = await requestMiniMaxVideoJson<MiniMaxFileRetrieveResponse>("/files/retrieve", {
    method: "GET",
    query: { file_id: fileId },
    config,
  })
  assertMiniMaxSuccess(payload, "minimax_video_download_failed")

  const downloadUrl = normalizeOptionalText(payload?.file?.download_url)
  if (!downloadUrl) {
    throw new Error("minimax_video_missing_download_url")
  }

  return {
    fileId: coerceStringId(payload?.file?.file_id) || fileId,
    downloadUrl,
    fileName: normalizeOptionalText(payload?.file?.filename),
    bytes: typeof payload?.file?.bytes === "number" ? payload.file.bytes : null,
    raw: payload,
  }
}

function requireEnterpriseId(currentUser: MiniMaxVideoRuntimeUser) {
  if (typeof currentUser.enterpriseId !== "number") {
    throw new Error("platform_media_enterprise_required")
  }
  return currentUser.enterpriseId
}

async function updateMiniMaxVideoRunRecord(runId: number, patch: UpdateMiniMaxVideoRunPatch) {
  const nextValues: Partial<typeof platformTaskRuns.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  }

  if (patch.status !== undefined) nextValues.status = patch.status
  if (patch.normalizedResult !== undefined) nextValues.normalizedResult = patch.normalizedResult
  if (patch.externalSystem !== undefined) nextValues.externalSystem = patch.externalSystem
  if (patch.externalRunId !== undefined) nextValues.externalRunId = patch.externalRunId
  if (patch.startedAt !== undefined) nextValues.startedAt = patch.startedAt
  if (patch.finishedAt !== undefined) nextValues.finishedAt = patch.finishedAt

  await db.update(platformTaskRuns).set(nextValues).where(eq(platformTaskRuns.id, runId))
}

async function createMiniMaxVideoRun(input: {
  currentUser: MiniMaxVideoRuntimeUser
  featureId: MiniMaxVideoFeatureId
  inputPayload?: Record<string, unknown> | null
}) {
  const enterpriseId = requireEnterpriseId(input.currentUser)
  const run = await createPlatformTaskRun({
    enterpriseId,
    userId: input.currentUser.id,
    kind: "media",
    itemType: "capability",
    itemSlug: input.featureId,
    status: "queued",
    inputPayload: input.inputPayload ?? null,
  })

  await appendPlatformRunEvent(run.id, {
    level: "info",
    message: "media_queued",
    payload: {
      provider: "minimax",
      featureId: input.featureId,
    },
  })

  const detail = await getPlatformTaskRun(run.id)
  if (!detail) {
    throw new Error("platform_media_run_not_found_after_create")
  }
  return detail
}

async function patchMiniMaxVideoRun(input: {
  runId: number
  patch: UpdateMiniMaxVideoRunPatch
  event?:
    | {
        level: "info" | "warn" | "error"
        message: string
        payload?: Record<string, unknown> | null
      }
    | undefined
}) {
  await updateMiniMaxVideoRunRecord(input.runId, input.patch)
  if (input.event) await appendPlatformRunEvent(input.runId, input.event)
  const detail = await getPlatformTaskRun(input.runId)
  if (!detail) {
    throw new Error("platform_media_run_not_found_after_update")
  }
  return detail
}

async function getMiniMaxVideoRunForUser(runId: number, currentUser: MiniMaxVideoRuntimeUser) {
  const enterpriseId = requireEnterpriseId(currentUser)
  const [row] = await db
    .select()
    .from(platformTaskRuns)
    .where(and(eq(platformTaskRuns.id, runId), eq(platformTaskRuns.enterpriseId, enterpriseId)))

  if (!row) return null
  return getPlatformTaskRun(row.id)
}

function resolveRequestedTarget(run: HydratedPlatformTaskRun): MiniMaxVideoFeatureId {
  return run.itemSlug === "image-to-video" ? "image-to-video" : "text-to-video"
}

function mapPlatformStatusToProviderStatus(status: string | null | undefined): MiniMaxVideoTask["status"] {
  if (status === "succeeded") return "SUCCESS"
  if (status === "failed" || status === "cancelled") return "FAILED"
  if (status === "queued") return "QUEUED"
  return "RUNNING"
}

function normalizeResultsFromTaskResult(
  normalizedResult: Record<string, unknown> | null | undefined,
  artifacts: HydratedPlatformTaskRun["artifacts"] = [],
) {
  const results = normalizedResult?.results
  const normalizedResults = !Array.isArray(results)
    ? []
    : results
        .map((item) => {
          if (!item || typeof item !== "object") return null
          const record = item as Record<string, unknown>
          return {
            url: normalizeOptionalText(record.url),
            outputType: normalizeOptionalText(record.outputType),
            text: normalizeOptionalText(record.text),
            title: normalizeOptionalText(record.title),
          }
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))

  if (normalizedResults.length === 0 && artifacts.length > 0) {
    return artifacts.map((artifact) => ({
      url: resolvePlatformArtifactSourceUrl(artifact),
      outputType: artifact.mimeType,
      text: null,
      title: artifact.title,
    }))
  }

  return normalizedResults
}

function buildTaskResponseFromRun(run: HydratedPlatformTaskRun): MiniMaxVideoTask {
  const normalizedResult =
    run.normalizedResult && typeof run.normalizedResult === "object" ? run.normalizedResult : null

  return {
    taskId: String(run.id),
    mediaTarget: "ai-video",
    requestedTarget: resolveRequestedTarget(run),
    provider: "minimax",
    status: mapPlatformStatusToProviderStatus(run.status),
    results: normalizeResultsFromTaskResult(normalizedResult, run.artifacts),
    extra:
      normalizedResult?.extra && typeof normalizedResult.extra === "object"
        ? (normalizedResult.extra as Record<string, unknown>)
        : null,
    raw:
      normalizedResult?.raw && typeof normalizedResult.raw === "object"
        ? (normalizedResult.raw as Record<string, unknown>)
        : null,
  }
}

function buildArtifactTitle(featureId: MiniMaxVideoFeatureId) {
  return `${featureId}-minimax-hailuo.mp4`
}

async function persistMiniMaxVideoArtifact(input: {
  run: HydratedPlatformTaskRun
  featureId: MiniMaxVideoFeatureId
  providerTaskId: string
  fileId: string
  downloadUrl: string
}) {
  const existingArtifact = input.run.artifacts[0]
  const title = buildArtifactTitle(input.featureId)
  let mirroredArtifact:
    | {
        storageKey: string
        publicUrl: string
        contentType: string
      }
    | null = null

  if (!existingArtifact && isPlatformArtifactR2Available()) {
    mirroredArtifact = await mirrorPlatformArtifactToR2({
      sourceUrl: input.downloadUrl,
      enterpriseId: input.run.enterpriseId,
      runId: input.run.id,
      provider: "minimax",
      title,
      contentType: "video/mp4",
      suggestedExtension: "mp4",
    }).catch(() => null)
  }

  const artifact =
    existingArtifact ||
    (await savePlatformArtifact({
      runId: input.run.id,
      enterpriseId: input.run.enterpriseId,
      ownerUserId: input.run.userId,
      kind: "file",
      title,
      mimeType: mirroredArtifact?.contentType || "video/mp4",
      storageKey: mirroredArtifact?.storageKey || null,
      externalUrl: input.downloadUrl,
      payload: {
        provider: "minimax",
        providerTaskId: input.providerTaskId,
        fileId: input.fileId,
        requestedTarget: input.featureId,
        mirroredUrl: mirroredArtifact?.publicUrl || null,
        upstreamUrl: input.downloadUrl,
      },
    }))
  const durableUrl = artifact.storageKey ? resolvePlatformArtifactSourceUrl(artifact) : null

  return {
    created: !existingArtifact,
    result: {
      url: durableUrl || buildMiniMaxVideoDownloadPath(input.fileId),
      outputType: artifact.mimeType || "video/mp4",
      text: "MiniMax Hailuo video result",
      title: artifact.title,
    } satisfies MiniMaxVideoResult,
  }
}

export function resolveMiniMaxVideoFeatureId(value: unknown): MiniMaxVideoFeatureId | null {
  return value === "image-to-video" || value === "text-to-video" || value === "ai-video"
    ? value === "image-to-video"
      ? "image-to-video"
      : "text-to-video"
    : null
}

export async function executeMiniMaxVideoFeature(input: {
  currentUser: MiniMaxVideoRuntimeUser
  featureId: MiniMaxVideoFeatureId
  params: Record<string, unknown>
  config?: MiniMaxVideoConfig
  defaultModel?: string | null
}) {
  const run = await createMiniMaxVideoRun({
    currentUser: input.currentUser,
    featureId: input.featureId,
    inputPayload: input.params,
  })

  const task = await createMiniMaxVideoGenerationTask({
    featureId: input.featureId,
    params: input.params,
    config: input.config,
    defaultModel: input.defaultModel,
  })

  const detail = await patchMiniMaxVideoRun({
    runId: run.id,
    patch: {
      status: "running",
      externalSystem: "minimax",
      externalRunId: task.taskId,
      startedAt: new Date(),
      normalizedResult: {
        requestedTarget: input.featureId,
        provider: "minimax",
        status: "RUNNING",
        results: [],
        extra: {
          providerTaskId: task.taskId,
          requestBody: task.body,
        },
        raw: task.raw as Record<string, unknown>,
      },
    },
    event: {
      level: "info",
      message: "minimax_video_task_submitted",
      payload: {
        providerTaskId: task.taskId,
        requestedTarget: input.featureId,
      },
    },
  })

  return buildTaskResponseFromRun(detail)
}

export async function queryMiniMaxVideoTask(input: {
  currentUser: MiniMaxVideoRuntimeUser
  runId: number
  config?: MiniMaxVideoConfig
}) {
  const run = await getMiniMaxVideoRunForUser(input.runId, input.currentUser)
  if (!run) {
    throw new Error("platform_media_task_not_found")
  }

  const featureId = resolveRequestedTarget(run)
  if (!run.externalRunId || run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") {
    return buildTaskResponseFromRun(run)
  }

  const query = await queryMiniMaxVideoGenerationTask(run.externalRunId, input.config)
  const currentNormalizedResult =
    run.normalizedResult && typeof run.normalizedResult === "object" ? run.normalizedResult : {}

  const file = query.status === "SUCCESS" && query.fileId
    ? await retrieveMiniMaxVideoFile(query.fileId, input.config)
    : null
  const persisted = file
    ? await persistMiniMaxVideoArtifact({
        run,
        featureId,
        providerTaskId: run.externalRunId,
        fileId: file.fileId,
        downloadUrl: file.downloadUrl,
      })
    : null

  const nextStatus: PlatformTaskRunStatus =
    query.status === "SUCCESS"
      ? "succeeded"
      : query.status === "FAILED"
        ? "failed"
        : query.status === "QUEUED"
          ? "queued"
          : "running"

  const detail = await patchMiniMaxVideoRun({
    runId: run.id,
    patch: {
      status: nextStatus,
      externalSystem: "minimax",
      externalRunId: run.externalRunId,
      finishedAt: nextStatus === "succeeded" || nextStatus === "failed" ? new Date() : null,
      normalizedResult: {
        ...currentNormalizedResult,
        requestedTarget: featureId,
        provider: "minimax",
        status: query.status,
        results: persisted ? [persisted.result] : [],
        extra: {
          ...(currentNormalizedResult.extra && typeof currentNormalizedResult.extra === "object"
            ? (currentNormalizedResult.extra as Record<string, unknown>)
            : {}),
          providerTaskId: run.externalRunId,
          providerStatus: query.providerStatus,
          fileId: query.fileId || null,
          downloadUrl: file?.downloadUrl || null,
        },
        raw: query.raw as Record<string, unknown>,
      },
    },
    event:
      nextStatus === run.status
        ? undefined
        : {
            level: nextStatus === "failed" ? "error" : "info",
            message:
              nextStatus === "succeeded"
                ? "minimax_video_task_succeeded"
                : nextStatus === "failed"
                  ? "minimax_video_task_failed"
                  : "minimax_video_task_running",
            payload: {
              providerTaskId: run.externalRunId,
              providerStatus: query.providerStatus,
              fileId: query.fileId || null,
              artifactCreated: persisted?.created ?? false,
            },
          },
  })

  return buildTaskResponseFromRun(detail)
}
