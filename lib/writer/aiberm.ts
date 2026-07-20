import { writerRequestJson } from "@/lib/writer/network"
import type { AiEntryProviderId } from "@/lib/ai-entry/provider-routing"

const AIBERM_API_BASE = (process.env.AIBERM_BASE_URL || "https://aiberm.com/v1").replace(/\/$/, "")
const AIBERM_API_KEY = process.env.AIBERM_API_KEY || process.env.WRITER_AIBERM_API_KEY || ""

const CRAZYROUTE_API_BASE = (
  process.env.CRAZYROUTE_BASE_URL ||
  process.env.CRAZYROUTER_BASE_URL ||
  process.env.AI_ENTRY_CRAZYROUTE_BASE_URL ||
  process.env.AI_ENTRY_CRAZYROUTER_BASE_URL ||
  "https://crazyrouter.com/v1"
).replace(/\/$/, "")
const CRAZYROUTE_API_KEY =
  process.env.CRAZYROUTE_API_KEY ||
  process.env.CRAZYROUTER_API_KEY ||
  process.env.AI_ENTRY_CRAZYROUTE_API_KEY ||
  process.env.AI_ENTRY_CRAZYROUTER_API_KEY ||
  ""
const PPTOKEN_API_BASE = (
  process.env.PPTOKEN_BASE_URL ||
  process.env.AI_ENTRY_PPTOKEN_BASE_URL ||
  "https://cn.pptoken.cc/v1"
).replace(/\/$/, "")
const PPTOKEN_API_KEY =
  process.env.PPTOKEN_API_KEY ||
  process.env.AI_ENTRY_PPTOKEN_API_KEY ||
  ""

type OpenAICompatibleMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

type AibermTextGenerationOptions = {
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  totalTimeoutMs?: number
  providerTimeoutMs?: number
  preferredProviderId?: AiEntryProviderId | null
  signal?: AbortSignal
}

type WriterStructuredObjectOptions = {
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  totalTimeoutMs?: number
  providerTimeoutMs?: number
  preferredProviderId?: AiEntryProviderId | null
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

function buildAibermHeaders() {
  if (!AIBERM_API_KEY) {
    throw new Error("aiberm_api_key_missing")
  }

  return {
    Authorization: `Bearer ${AIBERM_API_KEY}`,
    "Content-Type": "application/json",
  }
}

function buildCrazyrouteHeaders() {
  if (!CRAZYROUTE_API_KEY) {
    throw new Error("crazyroute_api_key_missing")
  }

  return {
    Authorization: `Bearer ${CRAZYROUTE_API_KEY}`,
    "Content-Type": "application/json",
  }
}

function buildPptokenHeaders() {
  if (!PPTOKEN_API_KEY) {
    throw new Error("pptoken_api_key_missing")
  }

  return {
    Authorization: `Bearer ${PPTOKEN_API_KEY}`,
    "Content-Type": "application/json",
  }
}

export function hasAibermApiKey() {
  return Boolean(AIBERM_API_KEY)
}

export function hasCrazyrouteApiKey() {
  return Boolean(CRAZYROUTE_API_KEY)
}

export function hasPptokenApiKey() {
  return Boolean(PPTOKEN_API_KEY)
}

export function hasWriterTextProvider() {
  return hasAibermApiKey() || hasCrazyrouteApiKey() || hasPptokenApiKey()
}

function buildWriterProviderOrder(preferredProviderId?: AiEntryProviderId | null) {
  const preferred = typeof preferredProviderId === "string" ? preferredProviderId.trim() : ""
  const providers = [
    { id: "aiberm" as const, enabled: hasAibermApiKey() },
    { id: "crazyroute" as const, enabled: hasCrazyrouteApiKey() },
    { id: "pptoken" as const, enabled: hasPptokenApiKey() },
  ].filter((provider) => provider.enabled)

  if (!preferred) return providers

  const preferredIndex = providers.findIndex((provider) => provider.id === preferred)
  if (preferredIndex <= 0) return providers

  return [providers[preferredIndex], ...providers.slice(0, preferredIndex), ...providers.slice(preferredIndex + 1)]
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

function isAbortLikeError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.message === "request_aborted")
}

function isTimeoutLikeError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  const cause = error.cause as { code?: string } | undefined
  return (
    message.includes("writer_request_timeout") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("etimedout") ||
    message.includes("socket hang up") ||
    cause?.code === "ETIMEDOUT" ||
    cause?.code === "UND_ERR_CONNECT_TIMEOUT" ||
    cause?.code === "UND_ERR_SOCKET"
  )
}

