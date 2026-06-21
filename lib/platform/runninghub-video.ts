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
import {
  getRunningHubConfig,
  queryRunningHubTask,
  submitRunningHubRawTask,
  submitRunningHubWorkflowTask,
  type RunningHubTaskResponse,
  uploadRunningHubBinary,
} from "@/lib/platform/runninghub"

export type RunningHubVideoFeatureId = "text-to-video" | "image-to-video" | "digital-human" | "video-enhance"

type RunningHubVideoRuntimeUser = {
  id: number
  enterpriseId: number | null
}

type RunningHubVideoResult = {
  url?: string | null
  outputType?: string | null
  text?: string | null
  title?: string | null
}

export type RunningHubVideoTask = {
  taskId: string
  mediaTarget: "ai-video"
  requestedTarget: RunningHubVideoFeatureId
  provider: "runninghub"
  status: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED"
  results: RunningHubVideoResult[]
  extra?: Record<string, unknown> | null
  raw?: Record<string, unknown> | null
}

type UpdateRunningHubVideoRunPatch = {
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

function normalizeInteger(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.trunc(parsed)
  }
  return null
}

function normalizeNonNegativeInteger(value: unknown, fallback: number) {
  const normalized = normalizeInteger(value)
  if (normalized == null) return fallback
  return normalized < 0 ? fallback : normalized
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized === "true") return true
    if (normalized === "false") return false
  }
  return fallback
}

function buildRunningHubFileNameFieldId(fieldId: string) {
  return `${fieldId}RunningHubFileName`
}

function requireEnterpriseId(currentUser: RunningHubVideoRuntimeUser) {
  if (typeof currentUser.enterpriseId !== "number") {
    throw new Error("platform_media_enterprise_required")
  }
  return currentUser.enterpriseId
}

async function updateRunningHubVideoRunRecord(runId: number, patch: UpdateRunningHubVideoRunPatch) {
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

async function createRunningHubVideoRun(input: {
  currentUser: RunningHubVideoRuntimeUser
  featureId: RunningHubVideoFeatureId
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
      provider: "runninghub",
      featureId: input.featureId,
    },
  })

  const detail = await getPlatformTaskRun(run.id)
  if (!detail) {
    throw new Error("platform_media_run_not_found_after_create")
  }

  return detail
}

async function patchRunningHubVideoRun(input: {
  runId: number
  patch: UpdateRunningHubVideoRunPatch
  event?:
    | {
        level: "info" | "warn" | "error"
        message: string
        payload?: Record<string, unknown> | null
      }
    | undefined
}) {
  await updateRunningHubVideoRunRecord(input.runId, input.patch)
  if (input.event) {
    await appendPlatformRunEvent(input.runId, input.event)
  }
  const detail = await getPlatformTaskRun(input.runId)
  if (!detail) {
    throw new Error("platform_media_run_not_found_after_update")
  }
  return detail
}

async function getRunningHubVideoRunForUser(runId: number, currentUser: RunningHubVideoRuntimeUser) {
  const enterpriseId = requireEnterpriseId(currentUser)
  const [row] = await db
    .select()
    .from(platformTaskRuns)
    .where(and(eq(platformTaskRuns.id, runId), eq(platformTaskRuns.enterpriseId, enterpriseId)))

  if (!row) return null
  return getPlatformTaskRun(row.id)
}

function resolveRequestedTarget(run: HydratedPlatformTaskRun): RunningHubVideoFeatureId {
  if (run.itemSlug === "image-to-video") return "image-to-video"
  if (run.itemSlug === "digital-human") return "digital-human"
  if (run.itemSlug === "video-enhance") return "video-enhance"
  return "text-to-video"
}

