import {
  generateText,
  streamText,
  type CoreMessage,
  type ToolSet,
} from "ai"

import {
  executeAiEntryWithProviderFailover,
  type AiEntryProviderId,
} from "@/lib/ai-entry/provider-routing"

type ProviderOptions = {
  preferredProviderId?: AiEntryProviderId | null
  preferredModel?: string
  forceModelAcrossProviders?: boolean
  disableSameProviderModelFallback?: boolean
  directProviderFailoverOnError?: boolean
}

type ProviderRunInfo = {
  providerId: string
  model: string
  attempt: number
  providerOrder: string[]
  upgradeProbe?: boolean
}

type BlockingExecution = {
  result: Awaited<ReturnType<typeof generateText>>
  providerId: AiEntryProviderId
  model: string
  providerOrder: AiEntryProviderId[]
}

type StreamingExecution = {
  result: { accumulated: string }
  providerId: AiEntryProviderId
  model: string
  providerOrder: AiEntryProviderId[]
}

type FullStreamPart = {
  type?: string
  textDelta?: string
  toolName?: string
  toolCallId?: string
  args?: unknown
  input?: unknown
  result?: unknown
  error?: unknown
}

const AI_ENTRY_EMPTY_RESPONSE_ERROR = "ai_entry_empty_response"
const AI_ENTRY_EMPTY_RESPONSE_AUTO_RETRY_LIMIT = 1

function extractErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error.trim()) return error.trim()
  if (error && typeof error === "object") {
    const candidate = (error as { message?: unknown }).message
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim()
  }
  return "ai_entry_stream_failed"
}

function toAiEntryExecutionError(error: unknown, retryable: boolean) {
  const normalized = error instanceof Error ? error : new Error(extractErrorMessage(error))
  ;(normalized as Error & { aiEntryRetryable?: boolean }).aiEntryRetryable = retryable
  return normalized
}

function isAiEntryEmptyResponseError(error: unknown) {
  return extractErrorMessage(error) === AI_ENTRY_EMPTY_RESPONSE_ERROR
}

async function executeWithEmptyResponseAutoRetry<T>(params: {
  run: () => Promise<T>
  onRetry?: (info: { retryAttempt: number; retryLimit: number }) => void
}) {
  let retryAttempt = 0
  while (true) {
    try {
      return await params.run()
    } catch (error) {
      if (
        !isAiEntryEmptyResponseError(error) ||
        retryAttempt >= AI_ENTRY_EMPTY_RESPONSE_AUTO_RETRY_LIMIT
      ) {
        throw error
      }
      retryAttempt += 1
      params.onRetry?.({
        retryAttempt,
        retryLimit: AI_ENTRY_EMPTY_RESPONSE_AUTO_RETRY_LIMIT,
      })
    }
  }
}

export function buildAiEntryProviderMessages(params: {
  providerId: AiEntryProviderId
  systemPrompt: string
  messages: CoreMessage[]
}) {
  const { providerId, systemPrompt, messages } = params

  if (providerId !== "aiberm") {
    return {
      system: systemPrompt,
      messages,
    }
  }

  const normalizedSystemPrompt = systemPrompt.trim()
  if (!normalizedSystemPrompt) {
    return {
      messages,
    }
  }

  const systemAsUserPrefix = `System instruction (must follow):\n${normalizedSystemPrompt}`
  const first = messages[0]
  if (first?.role === "user" && typeof first.content === "string") {
    return {
      messages: [
        {
          role: "user" as const,
          content: `${systemAsUserPrefix}\n\nUser request:\n${first.content}`,
        },
        ...messages.slice(1),
      ],
    }
  }

  return {
    messages: [
      {
        role: "user" as const,
        content: systemAsUserPrefix,
      },
      ...messages,
    ],
  }
}

export async function runAiEntryConsultingBlocking(params: {
  systemPrompt: string
  messages: CoreMessage[]
  selectedTools: ToolSet
  stopWhen: unknown
  providerOptions?: ProviderOptions
  onProviderAttempt?: (info: ProviderRunInfo) => void
  onProviderSuccess?: (info: ProviderRunInfo & { outputChars: number }) => void
  onEmptyResponseRetry?: (info: { retryAttempt: number; retryLimit: number }) => void
}): Promise<BlockingExecution> {
  return executeWithEmptyResponseAutoRetry({
    onRetry: params.onEmptyResponseRetry,
    run: () =>
      executeAiEntryWithProviderFailover(
        async (providerRun) => {
          params.onProviderAttempt?.({
            providerId: providerRun.providerId,
            model: providerRun.model,
            attempt: providerRun.attempt,
            providerOrder: providerRun.providerOrder,
            upgradeProbe: providerRun.upgradeProbe,
          })
          const providerInput = buildAiEntryProviderMessages({
            providerId: providerRun.providerId,
            systemPrompt: params.systemPrompt,
            messages: params.messages,
          })
          const result = await generateText({
            model: providerRun.provider.chat(providerRun.model),
            ...(providerInput.system ? { system: providerInput.system } : {}),
            messages: providerInput.messages,
            tools: params.selectedTools,
            stopWhen: params.stopWhen as any,
          })
          const resolvedText = (result.text || "").trim()
          if (!resolvedText) {
            throw toAiEntryExecutionError(new Error(AI_ENTRY_EMPTY_RESPONSE_ERROR), true)
          }
          params.onProviderSuccess?.({
            providerId: providerRun.providerId,
            model: providerRun.model,
            attempt: providerRun.attempt,
            providerOrder: providerRun.providerOrder,
            upgradeProbe: providerRun.upgradeProbe,
            outputChars: resolvedText.length,
          })
          return result
        },
        params.providerOptions,
      ),
  })
}