function toPositiveTimeoutMs(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function getRemainingBudgetMs(deadlineAt: number | null) {
  if (!deadlineAt) return null
  return Math.max(0, deadlineAt - Date.now())
}

function resolveProviderCallTimeoutMs(input: {
  remainingBudgetMs: number | null
  requestTimeoutMs: number | null
  providerTimeoutMs: number | null
}) {
  const candidates = [input.remainingBudgetMs, input.providerTimeoutMs, input.requestTimeoutMs].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  )
  if (!candidates.length) return null
  return Math.max(1, Math.min(...candidates))
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

async function generateTextWithProvider(params: {
  baseUrl: string
  headers: Record<string, string>
  systemPrompt: string
  userPrompt: string
  model: string
  options?: AibermTextGenerationOptions
  errorPrefix: string
}) {
  const response = await writerRequestJson(
    `${params.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: params.headers,
      signal: params.options?.signal,
      body: JSON.stringify({
        model: params.model,
        messages: [
          { role: "system", content: params.systemPrompt } satisfies OpenAICompatibleMessage,
          { role: "user", content: params.userPrompt } satisfies OpenAICompatibleMessage,
        ],
        temperature: params.options?.temperature ?? 0.7,
        max_tokens: params.options?.maxTokens ?? 4096,
      }),
    },
    { attempts: 2, timeoutMs: params.options?.timeoutMs ?? 90_000 },
  )

  if (!response.ok) {
    const data = response.data as any
    throw new Error(data?.error?.message || `${params.errorPrefix}_http_${response.status}`)
  }

  return extractTextFromOpenAICompatibleResponse(response.data)
}

export async function generateTextWithAiberm(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  options: AibermTextGenerationOptions = {},
) {
  return generateTextWithProvider({
    baseUrl: AIBERM_API_BASE,
    headers: buildAibermHeaders(),
    systemPrompt,
    userPrompt,
    model,
    options,
    errorPrefix: "aiberm_text",
  })
}

export async function generateTextWithCrazyroute(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  options: AibermTextGenerationOptions = {},
) {
  return generateTextWithProvider({
    baseUrl: CRAZYROUTE_API_BASE,
    headers: buildCrazyrouteHeaders(),
    systemPrompt,
    userPrompt,
    model,
    options,
    errorPrefix: "crazyroute_text",
  })
}

export async function generateTextWithPptoken(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  options: AibermTextGenerationOptions = {},
) {
  return generateTextWithProvider({
    baseUrl: PPTOKEN_API_BASE,
    headers: buildPptokenHeaders(),
    systemPrompt,
    userPrompt,
    model,
    options,
    errorPrefix: "pptoken_text",
  })
}

export async function generateTextWithWriterModel(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  options: AibermTextGenerationOptions = {},
) {
  const deadlineAt = (() => {
    const timeoutMs = toPositiveTimeoutMs(options.totalTimeoutMs ?? options.timeoutMs)
    return timeoutMs ? Date.now() + timeoutMs : null
  })()
  const requestTimeoutMs = toPositiveTimeoutMs(options.timeoutMs)
  const providerTimeoutMs = toPositiveTimeoutMs(options.providerTimeoutMs)

  async function runTextCallWithBudget(run: (scoped: AibermTextGenerationOptions) => Promise<string>) {
    const remainingBudgetMs = getRemainingBudgetMs(deadlineAt)
    if (remainingBudgetMs !== null && remainingBudgetMs <= 0) {
      throw new Error("writer_request_timeout")
    }

    const callTimeoutMs = resolveProviderCallTimeoutMs({
      remainingBudgetMs,
      requestTimeoutMs,
      providerTimeoutMs,
    })
    const scopedAbort = createProviderScopedAbortSignal(options.signal, callTimeoutMs)

    try {
      return await run({
        ...options,
        signal: scopedAbort.signal,
        ...(callTimeoutMs ? { timeoutMs: callTimeoutMs } : {}),
      })
    } catch (error) {
      if (options.signal?.aborted) {
        throw error
      }
      if (scopedAbort.didTimeout() || isTimeoutLikeError(error)) {
        throw new Error("writer_request_timeout")
      }
      throw error
    } finally {
      scopedAbort.cleanup()
    }
  }

  let lastError: unknown = null
  const providerOrder = buildWriterProviderOrder(options.preferredProviderId)

  for (let index = 0; index < providerOrder.length; index += 1) {
    const provider = providerOrder[index]
    try {
      if (provider.id === "aiberm") {
        return await runTextCallWithBudget((scoped) => generateTextWithAiberm(systemPrompt, userPrompt, model, scoped))
      }
      if (provider.id === "crazyroute") {
        return await runTextCallWithBudget((scoped) => generateTextWithCrazyroute(systemPrompt, userPrompt, model, scoped))
      }
      return await runTextCallWithBudget((scoped) => generateTextWithPptoken(systemPrompt, userPrompt, model, scoped))
    } catch (error) {
      if (options.signal?.aborted && isAbortLikeError(error)) {
        throw error
      }
      lastError = error
      const fallbackProvider = providerOrder[index + 1]?.id ?? null
      if (fallbackProvider) {
        console.warn(`writer.text.${provider.id}_fallback`, {
          message: error instanceof Error ? error.message : String(error),
          fallbackProvider,
        })
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("writer_text_provider_missing")
}

async function generateStructuredObjectWithProvider(params: WriterStructuredObjectParams & {
  baseUrl: string
  headers: Record<string, string>
  errorPrefix: string
}) {
  const response = await writerRequestJson(
    `${params.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: params.headers,
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
    throw new Error(data?.error?.message || `${params.errorPrefix}_http_${response.status}`)
  }

  return extractToolCallArgumentsFromOpenAICompatibleResponse(response.data, params.toolName)
}

async function generateStructuredObjectWithAiberm(params: WriterStructuredObjectParams) {
  return generateStructuredObjectWithProvider({
    ...params,
    baseUrl: AIBERM_API_BASE,
    headers: buildAibermHeaders(),
    errorPrefix: "aiberm_structured",
  })
}

async function generateStructuredObjectWithCrazyroute(params: WriterStructuredObjectParams) {
  return generateStructuredObjectWithProvider({
    ...params,
    baseUrl: CRAZYROUTE_API_BASE,
    headers: buildCrazyrouteHeaders(),
    errorPrefix: "crazyroute_structured",
  })
}

async function generateStructuredObjectWithPptoken(params: WriterStructuredObjectParams) {
  return generateStructuredObjectWithProvider({
    ...params,
    baseUrl: PPTOKEN_API_BASE,
    headers: buildPptokenHeaders(),
    errorPrefix: "pptoken_structured",
  })
}

export async function generateStructuredObjectWithWriterModel(params: WriterStructuredObjectParams) {
  const deadlineAt = (() => {
    const timeoutMs = toPositiveTimeoutMs(params.options?.totalTimeoutMs ?? params.options?.timeoutMs)
    return timeoutMs ? Date.now() + timeoutMs : null
  })()
  const requestTimeoutMs = toPositiveTimeoutMs(params.options?.timeoutMs)
  const providerTimeoutMs = toPositiveTimeoutMs(params.options?.providerTimeoutMs)

  async function runStructuredCallWithBudget(run: (scoped: WriterStructuredObjectParams) => Promise<unknown>) {
    const remainingBudgetMs = getRemainingBudgetMs(deadlineAt)
    if (remainingBudgetMs !== null && remainingBudgetMs <= 0) {
      throw new Error("writer_request_timeout")
    }

    const callTimeoutMs = resolveProviderCallTimeoutMs({
      remainingBudgetMs,
      requestTimeoutMs,
      providerTimeoutMs,
    })
    const scopedAbort = createProviderScopedAbortSignal(params.options?.signal, callTimeoutMs)

    try {
      return await run({
        ...params,
        options: {
          ...(params.options || {}),
          signal: scopedAbort.signal,
          ...(callTimeoutMs ? { timeoutMs: callTimeoutMs } : {}),
        },
      })
    } catch (error) {
      if (params.options?.signal?.aborted) {
        throw error
      }
      if (scopedAbort.didTimeout() || isTimeoutLikeError(error)) {
        throw new Error("writer_request_timeout")
      }
      throw error
    } finally {
      scopedAbort.cleanup()
    }
  }

  let lastError: unknown = null
  const providerOrder = buildWriterProviderOrder(params.options?.preferredProviderId)

  for (let index = 0; index < providerOrder.length; index += 1) {
    const provider = providerOrder[index]
    try {
      if (provider.id === "aiberm") {
        return await runStructuredCallWithBudget(generateStructuredObjectWithAiberm)
      }
      if (provider.id === "crazyroute") {
        return await runStructuredCallWithBudget(generateStructuredObjectWithCrazyroute)
      }
      return await runStructuredCallWithBudget(generateStructuredObjectWithPptoken)
    } catch (error) {
      if (params.options?.signal?.aborted && isAbortLikeError(error)) {
        throw error
      }
      lastError = error
      const fallbackProvider = providerOrder[index + 1]?.id ?? null
      if (fallbackProvider) {
        console.warn(`writer.structured.${provider.id}_fallback`, {
          message: error instanceof Error ? error.message : String(error),
          fallbackProvider,
        })
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("writer_structured_provider_missing")
}
