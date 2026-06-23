export type RunningHubMediaTarget = "ai-image" | "ai-video" | "visual-ad-pipeline"

export type RunningHubTaskStatus = "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED"

export type RunningHubTaskResult = {
  url?: string | null
  nodeId?: string | null
  outputType?: string | null
  text?: string | null
}

export type RunningHubTaskResponse = {
  taskId: string
  status: RunningHubTaskStatus | string
  errorCode?: string
  errorMessage?: string
  results?: RunningHubTaskResult[] | null
  clientId?: string
  promptTips?: string
  failedReason?: Record<string, unknown> | null
  usage?: Record<string, unknown> | null
}

type RunningHubEnvelope = {
  code?: number | string
  message?: string
  msg?: string
  errorCode?: string
  errorMessage?: string
  data?: RunningHubTaskResponse | null
}

type RunningHubWorkflowCreateResponse = {
  taskId?: string | null
  taskStatus?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  msg?: string | null
}

type RunningHubUploadResponse = {
  code?: number | string
  message?: string
  data?: {
    type?: string | null
    download_url?: string | null
    fileName?: string | null
    size?: string | number | null
  } | null
}

type RunningHubTargetConfig = {
  configured: boolean
  endpoint: string | null
}

export type RunningHubConfig = {
  baseUrl: string
  apiKey: string
  queryPath: string
  uploadPath: string
  workflowCreatePath: string
  seedanceTextToVideoEndpoint: string | null
  seedanceImageToVideoEndpoint: string | null
  seedanceMiniTextToVideoEndpoint: string | null
  seedanceMiniImageToVideoEndpoint: string | null
  digitalHumanWorkflowId: string | null
  videoEnhanceWorkflowId: string | null
  image: RunningHubTargetConfig
  video: RunningHubTargetConfig
}

function normalizeBaseUrl(value: string | undefined) {
  return (value?.trim() || "https://www.runninghub.cn").replace(/\/+$/, "")
}

function normalizeApiPath(value: string | undefined, fallback: string) {
  const raw = value?.trim()
  if (!raw) return fallback
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
  return raw.startsWith("/") ? raw : `/${raw}`
}

function normalizeEndpoint(value: string | undefined) {
  const raw = value?.trim()
  if (!raw) return null
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
  return raw.startsWith("/") ? raw : `/${raw}`
}

export function getRunningHubConfig(): RunningHubConfig {
  const apiKey = process.env.RUNNINGHUB_API_KEY?.trim() || ""
  const baseUrl = normalizeBaseUrl(process.env.RUNNINGHUB_BASE_URL)
  const seedanceTextToVideoEndpoint =
    normalizeEndpoint(process.env.RUNNINGHUB_SEEDANCE_TEXT_TO_VIDEO_ENDPOINT) ||
    "/openapi/v2/rhart-video/sparkvideo-2.0-fast/text-to-video"
  const seedanceImageToVideoEndpoint =
    normalizeEndpoint(process.env.RUNNINGHUB_SEEDANCE_IMAGE_TO_VIDEO_ENDPOINT) ||
    "/openapi/v2/rhart-video/sparkvideo-2.0-fast/image-to-video"
  const seedanceMiniTextToVideoEndpoint = normalizeEndpoint(
    process.env.RUNNINGHUB_SEEDANCE_MINI_TEXT_TO_VIDEO_ENDPOINT,
  ) || "/openapi/v2/rhart-video/sparkvideo-2.0-mini/text-to-video"
  const seedanceMiniImageToVideoEndpoint = normalizeEndpoint(
    process.env.RUNNINGHUB_SEEDANCE_MINI_IMAGE_TO_VIDEO_ENDPOINT,
  ) || "/openapi/v2/rhart-video/sparkvideo-2.0-mini/image-to-video"
  const workflowCreatePath = normalizeApiPath(process.env.RUNNINGHUB_WORKFLOW_CREATE_PATH, "/task/openapi/create")
  const digitalHumanWorkflowId = process.env.RUNNINGHUB_DIGITAL_HUMAN_WORKFLOW_ID?.trim() || null
  const videoEnhanceWorkflowId = process.env.RUNNINGHUB_VIDEO_ENHANCE_WORKFLOW_ID?.trim() || null
  const legacyVideoEndpoint = normalizeEndpoint(process.env.RUNNINGHUB_VIDEO_ENDPOINT)
  const hasScopedVideoConfig = Boolean(
    seedanceTextToVideoEndpoint ||
      seedanceImageToVideoEndpoint ||
      seedanceMiniTextToVideoEndpoint ||
      seedanceMiniImageToVideoEndpoint ||
      (workflowCreatePath && digitalHumanWorkflowId) ||
      (workflowCreatePath && videoEnhanceWorkflowId),
  )

  return {
    baseUrl,
    apiKey,
    queryPath: normalizeApiPath(process.env.RUNNINGHUB_QUERY_PATH, "/openapi/v2/query"),
    uploadPath: normalizeApiPath(process.env.RUNNINGHUB_UPLOAD_PATH, "/openapi/v2/media/upload/binary"),
    workflowCreatePath,
    seedanceTextToVideoEndpoint,
    seedanceImageToVideoEndpoint,
    seedanceMiniTextToVideoEndpoint,
    seedanceMiniImageToVideoEndpoint,
    digitalHumanWorkflowId,
    videoEnhanceWorkflowId,
    image: {
      configured: Boolean(apiKey && process.env.RUNNINGHUB_IMAGE_ENDPOINT?.trim()),
      endpoint: normalizeEndpoint(process.env.RUNNINGHUB_IMAGE_ENDPOINT),
    },
    video: {
      configured: Boolean(apiKey && (legacyVideoEndpoint || hasScopedVideoConfig)),
      endpoint:
        legacyVideoEndpoint ||
        seedanceTextToVideoEndpoint ||
        seedanceImageToVideoEndpoint ||
        seedanceMiniTextToVideoEndpoint ||
        seedanceMiniImageToVideoEndpoint ||
        workflowCreatePath,
    },
  }
}

