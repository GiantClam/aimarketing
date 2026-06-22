import { execFile } from "node:child_process"
import { promisify } from "node:util"

import type {
  ImageAssistantResolution,
  ImageAssistantSizePreset,
  ImageAssistantTaskType,
} from "@/lib/image-assistant/types"
import {
  normalizeGptImage2Background,
  normalizeGptImage2OutputCompression,
  normalizeGptImage2OutputFormat,
  normalizeGptImage2Quality,
  normalizeGptImage2ResponseFormat,
  normalizeGptImage2Size,
  normalizeGptImage2Moderation,
  type GptImage2Background,
  type GptImage2OutputFormat,
  type GptImage2Quality,
  type GptImage2Moderation,
  type GptImage2ResponseFormat,
} from "@/lib/image-assistant/model-options"
import { withTaskTimeout } from "@/lib/task-timeout"
import { hasWriterProxyTransport, writerFetch } from "@/lib/writer/network"

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
  quality: GptImage2Quality
  background: GptImage2Background
  outputFormat: GptImage2OutputFormat
  outputCompression: number | null
  moderation: GptImage2Moderation
  responseFormat: GptImage2ResponseFormat
  images: OpenAiCompatibleInlineImage[]
  mask: OpenAiCompatibleInlineImage | null
}

const DEFAULT_MODEL = "gpt-image-2"
const MAX_OPENAI_COMPATIBLE_IMAGE_CANDIDATES = 9
const OPENAI_COMPATIBLE_IMAGE_REQUEST_TIMEOUT_MS = 120_000
const OPENAI_COMPATIBLE_IMAGE_REQUEST_ATTEMPTS = 3
const OPENAI_COMPATIBLE_IMAGE_CURL_MAX_BUFFER_BYTES = 20 * 1024 * 1024

const execFileAsync = promisify(execFile)

type CurlRunner = (args: string[]) => Promise<{ stdout: string; stderr: string }>

let curlRunner: CurlRunner = async (args) =>
  execFileAsync("curl", args, {
    maxBuffer: OPENAI_COMPATIBLE_IMAGE_CURL_MAX_BUFFER_BYTES,
  })

function normalizeText(raw: unknown) {
  return typeof raw === "string" ? raw.trim() : ""
}

function trimBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/u, "")
}

export function setOpenAiCompatibleImageCurlRunnerForTests(runner: CurlRunner | null) {
  curlRunner = runner
    ? runner
    : async (args) =>
        execFileAsync("curl", args, {
          maxBuffer: OPENAI_COMPATIBLE_IMAGE_CURL_MAX_BUFFER_BYTES,
        })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableOpenAiCompatibleImageStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

function isRetryableOpenAiCompatibleImageError(error: unknown) {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  const cause = error.cause as { code?: string } | undefined
  return (
    message.includes("fetch failed") ||
    message.includes("other side closed") ||
    message.includes("socket hang up") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("temporarily unavailable") ||
    message.includes("request aborted") ||
    message.includes("request_timeout") ||
    message.includes("econnreset") ||
    cause?.code === "ECONNRESET" ||
    cause?.code === "ETIMEDOUT" ||
    cause?.code === "UND_ERR_SOCKET" ||
    cause?.code === "UND_ERR_CONNECT_TIMEOUT"
  )
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error("request_aborted")
    error.name = "AbortError"
    throw error
  }
}

function connectAbortSignals(parentSignal: AbortSignal | undefined, abortController: AbortController) {
  if (!parentSignal) {
    return () => {}
  }

  if (parentSignal.aborted) {
    abortController.abort()
    return () => {}
  }

  const handleAbort = () => abortController.abort()
  parentSignal.addEventListener("abort", handleAbort, { once: true })
  return () => parentSignal.removeEventListener("abort", handleAbort)
}

