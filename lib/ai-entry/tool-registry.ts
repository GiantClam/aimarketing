import "server-only"

import { tool, type ToolChoice, type ToolSet } from "ai"

import type { AuthUser } from "@/lib/auth/session"
import { enqueueAssistantTask } from "@/lib/assistant-async"
import { type AiEntryConversationScope } from "@/lib/ai-entry/repository"
import { type AiEntryAgentRuntimePolicy } from "@/lib/ai-entry/agent-runtime-policy"
import { extractAiEntryArtifactsFromToolResult } from "@/lib/ai-entry/artifact-runtime"
import { extractUserIntentFromMessageContent } from "@/lib/ai-entry/chat-attachments"
import { type AiEntryConversationState, resolveAiEntryConversationStateFromContents } from "@/lib/ai-entry/conversation-state"
import { type AiEntryMcpServerDefinition, getAiEntryMcpServerDefinitions, loadAiEntryMcpTools } from "@/lib/ai-entry/mcp-tools"
import { buildAiEntryPptTools } from "@/lib/ai-entry/ppt-tools"
import {
  type PptBriefState,
  preparePptPreviewInput,
} from "@/lib/ai-entry/ppt-brief"
import {
  extractLatestPptPreviewContext,
  extractLatestPptTemplateRecommendationContext,
  type PptPreviewContext,
  resolvePptTemplateSelectionFromUserText,
} from "@/lib/ai-entry/ppt-tool-result-message"
import {
  buildResearchBriefFromAttachmentContent,
  buildResearchBriefFromWebSearchResult,
  extractLatestResearchBriefContextFromContents,
  type StructuredResearchBrief,
} from "@/lib/ai-entry/research-brief-context"
import { type AiEntrySkillDefinition } from "@/lib/ai-entry/skill-registry"
import { buildAiEntryWebSearchTools } from "@/lib/ai-entry/web-search-tool"
import { isAiEntryPptAgentId } from "@/lib/ai-entry/model-policy"
import {
  buildPptMasterRecommendedTemplateSummaries,
  getPptWorkerSupportedTemplateIds,
  isPptMasterLibraryTemplateSupported,
} from "@/lib/lead-tools/ppt-worker-capabilities"
import type { PptPreviewResearchBrief } from "@/lib/lead-tools/ppt-preview-data-fixed"

type AiSdkToolLike = {
  description?: string
  inputSchema: unknown
  execute?: (input: unknown, options?: unknown) => unknown
  onInputStart?: (options: unknown) => unknown
  onInputDelta?: (options: unknown) => unknown
  onInputAvailable?: (options: unknown) => unknown
  providerOptions?: unknown
}

export type AiEntryToolRegistryResult = {
  selectedTools: ToolSet
  selectedToolIds: string[]
  toolChoice?: ToolChoice<ToolSet>
  closeTools: (() => Promise<void>) | null
  toolLoadWarnings: string[]
  selectedMcpServerIds: string[]
}

type ToolSource = "first_party" | "mcp"

const DEFAULT_TOOL_TIMEOUT_MS = 60_000
const AI_ENTRY_BACKGROUND_PPT_AGENT_ID = "executive-ppt"

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("tool_execution_timeout"))
    }, timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function normalizeToolError(error: unknown) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : typeof error === "string" && error.trim()
        ? error.trim()
        : "tool_execution_failed"

  if (
    /ppt_master_repo_missing|ppt_master_runtime_unavailable|ppt_master_script_failed|ppt_master_python_missing/iu.test(
      message,
    )
  ) {
    return {
      code: "ppt_master_runtime_unavailable",
      message: "PPT runtime is currently unavailable. Please try again later.",
    }
  }

  if (/ppt_variant_not_found|selected variant not found/iu.test(message)) {
    return {
      code: "ppt_variant_not_found",
      message: "The selected PPT variant could not be found. Use a variant key returned by preview_ppt_deck.",
    }
  }

  if (/missing_preview_session/iu.test(message)) {
    return {
      code: "missing_preview_session",
      message: "The PPT preview session is no longer available. Generate the preview again before export.",
    }
  }

  if (message === "tool_execution_timeout") {
    return {
      code: "tool_execution_timeout",
      message: "The tool timed out before returning a result.",
    }
  }

  return {
    code: "tool_execution_failed",
    message,
  }
}