export type RunningHubResolvedTarget = {
  requestedTarget: RunningHubMediaTarget
  providerTarget: "ai-image" | "ai-video"
  configured: boolean
  endpoint: string | null
}

export function resolveRunningHubTargetConfig(mediaTarget: RunningHubMediaTarget, config = getRunningHubConfig()) {
  if (mediaTarget === "ai-image") return config.image
  if (mediaTarget === "ai-video") return config.video
  return {
    configured: config.image.configured || config.video.configured,
    endpoint: config.video.endpoint || config.image.endpoint,
  }
}

export function hasRunningHubMediaTarget(mediaTarget: string): mediaTarget is RunningHubMediaTarget {
  return mediaTarget === "ai-image" || mediaTarget === "ai-video" || mediaTarget === "visual-ad-pipeline"
}

export function isRunningHubConfiguredForTarget(
  mediaTarget: RunningHubMediaTarget,
  config = getRunningHubConfig(),
) {
  const target = resolveRunningHubTargetConfig(mediaTarget, config)
  return Boolean(config.apiKey && target.configured && target.endpoint)
}

export function hasRunningHubMediaExecution(config = getRunningHubConfig()) {
  return isRunningHubConfiguredForTarget("ai-image", config) || isRunningHubConfiguredForTarget("ai-video", config)
}

export function resolveRunningHubProviderTarget(
  mediaTarget: RunningHubMediaTarget,
  config = getRunningHubConfig(),
): RunningHubResolvedTarget {
  if (mediaTarget === "ai-image") {
    const target = resolveRunningHubTargetConfig("ai-image", config)
    return {
      requestedTarget: mediaTarget,
      providerTarget: "ai-image",
      configured: Boolean(config.apiKey && target.configured && target.endpoint),
      endpoint: target.endpoint,
    }
  }

  if (mediaTarget === "ai-video") {
    const target = resolveRunningHubTargetConfig("ai-video", config)
    return {
      requestedTarget: mediaTarget,
      providerTarget: "ai-video",
      configured: Boolean(config.apiKey && target.configured && target.endpoint),
      endpoint: target.endpoint,
    }
  }

  const videoTarget = resolveRunningHubTargetConfig("ai-video", config)
  if (config.apiKey && videoTarget.configured && videoTarget.endpoint) {
    return {
      requestedTarget: mediaTarget,
      providerTarget: "ai-video",
      configured: true,
      endpoint: videoTarget.endpoint,
    }
  }

  const imageTarget = resolveRunningHubTargetConfig("ai-image", config)
  return {
    requestedTarget: mediaTarget,
    providerTarget: "ai-image",
    configured: Boolean(config.apiKey && imageTarget.configured && imageTarget.endpoint),
    endpoint: imageTarget.endpoint,
  }
}

function resolveRunningHubUrl(pathOrUrl: string, config: RunningHubConfig) {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl
  return `${config.baseUrl}${pathOrUrl}`
}

function normalizeRunningHubImageCandidateCount(value: unknown) {
  if (value == null || value === "") return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.max(1, Math.min(15, Math.trunc(parsed)))
}

function normalizeRunningHubImageResolution(value: unknown) {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  if (normalized === "2k" || normalized === "3k") return normalized
  return null
}