export async function runAiEntryConsultingStreaming(params: {
  systemPrompt: string
  messages: CoreMessage[]
  selectedTools: ToolSet
  stopWhen: unknown
  providerOptions?: ProviderOptions
  onProviderAttempt?: (info: ProviderRunInfo) => void
  onProviderSelected?: (info: ProviderRunInfo) => void
  onProviderSuccess?: (info: ProviderRunInfo & { outputChars: number }) => void
  onTextDelta?: (delta: string) => void
  onToolCall?: (payload: { toolName: string; toolCallId: string; args: unknown }) => void
  onToolResult?: (payload: { toolName: string; toolCallId: string; result: unknown }) => void
  onEmptyResponseRetry?: (info: { retryAttempt: number; retryLimit: number }) => void
}): Promise<StreamingExecution> {
  return executeWithEmptyResponseAutoRetry({
    onRetry: params.onEmptyResponseRetry,
    run: () =>
      executeAiEntryWithProviderFailover(
        async (providerRun) => {
          params.onProviderAttempt?.({
            providerId: providerRun.providerId,
            model: providerRun.model,
            attempt: providerRun.attempt,
            providerOrder: providerRun.providerOrder,
            upgradeProbe: providerRun.upgradeProbe,
          })
          params.onProviderSelected?.({
            providerId: providerRun.providerId,
            model: providerRun.model,
            attempt: providerRun.attempt,
            providerOrder: providerRun.providerOrder,
            upgradeProbe: providerRun.upgradeProbe,
          })

          const providerInput = buildAiEntryProviderMessages({
            providerId: providerRun.providerId,
            systemPrompt: params.systemPrompt,
            messages: params.messages,
          })

          const result = streamText({
            model: providerRun.provider.chat(providerRun.model),
            ...(providerInput.system ? { system: providerInput.system } : {}),
            messages: providerInput.messages,
            tools: params.selectedTools,
            stopWhen: params.stopWhen as any,
          })

          let accumulated = ""
          let hasStreamOutput = false
          try {
            for await (const part of result.fullStream) {
              const streamPart = part as FullStreamPart
              const eventType = streamPart.type || ""

              if (eventType === "text-delta") {
                const delta = streamPart.textDelta || ""
                if (delta) {
                  accumulated += delta
                  hasStreamOutput = true
                  params.onTextDelta?.(delta)
                }
                continue
              }

              if (eventType === "tool-call") {
                params.onToolCall?.({
                  toolName: streamPart.toolName || "",
                  toolCallId: streamPart.toolCallId || "",
                  args: streamPart.args ?? streamPart.input ?? null,
                })
                continue
              }

              if (eventType === "tool-result") {
                params.onToolResult?.({
                  toolName: streamPart.toolName || "",
                  toolCallId: streamPart.toolCallId || "",
                  result: streamPart.result ?? null,
                })
                continue
              }

              if (eventType === "error") {
                throw new Error(extractErrorMessage(streamPart.error))
              }
            }

            if (!accumulated.trim()) {
              const fallbackText = (await result.text).trim()
              if (fallbackText) {
                accumulated = fallbackText
                hasStreamOutput = true
                params.onTextDelta?.(fallbackText)
              }
            }

            const resolvedText = accumulated.trim()
            if (!resolvedText) {
              throw toAiEntryExecutionError(new Error(AI_ENTRY_EMPTY_RESPONSE_ERROR), true)
            }

            params.onProviderSuccess?.({
              providerId: providerRun.providerId,
              model: providerRun.model,
              attempt: providerRun.attempt,
              providerOrder: providerRun.providerOrder,
              upgradeProbe: providerRun.upgradeProbe,
              outputChars: resolvedText.length,
            })
          } catch (error) {
            throw toAiEntryExecutionError(error, !hasStreamOutput)
          }

          return { accumulated }
        },
        params.providerOptions,
      ),
  })
}