function mapPlatformStatusToProviderStatus(status: string | null | undefined): RunningHubVideoTask["status"] {
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

  const mergedResults = normalizedResults.map((item, index) => {
    const artifact = artifacts[index]
    if (!artifact) return item
    return {
      url: resolvePlatformArtifactSourceUrl(artifact) || item.url,
      outputType: item.outputType || artifact.mimeType,
      text: item.text,
      title: item.title || artifact.title,
    }
  })

  if (artifacts.length <= mergedResults.length) {
    return mergedResults
  }

  return [
    ...mergedResults,
    ...artifacts.slice(mergedResults.length).map((artifact) => ({
      url: resolvePlatformArtifactSourceUrl(artifact),
      outputType: artifact.mimeType,
      text: null,
      title: artifact.title,
    })),
  ]
}

function buildTaskResponseFromRun(run: HydratedPlatformTaskRun): RunningHubVideoTask {
  const normalizedResult =
    run.normalizedResult && typeof run.normalizedResult === "object" ? run.normalizedResult : null

  return {
    taskId: String(run.id),
    mediaTarget: "ai-video",
    requestedTarget: resolveRequestedTarget(run),
    provider: "runninghub",
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

function inferMimeTypeFromOutputType(outputType: string | null | undefined) {
  const normalized = String(outputType || "").trim().toLowerCase()
  if (!normalized) return "application/octet-stream"
  if (normalized === "mp4") return "video/mp4"
  if (normalized === "mov") return "video/quicktime"
  if (normalized === "webm") return "video/webm"
  if (normalized === "png") return "image/png"
  if (normalized === "jpg" || normalized === "jpeg") return "image/jpeg"
  if (normalized === "mp3") return "audio/mpeg"
  if (normalized === "wav") return "audio/wav"
  return normalized.includes("/") ? normalized : "application/octet-stream"
}

function buildArtifactTitle(featureId: RunningHubVideoFeatureId, index: number, outputType: string | null | undefined) {
  const extension = normalizeOptionalText(outputType) || "bin"
  return `${featureId}-${index + 1}.${extension}`
}

async function persistResultArtifacts(input: {
  run: HydratedPlatformTaskRun
  featureId: RunningHubVideoFeatureId
  providerTaskId: string
  query: RunningHubTaskResponse
}) {
  const existingArtifactCount = input.run.artifacts.length
  const results = Array.isArray(input.query.results) ? input.query.results : []

  const nextResults: RunningHubVideoResult[] = []
  let createdCount = 0

  for (const [index, result] of results.entries()) {
    const rawUrl = normalizeOptionalText(result?.url)
    const outputType = normalizeOptionalText(result?.outputType)
    const text = normalizeOptionalText(result?.text)
    const existingArtifact = input.run.artifacts[index]
    const artifactTitle = buildArtifactTitle(input.featureId, index, outputType)

    if (rawUrl) {
      let mirroredArtifact:
        | {
            storageKey: string
            publicUrl: string
            contentType: string
          }
        | null = null

      if (!existingArtifact && isPlatformArtifactR2Available()) {
        mirroredArtifact = await mirrorPlatformArtifactToR2({
          sourceUrl: rawUrl,
          enterpriseId: input.run.enterpriseId,
          runId: input.run.id,
          provider: "runninghub",
          title: artifactTitle,
          contentType: inferMimeTypeFromOutputType(outputType),
          suggestedExtension: outputType,
        }).catch(() => null)
      }

      const artifact =
        existingArtifact ||
        (await savePlatformArtifact({
          runId: input.run.id,
          enterpriseId: input.run.enterpriseId,
          ownerUserId: input.run.userId,
          kind: "file",
          title: artifactTitle,
          mimeType: mirroredArtifact?.contentType || inferMimeTypeFromOutputType(outputType),
          storageKey: mirroredArtifact?.storageKey || null,
          externalUrl: rawUrl,
          payload: {
            provider: "runninghub",
            providerTaskId: input.providerTaskId,
            requestedTarget: input.featureId,
            resultIndex: index,
            nodeId: normalizeOptionalText(result?.nodeId),
            outputType,
            mirroredUrl: mirroredArtifact?.publicUrl || null,
            upstreamUrl: rawUrl,
          },
        }))

      if (!existingArtifact) {
        createdCount += 1
      }

      nextResults.push({
        url: resolvePlatformArtifactSourceUrl(artifact) || rawUrl,
        outputType: outputType || artifact.mimeType || null,
        text,
        title: artifact.title,
      })
      continue
    }

    nextResults.push({
      url: null,
      outputType,
      text,
      title: null,
    })
  }

  return {
    results: nextResults,
    createdCount,
    hadExistingArtifacts: existingArtifactCount > 0,
  }
}

function buildWorkflowNodeInfoList(entries: Array<{ nodeId: string; fieldName: string; fieldValue: unknown }>) {
  return entries.filter((entry) => entry.fieldValue !== undefined && entry.fieldValue !== null)
}

async function submitTextToVideoTask(
  params: Record<string, unknown>,
  config?: ReturnType<typeof getRunningHubConfig>,
) {
  const resolvedConfig = config ?? getRunningHubConfig()
  if (!resolvedConfig.seedanceTextToVideoEndpoint) {
    throw new Error("runninghub_not_configured")
  }

  const prompt = normalizeOptionalText(params.prompt)
  if (!prompt) {
    throw new Error("video_prompt_required")
  }

  return submitRunningHubRawTask({
    endpoint: resolvedConfig.seedanceTextToVideoEndpoint,
    config: resolvedConfig,
    payload: {
      prompt,
      resolution: normalizeOptionalText(params.resolution) || "720p",
      duration: normalizeOptionalText(params.duration) || "5",
      generateAudio: normalizeBoolean(params.generateAudio, true),
      ratio: normalizeOptionalText(params.ratio) || "adaptive",
      webSearch: normalizeBoolean(params.webSearch, false),
      returnLastFrame: normalizeBoolean(params.returnLastFrame, false),
      seed: normalizeInteger(params.seed) ?? -1,
    },
  })
}

async function submitImageToVideoTask(
  params: Record<string, unknown>,
  config?: ReturnType<typeof getRunningHubConfig>,
) {
  const resolvedConfig = config ?? getRunningHubConfig()
  if (!resolvedConfig.seedanceImageToVideoEndpoint) {
    throw new Error("runninghub_not_configured")
  }

  const firstFrameUrl = normalizeOptionalText(params.firstFrameUrl)
  if (!firstFrameUrl) {
    throw new Error("video_first_frame_required")
  }

  const lastFrameUrl = normalizeOptionalText(params.lastFrameUrl)
  return submitRunningHubRawTask({
    endpoint: resolvedConfig.seedanceImageToVideoEndpoint,
    config: resolvedConfig,
    payload: {
      prompt: normalizeOptionalText(params.prompt),
      resolution: normalizeOptionalText(params.resolution) || "720p",
      duration: normalizeOptionalText(params.duration) || "5",
      firstFrameUrl,
      ...(lastFrameUrl ? { lastFrameUrl } : {}),
      generateAudio: normalizeBoolean(params.generateAudio, true),
      ratio: normalizeOptionalText(params.ratio) || "adaptive",
      realPersonMode: normalizeBoolean(params.realPersonMode, true),
      conversionSlots: lastFrameUrl
        ? ["all"]
        : ["firstFrameUrl"],
      returnLastFrame: normalizeBoolean(params.returnLastFrame, false),
      seed: normalizeInteger(params.seed) ?? -1,
    },
  })
}

async function submitDigitalHumanTask(
  params: Record<string, unknown>,
  config?: ReturnType<typeof getRunningHubConfig>,
) {
  const resolvedConfig = config ?? getRunningHubConfig()
  if (!resolvedConfig.digitalHumanWorkflowId) {
    throw new Error("runninghub_not_configured")
  }

  const audioUrl =
    normalizeOptionalText(params[buildRunningHubFileNameFieldId("audioUrl")]) ||
    normalizeOptionalText(params.audioUrl)
  const script = normalizeOptionalText(params.script)
  const avatarImageUrl =
    normalizeOptionalText(params[buildRunningHubFileNameFieldId("avatarImageUrl")]) ||
    normalizeOptionalText(params.avatarImageUrl)
  const prompt = normalizeOptionalText(params.prompt)

  if (!audioUrl && !script) {
    throw new Error("digital_human_audio_or_script_required")
  }
  if (!avatarImageUrl) {
    throw new Error("digital_human_avatar_required")
  }

  return submitRunningHubWorkflowTask({
    workflowId: resolvedConfig.digitalHumanWorkflowId,
    config: resolvedConfig,
    nodeInfoList: buildWorkflowNodeInfoList([
      { nodeId: "243", fieldName: "audio", fieldValue: audioUrl },
      { nodeId: "244", fieldName: "string", fieldValue: script },
      { nodeId: "288", fieldName: "index", fieldValue: audioUrl ? 0 : 1 },
      { nodeId: "343", fieldName: "image", fieldValue: avatarImageUrl },
      { nodeId: "349", fieldName: "value", fieldValue: prompt || "模特正在做产品展示，进行电商直播带货" },
      { nodeId: "128", fieldName: "seed", fieldValue: normalizeNonNegativeInteger(params.seed, 0) },
      { nodeId: "262", fieldName: "start", fieldValue: normalizeInteger(params.audioTrimStart) ?? 0 },
      { nodeId: "262", fieldName: "end", fieldValue: normalizeInteger(params.audioTrimEnd) },
    ]),
  })
}

async function submitVideoEnhanceTask(
  params: Record<string, unknown>,
  config?: ReturnType<typeof getRunningHubConfig>,
) {
  const resolvedConfig = config ?? getRunningHubConfig()
  if (!resolvedConfig.videoEnhanceWorkflowId) {
    throw new Error("runninghub_not_configured")
  }

  const sourceVideoUrl =
    normalizeOptionalText(params[buildRunningHubFileNameFieldId("sourceVideoUrl")]) ||
    normalizeOptionalText(params.sourceVideoUrl)
  if (!sourceVideoUrl) {
    throw new Error("video_enhance_source_required")
  }

  return submitRunningHubWorkflowTask({
    workflowId: resolvedConfig.videoEnhanceWorkflowId,
    config: resolvedConfig,
    nodeInfoList: buildWorkflowNodeInfoList([
      { nodeId: "33", fieldName: "video", fieldValue: sourceVideoUrl },
      {
        nodeId: "35",
        fieldName: "text",
        fieldValue:
          normalizeOptionalText(params.prompt) ||
          "将视频转换为超高清画质，在消除伪影的同时重建高频细节，显著提升画面清晰度",
      },
      { nodeId: "42", fieldName: "value", fieldValue: normalizeInteger(params.durationLimit) ?? 10 },
      { nodeId: "10", fieldName: "seed", fieldValue: normalizeNonNegativeInteger(params.seed, 0) },
    ]),
  })
}

export function resolveRunningHubVideoFeatureId(value: unknown): RunningHubVideoFeatureId | null {
  if (value === "text-to-video" || value === "image-to-video" || value === "digital-human" || value === "video-enhance") {
    return value
  }
  if (value === "ai-video") return "text-to-video"
  return null
}

export async function executeRunningHubVideoFeature(input: {
  currentUser: RunningHubVideoRuntimeUser
  featureId: RunningHubVideoFeatureId
  params: Record<string, unknown>
  config?: ReturnType<typeof getRunningHubConfig>
}) {
  const run = await createRunningHubVideoRun({
    currentUser: input.currentUser,
    featureId: input.featureId,
    inputPayload: input.params,
  })

  const task =
    input.featureId === "image-to-video"
      ? await submitImageToVideoTask(input.params, input.config)
      : input.featureId === "digital-human"
        ? await submitDigitalHumanTask(input.params, input.config)
        : input.featureId === "video-enhance"
          ? await submitVideoEnhanceTask(input.params, input.config)
          : await submitTextToVideoTask(input.params, input.config)

  const detail = await patchRunningHubVideoRun({
    runId: run.id,
    patch: {
      status: task.status === "SUCCESS" ? "succeeded" : task.status === "FAILED" ? "failed" : "running",
      externalSystem: "runninghub",
      externalRunId: task.taskId,
      startedAt: new Date(),
      finishedAt: task.status === "SUCCESS" || task.status === "FAILED" ? new Date() : null,
      normalizedResult: {
        requestedTarget: input.featureId,
        provider: "runninghub",
        status: task.status,
        results: [],
        extra: {
          providerTaskId: task.taskId,
        },
        raw: task.raw as Record<string, unknown>,
      },
    },
    event: {
      level: task.status === "FAILED" ? "error" : "info",
      message: "runninghub_video_task_submitted",
      payload: {
        providerTaskId: task.taskId,
        requestedTarget: input.featureId,
        providerStatus: task.status,
      },
    },
  })

  return buildTaskResponseFromRun(detail)
}

export async function queryRunningHubVideoTask(input: {
  currentUser: RunningHubVideoRuntimeUser
  runId: number
  config?: ReturnType<typeof getRunningHubConfig>
}) {
  const run = await getRunningHubVideoRunForUser(input.runId, input.currentUser)
  if (!run) {
    throw new Error("platform_media_task_not_found")
  }

  const featureId = resolveRequestedTarget(run)
  if (!run.externalRunId || run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") {
    return buildTaskResponseFromRun(run)
  }

  const query = await queryRunningHubTask(run.externalRunId, input.config)
  if (!query) {
    return buildTaskResponseFromRun(run)
  }

  const currentNormalizedResult =
    run.normalizedResult && typeof run.normalizedResult === "object" ? run.normalizedResult : {}

  const persisted = query.status === "SUCCESS"
    ? await persistResultArtifacts({
        run,
        featureId,
        providerTaskId: run.externalRunId,
        query,
      })
    : { results: [] as RunningHubVideoResult[], createdCount: 0, hadExistingArtifacts: false }

  const nextStatus: PlatformTaskRunStatus =
    query.status === "SUCCESS"
      ? "succeeded"
      : query.status === "FAILED"
        ? "failed"
        : query.status === "QUEUED"
          ? "queued"
          : "running"

  const detail = await patchRunningHubVideoRun({
    runId: run.id,
    patch: {
      status: nextStatus,
      externalSystem: "runninghub",
      externalRunId: run.externalRunId,
      finishedAt: nextStatus === "succeeded" || nextStatus === "failed" ? new Date() : null,
      normalizedResult: {
        ...currentNormalizedResult,
        requestedTarget: featureId,
        provider: "runninghub",
        status: query.status,
        results: query.status === "SUCCESS" ? persisted.results : [],
        extra: {
          ...(currentNormalizedResult.extra && typeof currentNormalizedResult.extra === "object"
            ? (currentNormalizedResult.extra as Record<string, unknown>)
            : {}),
          providerTaskId: run.externalRunId,
          errorCode: query.errorCode || null,
          errorMessage: query.errorMessage || null,
          failedReason: query.failedReason || null,
          usage: query.usage || null,
        },
        raw: query as Record<string, unknown>,
      },
    },
    event:
      nextStatus === run.status
        ? undefined
        : {
            level: nextStatus === "failed" ? "error" : "info",
            message:
              nextStatus === "succeeded"
                ? "runninghub_video_task_succeeded"
                : nextStatus === "failed"
                  ? "runninghub_video_task_failed"
                  : "runninghub_video_task_running",
            payload: {
              providerTaskId: run.externalRunId,
              providerStatus: query.status,
              artifactCount: persisted.createdCount,
              errorCode: query.errorCode || null,
            },
          },
  })

  return buildTaskResponseFromRun(detail)
}

export async function createRunningHubMediaUpload(file: File) {
  return uploadRunningHubBinary({
    file,
    fileName: file.name,
  })
}
