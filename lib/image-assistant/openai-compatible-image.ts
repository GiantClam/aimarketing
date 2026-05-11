import type {
  ImageAssistantResolution,
  ImageAssistantSizePreset,
  ImageAssistantTaskType,
} from "@/lib/image-assistant/types"

export type OpenAiCompatibleImageProviderId = "pptoken" | "aiberm" | "crazyroute"

export type OpenAiCompatibleInlineImage = {
  kind: "inline"
  assetId?: string | null
  mimeType: string
  base64Data: string
}

export type OpenAiCompatibleImageProviderConfig = {
  provider: OpenAiCompatibleImageProviderId
  baseUrl: string
  apiKey: string
  model: string
}

export type OpenAiCompatibleImageRequestParts = {
  endpoint: "/images/generations" | "/images/edits"
  model: string
  prompt: string
  size: string
  quality: "low" | "medium" | "high"
  outputFormat: "png"
  images: OpenAiCompatibleInlineImage[]
  mask: OpenAiCompatibleInlineImage | null
}

const DEFAULT_MODEL = "gpt-image-2"

function normalizeText(raw: unknown) {
  return typeof raw === "string" ? raw.trim() : ""
}

function trimBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/u, "")
}

export function getOpenAiCompatibleImageProviderConfig(
  provider: OpenAiCompatibleImageProviderId,
): OpenAiCompatibleImageProviderConfig | null {
  if (provider === "pptoken") {
    const apiKey =
      normalizeText(process.env.IMAGE_ASSISTANT_PPTOKEN_API_KEY) ||
      normalizeText(process.env.PPTOKEN_API_KEY)
    if (!apiKey) return null
    return {
      provider,
      apiKey,
      baseUrl:
        normalizeText(process.env.IMAGE_ASSISTANT_PPTOKEN_BASE_URL) ||
        normalizeText(process.env.PPTOKEN_BASE_URL) ||
        "https://api.pptoken.org/v1",
      model:
        normalizeText(process.env.IMAGE_ASSISTANT_PPTOKEN_MODEL) ||
        normalizeText(process.env.PPTOKEN_IMAGE_MODEL) ||
        DEFAULT_MODEL,
    }
  }

  if (provider === "crazyroute") {
    const apiKey =
      normalizeText(process.env.IMAGE_ASSISTANT_CRAZYROUTE_API_KEY) ||
      normalizeText(process.env.CRAZYROUTE_API_KEY) ||
      normalizeText(process.env.CRAZYROUTER_API_KEY)
    if (!apiKey) return null
    return {
      provider,
      apiKey,
      baseUrl:
        normalizeText(process.env.IMAGE_ASSISTANT_CRAZYROUTE_BASE_URL) ||
        normalizeText(process.env.CRAZYROUTE_BASE_URL) ||
        normalizeText(process.env.CRAZYROUTER_BASE_URL) ||
        "https://api.crazyroute.com/v1",
      model:
        normalizeText(process.env.IMAGE_ASSISTANT_CRAZYROUTE_MODEL) ||
        normalizeText(process.env.CRAZYROUTE_IMAGE_MODEL) ||
        DEFAULT_MODEL,
    }
  }

  const apiKey =
    normalizeText(process.env.IMAGE_ASSISTANT_AIBERM_API_KEY) ||
    normalizeText(process.env.AIBERM_API_KEY) ||
    normalizeText(process.env.WRITER_AIBERM_API_KEY)
  if (!apiKey) return null
  return {
    provider,
    apiKey,
    baseUrl:
      normalizeText(process.env.IMAGE_ASSISTANT_AIBERM_BASE_URL) ||
      normalizeText(process.env.AIBERM_BASE_URL) ||
      "https://aiberm.com/v1",
    model:
      normalizeText(process.env.IMAGE_ASSISTANT_AIBERM_MODEL) ||
      normalizeText(process.env.WRITER_AIBERM_IMAGE_MODEL) ||
      DEFAULT_MODEL,
  }
}

export function hasOpenAiCompatibleImageProviderKey(
  provider: OpenAiCompatibleImageProviderId,
) {
  return Boolean(getOpenAiCompatibleImageProviderConfig(provider))
}

export function mapGptImage2Size(
  sizePreset?: ImageAssistantSizePreset | null,
  resolution?: ImageAssistantResolution | null,
) {
  const preset = sizePreset || "1:1"
  const tier = resolution || "2K"

  if (preset === "1:1") {
    if (tier === "4K") return "4096x4096"
    if (tier === "2K") return "2048x2048"
    return "1024x1024"
  }
  if (preset === "4:5") return tier === "4K" ? "2048x2560" : "1024x1280"
  if (preset === "3:4") return tier === "4K" ? "2048x3072" : "1024x1536"
  if (preset === "4:3") return tier === "4K" ? "3072x2048" : "1536x1024"
  if (preset === "16:9") return tier === "4K" ? "3840x2160" : "2048x1152"
  if (preset === "9:16") return tier === "4K" ? "2160x3840" : "1152x2048"
  return "1024x1024"
}

export function mapGptImage2Quality(resolution?: ImageAssistantResolution | null) {
  if (resolution === "512") return "low"
  if (resolution === "4K") return "high"
  return "medium"
}

function withoutMaskAsset(
  referenceImages: OpenAiCompatibleInlineImage[],
  maskAssetId?: string | null,
) {
  if (!maskAssetId) return referenceImages
  return referenceImages.filter((image) => image.assetId !== maskAssetId)
}

