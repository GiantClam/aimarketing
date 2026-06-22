import { writerRequestJson } from "@/lib/writer/network"

import {
  generateOrEditImagesWithGoogle,
  getImageAssistantGoogleModel,
  type GoogleImageRuntimeConfig,
  type ImageAssistantFileReference,
} from "@/lib/image-assistant/google"
import {
  generateImagesWithOpenAiCompatibleProvider,
  getOpenAiCompatibleImageProviderConfig,
  hasOpenAiCompatibleImageProviderKey,
  type OpenAiCompatibleImageProviderConfig,
  type OpenAiCompatibleImageProviderId,
  type OpenAiCompatibleInlineImage,
} from "@/lib/image-assistant/openai-compatible-image"
import { executeImageProviderPlan, type ImageGenerationProvider } from "@/lib/image-generation/provider-orchestration"
import { isImageAssistantR2Available } from "@/lib/image-assistant/r2"
import {
  isRunningHubConfiguredForTarget,
  queryRunningHubTask,
  submitRunningHubTask,
  uploadRunningHubBinary,
  type RunningHubConfig,
} from "@/lib/platform/runninghub"
import type {
  GptImage2Background,
  GptImage2OutputFormat,
  GptImage2Quality,
  GptImage2Moderation,
  GptImage2ResponseFormat,
} from "@/lib/image-assistant/model-options"
import type { ImageAssistantResolution, ImageAssistantSizePreset, ImageAssistantTaskType } from "@/lib/image-assistant/types"

type InlineReferenceImage = OpenAiCompatibleInlineImage
type FileReferenceImage = ImageAssistantFileReference & { assetId?: string | null }
type ReferenceImageInput = InlineReferenceImage | FileReferenceImage
export type ImageAssistantRuntimeProviderConfig =
  | {
      kind: "openai-compatible"
      provider: OpenAiCompatibleImageProviderId
      config: OpenAiCompatibleImageProviderConfig
      model?: string | null
    }
  | {
      kind: "google"
      config: GoogleImageRuntimeConfig
      model?: string | null
    }
  | {
      kind: "runninghub"
      config: RunningHubConfig
      model?: string | null
    }

const PRIMARY_IMAGE_ASSISTANT_AIBERM_MODEL =
  process.env.IMAGE_ASSISTANT_AIBERM_MODEL || process.env.WRITER_AIBERM_IMAGE_MODEL || "gpt-image-2"
const AIBERM_API_BASE = (
  process.env.AIBERM_IMAGE_API_BASE ||
  process.env.AIBERM_BASE_URL?.replace(/\/v1$/i, "") ||
  "https://aiberm.com"
).replace(/\/$/, "")
const AIBERM_API_KEY =
  process.env.IMAGE_ASSISTANT_AIBERM_API_KEY ||
  process.env.AIBERM_API_KEY ||
  process.env.WRITER_AIBERM_API_KEY ||
  ""
const DEFAULT_IMAGE_RESOLUTION: ImageAssistantResolution = "2K"
const IMAGE_ASSISTANT_PROVIDER_TOTAL_TIMEOUT_MS = Math.max(
  30_000,
  Number.parseInt(process.env.IMAGE_ASSISTANT_PROVIDER_TOTAL_TIMEOUT_MS || "", 10) || 300_000,
)
const IMAGE_ASSISTANT_PROVIDER_TIMEOUT_MS = Math.max(
  5_000,
  Number.parseInt(process.env.IMAGE_ASSISTANT_PROVIDER_TIMEOUT_MS || "", 10) || 240_000,
)
const MAX_IMAGE_ASSISTANT_CANDIDATES = 9
const RUNNINGHUB_IMAGE_POLL_INTERVAL_MS = Math.max(
  1_000,
  Number.parseInt(process.env.RUNNINGHUB_IMAGE_POLL_INTERVAL_MS || "", 10) || 2_000,
)

function parseModelList(...values: Array<string | null | undefined>) {
  const result: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    for (const item of String(value || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)) {
      if (seen.has(item)) continue
      seen.add(item)
      result.push(item)
    }
  }

  return result
}

const IMAGE_ASSISTANT_AIBERM_MODELS = parseModelList(
  PRIMARY_IMAGE_ASSISTANT_AIBERM_MODEL,
  process.env.IMAGE_ASSISTANT_AIBERM_FALLBACK_MODELS,
  process.env.IMAGE_ASSISTANT_AIBERM_FALLBACK_MODEL,
)

function normalizeProviderErrorMessage(message: string) {
  const normalized = message.trim()
  if (/resource exhausted/i.test(normalized)) {
    return "image_assistant_resource_exhausted"
  }
  return normalized || "image_assistant_request_failed"
}

