import { NextRequest } from "next/server"

import { POST as aiChatPost } from "@/app/api/ai/chat/route"
import { POST as imageAssistantGeneratePost } from "@/app/api/image-assistant/generate/route"
import { GET as imageAssistantSessionGet } from "@/app/api/image-assistant/sessions/[sessionId]/route"
import { POST as mediaRunPost } from "@/app/api/platform/media/run/route"
import { GET as mediaTaskGet } from "@/app/api/platform/media/tasks/[taskId]/route"
import { GET as assistantTaskGet } from "@/app/api/tasks/[taskId]/route"
import { POST as leadToolDownloadPost } from "@/app/api/tools/[slug]/download/route"
import { POST as leadToolPreviewPost } from "@/app/api/tools/[slug]/preview/route"
import { POST as videoWorkflowPost } from "@/app/api/video-agent/workflow/route"
import { POST as writerChatStreamPost } from "@/app/api/writer/chat/stream/route"
import { applyInternalServiceAuthHeader, type AuthUser } from "@/lib/auth/session"
import {
  findModelByCapabilityAndAlias,
  getDefaultModelId,
  getModelDefinition,
  listModels,
} from "@/lib/ai-runtime/model-registry"
import type { ModelCapability } from "@/lib/ai-runtime/capabilities"
import {
  evaluatePlatformExecutionGate,
  resolvePlatformBindingExecutionProxyTarget,
  resolvePlatformCapabilityExecutionProxyTarget,
} from "@/lib/platform/execute"
import { getPlatformBindingTargetExecutionState, getPlatformCapabilityExecutionState } from "@/lib/platform/execution"
import { shouldChargeSharedCreditsForCapability } from "@/lib/platform/shared-credits-policy"
import { buildWorkflowImageGenerateRequestBody } from "@/lib/workflows/image-capability-request"
import {
  isEmbeddableWorkflowImagePromptUrl,
} from "@/lib/workflows/image-prompt-references"
import type {
  WorkflowCapabilityInvokeParams,
  WorkflowMediaRef,
  WorkflowNodeExecutionResult,
} from "@/lib/workflows/node-executors"

type WorkflowCapabilityInvokerOptions = {
  cookieHeader?: string | null
  currentUser: AuthUser
  locale?: "zh" | "en"
  requestOrigin?: string
  requestIp?: string
  maxPollAttempts?: number
  pollIntervalMs?: number
  callTimeoutMs?: number
}

const DEFAULT_WORKFLOW_CAPABILITY_TIMEOUT_MS = 120_000
const DEFAULT_WORKFLOW_IMAGE_TIMEOUT_MS = 300_000
const DEFAULT_WORKFLOW_VIDEO_TIMEOUT_MS = 30 * 60_000
const DEFAULT_WORKFLOW_PPT_TIMEOUT_MS = 300_000
const DEFAULT_DIGITAL_HUMAN_DURATION_SECONDS = 10
const DEFAULT_DIGITAL_HUMAN_TIMEOUT_MS_PER_VIDEO_SECOND = 60_000

function normalizeOrigin(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed || "http://127.0.0.1:3000"
}

function parsePositiveIntegerEnv(name: string) {
  const raw = process.env[name]
  if (typeof raw !== "string" || !raw.trim()) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: string) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutError))
    }, timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function extractUrlLikeItems(input: WorkflowCapabilityInvokeParams["input"]): string[] {
  const refs: WorkflowMediaRef[] = [...input.asset, ...input.image, ...input.video, ...input.audio, ...input.ppt]
  return refs
    .map((item) => item.url?.trim() || "")
    .filter((url) => isEmbeddableWorkflowImagePromptUrl(url))
}

export function resolveWorkflowCapabilityCallTimeoutMs(
  capabilitySlug: WorkflowCapabilityInvokeParams["capabilitySlug"],
  overrideTimeoutMs?: number,
  invokeParams?: WorkflowCapabilityInvokeParams,
) {
  if (Number.isFinite(overrideTimeoutMs) && (overrideTimeoutMs as number) > 0) {
    return overrideTimeoutMs as number
  }

  const defaultTimeoutMs =
    parsePositiveIntegerEnv("WORKFLOW_CAPABILITY_TIMEOUT_MS") ||
    DEFAULT_WORKFLOW_CAPABILITY_TIMEOUT_MS

  if (capabilitySlug === "ai-ppt") {
    const pptSpecificTimeoutMs =
      parsePositiveIntegerEnv("WORKFLOW_PPT_CAPABILITY_TIMEOUT_MS") ||
      DEFAULT_WORKFLOW_PPT_TIMEOUT_MS

    return Math.max(defaultTimeoutMs, pptSpecificTimeoutMs)
  }

  if (capabilitySlug === "ai-video") {
    if (isDigitalHumanWorkflowInvoke(invokeParams)) {
      const estimatedTimeoutMs = resolveDigitalHumanWorkflowTimeoutMs(invokeParams)
      return Math.max(defaultTimeoutMs, estimatedTimeoutMs)
    }

    const videoSpecificTimeoutMs =
      parsePositiveIntegerEnv("WORKFLOW_VIDEO_CAPABILITY_TIMEOUT_MS") ||
      DEFAULT_WORKFLOW_VIDEO_TIMEOUT_MS

    return Math.max(defaultTimeoutMs, videoSpecificTimeoutMs)
  }

  if (capabilitySlug !== "ai-image") {
    return defaultTimeoutMs
  }

  const imageSpecificTimeoutMs =
    parsePositiveIntegerEnv("WORKFLOW_IMAGE_CAPABILITY_TIMEOUT_MS") ||
    DEFAULT_WORKFLOW_IMAGE_TIMEOUT_MS

  return Math.max(defaultTimeoutMs, imageSpecificTimeoutMs)
}

