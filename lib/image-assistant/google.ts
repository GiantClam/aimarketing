import { GoogleGenAI, createPartFromUri } from "@google/genai"

import { loadImageSourceForModel } from "@/lib/image-assistant/assets"

import type { ImageAssistantResolution, ImageAssistantSizePreset } from "@/lib/image-assistant/types"

export type ImageAssistantFileReference = {
  kind: "file"
  mimeType: string
  fileUri: string
}

export type GoogleImageRuntimeConfig = {
  apiKey: string
  model: string
}

const GOOGLE_IMAGE_API_KEY =
  process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""
const PRIMARY_GOOGLE_IMAGE_MODEL =
  process.env.IMAGE_ASSISTANT_GOOGLE_MODEL ||
  process.env.WRITER_GEMINI_IMAGE_MODEL ||
  process.env.WRITER_IMAGE_MODEL ||
  "gemini-2.5-flash-image"
const DEFAULT_IMAGE_RESOLUTION: ImageAssistantResolution = "2K"

let googleClient: GoogleGenAI | null = null

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

const GOOGLE_IMAGE_MODELS = parseModelList(
  PRIMARY_GOOGLE_IMAGE_MODEL,
  process.env.IMAGE_ASSISTANT_GOOGLE_FALLBACK_MODELS,
  process.env.IMAGE_ASSISTANT_GOOGLE_FALLBACK_MODEL,
)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableGoogleError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  const cause = error.cause as { code?: string } | undefined
  return (
    message.includes("fetch failed") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("socket hang up") ||
    message.includes("econnreset") ||
    cause?.code === "ECONNRESET" ||
    cause?.code === "ETIMEDOUT" ||
    cause?.code === "UND_ERR_SOCKET"
  )
}

function isFallbackEligibleGoogleError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    isRetryableGoogleError(error) ||
    message.includes("resource exhausted") ||
    message.includes("internal") ||
    message.includes("unavailable") ||
    message.includes("deadline exceeded") ||
    message.includes("503") ||
    message.includes("500")
  )
}

function getGoogleClient(runtimeConfig?: GoogleImageRuntimeConfig | null) {
  const apiKey = runtimeConfig?.apiKey?.trim() || GOOGLE_IMAGE_API_KEY
  if (!apiKey) {
    throw new Error("google_image_api_key_missing")
  }

  if (runtimeConfig?.apiKey?.trim()) {
    return new GoogleGenAI({ apiKey })
  }

  if (!googleClient) {
    googleClient = new GoogleGenAI({ apiKey })
  }

  return googleClient
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

function extractTextSummary(data: any) {
  const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : []
  const textPart = parts.find((part: any) => typeof part?.text === "string")
  return typeof textPart?.text === "string" ? textPart.text : ""
}

export function hasImageAssistantGoogleKey(runtimeConfig?: GoogleImageRuntimeConfig | null) {
  return Boolean(runtimeConfig?.apiKey?.trim() || GOOGLE_IMAGE_API_KEY)
}

export function getImageAssistantGoogleModel(runtimeConfig?: GoogleImageRuntimeConfig | null) {
  return runtimeConfig?.model?.trim() || GOOGLE_IMAGE_MODELS[0] || "gemini-2.5-flash-image"
}

async function waitForUploadedFileActive(fileName: string, abortSignal?: AbortSignal) {
  const ai = getGoogleClient()

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const file = await ai.files.get({ name: fileName })
    if (file.state === "ACTIVE" && file.uri) {
      return file
    }
    if (file.state === "FAILED") {
      throw new Error(file.error?.message || "google_file_processing_failed")
    }
    if (abortSignal?.aborted) {
      const error = new Error("request_aborted")
      error.name = "AbortError"
      throw error
    }
    await sleep(800)
  }

  throw new Error("google_file_processing_timeout")
}

export async function uploadImageAssistantReferenceToGoogle(params: {
  url: string
  displayName: string
  signal?: AbortSignal
}) {
  const ai = getGoogleClient()
  const source = await loadImageSourceForModel(params.url, { signal: params.signal })
  const blobBytes = Uint8Array.from(source.buffer)
  const uploaded = await ai.files.upload({
    file: new Blob([blobBytes], {
      type: source.mimeType,
    }),
    config: {
      mimeType: source.mimeType,
      displayName: params.displayName,
      abortSignal: params.signal,
    },
  })

  const file = uploaded.state === "ACTIVE" && uploaded.uri ? uploaded : await waitForUploadedFileActive(String(uploaded.name), params.signal)
  if (!file.uri) {
    throw new Error("google_file_uri_missing")
  }

  return {
    name: String(file.name || ""),
    uri: String(file.uri),
    mimeType: String(file.mimeType || source.mimeType),
    createTime: file.createTime || null,
    expirationTime: file.expirationTime || null,
  }
}

export async function generateOrEditImagesWithGoogle(params: {
  prompt: string
  resolution: ImageAssistantResolution
  sizePreset?: ImageAssistantSizePreset | null
  referenceImages?: ImageAssistantFileReference[]
  config?: GoogleImageRuntimeConfig | null
  signal?: AbortSignal
}) {
  const ai = getGoogleClient(params.config)
  let lastError: unknown = null
  const models = params.config?.model?.trim()
    ? [params.config.model.trim()]
    : GOOGLE_IMAGE_MODELS

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex]

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                ...(params.referenceImages || []).map((image) => createPartFromUri(image.fileUri, image.mimeType)),
                { text: params.prompt },
              ],
            },
          ],
          config: {
            abortSignal: params.signal,
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
              aspectRatio: normalizeAspectRatio(params.sizePreset),
              imageSize: params.resolution || DEFAULT_IMAGE_RESOLUTION,
            },
          },
        })

        const urls = extractInlineImageDataUrls(response)
        const textSummary = extractTextSummary(response)
        if (!urls.length && !textSummary) {
          throw new Error("image_assistant_images_missing")
        }
        return {
          model,
          images: urls,
          textSummary: textSummary || "Image generation completed.",
        }
      } catch (error) {
        lastError = error
        if (params.signal?.aborted) {
          throw error
        }
        if (attempt < 3 && isRetryableGoogleError(error)) {
          console.warn("image-assistant.google.generate.retry", {
            attempt,
            model,
            message: error instanceof Error ? error.message : String(error),
          })
          await sleep(800 * attempt)
          continue
        }
        break
      }
    }

    if (modelIndex < models.length - 1 && isFallbackEligibleGoogleError(lastError)) {
      console.warn("image-assistant.google.generate.fallback", {
        fromModel: model,
        toModel: models[modelIndex + 1],
        message: lastError instanceof Error ? lastError.message : String(lastError),
      })
      continue
    }

    throw lastError instanceof Error ? lastError : new Error("google_generate_failed")
  }

  throw lastError instanceof Error ? lastError : new Error("google_generate_failed")
}
