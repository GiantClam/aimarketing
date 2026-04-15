import { NextRequest, NextResponse } from "next/server"
import {
  stepCountIs,
  type CoreMessage,
} from "ai"

import { requireSessionUser } from "@/lib/auth/guards"
import { isSessionDbUnavailableError } from "@/lib/auth/session"
import {
  loadEnterpriseKnowledgeContext,
  type EnterpriseKnowledgeScope,
  type EnterpriseKnowledgeContext,
} from "@/lib/dify/enterprise-knowledge"
import {
  appendAiEntryTurn,
  ensureAiEntryConversation,
  type AiEntryConversationScope,
} from "@/lib/ai-entry/repository"
import { type AiEntryProviderId } from "@/lib/ai-entry/provider-routing"
import { getAiEntryModelCatalog } from "@/lib/ai-entry/model-catalog"
import {
  isAiEntryAgentId,
} from "@/lib/ai-entry/agent-catalog"
import {
  AI_ENTRY_SONNET_46_MODEL_HINT,
  pickSonnet46ModelId,
  shouldLockConsultingAdvisorModel,
} from "@/lib/ai-entry/model-policy"
import { resolveEquivalentModelId } from "@/lib/ai-entry/model-id-registry"
import { resolveForcedReplyLanguage } from "@/lib/ai-entry/language-policy"
import { prepareAiEntryConsultingRuntime } from "@/lib/skills/runtime/ai-entry-consulting"
import {
  runAiEntryConsultingBlocking,
  runAiEntryConsultingStreaming,
} from "@/lib/skills/runtime/ai-entry-executor"

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

const STREAM_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
}