function buildHeaders() {
  if (!AIBERM_API_KEY) {
    throw new Error("aiberm_api_key_missing")
  }

  return {
    Authorization: `Bearer ${AIBERM_API_KEY}`,
    "Content-Type": "application/json",
  }
}

function normalizeAspectRatio(sizePreset?: string | null) {
  const value = sizePreset || "1:1"
  if (["1:1", "4:5", "3:4", "4:3", "16:9", "9:16"].includes(value)) {
    return value
  }

  return "1:1"
}

function extractInlineImageDataUrls(data: any) {
  const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : []
  const urls: string[] = []
  for (const part of parts) {
    const mimeType = typeof part?.inlineData?.mimeType === "string" ? part.inlineData.mimeType.trim() : ""
    const base64Data = typeof part?.inlineData?.data === "string" ? part.inlineData.data.trim() : ""
    if (mimeType.startsWith("image/") && base64Data) {
      urls.push(`data:${mimeType};base64,${base64Data}`)
    }
  }
  return urls
}

function buildFixtureDataUrl(prompt: string, aspectRatio: string, index = 0) {
  const palette = [
    ["#102a43", "#0ea5e9"],
    ["#2d1b69", "#ff6b6b"],
    ["#1f2937", "#f59e0b"],
    ["#0f766e", "#10b981"],
  ][index % 4]

  const safePrompt = prompt.replace(/[<&>"]/g, "").slice(0, 58) || "Image Design Assistant"
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${palette[0]}" />
          <stop offset="100%" stop-color="${palette[1]}" />
        </linearGradient>
      </defs>
      <rect width="1200" height="1200" fill="url(#g)" />
      <rect x="56" y="56" width="1088" height="1088" rx="44" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.22)" />
      <text x="88" y="150" fill="#ffffff" font-family="Arial, sans-serif" font-size="28">Image Design Assistant</text>
      <text x="88" y="240" fill="#ffffff" font-family="Arial, sans-serif" font-size="60" font-weight="700">${safePrompt}</text>
      <text x="88" y="314" fill="rgba(255,255,255,0.76)" font-family="Arial, sans-serif" font-size="28">Aspect ${aspectRatio} • Candidate ${index + 1}</text>
      <circle cx="920" cy="310" r="160" fill="rgba(255,255,255,0.16)" />
      <rect x="110" y="720" width="980" height="220" rx="28" fill="rgba(255,255,255,0.12)" />
      <text x="150" y="810" fill="#ffffff" font-family="Arial, sans-serif" font-size="38">Fixture output for local development</text>
      <text x="150" y="870" fill="rgba(255,255,255,0.78)" font-family="Arial, sans-serif" font-size="24">Set IMAGE_ASSISTANT_FIXTURES=true to keep using fixtures</text>
    </svg>
  `.trim()

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
}

export function shouldUseImageAssistantFixtures() {
  return process.env.IMAGE_ASSISTANT_FIXTURES === "true"
}

export function hasImageAssistantAibermKey() {
  return Boolean(AIBERM_API_KEY)
}

export function hasImageAssistantPptokenKey() {
  return hasOpenAiCompatibleImageProviderKey("pptoken")
}

export function hasImageAssistantCrazyrouteKey() {
  return hasOpenAiCompatibleImageProviderKey("crazyroute")
}

function isAbortLikeError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.message === "request_aborted")
}

function createProviderScopedAbortSignal(parentSignal?: AbortSignal, timeoutMs?: number | null) {
  const controller = new AbortController()
  let timedOut = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const onParentAbort = () => {
    controller.abort()
  }

  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort()
    } else {
      parentSignal.addEventListener("abort", onParentAbort, { once: true })
    }
  }

  if (timeoutMs && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      if (parentSignal) {
        parentSignal.removeEventListener("abort", onParentAbort)
      }
    },
  }
}

function toSafeBaseUrlHost(value: string | null | undefined) {
  const normalized = String(value || "").trim()
  if (!normalized) return null

  try {
    return new URL(normalized).host
  } catch {
    return normalized
  }
}

export function getImageAssistantModel(
  _resolution: ImageAssistantResolution,
  runtimeProviderConfig?: ImageAssistantRuntimeProviderConfig | null,
) {
  if (runtimeProviderConfig?.kind === "runninghub") {
    return runtimeProviderConfig.model || "runninghub-image-workflow"
  }
  if (runtimeProviderConfig?.kind === "google") {
    return runtimeProviderConfig.model || getImageAssistantGoogleModel(runtimeProviderConfig.config)
  }
  if (runtimeProviderConfig?.kind === "openai-compatible") {
    return runtimeProviderConfig.model || runtimeProviderConfig.config.model || "gpt-image-2"
  }
  if (hasImageAssistantPptokenKey()) {
    return getOpenAiCompatibleImageProviderConfig("pptoken")?.model || "gpt-image-2"
  }
  if (hasImageAssistantAibermKey()) {
    return IMAGE_ASSISTANT_AIBERM_MODELS[0]
  }
  if (hasImageAssistantCrazyrouteKey()) {
    return getOpenAiCompatibleImageProviderConfig("crazyroute")?.model || "gpt-image-2"
  }
  return "gpt-image-2"
}

export function getImageAssistantAvailability(params?: {
  runtimeProviderConfig?: ImageAssistantRuntimeProviderConfig | null
}) {
  if (params?.runtimeProviderConfig?.kind === "runninghub") {
    const model = params.runtimeProviderConfig.model || "runninghub-image-workflow"
    const enabled = isRunningHubConfiguredForTarget("ai-image", params.runtimeProviderConfig.config)
    return {
      enabled,
      reason: enabled ? null : "runninghub_not_configured",
      provider: "runninghub",
      models: {
        highQuality: model,
        lowCost: model,
      },
    }
  }

  if (params?.runtimeProviderConfig?.kind === "google") {
    const model =
      params.runtimeProviderConfig.model ||
      getImageAssistantGoogleModel(params.runtimeProviderConfig.config)
    return {
      enabled: true,
      reason: null,
      provider: "google",
      models: {
        highQuality: model,
        lowCost: model,
      },
    }
  }

  if (params?.runtimeProviderConfig?.kind === "openai-compatible") {
    const model =
      params.runtimeProviderConfig.model ||
      params.runtimeProviderConfig.config.model ||
      "gpt-image-2"
    return {
      enabled: true,
      reason: null,
      provider: params.runtimeProviderConfig.provider,
      models: {
        highQuality: model,
        lowCost: model,
      },
    }
  }

  const preferredProvider = hasImageAssistantPptokenKey()
    ? "pptoken"
    : hasImageAssistantAibermKey()
      ? "aiberm"
      : hasImageAssistantCrazyrouteKey()
        ? "crazyroute"
        : "unavailable"

  if (shouldUseImageAssistantFixtures()) {
    return {
      enabled: true,
      reason: null,
      provider: "fixture",
      models: {
        highQuality: IMAGE_ASSISTANT_AIBERM_MODELS[0],
        lowCost: IMAGE_ASSISTANT_AIBERM_MODELS[0],
      },
    }
  }

  if (!isImageAssistantR2Available()) {
    return {
      enabled: false,
      reason: "image_assistant_r2_config_missing",
      provider: preferredProvider,
      models: {
        highQuality: getImageAssistantModel(DEFAULT_IMAGE_RESOLUTION),
        lowCost: hasImageAssistantAibermKey() ? IMAGE_ASSISTANT_AIBERM_MODELS[0] : getImageAssistantModel(DEFAULT_IMAGE_RESOLUTION),
      },
    }
  }

  if (!hasImageAssistantPptokenKey() && !hasImageAssistantAibermKey() && !hasImageAssistantCrazyrouteKey()) {
    return {
      enabled: false,
      reason: "image_generation_provider_missing",
      provider: "unavailable",
      models: {
        highQuality: getImageAssistantModel(DEFAULT_IMAGE_RESOLUTION),
        lowCost: getImageAssistantModel(DEFAULT_IMAGE_RESOLUTION),
      },
    }
  }

  return {
    enabled: true,
    reason: null,
    provider: preferredProvider,
    models: {
      highQuality: getImageAssistantModel(DEFAULT_IMAGE_RESOLUTION),
      lowCost: hasImageAssistantAibermKey() ? IMAGE_ASSISTANT_AIBERM_MODELS[0] : getImageAssistantModel(DEFAULT_IMAGE_RESOLUTION),
    },
  }
}

function sleepWithSignal(ms: number, signal?: AbortSignal) {
  if (!signal) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
  }

  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timeoutId)
      signal.removeEventListener("abort", onAbort)
      const error = new Error("request_aborted")
      error.name = "AbortError"
      reject(error)
    }

    if (signal.aborted) {
      onAbort()
      return
    }

    signal.addEventListener("abort", onAbort, { once: true })
  })
}

function inlineReferenceToBlob(reference: InlineReferenceImage) {
  return new Blob([Buffer.from(reference.base64Data, "base64")], {
    type: reference.mimeType || "image/png",
  })
}

async function uploadRunningHubReferenceImage(params: {
  config: RunningHubConfig
  reference: InlineReferenceImage
  index: number
}) {
  const extension = params.reference.mimeType === "image/jpeg"
    ? "jpg"
    : params.reference.mimeType === "image/webp"
      ? "webp"
      : "png"

  const uploaded = await uploadRunningHubBinary({
    config: params.config,
    file: inlineReferenceToBlob(params.reference),
    fileName: `image-assistant-reference-${params.index + 1}.${extension}`,
  })

  return {
    assetId: params.reference.assetId || null,
    mimeType: params.reference.mimeType,
    fileName: uploaded.fileName,
    downloadUrl: uploaded.downloadUrl,
  }
}

function extractRunningHubImageResultUrls(result: Awaited<ReturnType<typeof queryRunningHubTask>>) {
  if (!result?.results?.length) {
    return []
  }

  return result.results
    .map((item) => (typeof item?.url === "string" ? item.url.trim() : ""))
    .filter(Boolean)
}

async function waitForRunningHubImageResults(params: {
  taskId: string
  config: RunningHubConfig
  signal?: AbortSignal
}) {
  const deadlineAt = Date.now() + IMAGE_ASSISTANT_PROVIDER_TOTAL_TIMEOUT_MS

  while (Date.now() < deadlineAt) {
    const task = await queryRunningHubTask(params.taskId, params.config)
    const status = String(task?.status || "").toUpperCase()

    if (status === "SUCCESS") {
      const images = extractRunningHubImageResultUrls(task)
      if (images.length === 0) {
        throw new Error("runninghub_image_results_missing")
      }

      return {
        status,
        images,
      }
    }

    if (status === "FAILED") {
      throw new Error(task?.errorMessage || task?.errorCode || "runninghub_image_task_failed")
    }

    await sleepWithSignal(RUNNINGHUB_IMAGE_POLL_INTERVAL_MS, params.signal)
  }

  throw new Error("runninghub_image_timeout")
}

async function generateOrEditImagesWithRunningHub(params: {
  prompt: string
  taskType: ImageAssistantTaskType
  model?: string | null
  sizePreset?: ImageAssistantSizePreset | null
  resolution: ImageAssistantResolution
  imageSize?: string | null
  imageQuality?: GptImage2Quality | null
  imageBackground?: GptImage2Background | null
  imageOutputFormat?: GptImage2OutputFormat | null
  imageOutputCompression?: number | null
  imageModeration?: GptImage2Moderation | null
  imageResponseFormat?: GptImage2ResponseFormat | null
  referenceImages?: InlineReferenceImage[]
  snapshotAssetId?: string | null
  maskAssetId?: string | null
  candidateCount: number
  config: RunningHubConfig
  signal?: AbortSignal
}) {
  const uploadedReferences = await Promise.all(
    (params.referenceImages || []).map((reference, index) =>
      uploadRunningHubReferenceImage({
        config: params.config,
        reference,
        index,
      }),
    ),
  )

  const maskImage =
    (params.maskAssetId
      ? uploadedReferences.find((reference) => reference.assetId === params.maskAssetId) || null
      : null)
  const snapshotImage =
    (params.snapshotAssetId
      ? uploadedReferences.find((reference) => reference.assetId === params.snapshotAssetId) || null
      : null)
  const contentReferences = uploadedReferences.filter((reference) => reference.assetId !== params.maskAssetId)
  const primaryImage = snapshotImage || contentReferences[0] || null
  const mode =
    params.taskType === "generate" && contentReferences.length === 0 && !snapshotImage ? "txt2img" : "img2img"

  const submit = await submitRunningHubTask({
    mediaTarget: "ai-image",
    config: params.config,
    payload: {
      prompt: params.prompt,
      model: params.model || null,
      candidateCount: params.candidateCount,
      sizePreset: params.sizePreset || null,
      resolution: params.resolution,
      imageSize: params.imageSize || null,
      imageQuality: params.imageQuality || null,
      imageBackground: params.imageBackground || null,
      imageOutputFormat: params.imageOutputFormat || null,
      imageOutputCompression: params.imageOutputCompression ?? null,
      imageModeration: params.imageModeration || null,
      imageResponseFormat: params.imageResponseFormat || null,
      taskType: params.taskType,
      mode,
      workflowMode: mode,
      inputMode: mode,
      referenceImages: contentReferences.map((reference) => ({
        assetId: reference.assetId,
        fileName: reference.fileName,
        mimeType: reference.mimeType,
        url: reference.downloadUrl,
      })),
      referenceImageUrls: contentReferences.map((reference) => reference.downloadUrl),
      inputImageUrl: primaryImage?.downloadUrl || null,
      inputImageUrls: contentReferences.map((reference) => reference.downloadUrl),
      imageUrl: primaryImage?.downloadUrl || null,
      sourceImageUrl: primaryImage?.downloadUrl || null,
      snapshotImageUrl: snapshotImage?.downloadUrl || primaryImage?.downloadUrl || null,
      maskImageUrl: maskImage?.downloadUrl || null,
    },
  })

  const completed = await waitForRunningHubImageResults({
    taskId: submit.taskId,
    config: params.config,
    signal: params.signal,
  })

  return {
    provider: "runninghub" as const,
    model: params.model || "runninghub-image-workflow",
    textSummary:
      mode === "txt2img"
        ? "Generated image results with RunningHub text-to-image."
        : "Generated image results with RunningHub image-to-image.",
    images: completed.images,
  }
}

function _isFallbackEligibleAibermError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    message.includes("image_assistant_http_5") ||
    message.includes("image_assistant_http_429") ||
    message.includes("resource exhausted") ||
    message.includes("fetch failed") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("temporarily unavailable")
  )
}

async function requestImagesWithModel(params: {
  model: string
  prompt: string
  sizePreset?: ImageAssistantSizePreset | null
  resolution: ImageAssistantResolution
  referenceImages?: InlineReferenceImage[]
  signal?: AbortSignal
}) {
  const response = await writerRequestJson(
    `${AIBERM_API_BASE}/v1beta/models/${encodeURIComponent(params.model)}:generateContent`,
    {
      method: "POST",
      headers: buildHeaders(),
      signal: params.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              ...(params.referenceImages || []).map((image) => ({
                inlineData: {
                  mimeType: image.mimeType,
                  data: image.base64Data,
                },
              })),
              { text: params.prompt },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio: normalizeAspectRatio(params.sizePreset),
            imageSize: params.resolution || DEFAULT_IMAGE_RESOLUTION,
          },
        },
      }),
    },
    { attempts: 1, timeoutMs: 120_000 },
  )

  if (!response.ok) {
    throw new Error(
      normalizeProviderErrorMessage((response.data as any)?.error?.message || `image_assistant_http_${response.status}`),
    )
  }

  const urls = extractInlineImageDataUrls(response.data)

  const textSummary =
    typeof (response.data as any)?.candidates?.[0]?.content?.parts?.find?.((part: any) => typeof part?.text === "string")?.text ===
    "string"
      ? (response.data as any).candidates[0].content.parts.find((part: any) => typeof part?.text === "string").text
      : ""

  if (!urls.length && !textSummary) {
    throw new Error("image_assistant_images_missing")
  }

  return {
    model: params.model,
    images: urls,
    textSummary: textSummary || "Image generation completed.",
  }
}

async function requestImages(params: {
  prompt: string
  sizePreset?: ImageAssistantSizePreset | null
  resolution: ImageAssistantResolution
  referenceImages?: InlineReferenceImage[]
  signal?: AbortSignal
}) {
  const model = IMAGE_ASSISTANT_AIBERM_MODELS[0]
  return requestImagesWithModel({
    ...params,
    model,
  })
}

function modelUsesOpenAiImageApi(model: string | null | undefined) {
  const normalized = String(model || "").toLowerCase()
  return normalized.includes("gpt-image-2") || normalized.includes("openai/gpt-image-2")
}

export function buildImageAssistantProviderPlan(params?: {
  hasPptoken?: boolean
  hasAiberm?: boolean
  hasCrazyroute?: boolean
  providerLock?: "pptoken" | "aiberm" | "crazyroute" | null
}) {
  if (params?.providerLock) {
    if (params.providerLock === "pptoken" && (params.hasPptoken ?? hasImageAssistantPptokenKey())) {
      return ["pptoken"] satisfies ImageGenerationProvider[]
    }
    if (params.providerLock === "aiberm" && (params.hasAiberm ?? hasImageAssistantAibermKey())) {
      return ["aiberm"] satisfies ImageGenerationProvider[]
    }
    if (params.providerLock === "crazyroute" && (params.hasCrazyroute ?? hasImageAssistantCrazyrouteKey())) {
      return ["crazyroute"] satisfies ImageGenerationProvider[]
    }
    return []
  }

  const plan: ImageGenerationProvider[] = []

  if (params?.hasPptoken ?? hasImageAssistantPptokenKey()) {
    plan.push("pptoken")
  }
  if (params?.hasAiberm ?? hasImageAssistantAibermKey()) {
    plan.push("aiberm")
  }
  if (params?.hasCrazyroute ?? hasImageAssistantCrazyrouteKey()) {
    plan.push("crazyroute")
  }

  return plan
}

function getProviderExecutionPlan(params: {
  referenceImages?: ReferenceImageInput[]
  providerLock?: "pptoken" | "aiberm" | "crazyroute" | null
}) {
  return buildImageAssistantProviderPlan({
    providerLock: params.providerLock || null,
  })
}

function requestOpenAiCompatibleImages(params: {
  provider: OpenAiCompatibleImageProviderId
  config?: OpenAiCompatibleImageProviderConfig | null
  prompt: string
  taskType: ImageAssistantTaskType
  model?: string | null
  sizePreset?: ImageAssistantSizePreset | null
  resolution: ImageAssistantResolution
  imageSize?: string | null
  imageQuality?: GptImage2Quality | null
  imageBackground?: GptImage2Background | null
  imageOutputFormat?: GptImage2OutputFormat | null
  imageOutputCompression?: number | null
  imageModeration?: GptImage2Moderation | null
  imageResponseFormat?: GptImage2ResponseFormat | null
  referenceImages?: InlineReferenceImage[]
  snapshotAssetId?: string | null
  maskAssetId?: string | null
  candidateCount?: number
  signal?: AbortSignal
}) {
  const config =
    params.config ||
    getOpenAiCompatibleImageProviderConfig(params.provider)
  if (!config) {
    throw new Error(`image_assistant_${params.provider}_api_key_missing`)
  }

  return generateImagesWithOpenAiCompatibleProvider({
    config,
    prompt: params.prompt,
    taskType: params.taskType,
    model: params.model,
    sizePreset: params.sizePreset,
    resolution: params.resolution,
    imageSize: params.imageSize,
    imageQuality: params.imageQuality,
    imageBackground: params.imageBackground,
    imageOutputFormat: params.imageOutputFormat,
    imageOutputCompression: params.imageOutputCompression,
    imageModeration: params.imageModeration,
    imageResponseFormat: params.imageResponseFormat,
    referenceImages: params.referenceImages,
    snapshotAssetId: params.snapshotAssetId,
    maskAssetId: params.maskAssetId,
    candidateCount: params.candidateCount,
    signal: params.signal,
  })
}

export async function generateOrEditImages(params: {
  prompt: string
  resolution: ImageAssistantResolution
  taskType?: ImageAssistantTaskType
  model?: string | null
  sizePreset?: ImageAssistantSizePreset | null
  imageSize?: string | null
  imageQuality?: GptImage2Quality | null
  imageBackground?: GptImage2Background | null
  imageOutputFormat?: GptImage2OutputFormat | null
  imageOutputCompression?: number | null
  imageModeration?: GptImage2Moderation | null
  imageResponseFormat?: GptImage2ResponseFormat | null
  referenceImages?: ReferenceImageInput[]
  providerLock?: "pptoken" | "aiberm" | "crazyroute" | null
  snapshotAssetId?: string | null
  maskAssetId?: string | null
  candidateCount?: number
  runtimeProviderConfig?: ImageAssistantRuntimeProviderConfig | null
  signal?: AbortSignal
}) {
  const taskType = params.taskType || "generate"
  const candidateCount = Math.max(1, Math.min(params.candidateCount || 1, MAX_IMAGE_ASSISTANT_CANDIDATES))
  const aspectRatio = normalizeAspectRatio(params.sizePreset)
  const providerDeadlineAt = Date.now() + IMAGE_ASSISTANT_PROVIDER_TOTAL_TIMEOUT_MS
  const getRemainingProviderBudgetMs = () => Math.max(0, providerDeadlineAt - Date.now())

  if (shouldUseImageAssistantFixtures()) {
    return {
      provider: "fixture",
      model: params.model || getImageAssistantModel(params.resolution),
      textSummary: "Generated local fixture image results.",
      images: Array.from({ length: candidateCount }, (_, index) => buildFixtureDataUrl(params.prompt, aspectRatio, index)),
    }
  }

  const inlineReferenceImages = (params.referenceImages || []).filter(
    (image): image is InlineReferenceImage => image.kind === "inline",
  )

  if (params.runtimeProviderConfig?.kind === "runninghub") {
    const result = await generateOrEditImagesWithRunningHub({
      prompt: params.prompt,
      taskType,
      model: params.model || params.runtimeProviderConfig.model || "runninghub-image-workflow",
      sizePreset: params.sizePreset,
      resolution: params.resolution,
      imageSize: params.imageSize,
      imageQuality: params.imageQuality,
      imageBackground: params.imageBackground,
      imageOutputFormat: params.imageOutputFormat,
      imageOutputCompression: params.imageOutputCompression,
      imageModeration: params.imageModeration,
      imageResponseFormat: params.imageResponseFormat,
      referenceImages: inlineReferenceImages,
      snapshotAssetId: params.snapshotAssetId,
      maskAssetId: params.maskAssetId,
      candidateCount,
      config: params.runtimeProviderConfig.config,
      signal: params.signal,
    })

    return {
      provider: result.provider,
      model: result.model,
      textSummary: result.textSummary,
      images: result.images,
    }
  }

  if (params.runtimeProviderConfig?.kind === "google") {
    const fileReferenceImages = (params.referenceImages || []).filter(
      (image): image is FileReferenceImage => image.kind === "file",
    )
    const result = await generateOrEditImagesWithGoogle({
      prompt: params.prompt,
      resolution: params.resolution,
      sizePreset: params.sizePreset,
      referenceImages: fileReferenceImages,
      config: params.runtimeProviderConfig.config,
      signal: params.signal,
    })

    return {
      provider: "google",
      model: result.model,
      textSummary: result.textSummary,
      images: result.images,
    }
  }

  if (params.runtimeProviderConfig?.kind === "openai-compatible") {
    const result = await requestOpenAiCompatibleImages({
      provider: params.runtimeProviderConfig.provider,
      config: params.runtimeProviderConfig.config,
      prompt: params.prompt,
      taskType,
      model:
        params.model ||
        params.runtimeProviderConfig.model ||
        params.runtimeProviderConfig.config.model,
      sizePreset: params.sizePreset,
      resolution: params.resolution,
      imageSize: params.imageSize,
      imageQuality: params.imageQuality,
      imageBackground: params.imageBackground,
      imageOutputFormat: params.imageOutputFormat,
      imageOutputCompression: params.imageOutputCompression,
      imageModeration: params.imageModeration,
      imageResponseFormat: params.imageResponseFormat,
      referenceImages: inlineReferenceImages,
      snapshotAssetId: params.snapshotAssetId,
      maskAssetId: params.maskAssetId,
      candidateCount,
      signal: params.signal,
    })

    return {
      provider: params.runtimeProviderConfig.provider,
      model: result.model,
      textSummary: result.textSummary,
      images: result.images,
    }
  }

  const providerPlan =
    params.runtimeProviderConfig
      ? []
      : getProviderExecutionPlan({
          referenceImages: params.referenceImages,
          providerLock: params.providerLock || null,
        })
  const providerIndexMap = new Map(providerPlan.map((provider, index) => [provider, index] as const))

  console.info("image-assistant.provider.plan", {
    providerPlan,
    providerLock: params.providerLock || null,
    taskType,
    candidateCount,
    model: params.model || null,
    imageSize: params.imageSize || null,
    imageQuality: params.imageQuality || null,
  })

  async function runProviderWithBudget<T>(
    provider: Exclude<ImageGenerationProvider, "fixture">,
    run: (signal: AbortSignal) => Promise<T>,
    providerIndex: number,
  ) {
    const remainingBudgetMs = getRemainingProviderBudgetMs()
    if (remainingBudgetMs <= 0) {
      throw new Error("image_assistant_provider_timeout")
    }

    const remainingProviders = Math.max(1, providerPlan.length - providerIndex)
    const sharedProviderBudgetMs =
      providerPlan.length > 1
        ? Math.ceil(remainingBudgetMs / remainingProviders)
        : remainingBudgetMs
    const providerTimeoutMs = Math.max(
      1_000,
      Math.min(IMAGE_ASSISTANT_PROVIDER_TIMEOUT_MS, remainingBudgetMs, sharedProviderBudgetMs),
    )
    const scopedAbort = createProviderScopedAbortSignal(params.signal, providerTimeoutMs)

    try {
      return await run(scopedAbort.signal)
    } catch (error) {
      if (params.signal?.aborted) {
        throw error
      }
      if (scopedAbort.didTimeout() || (isAbortLikeError(error) && !params.signal?.aborted)) {
        throw new Error(`image_assistant_${provider}_timeout`)
      }
      throw error
    } finally {
      scopedAbort.cleanup()
    }
  }

  const { provider: resolvedProvider, result } = await executeImageProviderPlan({
    providerPlan,
    signal: params.signal,
    handlers: {
      aiberm: () =>
        runProviderWithBudget(
          "aiberm",
          (providerSignal) => {
            const requestedModel = params.model || IMAGE_ASSISTANT_AIBERM_MODELS[0]
            const usesOpenAiImageApi = modelUsesOpenAiImageApi(requestedModel)
            const providerConfig = usesOpenAiImageApi
              ? getOpenAiCompatibleImageProviderConfig("aiberm")
              : null

            console.info("image-assistant.provider.start", {
              provider: "aiberm",
              model: requestedModel,
              baseUrlHost: toSafeBaseUrlHost(providerConfig?.baseUrl || AIBERM_API_BASE),
              taskType,
            })

            return usesOpenAiImageApi
              ? requestOpenAiCompatibleImages({
                  provider: "aiberm",
                  prompt: params.prompt,
                  taskType,
                  model: requestedModel,
                  resolution: params.resolution,
                  sizePreset: params.sizePreset,
                  imageSize: params.imageSize,
                  imageQuality: params.imageQuality,
                  imageBackground: params.imageBackground,
                  imageOutputFormat: params.imageOutputFormat,
                  imageOutputCompression: params.imageOutputCompression,
                  imageModeration: params.imageModeration,
                  imageResponseFormat: params.imageResponseFormat,
                  referenceImages: inlineReferenceImages,
                  snapshotAssetId: params.snapshotAssetId,
                  maskAssetId: params.maskAssetId,
                  candidateCount,
                  signal: providerSignal,
                })
              : requestImages({
                  prompt: params.prompt,
                  resolution: params.resolution,
                  sizePreset: params.sizePreset,
                  referenceImages: inlineReferenceImages,
                  signal: providerSignal,
                })
          },
          providerIndexMap.get("aiberm") ?? 0,
        ),
      pptoken: () =>
        runProviderWithBudget(
          "pptoken",
          (providerSignal) => {
            const providerConfig = getOpenAiCompatibleImageProviderConfig("pptoken")
            console.info("image-assistant.provider.start", {
              provider: "pptoken",
              model: params.model || providerConfig?.model || "gpt-image-2",
              baseUrlHost: toSafeBaseUrlHost(providerConfig?.baseUrl),
              taskType,
            })

            return requestOpenAiCompatibleImages({
              provider: "pptoken",
              prompt: params.prompt,
              taskType,
              model: params.model,
              resolution: params.resolution,
              sizePreset: params.sizePreset,
              imageSize: params.imageSize,
              imageQuality: params.imageQuality,
              imageBackground: params.imageBackground,
              imageOutputFormat: params.imageOutputFormat,
              imageOutputCompression: params.imageOutputCompression,
              imageModeration: params.imageModeration,
              imageResponseFormat: params.imageResponseFormat,
              referenceImages: inlineReferenceImages,
              snapshotAssetId: params.snapshotAssetId,
              maskAssetId: params.maskAssetId,
              candidateCount,
              signal: providerSignal,
            })
          },
          providerIndexMap.get("pptoken") ?? 0,
        ),
      crazyroute: () =>
        runProviderWithBudget(
          "crazyroute",
          (providerSignal) => {
            const providerConfig = getOpenAiCompatibleImageProviderConfig("crazyroute")
            console.info("image-assistant.provider.start", {
              provider: "crazyroute",
              model: params.model || providerConfig?.model || "gpt-image-2",
              baseUrlHost: toSafeBaseUrlHost(providerConfig?.baseUrl),
              taskType,
            })

            return requestOpenAiCompatibleImages({
              provider: "crazyroute",
              prompt: params.prompt,
              taskType,
              model: params.model,
              resolution: params.resolution,
              sizePreset: params.sizePreset,
              imageSize: params.imageSize,
              imageQuality: params.imageQuality,
              imageBackground: params.imageBackground,
              imageOutputFormat: params.imageOutputFormat,
              imageOutputCompression: params.imageOutputCompression,
              imageModeration: params.imageModeration,
              imageResponseFormat: params.imageResponseFormat,
              referenceImages: inlineReferenceImages,
              snapshotAssetId: params.snapshotAssetId,
              maskAssetId: params.maskAssetId,
              candidateCount,
              signal: providerSignal,
            })
          },
          providerIndexMap.get("crazyroute") ?? 0,
        ),
    },
    onProviderFailure: ({ provider, nextProvider, error }) => {
      console.warn(`image-assistant.${provider}.generate.failed`, {
        nextProvider,
        message: error instanceof Error ? error.message : String(error),
      })
    },
  })

  const expanded = Array.from({ length: candidateCount }, (_, index) => result.images[index % result.images.length])
  return {
    provider: resolvedProvider,
    model: result.model,
    textSummary: result.textSummary || "Image generation completed.",
    images: expanded,
  }
}
