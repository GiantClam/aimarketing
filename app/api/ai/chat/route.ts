import { NextRequest, NextResponse } from "next/server"
import {
  stepCountIs,
  type CoreMessage,
} from "ai"

import { requireSessionUser } from "@/lib/auth/guards"
import { isSessionDbUnavailableError } from "@/lib/auth/session"
import {
  appendAiEntryTurn,
  ensureAiEntryConversation,
  type AiEntryConversationScope,
} from "@/lib/ai-entry/repository"
import { type AiEntryProviderId } from "@/lib/ai-entry/provider-routing"
import {
  isAiEntryAgentId,
} from "@/lib/ai-entry/agent-catalog"
import {
  AI_ENTRY_CONSULTING_QUALITY_MODEL_HINT,
  pickConsultingModelId,
  resolveConsultingModelMode,
  shouldLockConsultingAdvisorModel,
  type AiEntryConsultingModelMode,
} from "@/lib/ai-entry/model-policy"
import { resolveEquivalentModelId } from "@/lib/ai-entry/model-id-registry"
import {
  getAiEntryWebSearchSystemRule,
  shouldQueryAiEntryEnterpriseKnowledge,
} from "@/lib/ai-entry/chat-policy"
import {
  normalizeAiEntryIdentity,
} from "@/lib/ai-entry/identity"
import { loadEnterpriseKnowledgeContext } from "@/lib/knowledge/service"
import type { EnterpriseKnowledgeContext, EnterpriseKnowledgeScope } from "@/lib/knowledge/types"
import { hasCustomAiChatModelSelection } from "@/lib/platform/shared-credits-policy"
import {
  normalizeAttachmentList,
  normalizeMessages,
  type IncomingAttachment,
  type IncomingMessage,
} from "@/lib/ai-entry/chat-attachments"
import { resolveForcedReplyLanguage } from "@/lib/ai-entry/language-policy"
import { prepareAiEntryConsultingRuntime } from "@/lib/skills/runtime/ai-entry-consulting"
import {
  type ProviderOptions,
  runAiEntryConsultingBlocking,
  runAiEntryConsultingStreaming,
} from "@/lib/skills/runtime/ai-entry-executor"
import { buildAiEntryWebSearchTools } from "@/lib/ai-entry/web-search-tool"
import { estimateTextCredits } from "@/lib/billing/costing"
import {
  finalizeReservedCredits,
  releaseReservedCredits,
  reserveFeatureCredits,
  type BillingReservation,
} from "@/lib/billing/runtime"
import { getGovernedAiEntryModelCatalogForUser } from "@/lib/platform/model-governance"
import { getEnterpriseTextRuntimeProviderConfigsForUser } from "@/lib/platform/enterprise-runtime-config"

export const runtime = "nodejs"