function orderImagesForMaskEdit(params: {
  referenceImages: OpenAiCompatibleInlineImage[]
  snapshotAssetId?: string | null
  maskAssetId?: string | null
}) {
  const images = withoutMaskAsset(params.referenceImages, params.maskAssetId)
  const snapshot =
    (params.snapshotAssetId
      ? images.find((image) => image.assetId === params.snapshotAssetId)
      : null) || images[0]
  if (!snapshot) {
    throw new Error("image_assistant_snapshot_missing")
  }

  const rest = images.filter((image) => image !== snapshot)
  return [snapshot, ...rest].slice(0, 16)
}

export function buildOpenAiCompatibleImageRequestParts(params: {
  model: string
  prompt: string
  taskType: ImageAssistantTaskType
  sizePreset?: ImageAssistantSizePreset | null
  resolution?: ImageAssistantResolution | null
  referenceImages?: OpenAiCompatibleInlineImage[]
  snapshotAssetId?: string | null
  maskAssetId?: string | null
}): OpenAiCompatibleImageRequestParts {
  const referenceImages = (params.referenceImages || []).filter(
    (image) => image.kind === "inline" && image.mimeType.startsWith("image/") && image.base64Data,
  )
  const prompt = normalizeText(params.prompt)
  if (!prompt) throw new Error("prompt_required")

  const isEditRequest =
    params.taskType === "edit" ||
    params.taskType === "blend" ||
    params.taskType === "style_transfer" ||
    params.taskType === "mask_edit" ||
    referenceImages.length > 0

  const mask = params.maskAssetId
    ? referenceImages.find((image) => image.assetId === params.maskAssetId) || null
    : null

  if (params.taskType === "mask_edit" && !mask) {
    throw new Error("image_assistant_mask_missing")
  }

  return {
    endpoint: isEditRequest ? "/images/edits" : "/images/generations",
    model: normalizeText(params.model) || DEFAULT_MODEL,
    prompt,
    size: mapGptImage2Size(params.sizePreset, params.resolution),
    quality: mapGptImage2Quality(params.resolution),
    outputFormat: "png",
    images:
      params.taskType === "mask_edit"
        ? orderImagesForMaskEdit({
            referenceImages,
            snapshotAssetId: params.snapshotAssetId,
            maskAssetId: params.maskAssetId,
          })
        : withoutMaskAsset(referenceImages, params.maskAssetId).slice(0, 16),
    mask,
  }
}

function imageToBlob(image: OpenAiCompatibleInlineImage) {
  return new Blob([Buffer.from(image.base64Data, "base64")], {
    type: image.mimeType || "image/png",
  })
}

function dataUrlFromImageApiItem(item: unknown) {
  const record = item && typeof item === "object" ? (item as Record<string, unknown>) : null
  const b64 = typeof record?.b64_json === "string" ? record.b64_json.trim() : ""
  if (b64) return `data:image/png;base64,${b64}`
  const url = typeof record?.url === "string" ? record.url.trim() : ""
  return url || null
}

export async function generateImagesWithOpenAiCompatibleProvider(params: {
  config: OpenAiCompatibleImageProviderConfig
  prompt: string
  taskType: ImageAssistantTaskType
  sizePreset?: ImageAssistantSizePreset | null
  resolution?: ImageAssistantResolution | null
  referenceImages?: OpenAiCompatibleInlineImage[]
  snapshotAssetId?: string | null
  maskAssetId?: string | null
  candidateCount?: number
  signal?: AbortSignal
}) {
  const requestParts = buildOpenAiCompatibleImageRequestParts({
    model: params.config.model,
    prompt: params.prompt,
    taskType: params.taskType,
    sizePreset: params.sizePreset,
    resolution: params.resolution,
    referenceImages: params.referenceImages,
    snapshotAssetId: params.snapshotAssetId,
    maskAssetId: params.maskAssetId,
  })
  const endpoint = `${trimBaseUrl(params.config.baseUrl)}${requestParts.endpoint}`
  const count = Math.max(1, Math.min(params.candidateCount || 1, 4))

  const requestInit: RequestInit = {
    method: "POST",
    signal: params.signal,
    headers: {
      Authorization: `Bearer ${params.config.apiKey}`,
    },
  }

  if (requestParts.endpoint === "/images/generations") {
    requestInit.headers = {
      ...requestInit.headers,
      "Content-Type": "application/json",
    }
    requestInit.body = JSON.stringify({
      model: requestParts.model,
      prompt: requestParts.prompt,
      size: requestParts.size,
      quality: requestParts.quality,
      output_format: requestParts.outputFormat,
      n: count,
    })
  } else {
    const form = new FormData()
    form.set("model", requestParts.model)
    form.set("prompt", requestParts.prompt)
    form.set("size", requestParts.size)
    form.set("quality", requestParts.quality)
    form.set("output_format", requestParts.outputFormat)
    form.set("n", String(count))
    requestParts.images.forEach((image, index) => {
      form.append("image", imageToBlob(image), `${image.assetId || `image-${index}`}.png`)
    })
    if (requestParts.mask) {
      form.set("mask", imageToBlob(requestParts.mask), `${requestParts.mask.assetId || "mask"}.png`)
    }
    requestInit.body = form
  }

  const response = await fetch(endpoint, requestInit)
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null

  if (!response.ok) {
    const message =
      typeof payload?.error === "object" && payload.error && "message" in payload.error
        ? String((payload.error as Record<string, unknown>).message || "")
        : `image_assistant_${params.config.provider}_http_${response.status}`
    throw new Error(message || `image_assistant_${params.config.provider}_request_failed`)
  }

  const images = (Array.isArray(payload?.data) ? payload.data : [])
    .map(dataUrlFromImageApiItem)
    .filter((value): value is string => Boolean(value))

  if (images.length === 0) {
    throw new Error("image_assistant_images_missing")
  }

  return {
    model: requestParts.model,
    images,
    textSummary: "Image generation completed.",
  }
}
