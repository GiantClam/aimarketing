import type { EnterpriseKnowledgeContext } from "@/lib/knowledge/types"
import { randomUUID } from "node:crypto"
import type { AiEntryProviderId } from "@/lib/ai-entry/provider-routing"
import { resolveAiEntryOpenCodeProvider } from "@/lib/ai-entry/provider-routing"
import { buildAgentRuntimeInput } from "@/lib/ai-entry/runtime/context-builder"
import { runOpenCodeAgent } from "@/lib/ai-entry/runtime/opencode-adapter"
import { resolveWriterOpenCodeRuntimeProfile } from "@/lib/ai-entry/runtime/profile-store"
import { isWriterTitleOnlyRevisionRequest, reconcileWriterRevisionResult } from "@/lib/writer/revision-guard"
import {
  WRITER_PLATFORM_CONFIG,
  type WriterContentType,
  type WriterLanguage,
  type WriterMode,
  type WriterPlatform,
} from "@/lib/writer/config"
import { isWriterR2Available } from "@/lib/writer/r2"
import { resolveWriterOpenCodeSkillIds } from "@/lib/writer/skill-catalog"
import { resolveWriterPlatformBinding } from "@/lib/writer/platform-registry"
import type {
  WriterHistoryEntry,
  WriterRetrievalStrategy,
  WriterRoutingDecision,
  WriterTurnDiagnostics,
} from "@/lib/writer/types"
import {
  buildWriterRecoveryContext,
  runWriterRuntimeWithRecovery,
  type WriterRuntimeContext,
} from "@/lib/writer/runtime/session-runtime"
import { validateWriterSubmitResult, type WriterSubmitResult } from "@/lib/writer/writer-result"

const WRITER_ENABLE_WEB_RESEARCH = process.env.WRITER_ENABLE_WEB_RESEARCH !== "false"
const WRITER_REQUIRE_WEB_RESEARCH = process.env.WRITER_REQUIRE_WEB_RESEARCH === "true"

type SearchItem = {
  title: string
  snippet: string
  link: string
}

type WriterResearchResult = {
  items: SearchItem[]
  extracts: Array<{ url: string; content: string }>
  status: "ready" | "disabled" | "timed_out" | "unavailable" | "skipped"
}

type WriterBriefFieldId = "contentType" | "targetPlatform" | "topic" | "audience" | "objective" | "tone"

type WriterConversationBrief = {
  topic: string
  audience: string
  objective: string
  tone: string
  constraints: string
}

type WriterBriefPlan = {
  brief: WriterConversationBrief
  routing: WriterRoutingDecision
  missingFields: WriterBriefFieldId[]
  turnCount: number
  maxTurns: number
  readyForGeneration: boolean
  selectedSkill: {
    id: "writer-briefing" | "writer-platform-generation"
    label: string
    stage: "briefing" | "execution"
  }
}

export type WriterRuntimeUsage = {
  inputTokens: number
  outputTokens: number
  costUsd: number
  toolCallCount: number
}

function emptyWriterRuntimeUsage(): WriterRuntimeUsage {
  return { inputTokens: 0, outputTokens: 0, costUsd: 0, toolCallCount: 0 }
}

function hasWriterResponse(answer: string, writerResult: WriterSubmitResult | null) {
  // A tool-only turn can legitimately have no text_delta. The structured
  // writer_submit_result is the authoritative response in that case.
  return Boolean(answer.trim() || writerResult)
}

async function runWriterOpenCodeText(params: {
  systemPrompt: string
  userPrompt: string
  history?: WriterHistoryEntry[]
  selectedSkillIds: string[]
  writerPhase: "briefing" | "draft"
  allowNetwork: boolean
  userId?: number
  conversationId?: string | null
  enterpriseId?: number | null
  selectedProviderId?: AiEntryProviderId | null
  selectedModelId?: string | null
  writerContext?: WriterRuntimeContext | null
}) {
  const runtimeProfile = resolveWriterOpenCodeRuntimeProfile()
  if (!runtimeProfile.enabled || runtimeProfile.backend !== "railway-opencode") {
    throw new Error("writer_opencode_runtime_not_configured")
  }

  const provider = resolveAiEntryOpenCodeProvider({
    providerId: params.selectedProviderId,
    modelId: params.selectedModelId,
  })
  if (!provider) throw new Error("writer_opencode_provider_not_configured")

  const historyMessages = (params.history || []).flatMap((entry) => {
    if (entry.role && entry.content) {
      return [{ role: entry.role, content: entry.content.trim() }]
    }
    return [
      ...(entry.query.trim() ? [{ role: "user" as const, content: entry.query.trim() }] : []),
      ...(entry.answer.trim() ? [{ role: "assistant" as const, content: entry.answer.trim() }] : []),
    ]
  }).filter((entry) => entry.content)
  const sessionKey = params.writerContext?.sessionKey || `sess-${randomUUID().replaceAll("-", "").padEnd(40, "0").slice(0, 40)}`
  const runtimeInput = buildAgentRuntimeInput({
    runId: randomUUID(),
    sessionKey,
    conversationId: params.conversationId || null,
    conversationRevision: params.writerContext?.activeDraft?.revision ?? null,
    writerContext: params.writerContext,
    enterpriseId: params.enterpriseId || null,
    userId: params.userId || 0,
    agentId: "writer",
    writerPhase: params.writerPhase,
    selectedSkillIds: params.selectedSkillIds,
    systemPrompt: params.systemPrompt,
    messages: [...historyMessages, { role: "user", content: params.userPrompt }],
    attachments: [],
    artifactContext: [],
    workflowContext: null,
    modelHint: `${provider.providerId}/${provider.modelId}`,
    allowNetwork: params.allowNetwork,
    profileLimits: {
      maxArtifacts: 0,
      maxArtifactBytes: 0,
      maxArtifactTotalBytes: 0,
    },
  })

  let answer = ""
  let writerResult: WriterSubmitResult | null = null
  const activatedSkillIds: string[] = []
  let resultToolCallCount = 0
  const countedToolCallIds = new Set<string>()
  const usage = emptyWriterRuntimeUsage()
  for await (const event of runOpenCodeAgent(runtimeInput, {
    runnerUrl: runtimeProfile.runnerUrl,
    backend: "railway-opencode",
    railway: true,
    timeoutMs: runtimeProfile.timeoutMs,
    provider,
    session: runtimeProfile.sessionEnabled,
  })) {
    if (event.event === "text_delta") answer += event.delta
    if (event.event === "writer_result_submitted") {
      writerResult = validateWriterSubmitResult(event.result)
      resultToolCallCount = Math.max(1, resultToolCallCount)
    }
    if (event.event === "skill_activated" && !activatedSkillIds.includes(event.skillId)) activatedSkillIds.push(event.skillId)
    if (event.event === "tool_event" && event.phase === "started") {
      const toolCallKey = event.toolCallId ? `${event.tool}:${event.toolCallId}` : null
      const isNewToolCall = !toolCallKey || !countedToolCallIds.has(toolCallKey)
      if (toolCallKey) countedToolCallIds.add(toolCallKey)
      if (isNewToolCall && event.tool === "writer_submit_result") resultToolCallCount += 1
      if (isNewToolCall) usage.toolCallCount += 1
    }
    if (event.event === "usage") {
      if (Number.isFinite(event.inputTokens) && (event.inputTokens || 0) >= 0) usage.inputTokens += event.inputTokens || 0
      if (Number.isFinite(event.outputTokens) && (event.outputTokens || 0) >= 0) usage.outputTokens += event.outputTokens || 0
      if (Number.isFinite(event.costUsd) && (event.costUsd || 0) >= 0) usage.costUsd += event.costUsd || 0
    }
    if (event.event === "runtime_error") throw new Error(`writer_opencode_failed:${event.message}`)
  }
  if (!hasWriterResponse(answer, writerResult)) throw new Error("writer_opencode_empty_response")
  return { answer, usage, writerResult, activatedSkillIds, resultToolCallCount }
}

