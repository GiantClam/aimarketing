import { writerRequestJson } from "@/lib/writer/network"

const AIBERM_API_BASE = (process.env.AIBERM_BASE_URL || "https://aiberm.com/v1").replace(/\/$/, "")
const AIBERM_IMAGE_API_BASE = (
  process.env.AIBERM_IMAGE_API_BASE ||
  AIBERM_API_BASE.replace(/\/v1$/i, "") ||
  "https://aiberm.com"
).replace(/\/$/, "")
const AIBERM_API_KEY = process.env.AIBERM_API_KEY || process.env.WRITER_AIBERM_API_KEY || ""
const AIBERM_IMAGE_SYSTEM_INSTRUCTION = process.env.AIBERM_IMAGE_SYSTEM_INSTRUCTION || "You are a helpful assistant."
const AIBERM_IMAGE_SIZE = process.env.AIBERM_IMAGE_SIZE || "2K"

type OpenAICompatibleMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

function buildAibermHeaders() {
  if (!AIBERM_API_KEY) {
    throw new Error("aiberm_api_key_missing")
  }

  return {
    Authorization: `Bearer ${AIBERM_API_KEY}`,
    "Content-Type": "application/json",
  }
}

export function hasAibermApiKey() {
  return Boolean(AIBERM_API_KEY)
}

export function extractTextFromOpenAICompatibleResponse(data: any) {
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null
  const message = choice?.message || {}
  const content = message?.content

  if (typeof content === "string" && content.trim()) {
    return content.trim()
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part?.text === "string") return part.text
        if (typeof part?.content === "string") return part.content
        return ""
      })
      .join("")
      .trim()

    if (text) {
      return text
    }
  }

  if (typeof choice?.text === "string" && choice.text.trim()) {
    return choice.text.trim()
  }

  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim()
  }

  throw new Error("openai_compatible_text_empty")
}

export async function generateTextWithAiberm(systemPrompt: string, userPrompt: string, model: string) {
  const response = await writerRequestJson(
    `${AIBERM_API_BASE}/chat/completions`,
    {
      method: "POST",
      headers: buildAibermHeaders(),
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt } satisfies OpenAICompatibleMessage,
          { role: "user", content: userPrompt } satisfies OpenAICompatibleMessage,
        ],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    },
    { attempts: 2, timeoutMs: 90_000 },
  )

  if (!response.ok) {
    const data = response.data as any
    throw new Error(data?.error?.message || `aiberm_text_http_${response.status}`)
  }

  return extractTextFromOpenAICompatibleResponse(response.data)
}

function normalizeAspectRatio(aspectRatio: string) {
  const supportedAspectRatios = new Set(["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"])
  return supportedAspectRatios.has(aspectRatio) ? aspectRatio : "16:9"
}

function extractInlineImageDataUrl(data: any) {
  const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : []
  for (const part of parts) {
    const mimeType = typeof part?.inlineData?.mimeType === "string" ? part.inlineData.mimeType.trim() : ""
    const base64Data = typeof part?.inlineData?.data === "string" ? part.inlineData.data.trim() : ""
    if (mimeType.startsWith("image/") && base64Data) {
      return `data:${mimeType};base64,${base64Data}`
    }
  }

  throw new Error("aiberm_image_missing")
}

export async function generateImageWithAiberm(prompt: string, model: string, aspectRatio: string) {
  const response = await writerRequestJson(
    `${AIBERM_IMAGE_API_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: buildAibermHeaders(),
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        systemInstruction: {
          parts: [{ text: AIBERM_IMAGE_SYSTEM_INSTRUCTION }],
        },
        generationConfig: {
          responseModalities: ["IMAGE"],
          temperature: 1,
          topP: 0.95,
          maxOutputTokens: 8192,
          imageConfig: {
            aspectRatio: normalizeAspectRatio(aspectRatio),
            imageSize: AIBERM_IMAGE_SIZE,
          },
        },
      }),
    },
    { attempts: 2, timeoutMs: 120_000 },
  )

  if (!response.ok) {
    const data = response.data as any
    throw new Error(data?.error?.message || `aiberm_image_http_${response.status}`)
  }

  return extractInlineImageDataUrl(response.data)
}