type ChatRequestBody = {
  messages?: IncomingMessage[]
  message?: string
  systemPrompt?: string
  attachments?: IncomingAttachment[]
  conversationId?: string | null
  conversationScope?: "chat" | "consulting"
  stream?: boolean
  knowledgeSource?: "industry_kb" | "personal_kb"
  enterpriseKnowledge?: {
    enabled?: boolean
    datasetIds?: number[]
  }
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

function parseEnterpriseKnowledgeConfig(input: ChatRequestBody["enterpriseKnowledge"]) {
  const datasetIds = Array.isArray(input?.datasetIds)
    ? [...new Set(input.datasetIds.filter((value) => Number.isInteger(value) && value > 0))]
    : []

  return {
    enabled: input?.enabled !== false,
    datasetIds,
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

function modelSupportsImageInput(modelId: string | null | undefined) {
  const normalized = typeof modelId === "string" ? modelId.toLowerCase() : ""
  if (!normalized) return false
  if (normalized.includes("gemini")) return true
  if (normalized.includes("claude")) return true
  if (normalized.includes("gpt-4") || normalized.includes("gpt-5") || normalized.includes("o3") || normalized.includes("o4")) return true
  if (normalized.includes("vision") || normalized.includes("vl") || normalized.includes("pixtral")) return true
  return false
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
    variants.push(`${enterpriseName} \u4f01\u4e1a\u4ecb\u7ecd`)
    variants.push(`${enterpriseName} \u6838\u5fc3\u4e1a\u52a1\u4e0e\u4ea7\u54c1`)
    variants.push(`${enterpriseName} \u76ee\u6807\u5ba2\u6237\u4e0e\u5178\u578b\u573a\u666f`)
  }

  return [...new Set(variants.map((item) => item.trim()).filter(Boolean))].slice(0, 4)
}

function inferAiEntryPreferredKnowledgeScopes(query: string): EnterpriseKnowledgeScope[] | undefined {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return undefined

  const brandIntroPattern =
    /\u54c1\u724c|\u54c1\u724c\u53d9\u4e8b|\u54c1\u724c\u4f18\u5316|\u516c\u53f8\u4ecb\u7ecd|\u4f01\u4e1a\u4ecb\u7ecd|\u4f01\u4e1a\u7b80\u4ecb|\u4ef7\u503c\u4e3b\u5f20|\u5b9a\u4f4d|about\s+us|company\s+intro|brand|positioning|value\s+proposition/i

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
  customSystemPrompt: string,
  latestUserPrompt: string,
  forcedReplyLanguage: "zh" | "en" | null,
  webSearch: {
    available?: boolean
    conversationScope?: AiEntryConversationScope
    consultingModelMode?: AiEntryConsultingModelMode
  } = {},
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
            "Reply in Chinese for subsequent turns regardless of user input language until the user explicitly asks to switch language.",
          ]
        : [
            "Language rule: default to the same language as the user's latest input.",
            "Language rule: only switch languages when the user explicitly asks to do so.",
            `Language hint: latest user input should be treated as ${inferredLanguage}.`,
          ]
  const base = [
    "You are an enterprise AI chat assistant focused on practical strategy, growth, operations, and execution support.",
    "Identity rule: never claim you are Kiro or a software-development-only assistant.",
    "Identity rule: do not proactively introduce your role or capabilities unless the user asks who you are or asks for an introduction.",
    "Identity rule: if the user explicitly asks who you are, describe yourself as a general consulting advisor assistant for enterprise users.",
    ...languageDirectives,
    "Prioritize a fast first useful response, then add structure, evidence, and caveats only where they improve the answer.",
    "Provide practical, high-signal answers with concrete next steps; avoid generic filler.",
    "When tools are available, call them only if they materially improve correctness.",
    getAiEntryWebSearchSystemRule({
      webSearchAvailable: Boolean(webSearch.available),
      conversationScope: webSearch.conversationScope,
      consultingModelMode: webSearch.consultingModelMode,
    }),
    "Ground answers in the user's question and sound consulting practice; do not invent company-specific facts, figures, or policies unless they come from the user or from retrieved enterprise knowledge below.",
  ].filter(Boolean).join("\n")
  const sections = [base]
  if (agentInstruction.trim()) {
    sections.push(`## Agent mode\n${agentInstruction.trim()}`)
  }
  if (customSystemPrompt.trim()) {
    sections.push(`## Custom system instruction\n${customSystemPrompt.trim()}`)
  }
  if (enterpriseKnowledge?.snippets.length) {
    sections.push(buildEnterpriseKnowledgePromptSection(enterpriseKnowledge))
  }
  return sections.join("\n\n")
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

function estimateTextTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4))
}

function getAiEntryUsageTokens(rawUsage: unknown, fallbackInputText: string, fallbackOutputText: string) {
  const usage = rawUsage && typeof rawUsage === "object" ? (rawUsage as Record<string, unknown>) : null
  const inputTokens =
    Number(usage?.inputTokens ?? usage?.promptTokens ?? usage?.prompt_tokens ?? 0) ||
    estimateTextTokens(fallbackInputText)
  const outputTokens =
    Number(usage?.outputTokens ?? usage?.completionTokens ?? usage?.completion_tokens ?? 0) ||
    estimateTextTokens(fallbackOutputText)
  return { inputTokens, outputTokens }
}