function isDigitalHumanWorkflowInvoke(params: WorkflowCapabilityInvokeParams | undefined) {
  if (!params) return false
  return params.nodeType === "digital_human" || normalizeOptionalText(params.node.config.featureId) === "digital-human"
}

function resolveDigitalHumanDurationSeconds(params: WorkflowCapabilityInvokeParams | undefined) {
  if (!params) return DEFAULT_DIGITAL_HUMAN_DURATION_SECONDS

  const configuredDuration =
    normalizeOptionalNumber(params.node.config.durationSeconds) ??
    normalizeOptionalNumber(params.node.config.duration)
  if (configuredDuration && configuredDuration > 0) {
    return configuredDuration
  }

  const trimStart = normalizeOptionalNumber(params.node.config.audioTrimStart) ?? 0
  const trimEnd = normalizeOptionalNumber(params.node.config.audioTrimEnd)
  if (trimEnd && trimEnd > trimStart) {
    return trimEnd - trimStart
  }

  return DEFAULT_DIGITAL_HUMAN_DURATION_SECONDS
}

function resolveDigitalHumanWorkflowTimeoutMs(params: WorkflowCapabilityInvokeParams | undefined) {
  const timeoutMsPerVideoSecond =
    parsePositiveIntegerEnv("WORKFLOW_DIGITAL_HUMAN_TIMEOUT_MS_PER_VIDEO_SECOND") ||
    DEFAULT_DIGITAL_HUMAN_TIMEOUT_MS_PER_VIDEO_SECOND
  const durationSeconds = resolveDigitalHumanDurationSeconds(params)
  return Math.ceil(durationSeconds * timeoutMsPerVideoSecond)
}

function resolveWorkflowCapabilityTimeoutError(
  capabilitySlug: WorkflowCapabilityInvokeParams["capabilitySlug"],
) {
  switch (capabilitySlug) {
    case "ai-chat":
      return "workflow_ai_chat_timeout"
    case "content-repurpose":
      return "workflow_writer_timeout"
    case "ai-ppt":
      return "workflow_ppt_timeout"
    case "ai-image":
      return "workflow_image_timeout"
    case "ai-video":
      return "workflow_video_timeout"
    case "ai-music":
      return "workflow_audio_timeout"
    default:
      return "workflow_capability_timeout"
  }
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

function normalizeOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return null
}

function normalizeBooleanString(value: unknown, fallback: boolean) {
  if (value === true || value === "true") return true
  if (value === false || value === "false") return false
  return fallback
}

function findFirstAssetUrlByMimePrefix(input: WorkflowCapabilityInvokeParams["input"], prefix: string) {
  for (const asset of input.asset) {
    if (asset.mimeType?.startsWith(prefix) && asset.url) return asset.url
  }
  return null
}

function findPrimaryImageUrl(input: WorkflowCapabilityInvokeParams["input"]) {
  return input.image[0]?.url || findFirstAssetUrlByMimePrefix(input, "image/")
}

function findSecondaryImageUrl(input: WorkflowCapabilityInvokeParams["input"]) {
  const imageUrl = input.image[1]?.url
  if (imageUrl) return imageUrl
  const assetImages = input.asset.filter((asset) => asset.mimeType?.startsWith("image/") && asset.url)
  return assetImages[1]?.url || null
}

function findPrimaryAudioUrl(input: WorkflowCapabilityInvokeParams["input"]) {
  return input.audio[0]?.url || findFirstAssetUrlByMimePrefix(input, "audio/")
}

function findPrimaryImageUrlFromAnyInput(input: WorkflowCapabilityInvokeParams["input"]) {
  return findPrimaryImageUrl(input) || findFirstAssetUrlByMimePrefix(input, "image/")
}

function extractWorkflowPptInputImages(input: WorkflowCapabilityInvokeParams["input"]) {
  const collected = new Map<string, {
    url: string
    title?: string | null
    mimeType?: string | null
    sourceNodeKey?: string | null
  }>()

  for (const item of input.image) {
    const url = item.url?.trim() || item.downloadUrl?.trim() || ""
    if (!url || collected.has(url)) continue
    collected.set(url, {
      url,
      title: item.title?.trim() || null,
      mimeType: item.mimeType?.trim() || null,
      sourceNodeKey: item.sourceNodeKey?.trim() || null,
    })
  }

  for (const item of input.asset) {
    const url = item.url?.trim() || ""
    if (!url || collected.has(url) || !item.mimeType?.startsWith("image/")) continue
    collected.set(url, {
      url,
      title: item.fileName?.trim() || null,
      mimeType: item.mimeType?.trim() || null,
      sourceNodeKey: null,
    })
  }

  return [...collected.values()]
}

function buildPromptText(params: WorkflowCapabilityInvokeParams, _locale: "zh" | "en") {
  const inheritedText = params.input.text.map((item) => item.trim()).filter(Boolean)
  const configuredPrompt =
    inheritedText.length > 0
      ? ""
      : typeof params.node.config.prompt === "string"
        ? params.node.config.prompt.trim()
        : typeof params.node.config.promptTemplate === "string"
          ? params.node.config.promptTemplate.trim()
          : ""
  const referenceUrls = extractUrlLikeItems(params.input)
  const includeReferenceUrls = params.capabilitySlug !== "ai-image" && params.capabilitySlug !== "ai-ppt"

  const sections = [
    configuredPrompt,
    inheritedText.length > 0 ? inheritedText.join("\n\n") : "",
    includeReferenceUrls && referenceUrls.length > 0
      ? `Reference URLs:\n${referenceUrls.map((url) => `- ${url}`).join("\n")}`
      : "",
  ].filter(Boolean)

  return sections.join("\n\n").trim()
}