export type WriterSkillsTurnResult =
  | ({
      outcome: "needs_clarification"
      operation: WriterSubmitResult["operation"]
      answer: string
      diagnostics: WriterTurnDiagnostics
      usage?: WriterRuntimeUsage
      assetIntents?: WriterSubmitResult["assetIntents"]
    } & WriterBriefPlan)
  | ({
      outcome: "draft_ready"
      operation: WriterSubmitResult["operation"]
      answer: string
      diagnostics: WriterTurnDiagnostics
      usage?: WriterRuntimeUsage
      assetIntents?: WriterSubmitResult["assetIntents"]
    } & WriterBriefPlan)


function createEmptyWriterBrief(): WriterConversationBrief {
  return {
    topic: "",
    audience: "",
    objective: "",
    tone: "",
    constraints: "",
  }
}


function buildWriterTurnDiagnostics(params: {
  retrievalStrategy: WriterRetrievalStrategy
  enterpriseKnowledge: EnterpriseKnowledgeContext | null
  enterpriseKnowledgeEnabled: boolean
  research: WriterResearchResult
  routing?: WriterRoutingDecision | null
  memoryRetrievedCount?: number
  memoryAppliedIds?: string[]
  soulCardVersion?: string | null
  soulCardConfidence?: number | null
  memoryScope?: string | null
}): WriterTurnDiagnostics {
  const enterpriseTitles = [
    ...new Set((params.enterpriseKnowledge?.snippets || []).map((snippet) => snippet.title).filter(Boolean)),
  ].slice(0, 4)

  return {
    retrievalStrategy: params.retrievalStrategy,
    enterpriseKnowledgeEnabled: params.enterpriseKnowledgeEnabled,
    enterpriseKnowledgeUsed: Boolean(params.enterpriseKnowledge?.snippets?.length),
    enterpriseDatasetCount: params.enterpriseKnowledge?.datasetsUsed?.length || 0,
    enterpriseSourceCount: params.enterpriseKnowledge?.snippets?.length || 0,
    enterpriseDatasets: [
      ...new Set((params.enterpriseKnowledge?.datasetsUsed || []).map((dataset) => dataset.datasetName).filter(Boolean)),
    ].slice(0, 3),
    enterpriseTitles,
    webResearchUsed: params.research.status === "ready" && params.research.items.length > 0,
    webResearchStatus: params.research.status,
    webSourceCount: params.research.items.length,
    webSourceUrls: [...new Set(params.research.items.map((item) => item.link).filter((link): link is string => Boolean(link)))].slice(0, 20),
    memoryRetrievedCount: Math.max(0, params.memoryRetrievedCount || 0),
    memoryAppliedIds: params.memoryAppliedIds || [],
    soulCardVersion: params.soulCardVersion ?? null,
    soulCardConfidence: params.soulCardConfidence ?? null,
    memoryScope: params.memoryScope ?? null,
    routing: params.routing || null,
  }
}








function shouldUseWriterE2EFixtures() {
  return process.env.WRITER_E2E_FIXTURES === "true"
}


function createEmptyResearchResult(status: WriterResearchResult["status"]): WriterResearchResult {
  return {
    items: [],
    extracts: [],
    status,
  }
}

type WriterFixtureScenario = "clarification" | "create" | "revise" | "translate" | "adapt_platform" | "research"


function safeBuildFixtureKnowledgeBlock(enterpriseKnowledge?: EnterpriseKnowledgeContext | null) {
  if (!enterpriseKnowledge?.snippets?.length) return ""
  return `\n## \u4f01\u4e1a\u77e5\u8bc6\u8981\u70b9\n\n${enterpriseKnowledge.snippets.map((snippet) => `- ${snippet.content}`).join("\n")}\n`
}

