import { writerRequestJson } from "@/lib/writer/network"

import type { ImageAssistantQualityMode, ImageAssistantSizePreset } from "@/lib/image-assistant/types"

const AIBERM_API_BASE = (
  process.env.AIBERM_IMAGE_API_BASE ||
  process.env.AIBERM_BASE_URL?.replace(/\/v1$/i, "") ||
  "https://aiberm.com"
).replace(/\/$/, "")
const AIBERM_API_KEY = process.env.AIBERM_API_KEY || process.env.WRITER_AIBERM_API_KEY || ""
const IMAGE_MODEL_HIGH = process.env.IMAGE_ASSISTANT_AIBERM_MODEL || "gemini-3-pro-image-preview"
const IMAGE_MODEL_LOW = process.env.IMAGE_ASSISTANT_AIBERM_LOW_COST_MODEL || "gemini-3.1-flash-image-preview"
const IMAGE_SIZE = process.env.IMAGE_ASSISTANT_IMAGE_SIZE || "2K"

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
  if (["1:1", "4:5", "3:4", "16:9", "9:16"].includes(value)) {
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

export function getImageAssistantModel(qualityMode: ImageAssistantQualityMode) {
  return qualityMode === "low_cost" ? IMAGE_MODEL_LOW : IMAGE_MODEL_HIGH
}

export function getImageAssistantAvailability() {
  if (shouldUseImageAssistantFixtures()) {
    return {
      enabled: true,
      reason: null,
      provider: "fixture",
      models: {
        highQuality: IMAGE_MODEL_HIGH,
        lowCost: IMAGE_MODEL_LOW,
      },
    }
  }

  if (!hasImageAssistantAibermKey()) {
    return {
      enabled: false,
      reason: "aiberm_api_key_missing",
      provider: "aiberm",
      models: {
        highQuality: IMAGE_MODEL_HIGH,
        lowCost: IMAGE_MODEL_LOW,
      },
    }
  }

  return {
    enabled: true,
    reason: null,
    provider: "aiberm",
    models: {
      highQuality: IMAGE_MODEL_HIGH,
      lowCost: IMAGE_MODEL_LOW,
    },
  }
}

async function requestImages(params: {
  prompt: string
  sizePreset?: ImageAssistantSizePreset | null
  qualityMode: ImageAssistantQualityMode
  referenceImages?: Array<{ mimeType: string; base64Data: string }>
}) {
  const model = getImageAssistantModel(params.qualityMode)
  const response = await writerRequestJson(
    `${AIBERM_API_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: buildHeaders(),
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
            imageSize: IMAGE_SIZE,
          },
        },
      }),
    },
    { attempts: 2, timeoutMs: 120_000 },
  )

  if (!response.ok) {
    throw new Error((response.data as any)?.error?.message || `image_assistant_http_${response.status}`)
  }

  const urls = extractInlineImageDataUrls(response.data)
  if (!urls.length) {
    throw new Error("image_assistant_images_missing")
  }

  return {
    model,
    images: urls,
    textSummary:
      typeof (response.data as any)?.candidates?.[0]?.content?.parts?.find?.((part: any) => typeof part?.text === "string")?.text ===
      "string"
        ? (response.data as any).candidates[0].content.parts.find((part: any) => typeof part?.text === "string").text
        : "Image generation completed.",
  }
}

export async function generateOrEditImages(params: {
  prompt: string
  qualityMode: ImageAssistantQualityMode
  sizePreset?: ImageAssistantSizePreset | null
  referenceImages?: Array<{ mimeType: string; base64Data: string }>
  candidateCount?: number
}) {
  const candidateCount = Math.max(1, Math.min(params.candidateCount || 1, 4))
  const aspectRatio = normalizeAspectRatio(params.sizePreset)

  if (shouldUseImageAssistantFixtures()) {
    return {
      provider: "fixture",
      model: getImageAssistantModel(params.qualityMode),
      textSummary: "Generated local fixture image results.",
      images: Array.from({ length: candidateCount }, (_, index) => buildFixtureDataUrl(params.prompt, aspectRatio, index)),
    }
  }

  const result = await requestImages(params)
  const expanded = Array.from({ length: candidateCount }, (_, index) => result.images[index % result.images.length])
  return {
    provider: "aiberm",
    model: result.model,
    textSummary: result.textSummary || "Image generation completed.",
    images: expanded,
  }
}