function createJsonRequest(input: {
  origin: string
  path: string
  body: unknown
  cookieHeader?: string | null
  requestIp?: string
  currentUser?: AuthUser | null
}) {
  const headers = new Headers({
    "content-type": "application/json",
    host: "127.0.0.1:3000",
    "x-forwarded-proto": "http",
    "x-forwarded-for": input.requestIp || "127.0.0.1",
  })

  if (input.cookieHeader) {
    headers.set("cookie", input.cookieHeader)
  } else if (input.currentUser?.id) {
    applyInternalServiceAuthHeader(headers, input.currentUser.id)
  }

  return new NextRequest(new URL(input.path, input.origin), {
    method: "POST",
    headers,
    body: JSON.stringify(input.body),
  })
}

function createGetRequest(input: {
  origin: string
  path: string
  cookieHeader?: string | null
  requestIp?: string
  currentUser?: AuthUser | null
}) {
  const headers = new Headers({
    host: "127.0.0.1:3000",
    "x-forwarded-proto": "http",
    "x-forwarded-for": input.requestIp || "127.0.0.1",
  })

  if (input.cookieHeader) {
    headers.set("cookie", input.cookieHeader)
  } else if (input.currentUser?.id) {
    applyInternalServiceAuthHeader(headers, input.currentUser.id)
  }

  return new NextRequest(new URL(input.path, input.origin), {
    method: "GET",
    headers,
  })
}

async function parseJsonResponse(response: Response) {
  return (await response.json().catch(() => null)) as Record<string, unknown> | null
}

function extractDataRecord(payload: Record<string, unknown> | null) {
  const candidate = payload?.data
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>)
    : null
}

async function parseErrorResponse(response: Response | undefined) {
  if (!response) {
    return "workflow_capability_failed:missing_response"
  }
  const payload = await parseJsonResponse(response)
  if (typeof payload?.error === "string" && payload.error.trim()) {
    return payload.error.trim()
  }
  return `workflow_capability_failed:${response.status}`
}

function extractMediaItems(payload: Record<string, unknown> | null) {
  const data = extractDataRecord(payload) ?? payload
  const results = Array.isArray(data?.results) ? data.results : []

  const items: WorkflowMediaRef[] = []
  for (const item of results) {
    if (!item || typeof item !== "object") continue
    const record = item as Record<string, unknown>
    items.push({
      url: typeof record.url === "string" ? record.url : null,
      title: typeof record.title === "string" ? record.title : null,
      mimeType: typeof record.outputType === "string" ? record.outputType : null,
    })
  }
  return items
}

function extractWorkflowImageCandidates(detailSnapshot: Record<string, unknown> | null, preferredVersionId?: string | null) {
  const detailData = extractDataRecord(detailSnapshot) ?? detailSnapshot
  const versions = Array.isArray(detailData?.versions) ? detailData.versions : []
  const versionRecords = versions.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
  const assetRecords = Array.isArray(detailData?.assets) ? detailData.assets : []
  const assetUrlById = new Map(
    assetRecords
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => [
        typeof item.id === "string" ? item.id : "",
        typeof item.url === "string" ? item.url.trim() : "",
      ] as const)
      .filter(([assetId, url]) => assetId && url),
  )

  const preferredVersion =
    preferredVersionId
      ? versionRecords.find((version) => typeof version.id === "string" && version.id === preferredVersionId) || null
      : null
  const fallbackVersion =
    versionRecords.find((version) =>
      Array.isArray(version.candidates) &&
      version.candidates.some((candidate) => Boolean(candidate && typeof candidate === "object" && typeof (candidate as Record<string, unknown>).url === "string")),
    ) || null
  const selectedVersion = preferredVersion ?? fallbackVersion ?? versionRecords[0] ?? null
  const candidates = Array.isArray(selectedVersion?.candidates) ? selectedVersion.candidates : []

  const images: WorkflowMediaRef[] = []
  for (const item of candidates) {
    if (!item || typeof item !== "object") continue
    const record = item as Record<string, unknown>
    const assetId = typeof record.asset_id === "string" ? record.asset_id : null
    const candidateUrl = typeof record.url === "string" ? record.url.trim() : null
    const assetUrl = assetId ? assetUrlById.get(assetId)?.trim() || null : null
    const url = isEmbeddableWorkflowImagePromptUrl(assetUrl) ? assetUrl : candidateUrl
    if (!url) continue
    images.push({
      url,
      title: assetId || "Workflow image",
      assetId,
      mimeType: "image/png",
    })
  }

  return images
}

function hasInlineWorkflowImageUrls(images: WorkflowMediaRef[]) {
  return images.some((image) => typeof image.url === "string" && image.url.trim().toLowerCase().startsWith("data:"))
}

function coerceNumericHeader(value: string | null) {
  if (!value) return undefined
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined
}

function extractDownloadFileName(headers: Headers) {
  const contentDisposition = headers.get("content-disposition") || ""
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    const decoded = decodeURIComponent(utf8Match[1]).trim()
    if (decoded) return decoded
  }

  const asciiMatch = contentDisposition.match(/filename="([^"]+)"/i)
  if (asciiMatch?.[1]) {
    const decoded = asciiMatch[1].trim()
    if (decoded) return decoded
  }

  return null
}

async function pollMediaTaskUntilComplete(input: {
  origin: string
  taskId: string
  target: "ai-image" | "ai-video" | "ai-music"
  cookieHeader?: string | null
  requestIp?: string
  currentUser?: AuthUser | null
  maxPollAttempts?: number
  pollIntervalMs: number
}) {
  const maxPollAttempts =
    Number.isFinite(input.maxPollAttempts) && (input.maxPollAttempts as number) > 0
      ? (input.maxPollAttempts as number)
      : null

  for (let attempt = 0; maxPollAttempts === null || attempt < maxPollAttempts; attempt += 1) {
    if (attempt > 0) {
      await sleep(input.pollIntervalMs)
    }

    const request = createGetRequest({
      origin: input.origin,
      path: `/api/platform/media/tasks/${encodeURIComponent(input.taskId)}?target=${encodeURIComponent(input.target)}`,
      cookieHeader: input.cookieHeader,
      requestIp: input.requestIp,
      currentUser: input.currentUser,
    })
    const response = await mediaTaskGet(request, {
      params: Promise.resolve({ taskId: input.taskId }),
    })

    if (!response.ok) {
      throw new Error(await parseErrorResponse(response))
    }

    const payload = await parseJsonResponse(response)
    const data =
      payload?.data && typeof payload.data === "object"
        ? (payload.data as Record<string, unknown>)
        : payload
    const status = typeof data?.status === "string" ? data.status.trim().toLowerCase() : ""

    if (status === "succeeded" || status === "success") {
      return payload
    }

    if (status === "failed" || status === "fail" || status === "cancelled" || status === "canceled") {
      throw new Error("workflow_media_task_failed")
    }
  }

  throw new Error("workflow_media_task_timeout")
}

