import { NextRequest, NextResponse } from "next/server"
import {
  generateText,
  stepCountIs,
  streamText,
  type CoreMessage,
  type ToolSet,
} from "ai"

import { requireSessionUser } from "@/lib/auth/guards"
import { isSessionDbUnavailableError } from "@/lib/auth/session"
import {
  loadEnterpriseKnowledgeContext,
  type EnterpriseKnowledgeContext,
} from "@/lib/dify/enterprise-knowledge"
import {
  appendAiEntryTurn,
  ensureAiEntryConversation,
  type AiEntryConversationScope,
} from "@/lib/ai-entry/repository"
import {
  getAiEntryMcpServerUrls,
  loadAiEntryMcpTools,
  selectAiEntryTools,
} from "@/lib/ai-entry/mcp-tools"
import {
  executeAiEntryWithProviderFailover,
  type AiEntryProviderId,
} from "@/lib/ai-entry/provider-routing"
import { getAiEntryModelCatalog } from "@/lib/ai-entry/model-catalog"
import {
  isAiEntryAgentId,
} from "@/lib/ai-entry/agent-catalog"
import {
  buildAiEntryAgentInstruction,
  buildAiEntryConsultingModeInstruction,
} from "@/lib/ai-entry/agent-prompts"
import {
  AI_ENTRY_CONSULTING_AGENT_ID,
  AI_ENTRY_SONNET_46_MODEL_HINT,
  pickSonnet46ModelId,
  shouldLockConsultingAdvisorModel,
} from "@/lib/ai-entry/model-policy"

export const runtime = "nodejs"

type IncomingMessage = {
  role?: string
  content?: unknown
}

type ChatRequestBody = {
  messages?: IncomingMessage[]
  message?: string
  conversationId?: string | null
  conversationScope?: "chat" | "consulting"
  stream?: boolean
  knowledgeSource?: "industry_kb" | "personal_kb"
  modelConfig?: {
    providerId?: string
    modelId?: string
  }
  agentConfig?: {
    agentId?: string
    entryMode?: string
  }
  skillConfig?: {
    enabled?: boolean
    enabledToolNames?: string[]
  }
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

const STREAM_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
}

function buildSseEvent(payload: Record<string, unknown>) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function normalizeMessages(messages: IncomingMessage[]) {
  const normalized: CoreMessage[] = []
  for (const item of messages) {
    const role = item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : null
    const content = typeof item?.content === "string" ? item.content.trim() : ""
    if (!role || !content) continue
    normalized.push({ role, content })
  }
  return normalized
}

function parseEnabledToolNames(input: unknown) {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
}

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

function canLoadEnterpriseKnowledgeForUser(user: {
  enterpriseId: number | null
  enterpriseStatus: string | null
}) {
  const id = user.enterpriseId
  if (typeof id !== "number" || !Number.isFinite(id) || id <= 0) return false
  return user.enterpriseStatus === "active"
}

function buildEnterpriseKnowledgePromptSection(context: EnterpriseKnowledgeContext) {
  if (!context.snippets.length) return ""

  const header = [
    "The following snippets were retrieved from this enterprise's configured Dify knowledge datasets.",
    "Use them when they are relevant; if they conflict with the user or are off-topic, rely on the user and general consulting judgment.",
  ].join(" ")

  const body = context.snippets
    .map((snippet, index) => {
      const title = snippet.title.trim() || `Snippet ${index + 1}`
      return `[${snippet.datasetName} - ${title}]\n${snippet.content.trim()}`
    })
    .join("\n\n---\n\n")

  return `## Enterprise knowledge\n${header}\n\n${body}`
}

function buildAiEntrySystemPrompt(
  enterpriseKnowledge: EnterpriseKnowledgeContext | null,
  agentInstruction: string,
) {
  const base = [
    "You are a general consulting advisor assistant for enterprise users.",
    "Identity rule: never claim you are Kiro or a software-development-only assistant.",
    "Identity rule: when asked who you are, describe yourself as a general consulting advisor assistant.",
    "Provide concise but actionable answers with structured bullets when useful.",
    "When tools are available, call them only if they materially improve correctness.",
    "Ground answers in the user's question and sound consulting practice; do not invent company-specific facts, figures, or policies unless they come from the user or from retrieved enterprise knowledge below.",
  ].join("\n")
  const sections = [base]
  if (agentInstruction.trim()) {
    sections.push(`## Agent mode\n${agentInstruction.trim()}`)
  }
  if (enterpriseKnowledge?.snippets.length) {
    sections.push(buildEnterpriseKnowledgePromptSection(enterpriseKnowledge))
  }
  return sections.join("\n\n")
}