function safeBuildFixtureDraft(
  platform: WriterPlatform,
  mode: WriterMode,
  preferredLanguage: WriterLanguage,
  enterpriseKnowledge?: EnterpriseKnowledgeContext | null,
) {
  const language = preferredLanguage === "auto" ? "zh" : preferredLanguage
  const knowledgeBlock = safeBuildFixtureKnowledgeBlock(enterpriseKnowledge)
  if (language !== "zh") {
    return `# Writer Fixture Draft

## Summary

This is a deterministic fixture draft for automated regression.

> Use this fixture only in E2E mode.

- Platform: ${platform}
- Mode: ${mode}
- Language: ${language}
${knowledgeBlock}
![Cover](writer-asset://cover)
`
  }

  if (platform === "x" && mode === "thread") {
    return `### Segment 1
\u771f\u6b63\u7684 AI \u589e\u957f\u74f6\u9888\uff0c\u5f80\u5f80\u4e0d\u662f\u6a21\u578b\u672c\u8eab\uff0c\u800c\u662f\u80fd\u5426\u63a5\u5165\u771f\u5b9e\u5de5\u4f5c\u6d41\u3002

### Segment 2
\u5f88\u591a\u56e2\u961f\u628a\u7cbe\u529b\u82b1\u5728\u8ffd\u65b0\u6a21\u578b\uff0c\u5374\u5ffd\u7565\u4e86\u7528\u6237\u8def\u5f84\u3001\u6570\u636e\u56de\u6d41\u548c\u81ea\u52a8\u5316\u95ed\u73af\u3002

### Segment 3
> \u5982\u679c\u4e00\u4e2a Agent \u8fd8\u4e0d\u80fd\u7a33\u5b9a\u5b8c\u6210\u771f\u5b9e\u4efb\u52a1\uff0c\u5b83\u5c31\u4ecd\u7136\u53ea\u662f\u4e00\u4e2a\u804a\u5929\u754c\u9762\u3002

### Segment 4
- \u5148\u9009\u4e00\u4e2a\u7a84\u800c\u6df1\u7684\u573a\u666f
- \u628a\u5de5\u4f5c\u6d41\u8dd1\u901a
- \u518d\u56de\u5934\u4f18\u5316\u6a21\u578b

![Cover](writer-asset://cover)

### Segment 5
\u5f53\u5de5\u7a0b\u3001\u6d41\u7a0b\u548c\u53cd\u9988\u673a\u5236\u6392\u5728\u524d\u9762\uff0c\u589e\u957f\u6548\u7387\u5f80\u5f80\u4f1a\u66f4\u5feb\u63d0\u5347\u3002

### Segment 6
${enterpriseKnowledge?.snippets?.[0]?.content || "\u5982\u679c\u4f60\u4e5f\u5728\u505a AI \u4ea7\u54c1\uff0c\u5148\u4ece\u6700\u96be\u7684\u771f\u5b9e\u5de5\u4f5c\u6d41\u95ee\u9898\u5f00\u59cb\u3002"}
`
  }

  return `# AI \u521b\u4e1a\u56e2\u961f\u5982\u4f55\u907f\u514d\u5185\u5bb9\u7a7a\u8f6c

${knowledgeBlock}
\u56e2\u961f\u771f\u6b63\u7f3a\u7684\uff0c\u5f80\u5f80\u4e0d\u662f\u201c\u5199\u5f97\u66f4\u591a\u201d\uff0c\u800c\u662f\u201c\u5199\u5b8c\u4ee5\u540e\u80fd\u6c89\u6dc0\u4e3a\u589e\u957f\u8d44\u4ea7\u201d\u3002

## \u5148\u660e\u786e\u5185\u5bb9\u670d\u52a1\u7684\u4e1a\u52a1\u76ee\u6807

\u5f88\u591a\u56e2\u961f\u4e00\u5f00\u59cb\u5c31\u8ffd\u6c42\u9009\u9898\u6570\u91cf\uff0c\u5374\u6ca1\u6709\u5148\u5b9a\u4e49\u5185\u5bb9\u5230\u5e95\u8981\u670d\u52a1\u54ea\u4e00\u6bb5\u4e1a\u52a1\u94fe\u8def\uff0c\u4f8b\u5982\u83b7\u5ba2\u3001\u6559\u80b2\u3001\u8f6c\u5316\uff0c\u8fd8\u662f\u5ba2\u6237\u6210\u529f\u3002

> \u6ca1\u6709\u4e1a\u52a1\u76ee\u6807\u7684\u5185\u5bb9\u751f\u4ea7\uff0c\u901a\u5e38\u53ea\u4f1a\u53d8\u6210\u5185\u90e8\u81ea\u6211\u611f\u52a8\u3002

## \u5efa\u7acb\u7a33\u5b9a\u7684\u5185\u5bb9\u590d\u7528\u673a\u5236

\u628a\u4e00\u6b21\u8c03\u7814\u62c6\u6210\u591a\u4e2a\u53ef\u590d\u7528\u8d44\u4ea7\uff0c\u4f8b\u5982\u6587\u7ae0\u3001\u793e\u5a92\u6458\u8981\u3001\u9500\u552e\u8ddf\u8fdb\u7d20\u6750\u548c\u77e5\u8bc6\u5e93\u66f4\u65b0\uff0c\u624d\u80fd\u8ba9\u5185\u5bb9\u771f\u6b63\u6c89\u6dc0\u4e0b\u6765\u3002

**\u5173\u952e\u505a\u6cd5\uff1a** \u6bcf\u6b21\u53d1\u5e03\u540e\u90fd\u8bb0\u5f55\u9605\u8bfb\u3001\u8f6c\u53d1\u3001\u54a8\u8be2\u548c\u8f6c\u5316\u53cd\u9988\u3002

## \u7528\u56fa\u5b9a\u5de5\u4f5c\u6d41\u964d\u4f4e\u5185\u5bb9\u6ce2\u52a8

- \u5148\u505a\u7814\u7a76\u548c\u8d44\u6599\u5f52\u7eb3
- \u518d\u4ea7\u51fa\u9996\u7a3f\u5e76\u786e\u8ba4\u6587\u6848
- \u6700\u540e\u751f\u6210\u914d\u56fe\u5e76\u7edf\u4e00\u9884\u89c8

![Cover](writer-asset://cover)

## \u8ba9\u5185\u5bb9\u4e0e\u56e2\u961f\u534f\u4f5c\u5f62\u6210\u95ed\u73af

\u8fd0\u8425\u3001\u9500\u552e\u548c\u4ea7\u54c1\u90fd\u5e94\u8be5\u80fd\u4ece\u540c\u4e00\u7bc7\u6587\u7ae0\u91cc\u63d0\u53d6\u53ef\u7528\u4fe1\u606f\uff0c\u907f\u514d\u5185\u5bb9\u505c\u7559\u5728\u5355\u70b9\u4ea7\u51fa\u3002

\u5199\u5230\u6700\u540e\uff0c\u771f\u6b63\u6709\u4ef7\u503c\u7684\u5185\u5bb9\uff0c\u4e0d\u662f\u66f4\u82b1\u54e8\uff0c\u800c\u662f\u66f4\u80fd\u5e2e\u52a9\u56e2\u961f\u7a33\u5b9a\u590d\u7528\u3001\u6301\u7eed\u8f6c\u5316\u3002`
}

