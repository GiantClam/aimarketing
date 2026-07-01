import "server-only"

import { tool, type ToolSet } from "ai"

import type { AuthUser } from "@/lib/auth/session"
import { type AiEntryAgentRuntimePolicy } from "@/lib/ai-entry/agent-runtime-policy"
import { extractAiEntryArtifactsFromToolResult } from "@/lib/ai-entry/artifact-runtime"
import { type AiEntryMcpServerDefinition, getAiEntryMcpServerDefinitions, loadAiEntryMcpTools } from "@/lib/ai-entry/mcp-tools"
import { buildAiEntryPptTools } from "@/lib/ai-entry/ppt-tools"
import { type AiEntrySkillDefinition } from "@/lib/ai-entry/skill-registry"
import { buildAiEntryWebSearchTools } from "@/lib/ai-entry/web-search-tool"

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
  closeTools: (() => Promise<void>) | null
  toolLoadWarnings: string[]
  selectedMcpServerIds: string[]
}

type ToolSource = "first_party" | "mcp"

const DEFAULT_TOOL_TIMEOUT_MS = 60_000
const MAX_RESEARCH_BRIEF_CHARS = 2_000

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

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function trimToLength(value: string, maxChars: number) {
  if (value.length <= maxChars) return value
  return `${value.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

type SearchResultLike = {
  title?: unknown
  url?: unknown
  snippet?: unknown
}

type WebSearchResultLike = {
  query?: unknown
  intent?: unknown
  results?: unknown
}

type StructuredResearchBrief = {
  topic: string
  keyFacts: string[]
  numericEvidence?: string[]
  risks?: string[]
  implications?: string[]
  sourceNotes?: string[]
  rawSummary?: string
}

function buildResearchBriefSummary(brief: StructuredResearchBrief) {
  const lines = [
    `Topic: ${brief.topic}`,
    brief.keyFacts.length ? `Key facts:\n- ${brief.keyFacts.join("\n- ")}` : null,
    brief.numericEvidence?.length ? `Numeric evidence:\n- ${brief.numericEvidence.join("\n- ")}` : null,
    brief.risks?.length ? `Risks:\n- ${brief.risks.join("\n- ")}` : null,
    brief.implications?.length ? `Implications:\n- ${brief.implications.join("\n- ")}` : null,
    brief.sourceNotes?.length ? `Source notes:\n- ${brief.sourceNotes.join("\n- ")}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")

  return trimToLength(lines, MAX_RESEARCH_BRIEF_CHARS)
}

function buildResearchBriefFromWebSearchResult(result: unknown): StructuredResearchBrief | null {
  if (!result || typeof result !== "object") return null

  const payload = result as WebSearchResultLike
  const query = readOptionalString(payload.query)
  const intent = readOptionalString(payload.intent)
  const results = Array.isArray(payload.results) ? payload.results : []

  if (!query || results.length === 0) {
    return null
  }

  const normalizedResults = results
    .map((item) => {
      const row = item as SearchResultLike
      return {
        title: readOptionalString(row?.title),
        url: readOptionalString(row?.url),
        snippet: readOptionalString(row?.snippet),
      }
    })
    .filter((item) => item.title || item.url || item.snippet)
    .slice(0, 4)

  if (normalizedResults.length === 0) {
    return null
  }

  const keyFacts = normalizedResults
    .map((item) => normalizeWhitespace(item.snippet || item.title || ""))
    .filter(Boolean)
    .slice(0, 4)

  const sourceNotes = normalizedResults
    .map((item) => {
      const title = item.title || "Untitled source"
      return item.url ? `${title} - ${item.url}` : title
    })
    .slice(0, 4)

  const brief: StructuredResearchBrief = {
    topic: query,
    keyFacts,
    sourceNotes,
  }

  if (intent) {
    brief.implications = [intent]
  }

  brief.rawSummary = buildResearchBriefSummary(brief)

  return brief
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
  selectedSkills: AiEntrySkillDefinition[]
  timeoutMs: number
  auditContext: {
    traceId: string
    conversationId: string
    agentId: string | null
    userId: number
    enterpriseId: number | null
  }
}): ToolSet {
  const skillByToolId = new Map<string, string>()
  let lastResearchBrief: StructuredResearchBrief | null = null

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
        const effectiveInput = maybeInjectResearchBrief(toolId, input, lastResearchBrief)
        console.info("ai-entry.tool.audit.start", {
          ...params.auditContext,
          toolId,
          source: params.source,
          skillId,
          inputSummary: summarizeToolInput(effectiveInput),
        })

        try {
          const result = await withTimeout(
            Promise.resolve(sourceTool.execute?.(effectiveInput, options)),
            Math.max(params.timeoutMs, DEFAULT_TOOL_TIMEOUT_MS),
          )
          if (toolId === "web_search") {
            lastResearchBrief = buildResearchBriefFromWebSearchResult(result)
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

  if (!explicitToolAllowlist && policyAllowedToolIds.has("web_search")) {
    firstPartyDesiredToolIds.add("web_search")
  }

  if (input.skillsEnabled) {
    for (const toolId of selectedSkillToolIds) {
      if (!policyAllowedToolIds.has(toolId)) continue
      if (explicitToolAllowlist && !explicitToolAllowlist.has(toolId)) continue
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
    selectedSkills: input.selectedSkills,
    timeoutMs: input.policy.maxRuntimeMs,
    auditContext: {
      ...input.auditContext,
      userId: input.currentUser.id,
      enterpriseId: input.currentUser.enterpriseId,
    },
  })
  const wrappedMcpTools = wrapToolSet({
    tools: loadedMcpTools,
    source: "mcp",
    selectedSkills: input.selectedSkills,
    timeoutMs: input.policy.maxRuntimeMs,
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
    closeTools,
    toolLoadWarnings,
    selectedMcpServerIds,
  }
}