function normalizeRunningHubImageSize(value: unknown) {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  const matched = normalized.match(/^(\d{2,4})x(\d{2,4})$/u)
  if (!matched) return null
  const width = Number.parseInt(matched[1], 10)
  const height = Number.parseInt(matched[2], 10)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }
  return { width, height }
}

function collectRunningHubImageUrls(payload: Record<string, unknown>) {
  const collected = new Set<string>()
  const candidates = [
    payload.imageUrls,
    payload.inputImageUrls,
    payload.referenceImageUrls,
  ]

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue
    for (const item of candidate) {
      if (typeof item !== "string") continue
      const normalized = item.trim()
      if (normalized) collected.add(normalized)
    }
  }

  const singletonCandidates = [
    payload.inputImageUrl,
    payload.imageUrl,
    payload.sourceImageUrl,
    payload.snapshotImageUrl,
  ]
  for (const candidate of singletonCandidates) {
    if (typeof candidate !== "string") continue
    const normalized = candidate.trim()
    if (normalized) collected.add(normalized)
  }

  return [...collected]
}

function normalizeSeedreamImagePayload(
  endpoint: string,
  payload: Record<string, unknown>,
) {
  const normalizedEndpoint = endpoint.toLowerCase()
  const isSeedreamTextToImage = normalizedEndpoint.includes("/seedream-v5-lite/text-to-image")
  const isSeedreamImageToImage = normalizedEndpoint.includes("/seedream-v5-lite/image-to-image")
  if (!isSeedreamTextToImage && !isSeedreamImageToImage) {
    return payload
  }

  const size = normalizeRunningHubImageSize(payload.imageSize)
  const maxImages = normalizeRunningHubImageCandidateCount(payload.maxImages) ??
    normalizeRunningHubImageCandidateCount(payload.candidateCount) ??
    1
  const normalized: Record<string, unknown> = {
    prompt: typeof payload.prompt === "string" ? payload.prompt : "",
    maxImages,
    sequentialImageGeneration: maxImages > 1 ? "auto" : "disabled",
  }

  const resolution = normalizeRunningHubImageResolution(payload.resolution)
  if (resolution) {
    normalized.resolution = resolution
  } else if (size) {
    normalized.width = size.width
    normalized.height = size.height
  }

  if (typeof payload.toolsType === "string" && payload.toolsType.trim()) {
    normalized.toolsType = payload.toolsType.trim()
  }
  if (typeof payload.webhookUrl === "string" && payload.webhookUrl.trim()) {
    normalized.webhookUrl = payload.webhookUrl.trim()
  }

  if (isSeedreamImageToImage) {
    normalized.imageUrls = collectRunningHubImageUrls(payload)
  }

  return normalized
}

function normalizeRunningHubResponsePayload(payload: unknown): RunningHubTaskResponse | null {
  if (!payload || typeof payload !== "object") return null
  if ("taskId" in payload) return payload as RunningHubTaskResponse

  const envelope = payload as RunningHubEnvelope
  if (envelope.data && typeof envelope.data === "object" && "taskId" in envelope.data) {
    return envelope.data
  }

  const workflow = payload as RunningHubWorkflowCreateResponse
  if (typeof workflow.taskId === "string" && workflow.taskId.trim()) {
    return {
      taskId: workflow.taskId.trim(),
      status: workflow.taskStatus?.trim() || "RUNNING",
      errorCode: workflow.errorCode || undefined,
      errorMessage: workflow.errorMessage || workflow.msg || undefined,
      results: null,
    }
  }

  return null
}

function normalizeRunningHubErrorCode(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed || trimmed === "0") return null
  return trimmed
}