function splitMarkdownSections(markdown: string) {
  const lines = markdown.split("\n")
  const sections: Array<{ heading: string | null; lines: string[] }> = []
  let current: { heading: string | null; lines: string[] } = { heading: null, lines: [] }
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (current.lines.length > 0) sections.push(current)
      current = { heading: line.replace(/^##\s+/, "").trim(), lines: [line] }
      continue
    }
    current.lines.push(line)
  }
  if (current.lines.length > 0) sections.push(current)
  return sections
}

function ensureWechatCoverPlaceholder(markdown: string) {
  if (/writer-asset:\/\/cover(?![a-z0-9-])/iu.test(markdown)) return markdown
  const lines = markdown.split("\n")
  const titleIndex = lines.findIndex((line) => /^#\s+/u.test(line.trim()))
  const insertionIndex = titleIndex >= 0 ? titleIndex + 1 : 0
  lines.splice(insertionIndex, 0, "", "![Cover](writer-asset://cover)", "")
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

function _normalizeWechatTitle(markdown: string, languageLabel: string) {
  const fallbackTitle = languageLabel === "Chinese" ? "未命名文章" : "Untitled Article"
  const lines = markdown.split("\n")
  const titleIndex = lines.findIndex((line) => /^#\s+/.test(line))
  if (titleIndex >= 0) {
    const title = lines[titleIndex].replace(/^#\s+/, "").trim()
    const rest = lines.filter((_, index) => index !== titleIndex && !/^#\s+/.test(lines[index]))
    return [`# ${title || fallbackTitle}`, ...rest].join("\n").trim()
  }
  const firstContentIndex = lines.findIndex((line) => line.trim())
  if (firstContentIndex < 0) return `# ${fallbackTitle}`
  const title = lines[firstContentIndex].replace(/^#+\s*/, "").trim() || fallbackTitle
  const rest = lines.filter((_, index) => index !== firstContentIndex)
  return [`# ${title}`, ...rest].join("\n").trim()
}

function postProcessWriterDraft(
  platform: WriterPlatform,
  mode: WriterMode,
  markdown: string,
  languageLabel: string,
  options?: { ensureCoverPlaceholder?: boolean; preserveTitle?: boolean },
) {
  const normalized = markdown.replace(/\r\n/g, "\n").trim()
  if (platform !== "wechat" || mode !== "article") return normalized
  let next = options?.preserveTitle
    ? _normalizeWechatTitle(normalized, languageLabel)
    : safeNormalizeWechatTitle(normalized, languageLabel)
  next = safeStripWechatMetaSections(next)
  if (options?.ensureCoverPlaceholder) next = ensureWechatCoverPlaceholder(next)
  return next.replace(/\n{3,}/g, "\n\n").trim()
}

function safeStripWechatMetaSections(markdown: string) {
  const blockedHeadings = [
    "title options",
    "publishing notes",
    "image notes",
    "\u914d\u56fe\u8bf4\u660e",
    "\u56fe\u7247\u8bf4\u660e",
    "\u53d1\u5e03\u8bf4\u660e",
    "\u53d1\u5e03\u5efa\u8bae",
    "\u6807\u9898\u5907\u9009",
    "\u5907\u9009\u6807\u9898",
  ]
  return splitMarkdownSections(markdown)
    .filter((section) => {
      const heading = (section.heading || "").toLowerCase()
      return !blockedHeadings.some((blocked) => heading.includes(blocked))
    })
    .map((section) => section.lines.join("\n").trim())
    .filter(Boolean)
    .join("\n\n")
}

function safeNormalizeWechatTitle(markdown: string, languageLabel: string) {
  type KeywordSignal = { value: string; confidence: "high" | "low" }
  const normalizeTitleCandidate = (value: string, fallback: string) => {
    const cleaned = value
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/writer-asset:\/\/[^\s)]+/g, " ")
      .replace(/`{1,3}/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    return cleaned || fallback
  }
  const normalizeKeywordCandidate = (value: string) => {
    const trimPunctuationRe =
      /^[\s|\uFF5C:\uFF1A;\uFF1B,\uFF0C.\u3002!?\uFF01\uFF1F\-\u2013\u2014]+|[\s|\uFF5C:\uFF1A;\uFF1B,\uFF0C.\u3002!?\uFF01\uFF1F\-\u2013\u2014]+$/g
    const cleaned = value
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/[#`*_]/g, " ")
      .replace(trimPunctuationRe, "")
      .replace(/\s+/g, " ")
      .trim()
    if (!cleaned || cleaned.length < 2 || cleaned.length > 32) return ""
    if (/^https?:\/\//i.test(cleaned) || cleaned.startsWith("writer-asset://")) return ""
    return cleaned
  }
  const keywordInTitle = (title: string, keyword: string) => {
    if (!title || !keyword) return false
    if (/[A-Za-z]/.test(keyword)) {
      return title.toLowerCase().includes(keyword.toLowerCase())
    }
    return title.includes(keyword)
  }
  const extractKeywordFromMarkdown = (value: string): KeywordSignal | null => {
    const explicitCandidates: string[] = []
    for (const match of value.matchAll(/\*\*([^*\n]{2,36})\*\*/g)) {
      explicitCandidates.push(match[1] || "")
    }
    for (const match of value.matchAll(/`([^`\n]{2,36})`/g)) {
      explicitCandidates.push(match[1] || "")
    }
    const explicitKeyword = explicitCandidates.map((item) => normalizeKeywordCandidate(item)).find(Boolean)
    if (explicitKeyword) return { value: explicitKeyword, confidence: "high" }

    const cleanedBody = value
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/\[[^\]]+\]\([^)]+\)/g, " ")
      .replace(/[`*_>#]/g, " ")
      .replace(/\s+/g, " ")
      .trim()

    const englishStopwords = new Set([
      "about",
      "after",
      "also",
      "and",
      "article",
      "because",
      "before",
      "but",
      "from",
      "have",
      "into",
      "just",
      "more",
      "only",
      "project",
      "that",
      "their",
      "there",
      "these",
      "this",
      "those",
      "using",
      "with",
      "what",
      "when",
      "where",
      "which",
      "will",
      "your",
    ])
    const tokenCounts = new Map<string, { token: string; count: number; firstIndex: number }>()
    let matchIndex = 0
    for (const match of cleanedBody.matchAll(/\b[A-Za-z][A-Za-z0-9.+_-]{2,24}\b/g)) {
      const token = (match[0] || "").trim()
      if (!token) continue
      const lower = token.toLowerCase()
      if (englishStopwords.has(lower)) continue
      const previous = tokenCounts.get(lower)
      tokenCounts.set(lower, {
        token,
        count: (previous?.count || 0) + 1,
        firstIndex: previous?.firstIndex ?? matchIndex,
      })
      matchIndex += 1
    }

    const ranked = [...tokenCounts.values()].sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count
      if (left.firstIndex !== right.firstIndex) return left.firstIndex - right.firstIndex
      return left.token.length - right.token.length
    })
    const top = ranked[0]
    if (!top || top.count < 2 || top.token.length < 4) return null
    const normalizedTop = normalizeKeywordCandidate(top.token)
    if (!normalizedTop) return null
    return { value: normalizedTop, confidence: "low" }
  }
  const isGenericTitle = (title: string) => {
    const normalized = title.trim().toLowerCase()
    return /^(?:untitled(?: article)?|new article|draft|article|post|thread)$/i.test(normalized) || /^(?:未命名文章|新建文章|文章|标题)$/.test(title.trim())
  }
  const hasViralSignal = (title: string, chineseContext: boolean) => {
    if (!title) return false
    if (chineseContext) {
      if (/[？?]/u.test(title) && /(怎么|如何|为什么|凭什么|到底|真相|误区|避坑|底层逻辑|关键)/u.test(title)) {
        return true
      }
      if (/\d+\s*(个|条|步|招|点|种|类|大)/u.test(title)) return true
      if (/(方法|步骤|策略|清单|模板|框架|拆解|复盘|避坑|误区|底层逻辑|别再|不是.*而是)/u.test(title)) {
        return true
      }
      return false
    }
    return (
      (/[?]/.test(title) && /(how|why|what|mistake|avoid|framework|playbook|strategy)/i.test(title)) ||
      /\b\d+\s*(ways|steps|mistakes|frameworks|rules|tips)\b/i.test(title)
    )
  }
  const buildViralSubject = (title: string, keywordSignal: KeywordSignal | null, chineseContext: boolean) => {
    const fromKeyword = normalizeKeywordCandidate(keywordSignal?.value || "")
    if (fromKeyword) return fromKeyword
    const normalized = normalizeTitleCandidate(title, "")
      .replace(/[|｜:：\-—].*$/u, "")
      .replace(/[“”"'《》]/gu, "")
      .trim()
    if (!normalized) return chineseContext ? "这个话题" : "this topic"
    return chineseContext ? normalized.slice(0, 16) : normalized.slice(0, 48)
  }
  const toCompellingTitle = (baseTitle: string, keywordSignal: KeywordSignal | null) => {
    const normalizedBaseTitle = normalizeTitleCandidate(baseTitle, fallbackTitle)
    const baseWasGeneric = isGenericTitle(normalizedBaseTitle)
    const chineseContext = languageLabel === "Chinese" || /[\u4e00-\u9fff]/u.test(normalizedBaseTitle)
    const separator = chineseContext ? "\uFF5C" : ": "
    let nextTitle = normalizedBaseTitle
    if (keywordSignal?.value && !keywordInTitle(nextTitle, keywordSignal.value)) {
      const shouldPrefix = keywordSignal.confidence === "high" || baseWasGeneric
      if (shouldPrefix) {
        nextTitle = `${keywordSignal.value}${separator}${normalizedBaseTitle}`
      }
    }
    if (!hasViralSignal(nextTitle, chineseContext)) {
      const subject = buildViralSubject(nextTitle, keywordSignal, chineseContext)
      if (chineseContext) {
        nextTitle = baseWasGeneric
          ? `${subject}怎么做？3个关键步骤讲透`
          : `${subject}：3个关键方法+3个避坑点`
      } else {
        nextTitle = baseWasGeneric
          ? `${subject}: 3 steps to get results`
          : `${subject}: 3 practical strategies and key pitfalls`
      }
    }
    const maxLength = chineseContext ? 38 : 110
    if (nextTitle.length > maxLength) {
      nextTitle = `${nextTitle.slice(0, maxLength).trim()}...`
    }
    return nextTitle.trim() || fallbackTitle
  }

  const fallbackTitle = languageLabel === "Chinese" ? "\u672a\u547d\u540d\u6587\u7ae0" : "Untitled Article"
  const lines = markdown.split("\n")
  const titleIndex = lines.findIndex((line) => /^#\s+/.test(line))
  if (titleIndex >= 0) {
    const title = lines[titleIndex].replace(/^#\s+/, "").trim()
    const rest = lines.filter((_, index) => index !== titleIndex && !/^#\s+/.test(lines[index]))
    const keywordSignal = extractKeywordFromMarkdown(rest.join("\n"))
    return [`# ${toCompellingTitle(title || fallbackTitle, keywordSignal)}`, ...rest].join("\n").trim()
  }
  const firstContentIndex = lines.findIndex((line) => line.trim())
  if (firstContentIndex < 0) return `# ${fallbackTitle}`
  const title = lines[firstContentIndex].replace(/^#+\s*/, "").trim() || fallbackTitle
  const rest = lines.filter((_, index) => index !== firstContentIndex)
  const keywordSignal = extractKeywordFromMarkdown(rest.join("\n"))
  return [`# ${toCompellingTitle(title, keywordSignal)}`, ...rest].join("\n").trim()
}




export function isWriterSkillsAvailable() {
  const openCodeWriterAvailable = hasWriterOpenCodeRuntime()
  return openCodeWriterAvailable && isWriterR2Available()
}

export type WriterSkillsAvailability = {
  enabled: boolean
  provider: "opencode" | "unavailable"
  reason: "ok" | "llm_api_key_missing" | "research_config_missing" | "writer_r2_config_missing"
  requiresWebResearch: boolean
  webResearchEnabled: boolean
}

function hasWriterOpenCodeRuntime() {
  const profile = resolveWriterOpenCodeRuntimeProfile()
  return profile.enabled && profile.backend === "railway-opencode" && Boolean(resolveAiEntryOpenCodeProvider())
}

export function getWriterSkillsAvailability(): WriterSkillsAvailability {
  const openCodeWriterAvailable = hasWriterOpenCodeRuntime()
  const preferredProvider = openCodeWriterAvailable ? "opencode" : "unavailable"

  if (!openCodeWriterAvailable) {
    return {
      enabled: false,
      provider: "unavailable",
      reason: "llm_api_key_missing",
      requiresWebResearch: WRITER_REQUIRE_WEB_RESEARCH,
      webResearchEnabled: WRITER_ENABLE_WEB_RESEARCH,
    }
  }

  if (!isWriterR2Available()) {
    return {
      enabled: false,
      provider: preferredProvider,
      reason: "writer_r2_config_missing",
      requiresWebResearch: WRITER_REQUIRE_WEB_RESEARCH,
      webResearchEnabled: WRITER_ENABLE_WEB_RESEARCH,
    }
  }

  return {
    enabled: true,
    provider: preferredProvider,
    reason: "ok",
    requiresWebResearch: WRITER_REQUIRE_WEB_RESEARCH,
    webResearchEnabled: WRITER_ENABLE_WEB_RESEARCH,
  }
}


/**
 * Production Writer path: one OpenCode execution, one registry-selected
 * primary platform Skill, and one structured result submission.
 */
export function validateWriterSkillFirstTurnResult(params: {
  platform: WriterPlatform
  mode: WriterMode
  platformLabel: string
  activeRevision: number
  activeTitle?: string
  allowTitleChange?: boolean
  result: WriterSubmitResult
  activatedSkillIds: string[]
  resultToolCallCount: number
}) {
  if (params.resultToolCallCount !== 1) throw new Error("writer_result_submission_count_invalid")
  const binding = resolveWriterPlatformBinding(params.platform)
  const activatedPrimaryCount = params.activatedSkillIds.filter((skillId) => skillId === binding.primary.skillId).length
  if (activatedPrimaryCount !== 1) throw new Error("writer_primary_skill_activation_invalid")

  const submittedPlatform = params.result.platform.trim().toLowerCase()
  if (submittedPlatform !== params.platform.toLowerCase() && submittedPlatform !== params.platformLabel.toLowerCase()) {
    throw new Error("writer_result_platform_mismatch")
  }
  if (!binding.operations.includes(params.result.operation)) throw new Error("writer_result_operation_unsupported")
  if (!binding.modes.includes(params.mode)) throw new Error("writer_result_mode_unsupported")
  if (params.result.outcome === "draft_ready") {
    const draft = params.result.draft
    if (!draft) throw new Error("writer_result_draft_missing")
    if (draft.baseRevision !== params.activeRevision) throw new Error("writer_result_stale_revision")
    if (binding.output.titleRequired && !draft.title.trim()) throw new Error("writer_result_title_missing")
    if (params.activeTitle && draft.title.trim() !== params.activeTitle.trim() && !params.allowTitleChange) {
      throw new Error("writer_result_title_changed")
    }
  }
  if (params.result.assetIntents.length > binding.assets.maxCount) throw new Error("writer_result_asset_limit_exceeded")
  if (params.result.assetIntents.some((intent) => intent.kind === "cover") && !binding.assets.cover) {
    throw new Error("writer_result_cover_not_supported")
  }
  if (params.result.assetIntents.some((intent) => intent.kind === "inline") && !binding.assets.inline) {
    throw new Error("writer_result_inline_asset_not_supported")
  }
  if (params.platform === "wechat" && params.result.outcome === "draft_ready" && !params.result.assetIntents.some((intent) => intent.kind === "cover")) {
    throw new Error("writer_result_cover_intent_missing")
  }
  return binding
}

function buildWriterFixtureFirstTurnResult(params: {
  query: string
  platform: WriterPlatform
  mode: WriterMode
  preferredLanguage: WriterLanguage
  writerContext?: WriterRuntimeContext | null
  platformLabel: string
  binding: ReturnType<typeof resolveWriterPlatformBinding>
  fixtureScenario?: WriterFixtureScenario
}) {
  const priorUserTurns = params.writerContext?.recentTurns.filter((turn) => turn.role === "user").length || 0
  const hasActiveDraft = Boolean(params.writerContext?.activeDraft)
  const inferredScenario: WriterFixtureScenario = !hasActiveDraft && priorUserTurns === 0
    ? "clarification"
    : hasActiveDraft
      ? "revise"
      : "create"
  const scenario = params.fixtureScenario || inferredScenario
  const shouldClarify = scenario === "clarification"
  const contentType: WriterContentType = ["wechat", "xiaohongshu", "weibo", "douyin"].includes(params.platform)
    ? "social_cn"
    : "social_global"
  const selectedSkillIds = resolveWriterOpenCodeSkillIds({
    contentType,
    targetPlatform: params.platformLabel,
  })

  if (shouldClarify) {
    const chinese = params.preferredLanguage === "zh" || (params.preferredLanguage === "auto" && /[\u4e00-\u9fff]/u.test(params.query))
    const result: WriterSubmitResult = {
      schemaVersion: 1,
      outcome: "needs_clarification",
      operation: "create",
      platform: params.platform,
      userMessage: chinese
        ? "我还需要确认一下受众、目标和语气，再开始生成完整稿件。"
        : "Audience: please confirm the target audience, goal, and tone before I draft the full piece.",
      draft: null,
      research: { requested: false, completed: false, sourceUrls: [] },
      assetIntents: [],
    }
    return { result, selectedSkillIds }
  }

  const content = safeBuildFixtureDraft(params.platform, params.mode, params.preferredLanguage)
  const title = content.match(/^#\s+(.+)$/mu)?.[1]?.trim() || "Writer Fixture Draft"
  const operation = scenario === "translate" || scenario === "adapt_platform"
    ? scenario
    : scenario === "revise" || (scenario === "research" && hasActiveDraft)
      ? "revise"
      : "create"
  const result: WriterSubmitResult = {
    schemaVersion: 1,
    outcome: "draft_ready",
    operation,
    platform: params.platform,
    userMessage: params.preferredLanguage === "zh"
      ? scenario === "translate"
        ? "已完成翻译稿。"
        : scenario === "adapt_platform"
          ? "已完成平台适配稿。"
          : scenario === "research"
            ? "已完成研究并更新文章草稿。"
            : "已完成文章草稿。"
      : scenario === "translate"
        ? "The translated draft is ready."
        : scenario === "adapt_platform"
          ? "The platform-adapted draft is ready."
          : scenario === "research"
            ? "The researched draft is ready."
            : "The article draft is ready.",
    draft: {
      title,
      content,
      baseRevision: params.writerContext?.activeDraft?.revision || 0,
    },
    research: scenario === "research"
      ? { requested: true, completed: true, sourceUrls: ["https://example.test/writer-research"] }
      : { requested: false, completed: false, sourceUrls: [] },
    assetIntents: params.binding.assets.cover
      ? [{
          id: "cover",
          kind: "cover",
          prompt: "editorial cover image",
          placement: "after_title",
          aspectRatio: params.binding.assets.aspectRatios[0] || "16:9",
        }]
      : [],
  }
  return { result, selectedSkillIds }
}

export async function runWriterSkillFirstTurn(params: {
  query: string
  platform: WriterPlatform
  mode: WriterMode
  preferredLanguage?: WriterLanguage
  userId?: number
  conversationId?: string | null
  enterpriseId?: number | null
  writerContext?: WriterRuntimeContext | null
  selectedProviderId?: AiEntryProviderId | null
  selectedModelId?: string | null
  /** Test-only deterministic scenario; ignored unless WRITER_E2E_FIXTURES=true. */
  fixtureScenario?: WriterFixtureScenario
}): Promise<WriterSkillsTurnResult> {
  const preferredLanguage = params.preferredLanguage || "auto"
  const platformConfig = WRITER_PLATFORM_CONFIG[params.platform]
  const binding = resolveWriterPlatformBinding(params.platform)
  const contentType: WriterContentType = ["wechat", "xiaohongshu", "weibo", "douyin"].includes(params.platform)
    ? "social_cn"
    : "social_global"
  const platformLabel = platformConfig.shortLabel
  const routing: WriterRoutingDecision = {
    contentType,
    targetPlatform: platformLabel,
    outputForm: params.mode === "thread" ? "platform-native thread" : "platform-native article",
    lengthTarget: platformConfig.wordRange,
    renderPlatform: params.platform,
    renderMode: params.mode,
    selectedSkillId: contentType,
    selectedSkillLabel: contentType === "social_cn" ? "中文社媒" : "海外社媒",
    selectedPlatformSkillId: binding.primary.skillId,
    selectedPlatformSkillLabel: binding.primary.skillId,
    selectedStyleSkillId: null,
    selectedStyleSkillLabel: null,
  }
  const language = preferredLanguage === "zh" ? "Chinese" : preferredLanguage === "en" ? "English" : "the user's language"
  const systemPrompt = [
    "You are the production Writer Agent.",
    "The writer-orchestrator and the selected platform Skill are the only editorial authorities for this turn.",
    `The active platform is ${platformLabel}; keep it unless the Skill determines that the user explicitly requests a supported platform switch.`,
    "Read every selected Skill completely. Decide whether to ask a clarification or produce the article from the current request and durable draft.",
    "Use writer_webfetch only when the Skill decides research is required. Never claim a source was verified if retrieval failed.",
    "Call writer_submit_result exactly once before finishing. The result must contain the complete draft when ready, the active base revision, research state, and validated cover/inline asset intents.",
    "Do not write a result as final prose or JSON text; submit it through the tool.",
    `Respond to the user in ${language}.`,
  ].join("\n")
  const selectedSkillIds = resolveWriterOpenCodeSkillIds({
    contentType,
    targetPlatform: platformLabel,
  })
  if (shouldUseWriterE2EFixtures()) {
    const fixture = buildWriterFixtureFirstTurnResult({
      query: params.query,
      platform: params.platform,
      mode: params.mode,
      preferredLanguage,
      writerContext: params.writerContext,
      platformLabel,
      binding,
      fixtureScenario: params.fixtureScenario,
    })
    const writerResult = fixture.result
    validateWriterSkillFirstTurnResult({
      platform: params.platform,
      mode: params.mode,
      platformLabel,
      activeRevision: params.writerContext?.activeDraft?.revision || 0,
      activeTitle: params.writerContext?.activeDraft?.title,
      allowTitleChange: isWriterTitleOnlyRevisionRequest(params.query),
      result: writerResult,
      activatedSkillIds: ["writer-orchestrator", ...fixture.selectedSkillIds.filter((id) => id !== "writer-orchestrator")],
      resultToolCallCount: 1,
    })
    const diagnostics = buildWriterTurnDiagnostics({
      retrievalStrategy: writerResult.research.requested ? "fresh_external" : "no_retrieval",
      enterpriseKnowledge: null,
      enterpriseKnowledgeEnabled: Boolean(params.enterpriseId),
      research: createEmptyResearchResult(
        writerResult.research.completed ? "ready" : writerResult.research.requested ? "unavailable" : "skipped",
      ),
      routing,
    })
    diagnostics.webResearchUsed = writerResult.research.completed
    diagnostics.webSourceCount = writerResult.research.sourceUrls.length
    diagnostics.webSourceUrls = writerResult.research.sourceUrls
    return {
      outcome: writerResult.outcome,
      operation: writerResult.operation,
      answer: writerResult.outcome === "draft_ready" ? writerResult.draft?.content || writerResult.userMessage : writerResult.userMessage,
      diagnostics,
      brief: createEmptyWriterBrief(),
      routing,
      missingFields: [],
      turnCount: (params.writerContext?.recentTurns.filter((turn) => turn.role === "user").length || 0) + 1,
      maxTurns: 1,
      readyForGeneration: writerResult.outcome === "draft_ready",
      assetIntents: writerResult.assetIntents,
      selectedSkill: {
        id: "writer-platform-generation",
        label: platformLabel,
        stage: "execution",
      },
    }
  }
  const invoke = (writerContext: WriterRuntimeContext | null) => runWriterOpenCodeText({
    systemPrompt,
    userPrompt: params.query,
    selectedSkillIds,
    writerPhase: "draft",
    allowNetwork: true,
    userId: params.userId,
    conversationId: params.conversationId,
    enterpriseId: params.enterpriseId,
    selectedProviderId: params.selectedProviderId,
    selectedModelId: params.selectedModelId,
    writerContext,
  })
  const result = params.writerContext
    ? await runWriterRuntimeWithRecovery({
        normalContext: params.writerContext,
        recoveryContext: buildWriterRecoveryContext(params.writerContext),
        invoke: (context) => invoke(context),
      })
    : await invoke(null)
  if (!result.writerResult) throw new Error("writer_result_not_submitted")
  const writerResult = reconcileWriterRevisionResult({
    query: params.query,
    result: result.writerResult,
    activeDraft: params.writerContext?.activeDraft,
  })
  validateWriterSkillFirstTurnResult({
    platform: params.platform,
    mode: params.mode,
    platformLabel,
    activeRevision: params.writerContext?.activeDraft?.revision || 0,
    activeTitle: params.writerContext?.activeDraft?.title,
    allowTitleChange: isWriterTitleOnlyRevisionRequest(params.query),
    result: writerResult,
    activatedSkillIds: result.activatedSkillIds,
    resultToolCallCount: result.resultToolCallCount,
  })
  const answer = writerResult.draft?.content || writerResult.userMessage
  const diagnostics = buildWriterTurnDiagnostics({
    retrievalStrategy: writerResult.research.requested ? "fresh_external" : "no_retrieval",
    enterpriseKnowledge: null,
    enterpriseKnowledgeEnabled: Boolean(params.enterpriseId),
    research: createEmptyResearchResult(writerResult.research.completed ? "ready" : writerResult.research.requested ? "unavailable" : "skipped"),
    routing,
  })
  diagnostics.webResearchUsed = writerResult.research.completed
  diagnostics.webSourceCount = writerResult.research.sourceUrls.length
  diagnostics.webSourceUrls = writerResult.research.sourceUrls
  return {
    outcome: writerResult.outcome,
    operation: writerResult.operation,
    answer: writerResult.outcome === "draft_ready"
      ? postProcessWriterDraft(params.platform, params.mode, answer, language, { ensureCoverPlaceholder: false, preserveTitle: true })
      : writerResult.userMessage,
    diagnostics,
    usage: result.usage,
    brief: createEmptyWriterBrief(),
    routing,
    missingFields: [],
    turnCount: 1,
    maxTurns: 1,
    readyForGeneration: writerResult.outcome === "draft_ready",
    assetIntents: writerResult.assetIntents,
    selectedSkill: {
      id: "writer-platform-generation",
      label: platformLabel,
      stage: "execution",
    },
  }
}