function isIdentityPrompt(prompt: string) {
  const normalized = prompt.trim()
  if (!normalized) return false
  return (
    /who\s+are\s+you/i.test(normalized) ||
    /what\s+are\s+you/i.test(normalized) ||
    /introduce\s+yourself/i.test(normalized) ||
    /\u4f60\u662f\u8c01/.test(normalized) ||
    /\u4ecb\u7ecd.*\u4f60/.test(normalized)
  )
}

function normalizeAiEntryIdentity(text: string, prompt: string) {
  const trimmed = text.trim()
  if (!trimmed) return text
  const isIdentityQuery = isIdentityPrompt(prompt)
  const looksChinese = /[\u4e00-\u9fff]/.test(`${prompt}\n${trimmed}`)
  const replacement = looksChinese
    ? "\u6211\u662f\u901a\u7528\u54a8\u8be2\u987e\u95ee\u52a9\u624b\uff0c\u4e13\u6ce8\u4e8e\u7b56\u7565\u3001\u589e\u957f\u3001\u8fd0\u8425\u4e0e\u6267\u884c\u4f18\u5316\u7b49\u4e1a\u52a1\u95ee\u9898\u3002"
    : "I am a general consulting advisor assistant focused on strategy, growth, operations, and execution optimization."

  if (isIdentityQuery) return replacement

  const identityConflictPatterns = [
    /\bkiro\b/i,
    /\bsoftware\s+development\b/i,
    /\bcode[, ]+debugging\b/i,
    /\u4e3b\u8981\u4e13\u6ce8\u4e8e\u8f6f\u4ef6\u5f00\u53d1\u548c\u6280\u672f\u65b9\u9762\u7684\u5e2e\u52a9/,
    /\u6211\u662f\s*kiro/i,
  ]

  const hasConflict = identityConflictPatterns.some((pattern) =>
    pattern.test(trimmed),
  )
  if (!hasConflict) return text

  return trimmed
    .replace(/\bkiro\b/gi, "general consulting advisor assistant")
    .replace(/software\s+development/gi, "strategy, growth, and operations consulting")
    .replace(/code,\s*debugging/gi, "strategy and execution optimization")
    .replace(
      /\u4e3b\u8981\u4e13\u6ce8\u4e8e\u8f6f\u4ef6\u5f00\u53d1\u548c\u6280\u672f\u65b9\u9762\u7684\u5e2e\u52a9/g,
      "\u4e3b\u8981\u4e13\u6ce8\u4e8e\u7b56\u7565\u3001\u589e\u957f\u4e0e\u8fd0\u8425\u6267\u884c\u4f18\u5316\u65b9\u9762\u7684\u5e2e\u52a9",
    )
}

function normalizeCoreMessageContent(content: CoreMessage["content"]) {
  if (typeof content === "string") return content.trim()
  if (!Array.isArray(content)) return ""

  return content
    .map((part) => {
      if (typeof part === "string") return part
      if (part && typeof part === "object" && "text" in part) {
        const text = (part as { text?: unknown }).text
        return typeof text === "string" ? text : ""
      }
      return ""
    })
    .join(" ")
    .trim()
}

function getLatestUserPrompt(messages: CoreMessage[]) {
  const latest = [...messages].reverse().find((item) => item.role === "user")
  if (!latest) return ""
  return normalizeCoreMessageContent(latest.content)
}

function parseModelConfig(input: ChatRequestBody["modelConfig"]) {
  const rawProviderId =
    typeof input?.providerId === "string" ? input.providerId.trim().toLowerCase() : ""
  const providerId: AiEntryProviderId | null =
    rawProviderId === "aiberm" ||
    rawProviderId === "crazyroute" ||
    rawProviderId === "openrouter"
      ? rawProviderId
      : null

  if (!providerId) return null

  const modelId =
    typeof input?.modelId === "string" && input.modelId.trim()
      ? input.modelId.trim()
      : null

  return {
    providerId,
    modelId,
  }
}