async function pollAssistantTaskUntilComplete(input: {
  origin: string
  taskId: string
  cookieHeader?: string | null
  requestIp?: string
  currentUser?: AuthUser | null
  maxPollAttempts?: number
  pollIntervalMs: number
}) {
  const maxPollAttempts =
    Number.isFinite(input.maxPollAttempts) && (input.maxPollAttempts as number) > 0
      ? (input.maxPollAttempts as number)
      : null

  for (let attempt = 0; maxPollAttempts === null || attempt < maxPollAttempts; attempt += 1) {
    if (attempt > 0) {
      await sleep(input.pollIntervalMs)
    }

    const request = createGetRequest({
      origin: input.origin,
      path: `/api/tasks/${encodeURIComponent(input.taskId)}`,
      cookieHeader: input.cookieHeader,
      requestIp: input.requestIp,
      currentUser: input.currentUser,
    })
    const response = await assistantTaskGet(request, {
      params: Promise.resolve({ taskId: input.taskId }),
    })

    if (!response.ok) {
      throw new Error(await parseErrorResponse(response))
    }

    const payload = await parseJsonResponse(response)
    const taskData = extractDataRecord(payload)
    const status = typeof taskData?.status === "string" ? taskData.status : ""
    const result = taskData?.result && typeof taskData.result === "object"
      ? (taskData.result as Record<string, unknown>)
      : null

    if (status === "success" || status === "approved") {
      return result ?? {}
    }

    if (status === "failed" || status === "cancelled" || status === "rejected") {
      const message = typeof result?.error === "string" && result.error.trim()
        ? result.error.trim()
        : "workflow_image_async_task_failed"
      throw new Error(message)
    }
  }

  throw new Error("workflow_image_task_timeout")
}

async function fetchImageAssistantSessionDetail(input: {
  origin: string
  sessionId: string
  cookieHeader?: string | null
  requestIp?: string
  currentUser?: AuthUser | null
}) {
  const request = createGetRequest({
    origin: input.origin,
    path: `/api/image-assistant/sessions/${encodeURIComponent(input.sessionId)}?mode=content&versionLimit=6&assetLimit=24`,
    cookieHeader: input.cookieHeader,
    requestIp: input.requestIp,
    currentUser: input.currentUser,
  })
  const response = await imageAssistantSessionGet(request, {
    params: Promise.resolve({ sessionId: input.sessionId }),
  })

  if (!response || !response.ok) {
    throw new Error(await parseErrorResponse(response))
  }

  return await parseJsonResponse(response)
}

function buildCapabilityGateError(responsePayload: Record<string, unknown> | null) {
  if (typeof responsePayload?.error === "string") {
    return responsePayload.error
  }

  return "workflow_capability_gate_failed"
}

function resolveWorkflowSharedCreditsRequired(params: {
  capabilitySlug: WorkflowCapabilityInvokeParams["capabilitySlug"]
  prompt: string
  locale: "zh" | "en"
  invokeParams: WorkflowCapabilityInvokeParams
  usesSharedCredits: boolean
}) {
  const { capabilitySlug, invokeParams, locale, prompt, usesSharedCredits } = params

  if (!usesSharedCredits) {
    return false
  }

  if (capabilitySlug === "ai-chat") {
    const selectedProviderId = normalizeOptionalText(invokeParams.node.config.selectedProviderId)
    const selectedModelId = normalizeOptionalText(invokeParams.node.config.selectedModelId)

    return shouldChargeSharedCreditsForCapability({
      capabilitySlug,
      usesSharedCredits,
      body: selectedProviderId
        ? {
            modelConfig: {
              providerId: selectedProviderId,
              ...(selectedModelId ? { modelId: selectedModelId } : {}),
            },
          }
        : {},
    })
  }

  if (capabilitySlug === "ai-image") {
    return shouldChargeSharedCreditsForCapability({
      capabilitySlug,
      usesSharedCredits,
      body: buildWorkflowImageGenerateRequestBody(invokeParams, prompt, locale),
    })
  }

  if (capabilitySlug === "ai-video") {
    return shouldChargeSharedCreditsForCapability({
      capabilitySlug,
      usesSharedCredits,
      body: {
        ...buildVideoGenerateRequestBody(invokeParams, prompt),
        referenceUrls: extractUrlLikeItems(invokeParams.input),
      },
    })
  }

  if (capabilitySlug === "ai-music") {
    return shouldChargeSharedCreditsForCapability({
      capabilitySlug,
      usesSharedCredits,
      body: buildAudioGenerateRequestBody(invokeParams, prompt),
    })
  }

  return usesSharedCredits
}

function resolveWorkflowVideoFeatureId(params: WorkflowCapabilityInvokeParams) {
  if (params.nodeType === "digital_human" || normalizeOptionalText(params.node.config.featureId) === "digital-human") {
    return "digital-human"
  }

  return normalizeOptionalText(params.node.config.firstFrameUrl) || findPrimaryImageUrl(params.input)
    ? "image-to-video"
    : "text-to-video"
}

function resolveWorkflowVideoCapability(featureId: "text-to-video" | "image-to-video"): ModelCapability {
  return featureId === "image-to-video" ? "video.image_to_video" : "video.text_to_video"
}