function createChatTraceId() {
  return `ai-entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

function canLoadEnterpriseKnowledgeForUser(user: {
  enterpriseId: number | null
  enterpriseStatus: string | null
}) {
  const id = user.enterpriseId
  if (typeof id !== "number" || !Number.isFinite(id) || id <= 0) return false
  return user.enterpriseStatus === "active"
}

function normalizeEnterpriseName(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
  return normalized
}

function buildAiEntryKnowledgeQueryVariants(query: string, enterpriseName: string) {
  const normalizedQuery = query.replace(/\s+/g, " ").trim()
  const variants = [normalizedQuery]
  if (enterpriseName) {
    variants.push(`${enterpriseName} 企业介绍`)
    variants.push(`${enterpriseName} 核心业务与产品`)
    variants.push(`${enterpriseName} 目标客户与典型场景`)
  }

  return [...new Set(variants.map((item) => item.trim()).filter(Boolean))].slice(0, 4)
}

function inferAiEntryPreferredKnowledgeScopes(query: string): EnterpriseKnowledgeScope[] | undefined {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return undefined

  const brandIntroPattern =
    /品牌|品牌叙事|品牌优化|公司介绍|企业介绍|企业简介|价值主张|定位|about\s+us|company\s+intro|brand|positioning|value\s+proposition/i

  if (brandIntroPattern.test(normalizedQuery)) {
    return ["brand", "general"]
  }

  return undefined
}

type KnowledgeQueryProgress = {
  event: "knowledge_query_start" | "knowledge_query_result"
  data?: {
    status?: "hit" | "miss" | "failed"
    snippetCount?: number
    datasetCount?: number
    message?: string
  }
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
  latestUserPrompt: string,
  forcedReplyLanguage: "zh" | "en" | null,
) {
  const normalizedPrompt = latestUserPrompt.trim()
  const inferredLanguage = /[\u4e00-\u9fff]/.test(normalizedPrompt)
    ? "Chinese"
    : normalizedPrompt
      ? "the user's message language"
      : "the user's message language"
  const languageDirectives =
    forcedReplyLanguage === "en"
      ? [
          "Language lock: the user explicitly requested English responses.",
          "Reply in English for subsequent turns regardless of user input language until the user explicitly asks to switch language.",
        ]
      : forcedReplyLanguage === "zh"
        ? [
            "Language lock: the user explicitly requested Chinese responses.",
            "后续回复必须保持中文，不受用户输入语言影响，直到用户再次明确要求切换语言。",
          ]
        : [
            "Language rule: default to the same language as the user's latest input.",
            "Language rule: only switch languages when the user explicitly asks to do so.",
            `Language hint: latest user input should be treated as ${inferredLanguage}.`,
          ]
  const base = [
    "You are a general consulting advisor assistant for enterprise users.",
    "Identity rule: never claim you are Kiro or a software-development-only assistant.",
    "Identity rule: when asked who you are, describe yourself as a general consulting advisor assistant.",
    ...languageDirectives,
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

function normalizeAiEntryIdentity(
  text: string,
  prompt: string,
  forcedReplyLanguage: "zh" | "en" | null,
) {
  const trimmed = text.trim()
  if (!trimmed) return text
  const isIdentityQuery = isIdentityPrompt(prompt)
  const looksChinese =
    forcedReplyLanguage === "zh"
      ? true
      : forcedReplyLanguage === "en"
        ? false
        : /[\u4e00-\u9fff]/.test(`${prompt}\n${trimmed}`)
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
  const availableModelIds = catalog.models.map((item) => item.id)
  const allCatalogModelAliases = catalog.models.flatMap((item) =>
    [
      item.id,
      item.canonicalId,
      item.runtimeId,
      ...(Array.isArray(item.aliases) ? item.aliases : []),
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0),
  )
  const findCatalogModelOption = (value: string | null | undefined) => {
    const normalized = typeof value === "string" ? value.trim() : ""
    if (!normalized) return null
    return (
      catalog.models.find((item) => {
        const aliases = [
          item.id,
          item.canonicalId,
          item.runtimeId,
          ...(Array.isArray(item.aliases) ? item.aliases : []),
        ].filter((candidate): candidate is string =>
          typeof candidate === "string" && candidate.trim().length > 0,
        )
        return aliases.includes(normalized)
      }) || null
    )
  }
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
      providerModelId: lockedModelId,
    }
  }

  const normalizedRequestedModelId = resolveEquivalentModelId(
    requestedModelId,
    allCatalogModelAliases.length > 0 ? allCatalogModelAliases : availableModelIds,
  )
  const requestedModelOption =
    findCatalogModelOption(normalizedRequestedModelId || requestedModelId) || null
  const fallbackModelOption = findCatalogModelOption(catalogFallbackModelId) || null
  const resolvedModelId = requestedModelOption?.id || fallbackModelOption?.id || catalogFallbackModelId
  const resolvedProviderModelId =
    requestedModelOption?.runtimeId ||
    requestedModelOption?.aliases?.[0] ||
    requestedModelOption?.id ||
    fallbackModelOption?.runtimeId ||
    fallbackModelOption?.aliases?.[0] ||
    resolvedModelId
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
    providerModelId: resolvedProviderModelId,
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

  return {
    agentId: resolvedAgentId,
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
  const traceId = createChatTraceId()
  const startedAtMs = Date.now()
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
    const forcedReplyLanguage = resolveForcedReplyLanguage(normalizedMessages)
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

    const enterpriseId = currentUser.enterpriseId
    const enterpriseName = normalizeEnterpriseName(currentUser.enterpriseName)
    const knowledgeQueryVariants = buildAiEntryKnowledgeQueryVariants(
      latestUserPrompt,
      enterpriseName,
    )
    const preferredKnowledgeScopes =
      inferAiEntryPreferredKnowledgeScopes(latestUserPrompt)
    const canQueryEnterpriseKnowledge =
      canLoadEnterpriseKnowledgeForUser(currentUser) &&
      typeof enterpriseId === "number" &&
      enterpriseId > 0 &&
      latestUserPrompt.trim().length > 0

    const loadEnterpriseKnowledge = async (
      notifyProgress?: (progress: KnowledgeQueryProgress) => void,
    ) => {
      if (!canQueryEnterpriseKnowledge) return null

      notifyProgress?.({
        event: "knowledge_query_start",
      })
      try {
        const enterpriseKnowledge = await loadEnterpriseKnowledgeContext({
          enterpriseId,
          query: latestUserPrompt.trim(),
          queryVariants: knowledgeQueryVariants,
          preferredScopes: preferredKnowledgeScopes,
          platform: "generic",
          mode: "article",
        })
        notifyProgress?.({
          event: "knowledge_query_result",
          data: {
            status:
              enterpriseKnowledge && enterpriseKnowledge.snippets.length > 0
                ? "hit"
                : "miss",
            snippetCount: enterpriseKnowledge?.snippets.length || 0,
            datasetCount: enterpriseKnowledge?.datasetsUsed.length || 0,
          },
        })
        return enterpriseKnowledge
      } catch (error) {
        console.warn("ai-entry.chat.enterprise_knowledge.failed", {
          enterpriseId,
          message: error instanceof Error ? error.message : String(error),
        })
        notifyProgress?.({
          event: "knowledge_query_result",
          data: {
            status: "failed",
            message: extractErrorMessage(error),
          },
        })
        return null
      }
    }

    const skillsEnabled = body.skillConfig?.enabled !== false
    const enabledToolNames = parseEnabledToolNames(body.skillConfig?.enabledToolNames)
    const consultingRuntime = await prepareAiEntryConsultingRuntime({
      latestUserPrompt,
      requestedAgentId: agentConfig.agentId,
      lockModelToSonnet46: agentConfig.lockModelToSonnet46,
      skillsEnabled,
      enabledToolNames,
    })
    const {
      effectiveAgentId,
      routeDecision,
      resolvedInstruction,
      selectedTools,
      selectedToolIds,
      closeTools: loadedCloseTools,
      toolLoadWarning,
    } = consultingRuntime
    if (loadedCloseTools) {
      closeTools = loadedCloseTools
    }

    if (toolLoadWarning) {
      console.warn("ai-entry.chat.mcp-tools.load.failed", {
        message: toolLoadWarning,
      })
    }

    if (routeDecision) {
      console.info("ai-entry.chat.agent.auto-routed", {
        requestedAgentId: agentConfig.agentId,
        effectiveAgentId,
        confidence: routeDecision.confidence,
        score: routeDecision.score,
        fallback: routeDecision.fallback,
        matchedSignals: routeDecision.matchedSignals,
      })
    }

    const maxStepCount = selectedToolIds.length > 0 ? 8 : 1
    const stopWhen = stepCountIs(maxStepCount)
    const providerOptions = modelConfig
      ? {
          preferredProviderId: modelConfig.providerId || undefined,
          preferredModel:
            modelConfig.providerModelId || modelConfig.modelId || undefined,
          ...(agentConfig.lockModelToSonnet46
            ? {
                forceModelAcrossProviders: true,
                disableSameProviderModelFallback: true,
                directProviderFailoverOnError: true,
              }
            : {}),
        }
      : undefined

    console.info("ai-entry.chat.request.start", {
      traceId,
      userId: currentUser.id,
      conversationId,
      stream,
      scope: conversationScope,
      lockModel: agentConfig.lockModelToSonnet46,
      selectedAgentId: effectiveAgentId,
      modelProviderId: modelConfig?.providerId || null,
      modelId: modelConfig?.modelId || null,
      providerModelId: modelConfig?.providerModelId || null,
    })

    if (!stream) {
      const enterpriseKnowledge = await loadEnterpriseKnowledge()
      const systemPrompt = buildAiEntrySystemPrompt(
        enterpriseKnowledge,
        resolvedInstruction,
        latestUserPrompt,
        forcedReplyLanguage,
      )
      const execution = await runAiEntryConsultingBlocking({
        systemPrompt,
        messages: normalizedMessages,
        selectedTools,
        stopWhen,
        providerOptions,
        onProviderAttempt: (providerRun) => {
          console.info("ai-entry.chat.provider.attempt", {
            traceId,
            conversationId,
            provider: providerRun.providerId,
            model: providerRun.model,
            attempt: providerRun.attempt,
          })
        },
        onProviderSuccess: (providerRun) => {
          console.info("ai-entry.chat.provider.success", {
            traceId,
            conversationId,
            provider: providerRun.providerId,
            model: providerRun.model,
            attempt: providerRun.attempt,
            outputChars: providerRun.outputChars,
            streamed: false,
          })
        },
        onEmptyResponseRetry: ({ retryAttempt, retryLimit }) => {
          console.warn("ai-entry.chat.empty_response.retry", {
            traceId,
            conversationId,
            streamed: false,
            retryAttempt,
            retryLimit,
          })
        },
      })
      const normalizedAssistantMessage = normalizeAiEntryIdentity(
        execution.result.text || "",
        latestUserPrompt,
        forcedReplyLanguage,
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

      console.info("ai-entry.chat.request.done", {
        traceId,
        conversationId,
        provider: execution.providerId,
        model: execution.model,
        persisted: persistenceEnabled,
        elapsedMs: Date.now() - startedAtMs,
      })

      return NextResponse.json({
        message: normalizedAssistantMessage,
        conversationId,
        persisted: persistenceEnabled,
        provider: execution.providerId,
        providerModel: execution.model,
        agentId: effectiveAgentId,
        agentRoute: routeDecision,
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
            agent_id: effectiveAgentId,
            agent_route: routeDecision,
          })
          const enterpriseKnowledge = await loadEnterpriseKnowledge((progress) => {
            sendEvent({
              event: progress.event,
              conversation_id: conversationId,
              data: progress.data || null,
            })
          })
          const systemPrompt = buildAiEntrySystemPrompt(
            enterpriseKnowledge,
            resolvedInstruction,
            latestUserPrompt,
            forcedReplyLanguage,
          )

          const execution = await runAiEntryConsultingStreaming({
            systemPrompt,
            messages: normalizedMessages,
            selectedTools,
            stopWhen,
            providerOptions,
            onProviderAttempt: (providerRun) => {
              console.info("ai-entry.chat.provider.attempt", {
                traceId,
                conversationId,
                provider: providerRun.providerId,
                model: providerRun.model,
                attempt: providerRun.attempt,
              })
            },
            onProviderSelected: (providerRun) => {
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
            },
            onProviderSuccess: (providerRun) => {
              console.info("ai-entry.chat.provider.success", {
                traceId,
                conversationId,
                provider: providerRun.providerId,
                model: providerRun.model,
                attempt: providerRun.attempt,
                outputChars: providerRun.outputChars,
                streamed: true,
              })
            },
            onTextDelta: (delta) => {
              sendEvent({
                event: "message",
                conversation_id: conversationId,
                answer: delta,
              })
            },
            onToolCall: (payload) => {
              sendEvent({
                event: "tool_call",
                conversation_id: conversationId,
                data: {
                  toolName: payload.toolName,
                  toolCallId: payload.toolCallId,
                  args: payload.args,
                },
              })
            },
            onToolResult: (payload) => {
              sendEvent({
                event: "tool_result",
                conversation_id: conversationId,
                data: {
                  toolName: payload.toolName,
                  toolCallId: payload.toolCallId,
                  result: payload.result,
                },
              })
            },
            onEmptyResponseRetry: ({ retryAttempt, retryLimit }) => {
              console.warn("ai-entry.chat.empty_response.retry", {
                traceId,
                conversationId,
                streamed: true,
                retryAttempt,
                retryLimit,
              })
            },
          })

          const normalizedStreamedAnswer = normalizeAiEntryIdentity(
            execution.result.accumulated || "",
            latestUserPrompt,
            forcedReplyLanguage,
          )
          sendEvent({
            event: "message_end",
            conversation_id: conversationId,
            answer: normalizedStreamedAnswer,
            provider: execution.providerId,
            provider_model: execution.model,
            agent_id: effectiveAgentId,
            agent_route: routeDecision,
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
          console.info("ai-entry.chat.request.done", {
            traceId,
            conversationId,
            provider: execution.providerId,
            model: execution.model,
            persisted: persistenceEnabled,
            streamed: true,
            elapsedMs: Date.now() - startedAtMs,
          })
        } catch (error) {
          console.error("ai-entry.chat.request.failed", {
            traceId,
            conversationId,
            message: extractErrorMessage(error),
            elapsedMs: Date.now() - startedAtMs,
          })
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
    console.error("ai-entry.chat.request.failed", {
      traceId,
      message: extractErrorMessage(error),
      elapsedMs: Date.now() - startedAtMs,
    })
    return NextResponse.json(
      { error: extractErrorMessage(error) },
      { status: 500 },
    )
  }
}