async function resolveModelConfig(
  input: ReturnType<typeof parseModelConfig>,
  options?: { forceSonnet46?: boolean },
) {
  const catalog = await getAiEntryModelCatalog()
  const availableModelIds = new Set(catalog.models.map((item) => item.id))
  const catalogFallbackModelId = catalog.selectedModelId || catalog.models[0]?.id || null
  const requestedModelId = input?.modelId || null
  const requestedProviderId = input?.providerId || null

  if (options?.forceSonnet46) {
    const lockedModelId =
      pickSonnet46ModelId(catalog.models) || AI_ENTRY_SONNET_46_MODEL_HINT
    const resolvedProviderId = requestedProviderId || catalog.providerId || null

    if (requestedModelId && requestedModelId !== lockedModelId) {
      console.warn("ai-entry.chat.model.locked.override", {
        requestedModelId,
        lockedModelId,
        providerId: resolvedProviderId,
      })
    }

    return {
      providerId: resolvedProviderId,
      modelId: lockedModelId,
    }
  }

  const resolvedModelId =
    requestedModelId && availableModelIds.has(requestedModelId)
      ? requestedModelId
      : catalogFallbackModelId
  const resolvedProviderId = catalog.providerId || requestedProviderId

  if (requestedModelId && resolvedModelId !== requestedModelId) {
    console.warn("ai-entry.chat.model.unavailable.fallback", {
      requestedModelId,
      resolvedModelId,
      providerId: resolvedProviderId,
    })
  }

  return {
    providerId: resolvedProviderId,
    modelId: resolvedModelId,
  }
}

function parseAgentConfig(input: ChatRequestBody["agentConfig"]) {
  const rawAgentId =
    typeof input?.agentId === "string" ? input.agentId.trim() : ""
  const resolvedAgentId =
    rawAgentId && isAiEntryAgentId(rawAgentId)
      ? rawAgentId
      : null
  const lockModelToSonnet46 = shouldLockConsultingAdvisorModel({
    entryMode: input?.entryMode,
    agentId: resolvedAgentId,
  })
  const effectiveAgentId = lockModelToSonnet46
    ? AI_ENTRY_CONSULTING_AGENT_ID
    : resolvedAgentId

  return {
    agentId: effectiveAgentId,
    lockModelToSonnet46,
  }
}

function parseConversationScope(input: ChatRequestBody) {
  if (input.conversationScope === "consulting") return "consulting" as const
  if (input.conversationScope === "chat") return "chat" as const
  if (
    shouldLockConsultingAdvisorModel({
      entryMode: input.agentConfig?.entryMode,
      agentId: typeof input.agentConfig?.agentId === "string" ? input.agentConfig.agentId : null,
    })
  ) {
    return "consulting" as const
  }
  return "chat" as const
}

