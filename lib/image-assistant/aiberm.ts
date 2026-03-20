import { writerRequestJson } from "@/lib/writer/network"
import {
  generateImagesWithOpenRouter,
  getOpenRouterImageModel,
  hasOpenRouterApiKey,
  type OpenRouterInlineReferenceImage,
} from "@/lib/writer/aiberm"

import {
  generateOrEditImagesWithGoogle,
  getImageAssistantGoogleModel,
  hasImageAssistantGoogleKey,
  type ImageAssistantFileReference,
} from "@/lib/image-assistant/google"
import { executeImageProviderPlan, type ImageGenerationProvider } from "@/lib/image-generation/provider-orchestration"
import { isImageAssistantR2Available } from "@/lib/image-assistant/r2"
import type { ImageAssistantResolution, ImageAssistantSizePreset } from "@/lib/image-assistant/types"

type InlineReferenceImage = { kind: "inline"; mimeType: string; base64Data: string }
type ReferenceImageInput = InlineReferenceImage | ImageAssistantFileReference

const PRIMARY_IMAGE_ASSISTANT_AIBERM_MODEL =
  process.env.IMAGE_ASSISTANT_AIBERM_MODEL || process.env.WRITER_AIBERM_IMAGE_MODEL || "gemini-3.1-flash-image-preview"
const AIBERM_API_BASE = (
  process.env.AIBERM_IMAGE_API_BASE ||
  process.env.AIBERM_BASE_URL?.replace(/\/v1$/i, "") ||
  "https://aiberm.com"
).replace(/\/$/, "")
const AIBERM_API_KEY = process.env.AIBERM_API_KEY || process.env.WRITER_AIBERM_API_KEY || ""
const DEFAULT_IMAGE_RESOLUTION: ImageAssistantResolution = "2K"

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

export function getImageAssistantModel(_resolution: ImageAssistantResolution) {
  if (hasImageAssistantGoogleKey()) {
    return getImageAssistantGoogleModel()
  }
  if (hasImageAssistantAibermKey()) {
    return IMAGE_ASSISTANT_AIBERM_MODELS[0]
  }
  return getOpenRouterImageModel()
}

export function getImageAssistantAvailability() {
  const preferredProvider = hasImageAssistantGoogleKey()
    ? "gemini"
    : hasImageAssistantAibermKey()
      ? "aiberm"
      : hasOpenRouterApiKey()
        ? "openrouter"
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
        lowCost: hasImageAssistantAibermKey() ? IMAGE_ASSISTANT_AIBERM_MODELS[0] : getOpenRouterImageModel(),
      },
    }
  }

  if (!hasImageAssistantAibermKey() && !hasImageAssistantGoogleKey() && !hasOpenRouterApiKey()) {
    return {
      enabled: false,
      reason: "image_generation_provider_missing",
      provider: "unavailable",
      models: {
        highQuality: getOpenRouterImageModel(),
        lowCost: getOpenRouterImageModel(),
      },
    }
  }

  return {
    enabled: true,
    reason: null,
    provider: preferredProvider,
    models: {
      highQuality: getImageAssistantModel(DEFAULT_IMAGE_RESOLUTION),
      lowCost: hasImageAssistantAibermKey() ? IMAGE_ASSISTANT_AIBERM_MODELS[0] : getOpenRouterImageModel(),
    },
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

function getProviderExecutionPlan(params: { referenceImages?: ReferenceImageInput[] }) {
  const hasFileReferences = (params.referenceImages || []).some((image) => image.kind === "file")
  const plan: ImageGenerationProvider[] = []

  if (hasImageAssistantGoogleKey() && (hasFileReferences || !hasImageAssistantAibermKey())) {
    plan.push("gemini")
  }
  if (hasImageAssistantAibermKey()) {
    plan.push("aiberm")
  }
  if (hasOpenRouterApiKey()) {
    plan.push("openrouter")
  }
  if (hasImageAssistantGoogleKey() && !plan.includes("gemini")) {
    plan.push("gemini")
  }

  return plan
}

export async function generateOrEditImages(params: {
  prompt: string
  resolution: ImageAssistantResolution
  sizePreset?: ImageAssistantSizePreset | null
  referenceImages?: ReferenceImageInput[]
  candidateCount?: number
  signal?: AbortSignal
}) {
  const candidateCount = Math.max(1, Math.min(params.candidateCount || 1, 4))
  const aspectRatio = normalizeAspectRatio(params.sizePreset)

  if (shouldUseImageAssistantFixtures()) {
    return {
      provider: "fixture",
      model: getImageAssistantModel(params.resolution),
      textSummary: "Generated local fixture image results.",
      images: Array.from({ length: candidateCount }, (_, index) => buildFixtureDataUrl(params.prompt, aspectRatio, index)),
    }
  }

  const fileReferenceImages = (params.referenceImages || []).filter(
    (image): image is ImageAssistantFileReference => image.kind === "file",
  )
  const inlineReferenceImages = (params.referenceImages || []).filter(
    (image): image is InlineReferenceImage => image.kind === "inline",
  )
  const providerPlan = getProviderExecutionPlan({ referenceImages: params.referenceImages })
  const { provider: resolvedProvider, result } = await executeImageProviderPlan({
    providerPlan,
    signal: params.signal,
    handlers: {
      gemini: () =>
        generateOrEditImagesWithGoogle({
          prompt: params.prompt,
          resolution: params.resolution,
          sizePreset: params.sizePreset,
          referenceImages: fileReferenceImages,
          signal: params.signal,
        }),
      aiberm: () =>
        requestImages({
          prompt: params.prompt,
          resolution: params.resolution,
          sizePreset: params.sizePreset,
          referenceImages: inlineReferenceImages,
          signal: params.signal,
        }),
      openrouter: async () => {
        const openRouterResult = await generateImagesWithOpenRouter(
          params.prompt,
          getOpenRouterImageModel(),
          aspectRatio,
          inlineReferenceImages as OpenRouterInlineReferenceImage[],
        )
        return {
          model: getOpenRouterImageModel(),
          images: openRouterResult.images,
          textSummary: openRouterResult.textSummary,
        }
      },
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