export function getOpenAiCompatibleImageProviderConfig(
  provider: OpenAiCompatibleImageProviderId,
): OpenAiCompatibleImageProviderConfig | null {
  if (provider === "pptoken") {
    const apiKey = normalizeText(process.env.IMAGE_ASSISTANT_PPTOKEN_API_KEY)
    if (!apiKey) return null
    return {
      provider,
      apiKey,
      baseUrl:
        normalizeText(process.env.IMAGE_ASSISTANT_PPTOKEN_BASE_URL) ||
        "https://api.pptoken.cc/v1",
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
  imageSize?: string | null
  imageQuality?: GptImage2Quality | null
  imageBackground?: GptImage2Background | null
  imageOutputFormat?: GptImage2OutputFormat | null
  imageOutputCompression?: number | null
  imageModeration?: GptImage2Moderation | null
  imageResponseFormat?: GptImage2ResponseFormat | null
  referenceImages?: OpenAiCompatibleInlineImage[]
  snapshotAssetId?: string | null
  maskAssetId?: string | null
}): OpenAiCompatibleImageRequestParts {
  const referenceImages = (params.referenceImages || []).filter(
    (image) => image.kind === "inline" && image.mimeType.startsWith("image/") && image.base64Data,
  )
  const prompt = normalizeText(params.prompt)
  if (!prompt) throw new Error("prompt_required")

  const isEditTask =
    params.taskType === "edit" ||
    params.taskType === "blend" ||
    params.taskType === "style_transfer" ||
    params.taskType === "mask_edit"

  const mask = params.maskAssetId
    ? referenceImages.find((image) => image.assetId === params.maskAssetId) || null
    : null

  if (params.taskType === "mask_edit" && !mask) {
    throw new Error("image_assistant_mask_missing")
  }

  return {
    endpoint: isEditTask ? "/images/edits" : "/images/generations",
    model: normalizeText(params.model) || DEFAULT_MODEL,
    prompt,
    size: normalizeGptImage2Size(params.imageSize),
    quality: normalizeGptImage2Quality(params.imageQuality),
    background: normalizeGptImage2Background(params.imageBackground),
    outputFormat: normalizeGptImage2OutputFormat(params.imageOutputFormat),
    outputCompression: normalizeGptImage2OutputCompression(
      params.imageOutputCompression,
      normalizeGptImage2OutputFormat(params.imageOutputFormat),
    ),
    moderation: normalizeGptImage2Moderation(params.imageModeration),
    responseFormat: normalizeGptImage2ResponseFormat(params.imageResponseFormat),
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

function extractOpenAiCompatibleImageErrorMessage(
  provider: OpenAiCompatibleImageProviderId,
  payload: Record<string, unknown> | null,
  status?: number,
) {
  if (typeof payload?.error === "object" && payload.error && "message" in payload.error) {
    return String((payload.error as Record<string, unknown>).message || "")
  }

  if (typeof payload?.message === "string" && payload.message.trim()) {
    return payload.message.trim()
  }

  return status ? `image_assistant_${provider}_http_${status}` : `image_assistant_${provider}_request_failed`
}

function extractOpenAiCompatibleImageResults(payload: Record<string, unknown> | null) {
  return (Array.isArray(payload?.data) ? payload.data : [])
    .map(dataUrlFromImageApiItem)
    .filter((value): value is string => Boolean(value))
}

async function requestOpenAiCompatibleImageGenerationWithCurl(params: {
  config: OpenAiCompatibleImageProviderConfig
  endpoint: string
  requestParts: OpenAiCompatibleImageRequestParts
  count: number
  timeoutMs: number
}) {
  const requestBody = JSON.stringify({
    model: params.requestParts.model,
    prompt: params.requestParts.prompt,
    size: params.requestParts.size,
    quality: params.requestParts.quality,
    background: params.requestParts.background,
    output_format: params.requestParts.outputFormat,
    ...(params.requestParts.outputCompression !== null
      ? { output_compression: params.requestParts.outputCompression }
      : {}),
    moderation: params.requestParts.moderation,
    response_format: params.requestParts.responseFormat,
    n: params.count,
  })

  const args = [
    "-sS",
    "--connect-timeout",
    String(Math.max(5, Math.ceil(params.timeoutMs / 3000))),
    "--max-time",
    String(Math.max(10, Math.ceil(params.timeoutMs / 1000))),
    "-X",
    "POST",
    params.endpoint,
    "-H",
    `Authorization: Bearer ${params.config.apiKey}`,
    "-H",
    "Content-Type: application/json",
    "-d",
    requestBody,
    "-w",
    "\n__HTTP_STATUS__:%{http_code}",
  ]

  const { stdout } = await curlRunner(args)
  const marker = "\n__HTTP_STATUS__:"
  const markerIndex = stdout.lastIndexOf(marker)
  if (markerIndex === -1) {
    throw new Error("image_assistant_curl_response_malformed")
  }

  const responseBody = stdout.slice(0, markerIndex)
  const status = Number.parseInt(stdout.slice(markerIndex + marker.length).trim(), 10)
  const payload = (JSON.parse(responseBody || "null") as Record<string, unknown> | null) ?? null

  if (!Number.isFinite(status) || status <= 0) {
    throw new Error("image_assistant_curl_status_missing")
  }

  if (status < 200 || status >= 300) {
    throw new Error(extractOpenAiCompatibleImageErrorMessage(params.config.provider, payload, status))
  }

  const images = extractOpenAiCompatibleImageResults(payload)
  if (images.length === 0) {
    throw new Error("image_assistant_images_missing")
  }

  return {
    model: params.requestParts.model,
    images,
    textSummary: "Image generation completed.",
  }
}

export async function generateImagesWithOpenAiCompatibleProvider(params: {
  config: OpenAiCompatibleImageProviderConfig
  prompt: string
  taskType: ImageAssistantTaskType
  sizePreset?: ImageAssistantSizePreset | null
  resolution?: ImageAssistantResolution | null
  model?: string | null
  imageSize?: string | null
  imageQuality?: GptImage2Quality | null
  imageBackground?: GptImage2Background | null
  imageOutputFormat?: GptImage2OutputFormat | null
  imageOutputCompression?: number | null
  imageModeration?: GptImage2Moderation | null
  imageResponseFormat?: GptImage2ResponseFormat | null
  referenceImages?: OpenAiCompatibleInlineImage[]
  snapshotAssetId?: string | null
  maskAssetId?: string | null
  candidateCount?: number
  signal?: AbortSignal
  attempts?: number
  timeoutMs?: number
}) {
  const requestParts = buildOpenAiCompatibleImageRequestParts({
    model: params.model || params.config.model,
    prompt: params.prompt,
    taskType: params.taskType,
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
  })
  const endpoint = `${trimBaseUrl(params.config.baseUrl)}${requestParts.endpoint}`
  const count = Math.max(1, Math.min(params.candidateCount || 1, MAX_OPENAI_COMPATIBLE_IMAGE_CANDIDATES))
  const attempts = Math.max(1, Math.min(params.attempts || OPENAI_COMPATIBLE_IMAGE_REQUEST_ATTEMPTS, 5))
  const timeoutMs = Math.max(1_000, params.timeoutMs || OPENAI_COMPATIBLE_IMAGE_REQUEST_TIMEOUT_MS)
  let lastError: unknown = null

  if (
    requestParts.endpoint === "/images/generations" &&
    params.config.provider === "pptoken" &&
    hasWriterProxyTransport()
  ) {
    console.info("image-assistant.openai-compatible.curl-preferred", {
      provider: params.config.provider,
      endpoint: requestParts.endpoint,
    })
    return requestOpenAiCompatibleImageGenerationWithCurl({
      config: params.config,
      endpoint,
      requestParts,
      count,
      timeoutMs,
    })
  }

  const createRequestInit = (signal?: AbortSignal): RequestInit => {
    const requestInit: RequestInit = {
      method: "POST",
      signal,
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
        background: requestParts.background,
        output_format: requestParts.outputFormat,
        ...(requestParts.outputCompression !== null
          ? { output_compression: requestParts.outputCompression }
          : {}),
        moderation: requestParts.moderation,
        response_format: requestParts.responseFormat,
        n: count,
      })
      return requestInit
    }

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
    return requestInit
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    throwIfAborted(params.signal)
    const abortController = new AbortController()
    const cleanupAbort = connectAbortSignals(params.signal, abortController)

    try {
      const response = await withTaskTimeout(
        (hasWriterProxyTransport() ? writerFetch(endpoint, createRequestInit(abortController.signal)) : fetch(endpoint, createRequestInit(abortController.signal))),
        timeoutMs,
        `image_assistant_${params.config.provider}_request_timeout`,
        { abortController },
      )
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null

      if (!response.ok) {
        const message = extractOpenAiCompatibleImageErrorMessage(params.config.provider, payload, response.status)
        const error = new Error(message || `image_assistant_${params.config.provider}_request_failed`)
        if (attempt < attempts && isRetryableOpenAiCompatibleImageStatus(response.status)) {
          console.warn("image-assistant.openai-compatible.retry", {
            provider: params.config.provider,
            attempt,
            status: response.status,
            endpoint: requestParts.endpoint,
          })
          await sleep(500 * attempt)
          continue
        }
        throw error
      }

      const images = extractOpenAiCompatibleImageResults(payload)

      if (images.length === 0) {
        throw new Error("image_assistant_images_missing")
      }

      return {
        model: requestParts.model,
        images,
        textSummary: "Image generation completed.",
      }
    } catch (error) {
      lastError = error
      if (params.signal?.aborted) {
        throwIfAborted(params.signal)
      }
      if (attempt < attempts && isRetryableOpenAiCompatibleImageError(error)) {
        console.warn("image-assistant.openai-compatible.retry", {
          provider: params.config.provider,
          attempt,
          endpoint: requestParts.endpoint,
          message: error instanceof Error ? error.message : String(error),
        })
        await sleep(500 * attempt)
        continue
      }
      if (
        requestParts.endpoint === "/images/generations" &&
        params.config.provider === "pptoken" &&
        isRetryableOpenAiCompatibleImageError(error)
      ) {
        console.warn("image-assistant.openai-compatible.curl-fallback", {
          provider: params.config.provider,
          endpoint: requestParts.endpoint,
          message: error instanceof Error ? error.message : String(error),
        })
        return requestOpenAiCompatibleImageGenerationWithCurl({
          config: params.config,
          endpoint,
          requestParts,
          count,
          timeoutMs,
        })
      }
      throw error
    } finally {
      cleanupAbort()
    }
  }

  throw lastError instanceof Error ? lastError : new Error("image_assistant_request_failed")
}
