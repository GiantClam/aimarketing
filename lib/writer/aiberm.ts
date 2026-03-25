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
const AIBERM_IMAGE_TIMEOUT_MS = Math.min(
  300_000,
  Math.max(60_000, Number.parseInt(process.env.WRITER_AIBERM_IMAGE_TIMEOUT_MS || "180000", 10) || 180_000),
)
const OPENROUTER_API_BASE = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "")
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ""
const OPENROUTER_TEXT_MODEL = process.env.OPENROUTER_TEXT_MODEL || "google/gemini-3-flash-preview"
const OPENROUTER_IMAGE_MODEL = process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-3.1-flash-image-preview"
const OPENROUTER_AUTH_BLOCK_WINDOW_MS =
  Number.parseInt(process.env.OPENROUTER_AUTH_BLOCK_WINDOW_MS || "", 10) || 15 * 60 * 1000
const OPENROUTER_APP_URL =
  process.env.OPENROUTER_APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || "AI Marketing"
const OPENROUTER_AUTH_BLOCKED_UNTIL_KEY = "__aimarketingOpenRouterAuthBlockedUntil__"

type OpenAICompatibleMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

type OpenRouterMessageContentPart =
  | {
      type: "text"
      text: string
    }
  | {
      type: "image_url"
      image_url: {
        url: string
      }
    }

export type OpenRouterInlineReferenceImage = {
  mimeType: string
  base64Data: string
}

function getOpenRouterAuthBlockedUntil() {
  const globalScope = globalThis as typeof globalThis & {
    [OPENROUTER_AUTH_BLOCKED_UNTIL_KEY]?: number
  }
  return globalScope[OPENROUTER_AUTH_BLOCKED_UNTIL_KEY] || 0
}

function setOpenRouterAuthBlockedUntil(blockedUntil: number) {
  const globalScope = globalThis as typeof globalThis & {
    [OPENROUTER_AUTH_BLOCKED_UNTIL_KEY]?: number
  }
  globalScope[OPENROUTER_AUTH_BLOCKED_UNTIL_KEY] = blockedUntil
}

function isOpenRouterAuthBlocked() {
  const blockedUntil = getOpenRouterAuthBlockedUntil()
  if (!blockedUntil) return false
  if (blockedUntil <= Date.now()) {
    setOpenRouterAuthBlockedUntil(0)
    return false
  }
  return true
}

function markOpenRouterAuthBlocked(message: string) {
  const blockedUntil = Date.now() + OPENROUTER_AUTH_BLOCK_WINDOW_MS
  setOpenRouterAuthBlockedUntil(blockedUntil)
  console.warn("writer.openrouter.auth_temporarily_blocked", {
    message,
    blockedUntil,
  })
}

