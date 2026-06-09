export type RunningHubMediaTarget = "ai-image" | "ai-video" | "ai-music" | "visual-ad-pipeline"

export type RunningHubTaskStatus = "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED"

export type RunningHubTaskResponse = {
  taskId: string
  status: RunningHubTaskStatus | string
  errorCode?: string
  errorMessage?: string
  results?: Array<{
    url?: string | null
    outputType?: string | null
    text?: string | null
  }> | null
  clientId?: string
  promptTips?: string
  failedReason?: Record<string, unknown> | null
  usage?: Record<string, unknown> | null
}

type RunningHubEnvelope = {
  code?: number | string
  message?: string
  errorCode?: string
  errorMessage?: string
  data?: RunningHubTaskResponse | null
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
  image: RunningHubTargetConfig
  video: RunningHubTargetConfig
  music?: RunningHubTargetConfig
}

function normalizeBaseUrl(value: string | undefined) {
  return (value?.trim() || "https://www.runninghub.ai").replace(/\/+$/, "")
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

  return {
    baseUrl,
    apiKey,
    queryPath: normalizeApiPath(process.env.RUNNINGHUB_QUERY_PATH, "/openapi/v2/query"),
    uploadPath: normalizeApiPath(process.env.RUNNINGHUB_UPLOAD_PATH, "/task/openapi/upload"),
    image: {
      configured: Boolean(apiKey && process.env.RUNNINGHUB_IMAGE_ENDPOINT?.trim()),
      endpoint: normalizeEndpoint(process.env.RUNNINGHUB_IMAGE_ENDPOINT),
    },
    video: {
      configured: Boolean(apiKey && process.env.RUNNINGHUB_VIDEO_ENDPOINT?.trim()),
      endpoint: normalizeEndpoint(process.env.RUNNINGHUB_VIDEO_ENDPOINT),
    },
    music: {
      configured: Boolean(apiKey && process.env.RUNNINGHUB_MUSIC_ENDPOINT?.trim()),
      endpoint: normalizeEndpoint(process.env.RUNNINGHUB_MUSIC_ENDPOINT),
    },
  }
}

export type RunningHubResolvedTarget = {
  requestedTarget: RunningHubMediaTarget
  providerTarget: "ai-image" | "ai-video" | "ai-music"
  configured: boolean
  endpoint: string | null
}

export function resolveRunningHubTargetConfig(mediaTarget: RunningHubMediaTarget, config = getRunningHubConfig()) {
  if (mediaTarget === "ai-image") return config.image
  if (mediaTarget === "ai-video") return config.video
  if (mediaTarget === "ai-music") {
    return config.music ?? {
      configured: false,
      endpoint: null,
    }
  }
  return {
    configured: config.image.configured || config.video.configured,
    endpoint: config.video.endpoint || config.image.endpoint,
  }
}

export function hasRunningHubMediaTarget(mediaTarget: string): mediaTarget is RunningHubMediaTarget {
  return (
    mediaTarget === "ai-image" ||
    mediaTarget === "ai-video" ||
    mediaTarget === "ai-music" ||
    mediaTarget === "visual-ad-pipeline"
  )
}

export function isRunningHubConfiguredForTarget(
  mediaTarget: RunningHubMediaTarget,
  config = getRunningHubConfig(),
) {
  const target = resolveRunningHubTargetConfig(mediaTarget, config)
  return Boolean(config.apiKey && target.configured && target.endpoint)
}

export function hasRunningHubMediaExecution(config = getRunningHubConfig()) {
  return (
    isRunningHubConfiguredForTarget("ai-image", config) ||
    isRunningHubConfiguredForTarget("ai-video", config) ||
    isRunningHubConfiguredForTarget("ai-music", config)
  )
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

  if (mediaTarget === "ai-music") {
    const target = resolveRunningHubTargetConfig("ai-music", config)
    return {
      requestedTarget: mediaTarget,
      providerTarget: "ai-music",
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

function normalizeRunningHubResponsePayload(payload: unknown): RunningHubTaskResponse | null {
  if (!payload || typeof payload !== "object") return null
  if ("taskId" in payload) return payload as RunningHubTaskResponse

  const envelope = payload as RunningHubEnvelope
  if (envelope.data && typeof envelope.data === "object" && "taskId" in envelope.data) {
    return envelope.data
  }

  return null
}

export async function submitRunningHubTask(input: {
  mediaTarget: RunningHubMediaTarget
  payload: Record<string, unknown>
}) {
  const config = getRunningHubConfig()
  const target = resolveRunningHubProviderTarget(input.mediaTarget, config)
  if (!config.apiKey || !target.configured || !target.endpoint) {
    throw new Error("runninghub_not_configured")
  }

  const response = await fetch(resolveRunningHubUrl(target.endpoint, config), {
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
  if (!response.ok) {
    const envelope = raw as RunningHubEnvelope | null
    throw new Error(data?.errorMessage || data?.errorCode || envelope?.errorMessage || envelope?.errorCode || "runninghub_submit_failed")
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

export async function queryRunningHubTask(taskId: string) {
  const config = getRunningHubConfig()
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