function normalizeRunningHubEnvelopeCode(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeRunningHubErrorMessage(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function resolveRunningHubSubmitError(
  raw: RunningHubTaskResponse | RunningHubEnvelope | null,
  data: RunningHubTaskResponse | null,
) {
  const envelope = raw as RunningHubEnvelope | null
  const envelopeCode = normalizeRunningHubEnvelopeCode(envelope?.code)
  const envelopeHasErrorCode = envelopeCode != null && envelopeCode !== 0
  const dataError =
    normalizeRunningHubErrorMessage(data?.errorMessage) ||
    normalizeRunningHubErrorCode(data?.errorCode)
  if (dataError) return dataError

  if (!envelopeHasErrorCode) {
    return (
      normalizeRunningHubErrorMessage(envelope?.errorMessage) ||
      normalizeRunningHubErrorCode(envelope?.errorCode)
    )
  }

  return (
    normalizeRunningHubErrorMessage(envelope?.message) ||
    normalizeRunningHubErrorMessage(envelope?.msg) ||
    normalizeRunningHubErrorCode(envelope?.errorCode) ||
    String(envelopeCode)
  )
}

export async function submitRunningHubTask(input: {
  mediaTarget: RunningHubMediaTarget
  payload: Record<string, unknown>
  config?: RunningHubConfig
}) {
  const config = input.config ?? getRunningHubConfig()
  const target = resolveRunningHubProviderTarget(input.mediaTarget, config)
  if (!config.apiKey || !target.configured || !target.endpoint) {
    throw new Error("runninghub_not_configured")
  }

  const normalizedPayload =
    target.providerTarget === "ai-image"
      ? normalizeSeedreamImagePayload(target.endpoint, input.payload)
      : input.payload

  const response = await fetch(resolveRunningHubUrl(target.endpoint, config), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(normalizedPayload),
    cache: "no-store",
  })

  const raw = (await response.json().catch(() => null)) as RunningHubTaskResponse | RunningHubEnvelope | null
  const data = normalizeRunningHubResponsePayload(raw)
  const submitError = resolveRunningHubSubmitError(raw, data)
  if (!response.ok || submitError) {
    throw new Error(submitError || "runninghub_submit_failed")
  }
  if (!data?.taskId) {
    throw new Error("runninghub_task_id_missing")
  }

  return {
    provider: "runninghub" as const,
    mediaTarget: target.providerTarget,
    requestedTarget: input.mediaTarget,
    endpoint: target.endpoint,
    taskId: data.taskId,
    status: data.status,
    raw: raw ?? data,
  }
}

export async function submitRunningHubRawTask(input: {
  endpoint: string
  payload: Record<string, unknown>
  config?: RunningHubConfig
}) {
  const config = input.config ?? getRunningHubConfig()
  if (!config.apiKey || !input.endpoint) {
    throw new Error("runninghub_not_configured")
  }

  const response = await fetch(resolveRunningHubUrl(input.endpoint, config), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.payload),
    cache: "no-store",
  })

  const raw = (await response.json().catch(() => null)) as RunningHubTaskResponse | RunningHubEnvelope | null
  const data = normalizeRunningHubResponsePayload(raw)
  const submitError = resolveRunningHubSubmitError(raw, data)
  if (!response.ok || submitError) {
    throw new Error(submitError || "runninghub_submit_failed")
  }
  if (!data?.taskId) {
    throw new Error("runninghub_task_id_missing")
  }

  return {
    endpoint: input.endpoint,
    taskId: data.taskId,
    status: data.status,
    raw: raw ?? data,
  }
}

export async function submitRunningHubWorkflowTask(input: {
  workflowId: string
  nodeInfoList: Array<{
    nodeId: string
    fieldName: string
    fieldValue: unknown
  }>
  config?: RunningHubConfig
}) {
  const config = input.config ?? getRunningHubConfig()
  if (!config.apiKey || !config.workflowCreatePath) {
    throw new Error("runninghub_not_configured")
  }

  return submitRunningHubRawTask({
    endpoint: config.workflowCreatePath,
    config,
    payload: {
      apiKey: config.apiKey,
      workflowId: input.workflowId,
      nodeInfoList: input.nodeInfoList,
    },
  })
}

export async function uploadRunningHubBinary(input: {
  file: Blob
  fileName: string
  config?: RunningHubConfig
}) {
  const config = input.config ?? getRunningHubConfig()
  if (!config.apiKey || !config.uploadPath) {
    throw new Error("runninghub_not_configured")
  }

  const formData = new FormData()
  formData.set("file", input.file, input.fileName)

  const response = await fetch(resolveRunningHubUrl(config.uploadPath, config), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: formData,
    cache: "no-store",
  })

  const raw = (await response.json().catch(() => null)) as RunningHubUploadResponse | null
  if (!response.ok || !raw?.data?.fileName || !raw.data.download_url) {
    throw new Error(raw?.message || "runninghub_upload_failed")
  }

  return {
    type: raw.data.type?.trim() || null,
    fileName: raw.data.fileName.trim(),
    downloadUrl: raw.data.download_url.trim(),
    size: raw.data.size == null ? null : String(raw.data.size),
    raw,
  }
}

export async function queryRunningHubTask(taskId: string, config = getRunningHubConfig()) {
  if (!config.apiKey) {
    throw new Error("runninghub_not_configured")
  }

  const response = await fetch(resolveRunningHubUrl(config.queryPath, config), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ taskId }),
    cache: "no-store",
  })

  const raw = (await response.json().catch(() => null)) as RunningHubTaskResponse | RunningHubEnvelope | null
  const data = normalizeRunningHubResponsePayload(raw)
  if (!response.ok) {
    const envelope = raw as RunningHubEnvelope | null
    throw new Error(data?.errorMessage || data?.errorCode || envelope?.errorMessage || envelope?.errorCode || "runninghub_query_failed")
  }

  return data
}