function toOpenRouterHttpError(status: number, data: any, fallbackMessage: string) {
  const message = data?.error?.message || fallbackMessage
  if (status === 401 || /user not found|unauthorized|invalid token|access token/i.test(String(message))) {
    markOpenRouterAuthBlocked(String(message))
  }
  return new Error(message)
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

export function hasOpenRouterApiKey() {
  return Boolean(OPENROUTER_API_KEY) && !isOpenRouterAuthBlocked()
}

export function hasWriterTextProvider() {
  return hasAibermApiKey() || hasOpenRouterApiKey()
}

export function getOpenRouterTextModel() {
  return OPENROUTER_TEXT_MODEL
}

export function getOpenRouterImageModel() {
  return OPENROUTER_IMAGE_MODEL
}

type AibermTextGenerationOptions = {
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

type WriterStructuredObjectOptions = {
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  signal?: AbortSignal
}

type WriterStructuredObjectParams = {
  systemPrompt: string
  userPrompt: string
  model: string
  toolName: string
  toolDescription?: string
  jsonSchema: Record<string, unknown>
  options?: WriterStructuredObjectOptions
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

function extractToolCallArgumentsFromOpenAICompatibleResponse(data: any, toolName?: string) {
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null
  const message = choice?.message || {}
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : []
  const targetToolCall = toolCalls.find((toolCall: any) => {
    const calledName = typeof toolCall?.function?.name === "string" ? toolCall.function.name : ""
    return !toolName || calledName === toolName
  })

  const argumentsPayload = targetToolCall?.function?.arguments
  if (typeof argumentsPayload === "string" && argumentsPayload.trim()) {
    return JSON.parse(argumentsPayload)
  }
  if (argumentsPayload && typeof argumentsPayload === "object") {
    return argumentsPayload
  }

  throw new Error("openai_compatible_tool_call_missing")
}

function buildOpenRouterHeaders() {
  if (!OPENROUTER_API_KEY) {
    throw new Error("openrouter_api_key_missing")
  }
  if (isOpenRouterAuthBlocked()) {
    throw new Error("openrouter_credential_temporarily_blocked")
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
  }

  if (OPENROUTER_APP_URL) {
    headers["HTTP-Referer"] = OPENROUTER_APP_URL
  }
  if (OPENROUTER_APP_NAME) {
    headers["X-Title"] = OPENROUTER_APP_NAME
  }

  return headers
}

function isAbortLikeError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.message === "request_aborted")
}

export async function generateTextWithAiberm(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  options: AibermTextGenerationOptions = {},
) {
  const response = await writerRequestJson(
    `${AIBERM_API_BASE}/chat/completions`,
    {
      method: "POST",
      headers: buildAibermHeaders(),
      signal: options.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt } satisfies OpenAICompatibleMessage,
          { role: "user", content: userPrompt } satisfies OpenAICompatibleMessage,
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
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

export async function generateTextWithOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  model = OPENROUTER_TEXT_MODEL,
  options: AibermTextGenerationOptions = {},
) {
  const response = await writerRequestJson(
    `${OPENROUTER_API_BASE}/chat/completions`,
    {
      method: "POST",
      headers: buildOpenRouterHeaders(),
      signal: options.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt } satisfies OpenAICompatibleMessage,
          { role: "user", content: userPrompt } satisfies OpenAICompatibleMessage,
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
      }),
    },
    { attempts: 2, timeoutMs: 90_000 },
  )

  if (!response.ok) {
    const data = response.data as any
    throw toOpenRouterHttpError(response.status, data, `openrouter_text_http_${response.status}`)
  }

  return extractTextFromOpenAICompatibleResponse(response.data)
}