function resolveWorkflowVideoModelId(params: WorkflowCapabilityInvokeParams, featureId: "text-to-video" | "image-to-video") {
  const configuredModel = normalizeOptionalText(params.node.config.model)
  const capability = resolveWorkflowVideoCapability(featureId)
  const matchingModel = findModelByCapabilityAndAlias({
    capability,
    value: configuredModel,
  })

  return (
    matchingModel?.id ||
    getModelDefinition(getDefaultModelId(capability) || "")?.id ||
    listModels({ capability })[0]?.id ||
    undefined
  )
}

export function buildVideoGenerateRequestBody(params: WorkflowCapabilityInvokeParams, prompt: string) {
  const featureId = resolveWorkflowVideoFeatureId(params)

  if (params.nodeType === "digital_human" || featureId === "digital-human") {
    const audioUrl = normalizeOptionalText(params.node.config.audioUrl) || findPrimaryAudioUrl(params.input)
    const script = normalizeOptionalText(params.node.config.script) || (!audioUrl ? prompt : undefined)

    return {
      featureId: "digital-human",
      params: {
        prompt: normalizeOptionalText(params.node.config.scenePrompt) || undefined,
        script,
        audioUrl: audioUrl || undefined,
        avatarImageUrl: normalizeOptionalText(params.node.config.avatarImageUrl) || findPrimaryImageUrlFromAnyInput(params.input),
        durationSeconds: resolveDigitalHumanDurationSeconds(params),
        seed: normalizeOptionalNumber(params.node.config.seed) ?? -1,
        audioTrimStart: normalizeOptionalNumber(params.node.config.audioTrimStart) ?? undefined,
        audioTrimEnd: normalizeOptionalNumber(params.node.config.audioTrimEnd) ?? undefined,
      },
    }
  }

  if (featureId === "image-to-video") {
    const selectedModel = resolveWorkflowVideoModelId(params, "image-to-video")
    return {
      featureId,
      params: {
        prompt,
        model: selectedModel,
        modelId: selectedModel,
        firstFrameUrl: normalizeOptionalText(params.node.config.firstFrameUrl) || findPrimaryImageUrl(params.input),
        lastFrameUrl: normalizeOptionalText(params.node.config.lastFrameUrl) || findSecondaryImageUrl(params.input) || undefined,
        resolution: normalizeOptionalText(params.node.config.resolution) || "768p",
        duration: normalizeOptionalText(params.node.config.duration) || "6",
        ratio: normalizeOptionalText(params.node.config.ratio) || "adaptive",
        generateAudio: normalizeBooleanString(params.node.config.generateAudio, true),
        realPersonMode: normalizeBooleanString(params.node.config.realPersonMode, true),
        seed: normalizeOptionalNumber(params.node.config.seed) ?? -1,
      },
    }
  }

  const selectedModel = resolveWorkflowVideoModelId(params, "text-to-video")
  return {
    featureId: "text-to-video",
    params: {
      prompt,
      model: selectedModel,
      modelId: selectedModel,
      resolution: normalizeOptionalText(params.node.config.resolution) || "768p",
      duration: normalizeOptionalText(params.node.config.duration) || "6",
      ratio: normalizeOptionalText(params.node.config.ratio) || "adaptive",
      generateAudio: normalizeBooleanString(params.node.config.generateAudio, true),
      seed: normalizeOptionalNumber(params.node.config.seed) ?? -1,
    },
  }
}

function buildAudioGenerateRequestBody(params: WorkflowCapabilityInvokeParams, prompt: string) {
  const configuredFeatureId = normalizeOptionalText(params.node.config.featureId)
  const featureId =
    params.nodeType === "voice_synthesis" || params.action === "voice-synthesis" || configuredFeatureId === "voice-synthesis"
      ? "voice-synthesis"
      : "ai-music"

  if (featureId === "voice-synthesis") {
    return {
      featureId,
      params: {
        prompt,
        voiceId: normalizeOptionalText(params.node.config.voiceId) || undefined,
        model: normalizeOptionalText(params.node.config.model) || "speech-2.8-hd",
        languageBoost: normalizeOptionalText(params.node.config.languageBoost) || "auto",
        speed: normalizeOptionalNumber(params.node.config.speed) ?? 1,
        volume: normalizeOptionalNumber(params.node.config.volume) ?? 1,
        pitch: normalizeOptionalNumber(params.node.config.pitch) ?? 1,
      },
    }
  }

  return {
    featureId: "ai-music",
    params: {
      stylePrompt: prompt,
      lyricsSource: normalizeOptionalText(params.node.config.lyricsSource) || "ai_generate",
      lyricsPrompt: prompt,
      title: normalizeOptionalText(params.node.config.title) || undefined,
      genre: normalizeOptionalText(params.node.config.genre) || undefined,
      mood: normalizeOptionalText(params.node.config.mood) || undefined,
      vocals: normalizeOptionalText(params.node.config.vocals) || undefined,
      referenceAudioUrl: normalizeOptionalText(params.node.config.referenceAudioUrl) || findPrimaryAudioUrl(params.input) || undefined,
    },
  }
}