function parseModelConfig(input: ChatRequestBody["modelConfig"]) {
  const rawProviderId =
    typeof input?.providerId === "string" ? input.providerId.trim().toLowerCase() : ""
  let providerId: AiEntryProviderId | null = null
  if (rawProviderId === "crazyrouter") {
    providerId = "crazyroute"
  } else if (
    rawProviderId === "pptoken" ||
    rawProviderId === "openrouter" ||
    rawProviderId === "aiberm" ||
    rawProviderId === "crazyroute" ||
    rawProviderId === "enterprise-openai-compatible" ||
    rawProviderId === "enterprise-qwen-official" ||
    rawProviderId === "enterprise-minimax-official" ||
    rawProviderId === "enterprise-glm-official"
  ) {
    providerId = rawProviderId
  }

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
  user: {
    id: number
    enterpriseId: number | null
    enterpriseRole: string | null
    enterpriseStatus: string | null
  },
  options?: {
    forceConsultingModel?: boolean
    consultingModelMode?: AiEntryConsultingModelMode
  },
) {
  const requestedProviderId = input?.providerId || null
  const catalog = await getGovernedAiEntryModelCatalogForUser({
    user,
    requestedProviderId,
  })
  if (catalog.models.length === 0) {
    throw new Error("ai_entry_model_unavailable_for_user")
  }
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
  if (options?.forceConsultingModel) {
    const lockedModelId =
      pickConsultingModelId(catalog.models) ||
      AI_ENTRY_CONSULTING_QUALITY_MODEL_HINT
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
  const resolvedProviderId = requestedProviderId || catalog.providerId

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
  const lockModelToConsultingModel = shouldLockConsultingAdvisorModel({
    entryMode: input?.entryMode,
    agentId: resolvedAgentId,
  })
  const consultingModelMode = resolveConsultingModelMode()

  return {
    agentId: resolvedAgentId,
    lockModelToConsultingModel,
    consultingModelMode,
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
  agentId?: string | null
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
  let aiEntryCreditReservation: BillingReservation | null = null
  let aiEntryCreditFinalized = false
  let billingUserId: number | null = null
  let billingEnterpriseId: number | null = null
  const traceId = createChatTraceId()
  const startedAtMs = Date.now()
  try {
    const auth = await requireSessionUser(request)
    if ("response" in auth) {
      return auth.response
    }
    const currentUser = auth.user
    billingUserId = currentUser.id
    billingEnterpriseId = currentUser.enterpriseId

    const body = (await request.json()) as ChatRequestBody
    const customSystemPrompt =
      typeof body.systemPrompt === "string" ? body.systemPrompt.trim().slice(0, 24_000) : ""
    const enterpriseKnowledgeConfig = parseEnterpriseKnowledgeConfig(body.enterpriseKnowledge)
    const attachments = normalizeAttachmentList(body.attachments)
    const requestedMessages = normalizeMessages(Array.isArray(body.messages) ? body.messages : [], attachments)
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
    const modelConfig = await resolveModelConfig(parseModelConfig(body.modelConfig), currentUser, {
      forceConsultingModel: agentConfig.lockModelToConsultingModel,
      consultingModelMode: agentConfig.consultingModelMode,
    })
    if (attachments.some((attachment) => attachment.mediaType.startsWith("image/"))) {
      const resolvedModelId = modelConfig?.providerModelId || modelConfig?.modelId || null
      if (!modelSupportsImageInput(resolvedModelId)) {
        return NextResponse.json({ error: "unsupported_image_upload" }, { status: 400 })
      }
    }
    if (attachments.some((attachment) => !attachment.mediaType.startsWith("image/") && !attachment.mediaType.startsWith("text/") && !attachment.mediaType.includes("json") && !attachment.mediaType.includes("csv"))) {
      return NextResponse.json({ error: "unsupported_attachment_type" }, { status: 400 })
    }
    let persistenceEnabled = true
    let conversationId = ""
    try {
      const ensuredConversation = await ensureAiEntryConversation(
        currentUser.id,
        body.conversationId,
        latestUserPrompt || "New chat",
        modelConfig?.modelId,
        conversationScope,
        agentConfig.agentId,
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
      enterpriseKnowledgeConfig.enabled &&
      typeof enterpriseId === "number" &&
      enterpriseId > 0 &&
      latestUserPrompt.trim().length > 0
    let shouldQueryEnterpriseKnowledgeForRequest = false

    const loadEnterpriseKnowledge = async (
      notifyProgress?: (progress: KnowledgeQueryProgress) => void,
    ) => {
      if (!shouldQueryEnterpriseKnowledgeForRequest) return null

      notifyProgress?.({
        event: "knowledge_query_start",
      })
      try {
        const enterpriseKnowledge = await loadEnterpriseKnowledgeContext({
          enterpriseId,
          query: latestUserPrompt.trim(),
          queryVariants: knowledgeQueryVariants,
          preferredScopes: preferredKnowledgeScopes,
          preferredDatasetIds: enterpriseKnowledgeConfig.datasetIds,
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
      lockModelToConsultingModel: agentConfig.lockModelToConsultingModel,
      skillsEnabled,
      enabledToolNames,
    })
    const {
      effectiveAgentId,
      routeDecision,
      resolvedInstruction,
      selectedTools,
      closeTools: loadedCloseTools,
      toolLoadWarning,
    } = consultingRuntime
    shouldQueryEnterpriseKnowledgeForRequest = shouldQueryAiEntryEnterpriseKnowledge({
      canQueryEnterpriseKnowledge,
      effectiveAgentId,
    })
    if (loadedCloseTools) {
      closeTools = loadedCloseTools
    }
    const webSearchTools = buildAiEntryWebSearchTools()
    const effectiveSelectedTools = {
      ...(selectedTools || {}),
      ...webSearchTools,
    }
    const effectiveSelectedToolIds = Object.keys(effectiveSelectedTools)

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

    const maxStepCount = effectiveSelectedToolIds.length > 0 ? 8 : 1
    const stopWhen = stepCountIs(maxStepCount)
    const enterpriseTextRuntime = await getEnterpriseTextRuntimeProviderConfigsForUser(
      currentUser,
    )
    const providerOptions: ProviderOptions | undefined =
      modelConfig || enterpriseTextRuntime
        ? {
            preferredProviderId:
              modelConfig?.providerId ||
              enterpriseTextRuntime?.selectedProviderId ||
              undefined,
            preferredModel:
              modelConfig?.providerModelId ||
              modelConfig?.modelId ||
              enterpriseTextRuntime?.selectedModelId ||
              undefined,
            ...(enterpriseTextRuntime?.providerConfigs?.length
              ? {
                  providerConfigs: enterpriseTextRuntime.providerConfigs,
                }
              : {}),
            ...(agentConfig.lockModelToConsultingModel
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
      lockModel: agentConfig.lockModelToConsultingModel,
      consultingModelMode: agentConfig.consultingModelMode,
      selectedAgentId: effectiveAgentId,
      modelProviderId: modelConfig?.providerId || null,
      modelId: modelConfig?.modelId || null,
      providerModelId: modelConfig?.providerModelId || null,
      attachmentCount: attachments.length,
      selectedToolIds: effectiveSelectedToolIds,
    })

    const shouldReserveAiEntryCredits =
      !currentUser.isDemo && !hasCustomAiChatModelSelection(body.modelConfig)
    if (shouldReserveAiEntryCredits) {
      const reserveEstimate = estimateTextCredits({
        featureKey: "ai_entry_chat",
        inputTokens: estimateTextTokens(
          [customSystemPrompt, ...normalizedMessages.map((message) => normalizeCoreMessageContent(message.content))]
            .filter(Boolean)
            .join("\n"),
        ),
        outputTokens: 4_000,
        provider: modelConfig?.providerId || null,
        model: modelConfig?.providerModelId || modelConfig?.modelId || null,
      })
      try {
        aiEntryCreditReservation = await reserveFeatureCredits({
          userId: currentUser.id,
          enterpriseId: currentUser.enterpriseId,
          featureKey: "ai_entry_chat",
          amount: reserveEstimate.credits,
          idempotencyKey: `ai-entry:${conversationId}:${traceId}:reserve`,
          metadata: {
            conversationId,
            traceId,
            estimate: reserveEstimate,
          },
        })
      } catch (error) {
        if (error instanceof Error && error.message === "insufficient_credits") {
          return NextResponse.json({ error: "insufficient_credits" }, { status: 402 })
        }
        throw error
      }
    }

    if (!stream) {
      const enterpriseKnowledge = await loadEnterpriseKnowledge()
      const systemPrompt = buildAiEntrySystemPrompt(
        enterpriseKnowledge,
        resolvedInstruction,
        customSystemPrompt,
        latestUserPrompt,
        forcedReplyLanguage,
        {
          available: Boolean(webSearchTools.web_search),
          conversationScope,
          consultingModelMode: agentConfig.consultingModelMode,
        },
      )
      const execution = await runAiEntryConsultingBlocking({
        systemPrompt,
        messages: normalizedMessages,
        selectedTools: effectiveSelectedTools,
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
          agentId: agentConfig.agentId,
        })
      }

      const usageTokens = getAiEntryUsageTokens(
        (execution.result as { usage?: unknown }).usage,
        normalizedMessages.map((message) => normalizeCoreMessageContent(message.content)).join("\n"),
        normalizedAssistantMessage,
      )
      const actualCost = estimateTextCredits({
        featureKey: "ai_entry_chat",
        inputTokens: usageTokens.inputTokens,
        outputTokens: usageTokens.outputTokens,
        provider: execution.providerId,
        model: execution.model,
      })
      await finalizeReservedCredits({
        reservation: aiEntryCreditReservation,
        userId: currentUser.id,
        enterpriseId: currentUser.enterpriseId,
        actualAmount: actualCost.credits,
        idempotencyKey: `ai-entry:${conversationId}:${traceId}:debit`,
        provider: execution.providerId,
        model: execution.model,
        officialCostUsd: actualCost.officialCostUsd,
        costBasisUsd: actualCost.costBasisUsd,
        usagePayload: actualCost.metadata,
        metadata: { conversationId, traceId },
      }).catch((error) => {
        console.warn("ai-entry.billing.finalize.failed", {
          conversationId,
          message: error instanceof Error ? error.message : String(error),
        })
      })
      aiEntryCreditFinalized = true

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
        let knowledgeQueryStartedAtMs: number | null = null
        let knowledgeQueryCompletedAtMs: number | null = null
        let providerSelectedAtMs: number | null = null
        let firstTextDeltaAtMs: number | null = null
        let lastTextDeltaAtMs: number | null = null
        const sendEvent = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(buildSseEvent(payload)))
        }

        try {
          sendEvent({
            event: "conversation_init",
            conversation_id: conversationId,
            enabled_tools: effectiveSelectedToolIds,
            skills_enabled: skillsEnabled,
            persisted: persistenceEnabled,
            agent_id: effectiveAgentId,
            agent_route: routeDecision,
          })
          const enterpriseKnowledge = await loadEnterpriseKnowledge((progress) => {
            if (progress.event === "knowledge_query_start") {
              knowledgeQueryStartedAtMs = Date.now()
            } else if (progress.event === "knowledge_query_result") {
              knowledgeQueryCompletedAtMs = Date.now()
            }
            sendEvent({
              event: progress.event,
              conversation_id: conversationId,
              data: progress.data || null,
            })
          })
          const systemPrompt = buildAiEntrySystemPrompt(
            enterpriseKnowledge,
            resolvedInstruction,
            customSystemPrompt,
            latestUserPrompt,
            forcedReplyLanguage,
            {
              available: Boolean(webSearchTools.web_search),
              conversationScope,
              consultingModelMode: agentConfig.consultingModelMode,
            },
          )

          const execution = await runAiEntryConsultingStreaming({
            systemPrompt,
            messages: normalizedMessages,
            selectedTools: effectiveSelectedTools,
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
              providerSelectedAtMs = Date.now()
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
                firstTokenMs:
                  firstTextDeltaAtMs === null
                    ? null
                    : firstTextDeltaAtMs - startedAtMs,
                providerToFirstTokenMs:
                  firstTextDeltaAtMs === null || providerSelectedAtMs === null
                    ? null
                    : firstTextDeltaAtMs - providerSelectedAtMs,
              })
            },
            onTextDelta: (delta) => {
              if (delta) {
                const now = Date.now()
                if (firstTextDeltaAtMs === null) {
                  firstTextDeltaAtMs = now
                  console.info("ai-entry.chat.first_token", {
                    traceId,
                    conversationId,
                    providerSelectedElapsedMs:
                      providerSelectedAtMs === null
                        ? null
                        : providerSelectedAtMs - startedAtMs,
                    elapsedMs: now - startedAtMs,
                    providerToFirstTokenMs:
                      providerSelectedAtMs === null
                        ? null
                        : now - providerSelectedAtMs,
                  })
                }
                lastTextDeltaAtMs = now
              }
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
              agentId: agentConfig.agentId,
            })
          }
          const usageTokens = getAiEntryUsageTokens(
            null,
            normalizedMessages.map((message) => normalizeCoreMessageContent(message.content)).join("\n"),
            normalizedStreamedAnswer,
          )
          const actualCost = estimateTextCredits({
            featureKey: "ai_entry_chat",
            inputTokens: usageTokens.inputTokens,
            outputTokens: usageTokens.outputTokens,
            provider: execution.providerId,
            model: execution.model,
          })
          await finalizeReservedCredits({
            reservation: aiEntryCreditReservation,
            userId: currentUser.id,
            enterpriseId: currentUser.enterpriseId,
            actualAmount: actualCost.credits,
            idempotencyKey: `ai-entry:${conversationId}:${traceId}:debit`,
            provider: execution.providerId,
            model: execution.model,
            officialCostUsd: actualCost.officialCostUsd,
            costBasisUsd: actualCost.costBasisUsd,
            usagePayload: actualCost.metadata,
            metadata: { conversationId, traceId, streamed: true },
          }).catch((error) => {
            console.warn("ai-entry.billing.finalize.failed", {
              conversationId,
              message: error instanceof Error ? error.message : String(error),
            })
          })
          aiEntryCreditFinalized = true
          console.info("ai-entry.chat.request.done", {
            traceId,
            conversationId,
            provider: execution.providerId,
            model: execution.model,
            persisted: persistenceEnabled,
            streamed: true,
            elapsedMs: Date.now() - startedAtMs,
            knowledgeQueryMs:
              knowledgeQueryStartedAtMs === null ||
              knowledgeQueryCompletedAtMs === null
                ? null
                : knowledgeQueryCompletedAtMs - knowledgeQueryStartedAtMs,
            firstTokenMs:
              firstTextDeltaAtMs === null
                ? null
                : firstTextDeltaAtMs - startedAtMs,
            lastTokenMs:
              lastTextDeltaAtMs === null
                ? null
                : lastTextDeltaAtMs - startedAtMs,
            providerToFirstTokenMs:
              firstTextDeltaAtMs === null || providerSelectedAtMs === null
                ? null
                : firstTextDeltaAtMs - providerSelectedAtMs,
          })
        } catch (error) {
          if (aiEntryCreditReservation && !aiEntryCreditFinalized) {
            await releaseReservedCredits({
              reservation: aiEntryCreditReservation,
              userId: currentUser.id,
              enterpriseId: currentUser.enterpriseId,
              idempotencyKey: `ai-entry:${conversationId}:${traceId}:release`,
              reason: "ai_entry_stream_failed",
            }).catch((releaseError) => {
              console.warn("ai-entry.billing.release.failed", {
                conversationId,
                message: releaseError instanceof Error ? releaseError.message : String(releaseError),
              })
            })
          }
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
    if (aiEntryCreditReservation && !aiEntryCreditFinalized && billingUserId) {
      await releaseReservedCredits({
        reservation: aiEntryCreditReservation,
        userId: billingUserId,
        enterpriseId: billingEnterpriseId,
        idempotencyKey: `ai-entry:unknown:${traceId}:release`,
        reason: "ai_entry_request_failed",
      }).catch((releaseError) => {
        console.warn("ai-entry.billing.release.failed", {
          traceId,
          message: releaseError instanceof Error ? releaseError.message : String(releaseError),
        })
      })
    }
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