export async function generateTextWithWriterModel(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  options: AibermTextGenerationOptions = {},
) {
  let lastError: unknown = null

  if (hasAibermApiKey()) {
    try {
      return await generateTextWithAiberm(systemPrompt, userPrompt, model, options)
    } catch (error) {
      if (isAbortLikeError(error)) {
        throw error
      }
      lastError = error
      console.warn("writer.text.aiberm_fallback", {
        message: error instanceof Error ? error.message : String(error),
        fallbackProvider: hasOpenRouterApiKey() ? "openrouter" : null,
      })
    }
  }

  if (hasOpenRouterApiKey()) {
    try {
      return await generateTextWithOpenRouter(systemPrompt, userPrompt, model || OPENROUTER_TEXT_MODEL, options)
    } catch (error) {
      if (isAbortLikeError(error)) {
        throw error
      }
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error("writer_text_provider_missing")
}

async function generateStructuredObjectWithAiberm(params: WriterStructuredObjectParams) {
  const response = await writerRequestJson(
    `${AIBERM_API_BASE}/chat/completions`,
    {
      method: "POST",
      headers: buildAibermHeaders(),
      signal: params.options?.signal,
      body: JSON.stringify({
        model: params.model,
        messages: [
          { role: "system", content: params.systemPrompt } satisfies OpenAICompatibleMessage,
          { role: "user", content: params.userPrompt } satisfies OpenAICompatibleMessage,
        ],
        temperature: params.options?.temperature ?? 0,
        max_tokens: params.options?.maxTokens ?? 1024,
        tools: [
          {
            type: "function",
            function: {
              name: params.toolName,
              description: params.toolDescription || "Return the structured extraction result.",
              parameters: params.jsonSchema,
              strict: true,
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: {
            name: params.toolName,
          },
        },
      }),
    },
    { attempts: 1, timeoutMs: params.options?.timeoutMs ?? 30_000 },
  )

  if (!response.ok) {
    const data = response.data as any
    throw new Error(data?.error?.message || `aiberm_structured_http_${response.status}`)
  }

  return extractToolCallArgumentsFromOpenAICompatibleResponse(response.data, params.toolName)
}

async function generateStructuredObjectWithOpenRouter(params: WriterStructuredObjectParams) {
  const response = await writerRequestJson(
    `${OPENROUTER_API_BASE}/chat/completions`,
    {
      method: "POST",
      headers: buildOpenRouterHeaders(),
      signal: params.options?.signal,
      body: JSON.stringify({
        model: params.model || OPENROUTER_TEXT_MODEL,
        messages: [
          { role: "system", content: params.systemPrompt } satisfies OpenAICompatibleMessage,
          { role: "user", content: params.userPrompt } satisfies OpenAICompatibleMessage,
        ],
        temperature: params.options?.temperature ?? 0,
        max_tokens: params.options?.maxTokens ?? 1024,
        tools: [
          {
            type: "function",
            function: {
              name: params.toolName,
              description: params.toolDescription || "Return the structured extraction result.",
              parameters: params.jsonSchema,
              strict: true,
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: {
            name: params.toolName,
          },
        },
      }),
    },
    { attempts: 1, timeoutMs: params.options?.timeoutMs ?? 30_000 },
  )

  if (!response.ok) {
    const data = response.data as any
    throw toOpenRouterHttpError(response.status, data, `openrouter_structured_http_${response.status}`)
  }

  return extractToolCallArgumentsFromOpenAICompatibleResponse(response.data, params.toolName)
}

export async function generateStructuredObjectWithWriterModel(params: WriterStructuredObjectParams) {
  let lastError: unknown = null

  if (hasAibermApiKey()) {
    try {
      return await generateStructuredObjectWithAiberm(params)
    } catch (error) {
      if (isAbortLikeError(error)) {
        throw error
      }
      lastError = error
      console.warn("writer.structured.aiberm_fallback", {
        message: error instanceof Error ? error.message : String(error),
        fallbackProvider: hasOpenRouterApiKey() ? "openrouter" : null,
      })
    }
  }

  if (hasOpenRouterApiKey()) {
    try {
      return await generateStructuredObjectWithOpenRouter({
        ...params,
        model: params.model || OPENROUTER_TEXT_MODEL,
      })
    } catch (error) {
      if (isAbortLikeError(error)) {
        throw error
      }
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error("writer_structured_provider_missing")
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

function extractOpenRouterImageDataUrls(data: any) {
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null
  const images = Array.isArray(choice?.message?.images) ? choice.message.images : []
  const urls = images
    .map((image: any) => {
      if (typeof image?.image_url?.url === "string" && image.image_url.url.trim()) {
        return image.image_url.url.trim()
      }
      if (typeof image?.imageUrl?.url === "string" && image.imageUrl.url.trim()) {
        return image.imageUrl.url.trim()
      }
      return ""
    })
    .filter(Boolean)

  if (!urls.length) {
    throw new Error("openrouter_image_missing")
  }

  return urls
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
    { attempts: 1, timeoutMs: AIBERM_IMAGE_TIMEOUT_MS },
  )

  if (!response.ok) {
    const data = response.data as any
    throw new Error(data?.error?.message || `aiberm_image_http_${response.status}`)
  }

  return extractInlineImageDataUrl(response.data)
}

export async function generateImagesWithOpenRouter(
  prompt: string,
  model = OPENROUTER_IMAGE_MODEL,
  aspectRatio = "16:9",
  referenceImages: OpenRouterInlineReferenceImage[] = [],
) {
  const content: OpenRouterMessageContentPart[] = [
    {
      type: "text",
      text: prompt,
    },
    ...referenceImages.map((image) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${image.mimeType};base64,${image.base64Data}`,
      },
    })),
  ]

  const response = await writerRequestJson(
    `${OPENROUTER_API_BASE}/chat/completions`,
    {
      method: "POST",
      headers: buildOpenRouterHeaders(),
      body: JSON.stringify({
        model,
        modalities: ["image", "text"],
        messages: [
          {
            role: "user",
            content,
          },
        ],
        image_config: {
          aspect_ratio: normalizeAspectRatio(aspectRatio),
        },
      }),
    },
    { attempts: 2, timeoutMs: 180_000 },
  )

  if (!response.ok) {
    const data = response.data as any
    throw toOpenRouterHttpError(response.status, data, `openrouter_image_http_${response.status}`)
  }

  const textSummary = (() => {
    try {
      return extractTextFromOpenAICompatibleResponse(response.data)
    } catch {
      return ""
    }
  })()

  return {
    images: extractOpenRouterImageDataUrls(response.data),
    textSummary: textSummary || "Image generation completed.",
  }
}

export async function generateImageWithOpenRouter(
  prompt: string,
  model = OPENROUTER_IMAGE_MODEL,
  aspectRatio = "16:9",
  referenceImages: OpenRouterInlineReferenceImage[] = [],
) {
  const result = await generateImagesWithOpenRouter(prompt, model, aspectRatio, referenceImages)
  return result.images[0]
}