async function parseWriterStreamResponse(response: Response) {
  if (!response.ok || !response.body) {
    throw new Error(await parseErrorResponse(response))
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder("utf-8")
  let buffer = ""
  let answer = ""

  const applyChunk = (chunk: string) => {
    const frames = chunk.split("\n\n")
    for (const frame of frames) {
      const line = frame
        .split("\n")
        .find((candidate) => candidate.startsWith("data: "))
      if (!line) continue

      const payload = JSON.parse(line.slice(6)) as Record<string, unknown>
      if (payload.event === "error") {
        throw new Error(typeof payload.error === "string" ? payload.error : "writer_stream_failed")
      }
      if (payload.event === "message" && typeof payload.answer === "string") {
        answer += payload.answer
      }
      if (payload.event === "message_end" && typeof payload.answer === "string" && payload.answer.trim()) {
        answer = payload.answer
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lastBoundary = buffer.lastIndexOf("\n\n")
    if (lastBoundary === -1) continue
    applyChunk(buffer.slice(0, lastBoundary))
    buffer = buffer.slice(lastBoundary + 2)
  }

  if (buffer.trim()) {
    applyChunk(`${buffer}\n\n`)
  }

  const normalized = answer.trim()
  if (!normalized) {
    throw new Error("workflow_writer_empty_response")
  }

  return normalized
}

export function createWorkflowCapabilityInvoker(options: WorkflowCapabilityInvokerOptions) {
  return async function invokeWorkflowCapability(
    params: WorkflowCapabilityInvokeParams,
  ): Promise<WorkflowNodeExecutionResult> {
    const locale = options.locale || "en"
    const origin = normalizeOrigin(options.requestOrigin)
    const prompt = buildPromptText(params, options.locale ?? "en")
    const executionState =
      params.capabilitySlug === "content-repurpose"
        ? await getPlatformBindingTargetExecutionState(params.capabilitySlug, locale, options.currentUser)
        : await getPlatformCapabilityExecutionState(params.capabilitySlug, locale, options.currentUser)
    const target =
      params.capabilitySlug === "content-repurpose"
        ? resolvePlatformBindingExecutionProxyTarget(params.capabilitySlug, params.action)
        : resolvePlatformCapabilityExecutionProxyTarget(params.capabilitySlug, params.action)

    if (!executionState || !target) {
      throw new Error("workflow_capability_target_unavailable")
    }

    const gate = evaluatePlatformExecutionGate({
      currentUser: options.currentUser,
      requiresLogin: target.requiresLogin,
      runtimeStatus: executionState.runtimeStatus,
      accessState: executionState.accessState,
      usesSharedCredits: executionState.usesSharedCredits,
      sharedCreditsRequired: resolveWorkflowSharedCreditsRequired({
        capabilitySlug: params.capabilitySlug,
        prompt,
        locale,
        invokeParams: params,
        usesSharedCredits: executionState.usesSharedCredits,
      }),
      billingCanSpendCredits: executionState.billing?.canSpendCredits ?? null,
    })
    if (!gate.ok) {
      throw new Error(buildCapabilityGateError(await parseJsonResponse(gate.response)))
    }

    const callTimeoutMs = resolveWorkflowCapabilityCallTimeoutMs(
      params.capabilitySlug,
      options.callTimeoutMs,
      params,
    )

    return withTimeout(
      (async (): Promise<WorkflowNodeExecutionResult> => {
        if (params.capabilitySlug === "ai-chat") {
          const selectedProviderId = normalizeOptionalText(params.node.config.selectedProviderId)
          const selectedModelId = normalizeOptionalText(params.node.config.selectedModelId)
          const systemPrompt = normalizeOptionalText(params.node.config.systemPrompt)
          const response = await aiChatPost(
            createJsonRequest({
              origin,
              path: "/api/ai/chat",
              body: {
                message: prompt,
                stream: false,
                ...(systemPrompt ? { systemPrompt } : {}),
                ...(selectedProviderId
                  ? {
                      modelConfig: {
                        providerId: selectedProviderId,
                        ...(selectedModelId ? { modelId: selectedModelId } : {}),
                      },
                    }
                  : {}),
              },
              cookieHeader: options.cookieHeader,
              requestIp: options.requestIp,
              currentUser: options.currentUser,
            }),
          )

          if (!response || !response.ok) {
            throw new Error(await parseErrorResponse(response))
          }

          const payload = await parseJsonResponse(response)
          const message = typeof payload?.message === "string" ? payload.message : ""
          if (!message.trim()) {
            throw new Error("workflow_llm_empty_response")
          }

          return {
            output: {
              text: [message],
            },
            providerId: typeof payload?.provider === "string" ? payload.provider : null,
            modelId: typeof payload?.providerModel === "string" ? payload.providerModel : null,
          }
        }

        if (params.capabilitySlug === "content-repurpose") {
          const response = await writerChatStreamPost(
            createJsonRequest({
              origin,
              path: "/api/writer/chat/stream",
              body: {
                query: prompt,
                platform: normalizeOptionalText(params.node.config.platform) || "generic",
                mode: normalizeOptionalText(params.node.config.mode) || "article",
                language: normalizeOptionalText(params.node.config.language) || "auto",
              },
              cookieHeader: options.cookieHeader,
              requestIp: options.requestIp,
              currentUser: options.currentUser,
            }),
          )

          if (!response) {
            throw new Error(await parseErrorResponse(response))
          }

          const message = await parseWriterStreamResponse(response)
          return {
            output: {
              text: [message],
            },
            providerId: "writer",
            modelId: "writer-skills",
          }
        }

        if (params.capabilitySlug === "ai-ppt") {
          const inputImages = extractWorkflowPptInputImages(params.input)
          const previewBody = {
            prompt,
            scenario: typeof params.node.config.scenario === "string" ? params.node.config.scenario : "marketing-campaign",
            language: typeof params.node.config.language === "string" ? params.node.config.language : "zh-CN",
            model: typeof params.node.config.model === "string" ? params.node.config.model : undefined,
            templateMode: typeof params.node.config.templateMode === "string" ? params.node.config.templateMode : "auto-4",
            templateId: typeof params.node.config.templateId === "string" ? params.node.config.templateId : undefined,
            pageCount: typeof params.node.config.pageCount === "number" ? params.node.config.pageCount : undefined,
            images:
              inputImages.length > 0
                ? inputImages.map((image, index) => ({
                    ...image,
                    role: index === 0 ? "cover" : "content",
                  }))
                : undefined,
          }
          const previewResponse = await leadToolPreviewPost(
            createJsonRequest({
              origin,
              path: "/api/tools/ai-ppt-preview/preview",
              body: previewBody,
              cookieHeader: options.cookieHeader,
              requestIp: options.requestIp,
              currentUser: options.currentUser,
            }),
            { params: Promise.resolve({ slug: "ai-ppt-preview" }) },
          )

          if (!previewResponse.ok) {
            throw new Error(await parseErrorResponse(previewResponse))
          }

          const previewPayload = await parseJsonResponse(previewResponse)
          const deck = previewPayload?.deck
          const previewSessionId =
            typeof previewPayload?.previewSessionId === "string" ? previewPayload.previewSessionId : undefined
          const variants =
            deck && typeof deck === "object" && Array.isArray((deck as Record<string, unknown>).variants)
              ? ((deck as Record<string, unknown>).variants as Array<Record<string, unknown>>)
              : []
          const selectedVariantKey =
            typeof params.node.config.selectedVariantKey === "string"
              ? params.node.config.selectedVariantKey
              : typeof variants[0]?.key === "string"
                ? variants[0].key
                : null

          if (!deck || !selectedVariantKey) {
            throw new Error("workflow_ppt_variant_missing")
          }

          const downloadResponse = await leadToolDownloadPost(
            createJsonRequest({
              origin,
              path: "/api/tools/ai-ppt-preview/download",
              body: {
                deck,
                selectedVariantKey,
                previewSessionId,
              },
              cookieHeader: options.cookieHeader,
              requestIp: options.requestIp,
              currentUser: options.currentUser,
            }),
            { params: Promise.resolve({ slug: "ai-ppt-preview" }) },
          )

          if (!downloadResponse.ok) {
            throw new Error(await parseErrorResponse(downloadResponse))
          }

          const artifactId = coerceNumericHeader(downloadResponse.headers.get("x-platform-artifact-id"))
          const workItemId = coerceNumericHeader(downloadResponse.headers.get("x-platform-work-item-id"))
          const contentType = downloadResponse.headers.get("content-type") || "application/vnd.openxmlformats-officedocument.presentationml.presentation"
          const downloadFileName = extractDownloadFileName(downloadResponse.headers) || "workflow-deck"
          const previewUrl = artifactId ? `/api/platform/artifacts/${artifactId}/download` : null
          const downloadUrl = artifactId ? `/api/platform/artifacts/${artifactId}/download?download=1` : previewUrl

          return {
            output: {
              ppt: [{
                artifactId,
                title: downloadFileName,
                mimeType: contentType,
                url: previewUrl,
                downloadUrl,
              }],
            },
            metadata: {
              selectedVariantKey,
              previewSessionId: previewSessionId || null,
              workItemId: workItemId ?? null,
            },
          }
        }

        if (params.capabilitySlug === "ai-image") {
          if (target.downstreamPath.startsWith("/api/image-assistant/generate")) {
            const response = await imageAssistantGeneratePost(
              createJsonRequest({
                origin,
                path: "/api/image-assistant/generate",
                body: buildWorkflowImageGenerateRequestBody(params, prompt, locale),
                cookieHeader: options.cookieHeader,
                requestIp: options.requestIp,
                currentUser: options.currentUser,
              }),
            )

            if (!response || !response.ok) {
              throw new Error(await parseErrorResponse(response))
            }

            const payload = await parseJsonResponse(response)
            const payloadData = extractDataRecord(payload)
            const directOutcome = typeof payloadData?.outcome === "string" ? payloadData.outcome : null
            const directDetailSnapshot =
              payloadData?.detail_snapshot && typeof payloadData.detail_snapshot === "object"
                ? (payloadData.detail_snapshot as Record<string, unknown>)
                : null
            const directSessionId = typeof payloadData?.session_id === "string" ? payloadData.session_id : null
            const directVersionId = typeof payloadData?.version_id === "string" ? payloadData.version_id : null

            if (directOutcome === "needs_clarification") {
              throw new Error("workflow_image_requires_more_detail")
            }

            if (directDetailSnapshot) {
              const images = extractWorkflowImageCandidates(directDetailSnapshot, directVersionId)
              if (images.length === 0) {
                throw new Error("workflow_image_empty_response")
              }

              return {
                output: {
                  image: images,
                },
                metadata: {
                  sessionId: directSessionId,
                },
              }
            }

            const asyncTaskId = typeof payloadData?.task_id === "string" ? payloadData.task_id : null
            if (!asyncTaskId) {
              throw new Error("workflow_image_async_task_missing")
            }
            const assistantPollIntervalMs = options.pollIntervalMs ?? 3000
            const asyncResult = await pollAssistantTaskUntilComplete({
              origin,
              taskId: asyncTaskId,
              cookieHeader: options.cookieHeader,
              requestIp: options.requestIp,
              currentUser: options.currentUser,
              maxPollAttempts: options.maxPollAttempts,
              pollIntervalMs: assistantPollIntervalMs,
            })
            const asyncOutcome = typeof asyncResult.outcome === "string" ? asyncResult.outcome : null
            const asyncVersionId = typeof asyncResult.version_id === "string" ? asyncResult.version_id : null
            const asyncSessionId =
              (typeof asyncResult.session_id === "string" && asyncResult.session_id) ||
              directSessionId

            if (asyncOutcome === "needs_clarification") {
              throw new Error("workflow_image_requires_more_detail")
            }
            if (!asyncSessionId) {
              throw new Error("workflow_image_async_session_missing")
            }
            let sessionPayload = await fetchImageAssistantSessionDetail({
              origin,
              sessionId: asyncSessionId,
              cookieHeader: options.cookieHeader,
              requestIp: options.requestIp,
              currentUser: options.currentUser,
            })
            let images = extractWorkflowImageCandidates(sessionPayload, asyncVersionId)
            for (let attempt = 0; attempt < 5 && hasInlineWorkflowImageUrls(images); attempt += 1) {
              await sleep(800)
              sessionPayload = await fetchImageAssistantSessionDetail({
                origin,
                sessionId: asyncSessionId,
                cookieHeader: options.cookieHeader,
                requestIp: options.requestIp,
                currentUser: options.currentUser,
              })
              images = extractWorkflowImageCandidates(sessionPayload, asyncVersionId)
            }
            if (images.length === 0) {
              throw new Error("workflow_image_empty_response")
            }

            return {
              output: {
                image: images,
              },
              metadata: {
                sessionId: asyncSessionId,
                outcome: asyncOutcome,
                taskId: asyncTaskId,
              },
            }
          }

          const mediaResponse = await mediaRunPost(
            createJsonRequest({
              origin,
              path: `/api/platform/media/run?target=ai-image&action=${encodeURIComponent(params.action)}`,
              body: {
                ...buildWorkflowImageGenerateRequestBody(params, prompt, locale),
              },
              cookieHeader: options.cookieHeader,
              requestIp: options.requestIp,
              currentUser: options.currentUser,
            }),
          )

          if (!mediaResponse.ok) {
            throw new Error(await parseErrorResponse(mediaResponse))
          }

          const mediaPayload = await parseJsonResponse(mediaResponse)
          const mediaData =
            mediaPayload?.data && typeof mediaPayload.data === "object"
              ? (mediaPayload.data as Record<string, unknown>)
              : null
          const taskId = typeof mediaData?.taskId === "string" ? mediaData.taskId : null
          const status = typeof mediaData?.status === "string" ? mediaData.status : ""

          const finalPayload =
            taskId && (status === "queued" || status === "running")
              ? await pollMediaTaskUntilComplete({
                  origin,
                  taskId,
                  target: "ai-image",
                  cookieHeader: options.cookieHeader,
                  requestIp: options.requestIp,
                  currentUser: options.currentUser,
                  maxPollAttempts: options.maxPollAttempts,
                  pollIntervalMs: options.pollIntervalMs ?? 3000,
                })
              : mediaPayload

          return {
            output: {
              image: extractMediaItems(finalPayload),
            },
          }
        }

        if (params.capabilitySlug === "ai-video") {
          if (!target.downstreamPath.startsWith("/api/platform/media/run")) {
            const response = await videoWorkflowPost(
              createJsonRequest({
                origin,
                path: "/api/video-agent/workflow",
                body: {
                  action: "plan",
                  goal: prompt,
                },
                cookieHeader: options.cookieHeader,
                requestIp: options.requestIp,
                currentUser: options.currentUser,
              }),
            )

            if (!response || !response.ok) {
              throw new Error(await parseErrorResponse(response))
            }

            const payload = await parseJsonResponse(response)
            return {
              output: {
                video: extractMediaItems(payload),
              },
              metadata: payload ?? null,
            }
          }

          const mediaResponse = await mediaRunPost(
            createJsonRequest({
              origin,
              path: `/api/platform/media/run?target=ai-video&action=${encodeURIComponent(params.action)}`,
              body: {
                ...buildVideoGenerateRequestBody(params, prompt),
                referenceUrls: extractUrlLikeItems(params.input),
              },
              cookieHeader: options.cookieHeader,
              requestIp: options.requestIp,
              currentUser: options.currentUser,
            }),
          )

          if (!mediaResponse.ok) {
            throw new Error(await parseErrorResponse(mediaResponse))
          }

          const mediaPayload = await parseJsonResponse(mediaResponse)
          const mediaData =
            mediaPayload?.data && typeof mediaPayload.data === "object"
              ? (mediaPayload.data as Record<string, unknown>)
              : null
          const taskId = typeof mediaData?.taskId === "string" ? mediaData.taskId : null
          const status = typeof mediaData?.status === "string" ? mediaData.status : ""
          const finalPayload =
            taskId && (status === "queued" || status === "running")
              ? await pollMediaTaskUntilComplete({
                  origin,
                  taskId,
                  target: "ai-video",
                  cookieHeader: options.cookieHeader,
                  requestIp: options.requestIp,
                  currentUser: options.currentUser,
                  maxPollAttempts: options.maxPollAttempts,
                  pollIntervalMs: options.pollIntervalMs ?? 5000,
                })
              : mediaPayload

          return {
            output: {
              video: extractMediaItems(finalPayload),
            },
          }
        }

        if (params.capabilitySlug === "ai-music") {
          const mediaResponse = await mediaRunPost(
            createJsonRequest({
              origin,
              path: `/api/platform/media/run?target=ai-music&action=${encodeURIComponent(params.action)}`,
              body: buildAudioGenerateRequestBody(params, prompt),
              cookieHeader: options.cookieHeader,
              requestIp: options.requestIp,
              currentUser: options.currentUser,
            }),
          )

          if (!mediaResponse.ok) {
            throw new Error(await parseErrorResponse(mediaResponse))
          }

          const mediaPayload = await parseJsonResponse(mediaResponse)
          const mediaData =
            mediaPayload?.data && typeof mediaPayload.data === "object"
              ? (mediaPayload.data as Record<string, unknown>)
              : null
          const taskId = typeof mediaData?.taskId === "string" ? mediaData.taskId : null
          const status = typeof mediaData?.status === "string" ? mediaData.status : ""
          const finalPayload =
            taskId && (status === "queued" || status === "running")
              ? await pollMediaTaskUntilComplete({
                  origin,
                  taskId,
                  target: "ai-music",
                  cookieHeader: options.cookieHeader,
                  requestIp: options.requestIp,
                  currentUser: options.currentUser,
                  maxPollAttempts: options.maxPollAttempts,
                  pollIntervalMs: options.pollIntervalMs ?? 4000,
                })
              : mediaPayload

          return {
            output: {
              audio: extractMediaItems(finalPayload),
            },
          }
        }

        throw new Error("workflow_capability_not_supported")
      })(),
      callTimeoutMs,
      resolveWorkflowCapabilityTimeoutError(params.capabilitySlug),
    )
  }
}