async function persistAiEntryTurnSafe(params: {
  userId: number
  conversationId: string
  userPrompt: string
  assistantMessage: string
  knowledgeSource: "industry_kb" | "personal_kb"
  scope: AiEntryConversationScope
}) {
  if (!params.userPrompt.trim() || !params.assistantMessage.trim()) return
  try {
    await appendAiEntryTurn(params)
  } catch (error) {
    console.error("ai-entry.chat.persist.failed", {
      conversationId: params.conversationId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function POST(request: NextRequest) {
  let closeTools: (() => Promise<void>) | null = null
  try {
    const auth = await requireSessionUser(request)
    if ("response" in auth) {
      return auth.response
    }
    const currentUser = auth.user

    const body = (await request.json()) as ChatRequestBody
    const requestedMessages = normalizeMessages(Array.isArray(body.messages) ? body.messages : [])
    const fallbackPrompt = typeof body.message === "string" ? body.message.trim() : ""

    if (!requestedMessages.length && !fallbackPrompt) {
      return NextResponse.json({ error: "message is required" }, { status: 400 })
    }

    const normalizedMessages =
      requestedMessages.length > 0
        ? requestedMessages
        : ([{ role: "user", content: fallbackPrompt }] as CoreMessage[])

    const latestUserPrompt = getLatestUserPrompt(normalizedMessages) || fallbackPrompt
    const agentConfig = parseAgentConfig(body.agentConfig)
    const conversationScope: AiEntryConversationScope = parseConversationScope(body)
    const modelConfig = await resolveModelConfig(parseModelConfig(body.modelConfig), {
      forceSonnet46: agentConfig.lockModelToSonnet46,
    })
    let persistenceEnabled = true
    let conversationId = ""
    try {
      const ensuredConversation = await ensureAiEntryConversation(
        currentUser.id,
        body.conversationId,
        latestUserPrompt || "New chat",
        modelConfig?.modelId,
        conversationScope,
      )
      conversationId = ensuredConversation.id
    } catch (error) {
      if (!isSessionDbUnavailableError(error)) {
        throw error
      }

      persistenceEnabled = false
      const clientConversationId =
        typeof body.conversationId === "string" ? body.conversationId.trim() : ""
      conversationId = clientConversationId || `ephemeral-${Date.now()}`
      console.warn("ai-entry.chat.persistence.unavailable", {
        userId: currentUser.id,
        conversationId,
        message: error instanceof Error ? error.message : String(error),
      })
    }

    const stream = body.stream !== false
    const knowledgeSource =
      body.knowledgeSource === "personal_kb" ? "personal_kb" : "industry_kb"

    let enterpriseKnowledge: EnterpriseKnowledgeContext | null = null
    const enterpriseId = currentUser.enterpriseId
    if (
      canLoadEnterpriseKnowledgeForUser(currentUser) &&
      typeof enterpriseId === "number" &&
      enterpriseId > 0 &&
      latestUserPrompt.trim()
    ) {
      try {
        enterpriseKnowledge = await loadEnterpriseKnowledgeContext({
          enterpriseId,
          query: latestUserPrompt.trim(),
          platform: "generic",
          mode: "article",
        })
      } catch (error) {
        console.warn("ai-entry.chat.enterprise_knowledge.failed", {
          enterpriseId,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const agentInstruction = await buildAiEntryAgentInstruction(agentConfig.agentId)
    const modeInstruction = await buildAiEntryConsultingModeInstruction(
      agentConfig.lockModelToSonnet46,
    )
    const resolvedInstruction = agentInstruction || modeInstruction
    const skillsEnabled = body.skillConfig?.enabled !== false
    const enabledToolNames = parseEnabledToolNames(body.skillConfig?.enabledToolNames)

    let selectedTools = {} as ToolSet
    let selectedToolIds: string[] = []
    if (skillsEnabled) {
      const urls = getAiEntryMcpServerUrls()
      if (urls.length > 0) {
        try {
          const loaded = await loadAiEntryMcpTools(urls)
          closeTools = loaded.close
          const loadedTools =
            loaded.tools && typeof loaded.tools === "object"
              ? loaded.tools
              : ({} as ToolSet)
          selectedTools =
            enabledToolNames.length > 0
              ? selectAiEntryTools(loadedTools, enabledToolNames)
              : loadedTools
          selectedToolIds = Object.keys((selectedTools || {}) as Record<string, unknown>)
        } catch (error) {
          console.warn("ai-entry.chat.mcp-tools.load.failed", {
            message: error instanceof Error ? error.message : String(error),
          })
          selectedTools = {} as ToolSet
          selectedToolIds = []
        }
      }
    }

    const maxStepCount = selectedToolIds.length > 0 ? 8 : 1
    const stopWhen = stepCountIs(maxStepCount)
    const systemPrompt = buildAiEntrySystemPrompt(
      enterpriseKnowledge,
      resolvedInstruction,
    )
    const providerOptions = modelConfig
      ? {
          preferredProviderId: modelConfig.providerId || undefined,
          preferredModel: modelConfig.modelId || undefined,
          ...(agentConfig.lockModelToSonnet46
            ? {
                forceModelAcrossProviders: true,
                disableSameProviderModelFallback: true,
              }
            : {}),
        }
      : undefined

    if (!stream) {
      const execution = await executeAiEntryWithProviderFailover(
        async (providerRun) => {
          const result = await generateText({
            // Force OpenAI-compatible chat completions path for proxy providers
            // that do not implement the newer /responses endpoint.
            model: providerRun.provider.chat(providerRun.model),
            system: systemPrompt,
            messages: normalizedMessages,
            tools: selectedTools,
            stopWhen,
          })
          return result
        },
        providerOptions,
      )
      const normalizedAssistantMessage = normalizeAiEntryIdentity(
        execution.result.text || "",
        latestUserPrompt,
      )

      if (persistenceEnabled) {
        await persistAiEntryTurnSafe({
          userId: currentUser.id,
          conversationId,
          userPrompt: latestUserPrompt,
          assistantMessage: normalizedAssistantMessage,
          knowledgeSource,
          scope: conversationScope,
        })
      }

      return NextResponse.json({
        message: normalizedAssistantMessage,
        conversationId,
        persisted: persistenceEnabled,
        provider: execution.providerId,
        providerModel: execution.model,
        agentId: agentConfig.agentId,
        providerOrder: execution.providerOrder,
        toolCalls: execution.result.toolCalls?.map((call: { toolCallId: string; toolName: string }) => ({
          toolCallId: call.toolCallId,
          toolName: call.toolName,
        })),
      })
    }

    const encoder = new TextEncoder()
    const responseStream = new ReadableStream({
      async start(controller) {
        const sendEvent = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(buildSseEvent(payload)))
        }

        try {
          sendEvent({
            event: "conversation_init",
            conversation_id: conversationId,
            enabled_tools: selectedToolIds,
            skills_enabled: skillsEnabled,
            persisted: persistenceEnabled,
          })

          const execution = await executeAiEntryWithProviderFailover(async (providerRun) => {
            sendEvent({
              event:
                providerRun.attempt === 1
                  ? "provider_selected"
                  : "provider_fallback",
              conversation_id: conversationId,
              provider: providerRun.providerId,
              provider_model: providerRun.model,
              provider_order: providerRun.providerOrder,
              provider_attempt: providerRun.attempt,
              provider_upgrade_probe: providerRun.upgradeProbe,
            })

            const result = streamText({
              // Keep stream mode aligned with non-stream mode on chat/completions.
              model: providerRun.provider.chat(providerRun.model),
              system: systemPrompt,
              messages: normalizedMessages,
              tools: selectedTools,
              stopWhen,
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
                    sendEvent({
                      event: "message",
                      conversation_id: conversationId,
                      answer: delta,
                    })
                  }
                  continue
                }

                if (eventType === "tool-call") {
                  sendEvent({
                    event: "tool_call",
                    conversation_id: conversationId,
                    data: {
                      toolName: streamPart.toolName || "",
                      toolCallId: streamPart.toolCallId || "",
                      args: streamPart.args ?? streamPart.input ?? null,
                    },
                  })
                  continue
                }

                if (eventType === "tool-result") {
                  sendEvent({
                    event: "tool_result",
                    conversation_id: conversationId,
                    data: {
                      toolName: streamPart.toolName || "",
                      toolCallId: streamPart.toolCallId || "",
                      result: streamPart.result ?? null,
                    },
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
                  sendEvent({
                    event: "message",
                    conversation_id: conversationId,
                    answer: fallbackText,
                  })
                }
              }
            } catch (error) {
              throw toAiEntryExecutionError(error, !hasStreamOutput)
            }

            return { accumulated }
          }, providerOptions)

          const normalizedStreamedAnswer = normalizeAiEntryIdentity(
            execution.result.accumulated || "",
            latestUserPrompt,
          )
          sendEvent({
            event: "message_end",
            conversation_id: conversationId,
            answer: normalizedStreamedAnswer,
            provider: execution.providerId,
            provider_model: execution.model,
            agent_id: agentConfig.agentId,
            provider_order: execution.providerOrder,
          })

          if (persistenceEnabled) {
            await persistAiEntryTurnSafe({
              userId: currentUser.id,
              conversationId,
              userPrompt: latestUserPrompt,
              assistantMessage: normalizedStreamedAnswer,
              knowledgeSource,
              scope: conversationScope,
            })
          }
        } catch (error) {
          sendEvent({
            event: "error",
            conversation_id: conversationId,
            error: extractErrorMessage(error),
          })
        } finally {
          try {
            if (closeTools) await closeTools()
          } finally {
            controller.close()
          }
        }
      },
    })

    return new Response(responseStream, { headers: STREAM_HEADERS })
  } catch (error) {
    try {
      if (closeTools) await closeTools()
    } catch {
      // ignore cleanup error
    }
    return NextResponse.json(
      { error: extractErrorMessage(error) },
      { status: 500 },
    )
  }
}