function summarizeToolInput(input: unknown) {
  try {
    return JSON.stringify(input).slice(0, 1_000)
  } catch {
    return "[unserializable-tool-input]"
  }
}

function summarizeToolOutput(output: unknown) {
  try {
    return JSON.stringify(output).slice(0, 1_500)
  } catch {
    return "[unserializable-tool-output]"
  }
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function resolveEditablePptTemplateSelectionFromText(input: {
  userText: string | null | undefined
  latestTemplateRecommendationContext: ReturnType<typeof extractLatestPptTemplateRecommendationContext>
}) {
  const contextTemplateId = resolvePptTemplateSelectionFromUserText(
    input.userText,
    input.latestTemplateRecommendationContext,
  )
  if (contextTemplateId && isPptMasterLibraryTemplateSupported(contextTemplateId)) {
    return contextTemplateId
  }

  const normalized = readOptionalString(input.userText)?.toLowerCase() ?? ""
  if (!normalized) return null

  return (
    getPptWorkerSupportedTemplateIds().find((templateId) => {
      const candidate = templateId.trim().toLowerCase()
      return candidate && (normalized === candidate || normalized.includes(candidate))
    }) ?? null
  )
}

function maybeInjectResearchBrief(
  toolId: string,
  input: unknown,
  lastResearchBrief: StructuredResearchBrief | null,
) {
  if (toolId !== "preview_ppt_deck" || !lastResearchBrief || !input || typeof input !== "object") {
    return input
  }

  const record = input as Record<string, unknown>
  const existingBrief = record.researchBrief
  if (existingBrief) {
    return input
  }

  return {
    ...record,
    researchBrief: lastResearchBrief,
  }
}

function maybeInjectPptExportContext(
  toolId: string,
  input: unknown,
  latestPreviewContext: ReturnType<typeof extractLatestPptPreviewContext>,
) {
  if (toolId !== "export_ppt_deck" || !latestPreviewContext) {
    return input
  }

  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  const previewSessionId = readOptionalString(record.previewSessionId) ?? latestPreviewContext.previewSessionId
  const selectedVariantKey = readOptionalString(record.selectedVariantKey) ?? latestPreviewContext.defaultVariantKey

  return {
    ...record,
    previewSessionId,
    ...(selectedVariantKey ? { selectedVariantKey } : {}),
  }
}

function maybeInjectPptTemplateSelection(input: {
  toolId: string
  rawInput: unknown
  latestTemplateRecommendationContext: ReturnType<typeof extractLatestPptTemplateRecommendationContext>
  latestUserPrompt: string | null | undefined
  agentId: string | null
  executionContext?: "chat" | "workflow"
}) {
  if (
    input.toolId !== "preview_ppt_deck" ||
    input.agentId !== "executive-ppt" ||
    input.executionContext === "workflow"
  ) {
    return input.rawInput
  }

  const record = input.rawInput && typeof input.rawInput === "object" ? (input.rawInput as Record<string, unknown>) : {}
  const selectedTemplateId = resolveEditablePptTemplateSelectionFromText({
    userText: input.latestUserPrompt,
    latestTemplateRecommendationContext: input.latestTemplateRecommendationContext,
  })
  if (selectedTemplateId) {
    return {
      ...record,
      templateMode: "single-template",
      templateId: selectedTemplateId,
    }
  }

  const rest = { ...record }
  delete rest.templateId
  delete rest.templateMode
  return rest
}

function maybeInjectPptSourcePrompt(input: {
  toolId: string
  rawInput: unknown
  latestUserPrompt: string | null | undefined
}) {
  if (input.toolId !== "preview_ppt_deck") {
    return input.rawInput
  }

  const sourcePrompt = readOptionalString(input.latestUserPrompt)
  if (!sourcePrompt) {
    return input.rawInput
  }

  const normalizedSourcePrompt = extractUserIntentFromMessageContent(sourcePrompt)
  if (!normalizedSourcePrompt) {
    return input.rawInput
  }

  const record = input.rawInput && typeof input.rawInput === "object" ? (input.rawInput as Record<string, unknown>) : {}
  return {
    ...record,
    sourcePrompt: normalizedSourcePrompt,
  }
}

function extractPreviewContextFromToolResult(result: unknown): PptPreviewContext | null {
  if (!result || typeof result !== "object" || (result as { ok?: unknown }).ok === false) {
    return null
  }

  const previewSessionId = readOptionalString((result as { previewSessionId?: unknown }).previewSessionId)
  const variants = Array.isArray((result as { variants?: unknown }).variants)
    ? ((result as { variants?: unknown }).variants as unknown[])
        .map((variant) =>
          variant && typeof variant === "object"
            ? readOptionalString((variant as { key?: unknown }).key)
            : null,
        )
        .filter((value): value is string => Boolean(value))
    : []

  if (!previewSessionId || variants.length === 0) {
    return null
  }

  const recommendedVariantKey = readOptionalString(
    (result as { recommendedVariantKey?: unknown }).recommendedVariantKey,
  )

  return {
    previewSessionId,
    defaultVariantKey: recommendedVariantKey ?? variants[0] ?? null,
    variantKeys: variants,
  }
}

function isMissingPreviewSessionResult(result: unknown) {
  if (!result || typeof result !== "object" || (result as { ok?: unknown }).ok !== false) {
    return false
  }

  const error = (result as { error?: { code?: unknown } }).error
  return readOptionalString(error?.code) === "missing_preview_session"
}

function maybePreparePptPreviewInput(
  toolId: string,
  input: unknown,
  briefState: PptBriefState | null,
  _options?: {
    agentId: string | null
    executionContext?: "chat" | "workflow"
    latestUserPrompt?: string | null
    latestTemplateRecommendationContext?: ReturnType<typeof extractLatestPptTemplateRecommendationContext>
  },
) {
  if (toolId !== "preview_ppt_deck") {
    return {
      ok: true as const,
      input,
    }
  }

  const prepared = preparePptPreviewInput({
    rawInput: input,
    briefState,
  })
  if (!prepared.ok) {
    return prepared
  }

  return prepared
}

function normalizePptPreparedScenario(value: unknown) {
  return value === "marketing-campaign" ||
    value === "product-launch" ||
    value === "sales-deck" ||
    value === "training"
    ? value
    : "marketing-campaign"
}

function normalizePptPreparedLanguage(value: unknown) {
  return value === "zh-CN" || value === "en-US" ? value : "zh-CN"
}

function readPptPreparedResearchBrief(value: unknown) {
  return typeof value === "string" || (value && typeof value === "object")
    ? (value as string | PptPreviewResearchBrief)
    : undefined
}

function shouldRunPptPreviewInBackground(input: {
  toolId: string
  source: ToolSource
  executionContext?: "chat" | "workflow"
  agentId: string | null
}) {
  return (
    input.toolId === "preview_ppt_deck" &&
    input.source === "first_party" &&
    input.executionContext !== "workflow" &&
    input.agentId === AI_ENTRY_BACKGROUND_PPT_AGENT_ID
  )
}

async function enqueueBackgroundPptPreviewTask(input: {
  user: AuthUser
  conversationId: string
  conversationScope: AiEntryConversationScope
  agentId: string
  toolCallId: string
  preparedInput: Record<string, unknown>
  isZh: boolean
  selectedTemplateId?: string | null
  recommendedTemplates?: unknown[]
}) {
  const task = await enqueueAssistantTask({
    userId: input.user.id,
    workflowName: "ai_entry_ppt_preview",
    payload: {
      kind: "ai_entry_ppt_preview",
      userId: input.user.id,
      conversationId: input.conversationId,
      conversationScope: input.conversationScope,
      agentId: input.agentId,
      toolCallId: input.toolCallId,
      input: input.preparedInput,
      isZh: input.isZh,
    },
  })

  return {
    ok: true,
    status: "queued",
    message: input.isZh
      ? "PPT 已切换为后台生成 SVG 预览。系统会继续轮询并在完成后回填预览结果；只有在导出下载时才会继续生成可编辑 PPTX，复杂或长页数 deck 可能需要十几分钟。"
      : "PPT generation has moved to background SVG preview generation. The system will keep polling and fill the preview back in when it completes; editable PPTX generation continues only when the user exports the deck, and complex or longer decks can still take many minutes.",
    ...(input.selectedTemplateId ? { selectedTemplateId: input.selectedTemplateId } : {}),
    ...(Array.isArray(input.recommendedTemplates) && input.recommendedTemplates.length > 0
      ? { recommendedTemplates: input.recommendedTemplates }
      : {}),
    backgroundTask: {
      taskId: String(task.id),
      conversationId: input.conversationId,
      toolName: "preview_ppt_deck",
      status: "queued",
    },
  }
}

function maybeApplyDefaultBackgroundPptTemplateSelection(input: {
  toolId: string
  preparedInput: unknown
  agentId: string | null
  executionContext?: "chat" | "workflow"
}) {
  if (
    input.toolId !== "preview_ppt_deck" ||
    input.agentId !== AI_ENTRY_BACKGROUND_PPT_AGENT_ID ||
    input.executionContext === "workflow" ||
    !input.preparedInput ||
    typeof input.preparedInput !== "object"
  ) {
    return {
      preparedInput: input.preparedInput,
      selectedTemplateId: null,
      recommendedTemplates: [] as Array<Record<string, unknown>>,
    }
  }

  const record = input.preparedInput as Record<string, unknown>
  const selectedTemplateId = readOptionalString(record.templateId)
  if (selectedTemplateId && isPptMasterLibraryTemplateSupported(selectedTemplateId)) {
    return {
      preparedInput: record,
      selectedTemplateId,
      recommendedTemplates: [] as Array<Record<string, unknown>>,
    }
  }

  const prompt = readOptionalString(record.prompt) || readOptionalString(record.sourcePrompt) || ""
  const recommendedTemplates = buildPptMasterRecommendedTemplateSummaries(
    {
      prompt,
      researchBrief: readPptPreparedResearchBrief(record.researchBrief),
      scenario: normalizePptPreparedScenario(record.scenario),
      language: normalizePptPreparedLanguage(record.language),
      pageCount: typeof record.pageCount === "number" && Number.isFinite(record.pageCount)
        ? record.pageCount
        : undefined,
    },
    {
      allowedTemplateIds: getPptWorkerSupportedTemplateIds(),
    },
  )
  const defaultTemplateId = recommendedTemplates[0]?.templateId?.trim() || null
  if (defaultTemplateId) {
    return {
      preparedInput: {
        ...record,
        templateMode: "single-template",
        templateId: defaultTemplateId,
      },
      selectedTemplateId: defaultTemplateId,
      recommendedTemplates: recommendedTemplates as Array<Record<string, unknown>>,
    }
  }

  return {
    preparedInput: record,
    selectedTemplateId: null,
    recommendedTemplates: [] as Array<Record<string, unknown>>,
  }
}

function filterToolSet(tools: ToolSet, allowedIds: Set<string>) {
  const selected: Record<string, unknown> = {}

  for (const [toolId, toolDef] of Object.entries((tools || {}) as Record<string, unknown>)) {
    if (!allowedIds.has(toolId)) continue
    selected[toolId] = toolDef
  }

  return selected as ToolSet
}

function wrapToolSet(params: {
  tools: ToolSet
  source: ToolSource
  currentUser: AuthUser
  selectedSkills: AiEntrySkillDefinition[]
  timeoutMs: number
  messageContents?: string[]
  conversationScope: AiEntryConversationScope
  pptBriefState: PptBriefState | null
  latestPreviewContext: ReturnType<typeof extractLatestPptPreviewContext>
  latestTemplateRecommendationContext: ReturnType<typeof extractLatestPptTemplateRecommendationContext>
  latestUserPrompt?: string | null
  executionContext?: "chat" | "workflow"
  auditContext: {
    traceId: string
    conversationId: string
    agentId: string | null
    userId: number
    enterpriseId: number | null
  }
}): ToolSet {
  const skillByToolId = new Map<string, string>()
  let lastResearchBrief =
    extractLatestResearchBriefContextFromContents(params.messageContents) ||
    buildResearchBriefFromAttachmentContent({
      latestUserPrompt: params.latestUserPrompt,
      messageContents: params.messageContents,
    })
  let latestPreviewContextForTurn = params.latestPreviewContext
  const latestTemplateRecommendationContextForTurn = params.latestTemplateRecommendationContext

  for (const skill of params.selectedSkills) {
    for (const toolId of skill.toolIds) {
      skillByToolId.set(toolId, skill.id)
    }
  }

  const wrapped: Record<string, unknown> = {}
  for (const [toolId, rawTool] of Object.entries((params.tools || {}) as Record<string, unknown>)) {
    const sourceTool = rawTool as AiSdkToolLike
    if (typeof sourceTool.execute !== "function") continue

    wrapped[toolId] = tool({
      description: sourceTool.description,
      inputSchema: sourceTool.inputSchema as any,
      ...(sourceTool.providerOptions ? { providerOptions: sourceTool.providerOptions as any } : {}),
      ...(sourceTool.onInputStart ? { onInputStart: sourceTool.onInputStart as any } : {}),
      ...(sourceTool.onInputDelta ? { onInputDelta: sourceTool.onInputDelta as any } : {}),
      ...(sourceTool.onInputAvailable ? { onInputAvailable: sourceTool.onInputAvailable as any } : {}),
      execute: async (input: unknown, options: unknown) => {
        const startedAt = Date.now()
        const skillId = skillByToolId.get(toolId) || null
        const exportReadyInput = maybeInjectPptExportContext(toolId, input, latestPreviewContextForTurn)
        const templateReadyInput = maybeInjectPptTemplateSelection({
          toolId,
          rawInput: exportReadyInput,
          latestTemplateRecommendationContext: latestTemplateRecommendationContextForTurn,
          latestUserPrompt: params.latestUserPrompt,
          agentId: params.auditContext.agentId,
          executionContext: params.executionContext,
        })
        const sourcePromptReadyInput = maybeInjectPptSourcePrompt({
          toolId,
          rawInput: templateReadyInput,
          latestUserPrompt: params.latestUserPrompt,
        })
        const effectiveInput = maybeInjectResearchBrief(toolId, sourcePromptReadyInput, lastResearchBrief)
        const preparedPreviewInput = maybePreparePptPreviewInput(
          toolId,
          effectiveInput,
          params.pptBriefState,
          {
            agentId: params.auditContext.agentId,
            executionContext: params.executionContext,
            latestUserPrompt: params.latestUserPrompt,
            latestTemplateRecommendationContext: latestTemplateRecommendationContextForTurn,
          },
        )
        console.info("ai-entry.tool.audit.start", {
          ...params.auditContext,
          toolId,
          source: params.source,
          skillId,
          inputSummary: summarizeToolInput(preparedPreviewInput.ok ? preparedPreviewInput.input : effectiveInput),
        })

        try {
          if (!preparedPreviewInput.ok) {
            console.warn("ai-entry.tool.audit.blocked", {
              ...params.auditContext,
              toolId,
              source: params.source,
              skillId,
              elapsedMs: Date.now() - startedAt,
              errorCode: preparedPreviewInput.error.code,
              missingFields: preparedPreviewInput.missingFields,
            })
            return {
              ok: false,
              error: preparedPreviewInput.error,
              missingFields: preparedPreviewInput.missingFields,
              suggestedBrief: preparedPreviewInput.suggestedBrief,
              ...(preparedPreviewInput && "recommendedTemplates" in preparedPreviewInput
                ? { recommendedTemplates: (preparedPreviewInput as { recommendedTemplates?: unknown }).recommendedTemplates }
                : {}),
            }
          }
          const backgroundPreviewSelection = maybeApplyDefaultBackgroundPptTemplateSelection({
            toolId,
            preparedInput: preparedPreviewInput.input,
            agentId: params.auditContext.agentId,
            executionContext: params.executionContext,
          })
          if (
            shouldRunPptPreviewInBackground({
              toolId,
              source: params.source,
              executionContext: params.executionContext,
              agentId: params.auditContext.agentId,
            })
          ) {
            const backgroundResult = await enqueueBackgroundPptPreviewTask({
              user: params.currentUser,
              conversationId: params.auditContext.conversationId,
              conversationScope: params.conversationScope,
              agentId: params.auditContext.agentId || AI_ENTRY_BACKGROUND_PPT_AGENT_ID,
              toolCallId:
                readOptionalString(
                  options && typeof options === "object"
                    ? (options as { toolCallId?: unknown }).toolCallId
                    : null,
                ) || toolId,
              preparedInput: backgroundPreviewSelection.preparedInput as Record<string, unknown>,
              isZh: /[\u4e00-\u9fff]/u.test(
                typeof params.latestUserPrompt === "string" ? params.latestUserPrompt : "",
              ),
              selectedTemplateId: backgroundPreviewSelection.selectedTemplateId,
              recommendedTemplates: backgroundPreviewSelection.recommendedTemplates,
            })
            console.info("ai-entry.tool.audit.queued", {
              ...params.auditContext,
              toolId,
              source: params.source,
              skillId,
              elapsedMs: Date.now() - startedAt,
              taskId: backgroundResult.backgroundTask.taskId,
              selectedTemplateId: backgroundPreviewSelection.selectedTemplateId,
            })
            return backgroundResult
          }
          const result = await withTimeout(
            Promise.resolve(sourceTool.execute?.(preparedPreviewInput.input, options)),
            Math.max(params.timeoutMs, DEFAULT_TOOL_TIMEOUT_MS),
          )
          if (toolId === "web_search") {
            lastResearchBrief = buildResearchBriefFromWebSearchResult(result)
          }
          if (toolId === "preview_ppt_deck") {
            latestPreviewContextForTurn =
              extractPreviewContextFromToolResult(result) ?? latestPreviewContextForTurn
          }
          if (toolId === "export_ppt_deck" && isMissingPreviewSessionResult(result)) {
            latestPreviewContextForTurn = null
          }
          const artifacts = extractAiEntryArtifactsFromToolResult({
            toolName: toolId,
            result,
          })
          console.info("ai-entry.tool.audit.done", {
            ...params.auditContext,
            toolId,
            source: params.source,
            skillId,
            elapsedMs: Date.now() - startedAt,
            artifactIds: artifacts.map((artifact) => artifact.artifactId).filter((value) => typeof value === "number"),
            outputSummary: summarizeToolOutput(result),
          })
          return result
        } catch (error) {
          const normalizedError = normalizeToolError(error)
          console.warn("ai-entry.tool.audit.failed", {
            ...params.auditContext,
            toolId,
            source: params.source,
            skillId,
            elapsedMs: Date.now() - startedAt,
            errorCode: normalizedError.code,
            errorMessage: normalizedError.message,
          })
          return {
            ok: false,
            error: normalizedError,
          }
        }
      },
    })
  }

  return wrapped as ToolSet
}

function getSelectedSkillToolIds(selectedSkills: AiEntrySkillDefinition[]) {
  return new Set(selectedSkills.flatMap((skill) => skill.toolIds))
}

function resolvePptToolAccess(input: {
  agentId: string | null
  executionContext?: "chat" | "workflow"
  conversationState?: AiEntryConversationState | null
}) {
  if (!isAiEntryPptAgentId(input.agentId)) {
    return {
      exportEnabled: true,
    }
  }

  if (input.executionContext === "workflow") {
    return {
      exportEnabled: true,
    }
  }

  const state = input.conversationState?.ppt

  return {
    exportEnabled:
      state?.phase === "preview-ready" ||
      state?.phase === "exported",
  }
}

function getAllowedMcpDefinitions(policy: AiEntryAgentRuntimePolicy) {
  const allowedServerIds = new Set(policy.allowedMcpServerIds)
  return getAiEntryMcpServerDefinitions().filter((definition) => allowedServerIds.has(definition.id))
}

export async function buildAiEntryToolRegistry(input: {
  currentUser: AuthUser
  policy: AiEntryAgentRuntimePolicy
  selectedSkills: AiEntrySkillDefinition[]
  skillsEnabled: boolean
  enabledToolNames: string[] | null
  executionContext?: "chat" | "workflow"
  conversationScope?: AiEntryConversationScope
  pptBriefState?: PptBriefState | null
  conversationState?: AiEntryConversationState | null
  latestUserPrompt?: string | null
  messageContents?: string[]
  selectedPreviewModel?: string | null
  selectedPreviewProviderId?: string | null
  auditContext: {
    traceId: string
    conversationId: string
    agentId: string | null
  }
}): Promise<AiEntryToolRegistryResult> {
  const toolLoadWarnings: string[] = []
  const policyAllowedToolIds = new Set(input.policy.allowedToolIds)
  const explicitToolAllowlist =
    input.enabledToolNames ? new Set(input.enabledToolNames) : null
  const selectedSkillToolIds = getSelectedSkillToolIds(input.selectedSkills)
  const firstPartyDesiredToolIds = new Set<string>()
  const conversationState =
    input.conversationState ??
    resolveAiEntryConversationStateFromContents(input.messageContents)
  const pptConversationState = conversationState.ppt
  const latestPreviewContext = pptConversationState.latestPreview
  const latestTemplateRecommendationContext = (input.messageContents || [])
    .map((content) => extractLatestPptTemplateRecommendationContext(content))
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .at(-1) ?? null
  const pptToolAccess = resolvePptToolAccess({
    agentId: input.auditContext.agentId,
    executionContext: input.executionContext ?? "chat",
    conversationState,
  })

  if (!explicitToolAllowlist && policyAllowedToolIds.has("web_search")) {
    firstPartyDesiredToolIds.add("web_search")
  }

  if (input.skillsEnabled) {
    for (const toolId of selectedSkillToolIds) {
      if (!policyAllowedToolIds.has(toolId)) continue
      if (explicitToolAllowlist && !explicitToolAllowlist.has(toolId)) continue
      if (toolId === "export_ppt_deck" && !pptToolAccess.exportEnabled) {
        continue
      }
      firstPartyDesiredToolIds.add(toolId)
    }
  }

  if (explicitToolAllowlist && explicitToolAllowlist.has("web_search") && policyAllowedToolIds.has("web_search")) {
    firstPartyDesiredToolIds.add("web_search")
  }

  const firstPartyTools = filterToolSet(
    {
      ...buildAiEntryWebSearchTools(),
      ...buildAiEntryPptTools({
        currentUser: input.currentUser,
        agentId: input.auditContext.agentId,
        selectedPreviewModel: input.selectedPreviewModel,
        selectedPreviewProviderId: input.selectedPreviewProviderId,
      }),
    },
    firstPartyDesiredToolIds,
  )

  let loadedMcpTools = {} as ToolSet
  let closeTools: (() => Promise<void>) | null = null
  let selectedMcpServerIds: string[] = []

  if (input.skillsEnabled && input.policy.allowedMcpServerIds.length > 0) {
    const allowedDefinitions = getAllowedMcpDefinitions(input.policy)
    if (allowedDefinitions.length > 0) {
      const loaded = await loadAiEntryMcpTools({
        serverDefinitions: allowedDefinitions as AiEntryMcpServerDefinition[],
        allowedToolNames: input.enabledToolNames ?? undefined,
      })
      loadedMcpTools = loaded.tools
      closeTools = loaded.close
      selectedMcpServerIds = loaded.loadedServerIds
      toolLoadWarnings.push(...loaded.warnings)
    }
  }

  const wrappedFirstPartyTools = wrapToolSet({
    tools: firstPartyTools,
    source: "first_party",
    currentUser: input.currentUser,
    selectedSkills: input.selectedSkills,
    timeoutMs: input.policy.maxRuntimeMs,
    messageContents: input.messageContents,
    conversationScope: input.conversationScope ?? "chat",
    pptBriefState: input.pptBriefState ?? null,
    latestPreviewContext,
    latestTemplateRecommendationContext,
    latestUserPrompt: input.latestUserPrompt,
    executionContext: input.executionContext,
    auditContext: {
      ...input.auditContext,
      userId: input.currentUser.id,
      enterpriseId: input.currentUser.enterpriseId,
    },
  })
  const wrappedMcpTools = wrapToolSet({
    tools: loadedMcpTools,
    source: "mcp",
    currentUser: input.currentUser,
    selectedSkills: input.selectedSkills,
    timeoutMs: input.policy.maxRuntimeMs,
    messageContents: input.messageContents,
    conversationScope: input.conversationScope ?? "chat",
    pptBriefState: input.pptBriefState ?? null,
    latestPreviewContext,
    latestTemplateRecommendationContext,
    latestUserPrompt: input.latestUserPrompt,
    executionContext: input.executionContext,
    auditContext: {
      ...input.auditContext,
      userId: input.currentUser.id,
      enterpriseId: input.currentUser.enterpriseId,
    },
  })

  const selectedTools = {
    ...wrappedFirstPartyTools,
    ...wrappedMcpTools,
  }

  return {
    selectedTools,
    selectedToolIds: Object.keys(selectedTools),
    toolChoice: undefined,
    closeTools,
    toolLoadWarnings,
    selectedMcpServerIds,
  }
}
