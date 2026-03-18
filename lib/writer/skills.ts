import {
  loadEnterpriseKnowledgeContext,
  type EnterpriseKnowledgeContext,
  type EnterpriseKnowledgeScope,
} from "@/lib/dify/enterprise-knowledge"
import { z } from "zod"
import {
  generateTextWithWriterModel,
  hasAibermApiKey,
  hasOpenRouterApiKey,
  hasWriterTextProvider,
} from "@/lib/writer/aiberm"
import { type WriterLanguage, type WriterMode, type WriterPlatform } from "@/lib/writer/config"
import { writerRequestJson, writerRequestText } from "@/lib/writer/network"
import { isWriterR2Available } from "@/lib/writer/r2"
import {
  getWriterBriefingSkillDocument,
  getWriterRepoHostedSkillDocument,
  type WriterBriefingSkillDocument,
  type WriterRuntimeSkillDocument,
} from "@/lib/writer/skill-documents"
import type {
  WriterConversationStatus,
  WriterHistoryEntry,
  WriterRetrievalStrategy,
  WriterTurnDiagnostics,
} from "@/lib/writer/types"

const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY || ""
const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID || ""
const JINA_API_KEY = process.env.JINA_API_KEY || ""

const WRITER_TEXT_MODEL = process.env.WRITER_TEXT_MODEL || "google/gemini-3-flash"
const WRITER_ENABLE_WEB_RESEARCH = process.env.WRITER_ENABLE_WEB_RESEARCH !== "false"
const WRITER_REQUIRE_WEB_RESEARCH = process.env.WRITER_REQUIRE_WEB_RESEARCH === "true"
const WRITER_RESEARCH_CACHE_TTL_MS = Math.max(
  0,
  Number.parseInt(process.env.WRITER_RESEARCH_CACHE_TTL_MS || "600000", 10) || 600_000,
)
const WRITER_RESEARCH_BUDGET_MS = Math.max(
  0,
  Number.parseInt(process.env.WRITER_RESEARCH_BUDGET_MS || "4500", 10) || 4_500,
)
const WRITER_ENTERPRISE_KNOWLEDGE_BUDGET_MS = Math.max(
  0,
  Number.parseInt(process.env.WRITER_ENTERPRISE_KNOWLEDGE_BUDGET_MS || "3000", 10) || 3_000,
)
const WRITER_SEARCH_RESULT_LIMIT = Math.min(
  10,
  Math.max(1, Number.parseInt(process.env.WRITER_SEARCH_RESULT_LIMIT || "4", 10) || 4),
)
const WRITER_SEARCH_EXTRACT_LIMIT = Math.min(
  3,
  Math.max(1, Number.parseInt(process.env.WRITER_SEARCH_EXTRACT_LIMIT || "1", 10) || 1),
)

const writerResearchCache = new Map<string, { expiresAt: number; value: Promise<WriterResearchResult> }>()

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

type WriterPlatformGuide = {
  label: string
  tone: string
  format: string
  length: string
  image: string
  promptRules: string[]
  articleStructureGuidance: string
  threadStructureGuidance: string
}

const WRITER_PLATFORM_GUIDE: Record<WriterPlatform, WriterPlatformGuide> = {
  wechat: {
    label: "WeChat Official Account article writer",
    tone: "professional, analytical, trusted, story-driven",
    format: "publish-ready long-form article",
    length: "1500-3500 words or equivalent localized length",
    image: "16:9 cover plus 2-5 inline editorial images",
    promptRules: [
      "Follow a research-first workflow.",
      "Write as a polished article for direct publishing, not as a writing brief.",
      "Use H2 sections when they improve readability, but do not force a rigid intro-body-conclusion template.",
      "Allow the article to open directly with a strong first paragraph when that reads better.",
      "Allow the ending to be a natural closing paragraph or a labeled conclusion only when appropriate.",
      "Keep facts grounded in the provided material. Do not invent precise data or unsupported claims.",
    ],
    articleStructureGuidance: [
      "Write as a complete article suitable for WeChat publishing.",
      "You may use H2 headings where they improve readability.",
      "Do not force labeled sections such as intro or conclusion unless the topic naturally benefits from them.",
      "Insert `![Cover](writer-asset://cover)` near the opening and inline image placeholders where relevant.",
    ].join("\n"),
    threadStructureGuidance: "",
  },
  xiaohongshu: {
    label: "Xiaohongshu image-post writer",
    tone: "conversational, catchy, friendly, save-worthy",
    format: "mobile-first visual note",
    length: "200-900 words or equivalent localized length",
    image: "3:4 cover plus 3-6 card-style images",
    promptRules: [
      "Lead with a hook and optimize for quick mobile reading.",
      "Keep paragraphs short and punchy.",
      "Avoid heavy article framing unless the user explicitly asks for it.",
      "End with a save/share/comment CTA only when it fits the platform style.",
      "Retain factual accuracy from the provided material.",
    ],
    articleStructureGuidance: [
      "Write as a mobile-first image note.",
      "Use short paragraphs and punchy pacing.",
      "Do not force traditional article sections unless explicitly requested.",
      "Insert `![Cover](writer-asset://cover)` and inline image placeholders that map to visual cards.",
    ].join("\n"),
    threadStructureGuidance: "",
  },
  x: {
    label: "X writer",
    tone: "direct, sharp, opinion-driven, globally legible",
    format: "single post or thread-ready draft",
    length: "single post: concise long post; thread: 5-12 segments",
    image: "16:9 social image set with 1-3 visual assets",
    promptRules: [
      "If the mode is thread, structure the body as a clean sequence of short segments.",
      "Lead with a strong hook and keep every segment self-contained but connected.",
      "Prioritize clarity and takeaways over ornamental writing.",
      "Avoid forced section headers unless the user explicitly asks for article style.",
    ],
    articleStructureGuidance: [
      "Write as a single social post or article-style post for the selected platform.",
      "Use headings only when helpful; do not force long-form article conventions.",
      "Insert image placeholders only where they improve the post.",
    ].join("\n"),
    threadStructureGuidance: [
      "Write as a sequential multi-part post.",
      "Use `### Segment 1`, `### Segment 2`, etc. so the UI can render thread cards.",
      "Keep each segment publishable on its own.",
      "Use only the image placeholders actually needed for this mode.",
    ].join("\n"),
  },
  facebook: {
    label: "Facebook writer",
    tone: "narrative, community-oriented, shareable, brand-safe",
    format: "single long post or multi-part social post",
    length: "single post: medium to long; multi-part: 4-8 segments",
    image: "16:9 or 1.91:1 brand-friendly social visuals with 1-4 assets",
    promptRules: [
      "Balance story, practical insight, and shareability.",
      "If the mode is multi-part, write segments that flow naturally when posted sequentially.",
      "Use section labels only when they help reading; do not force article conventions from other platforms.",
      "Keep examples concrete and easy to understand without insider context.",
    ],
    articleStructureGuidance: [
      "Write as a single social post or article-style post for the selected platform.",
      "Use headings only when helpful; do not force long-form article conventions.",
      "Insert image placeholders only where they improve the post.",
    ].join("\n"),
    threadStructureGuidance: [
      "Write as a sequential multi-part post.",
      "Use `### Segment 1`, `### Segment 2`, etc. so the UI can render thread cards.",
      "Keep each segment publishable on its own.",
      "Use only the image placeholders actually needed for this mode.",
    ].join("\n"),
  },
}

const WRITER_BRIEF_MAX_TURNS = 5
const WRITER_CONTEXT_MAX_TURNS = 12
const WRITER_CONTEXT_WINDOW_TURNS = 4
const WRITER_CONTEXT_ENTRY_MAX_CHARS = 360
const WRITER_PRIOR_DRAFT_MAX_CHARS = 6_000
const WRITER_BRIEF_EXTRACTION_MAX_CHARS = 220
const WRITER_BRIEF_FIELD_IDS = ["topic", "audience", "objective", "tone"] as const
const WRITER_BRIEF_EXTRACTION_SCHEMA = z.object({
  resolvedBrief: z.object({
    topic: z.string().default(""),
    audience: z.string().default(""),
    objective: z.string().default(""),
    tone: z.string().default(""),
    constraints: z.string().default(""),
  }),
  answeredFields: z.array(z.enum(WRITER_BRIEF_FIELD_IDS)).default([]),
  suggestedFollowUpFields: z.array(z.enum(WRITER_BRIEF_FIELD_IDS)).max(2).default([]),
  suggestedFollowUpQuestion: z.string().default(""),
  userWantsDirectOutput: z.boolean().default(false),
  briefSufficient: z.boolean().default(false),
  confidence: z.number().min(0).max(1).default(0),
})
const _WRITER_TONE_KEYWORDS = [
  "professional",
  "conversational",
  "friendly",
  "sharp",
  "formal",
  "casual",
  "analytical",
  "story-driven",
  "direct",
  "warm",
  "playful",
  "authoritative",
  "专业",
  "正式",
  "轻松",
  "口语化",
  "克制",
  "犀利",
  "故事感",
  "分析型",
  "亲切",
  "权威",
  "幽默",
]

const CLEAN_WRITER_TONE_KEYWORDS = [
  "professional",
  "conversational",
  "friendly",
  "sharp",
  "formal",
  "casual",
  "analytical",
  "story-driven",
  "direct",
  "warm",
  "playful",
  "authoritative",
  "专业",
  "正式",
  "轻松",
  "口语化",
  "克制",
  "犀利",
  "故事感",
  "分析型",
  "亲切",
  "权威",
  "幽默",
]

type WriterBriefFieldId = (typeof WRITER_BRIEF_FIELD_IDS)[number]

type WriterConversationBrief = {
  topic: string
  audience: string
  objective: string
  tone: string
  constraints: string
}

type WriterBriefPlan = {
  brief: WriterConversationBrief
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

type WriterDraftGenerationResult = {
  answer: string
  diagnostics: WriterTurnDiagnostics
}

export type WriterSkillsTurnResult =
  | ({
      outcome: "needs_clarification"
      answer: string
      diagnostics: WriterTurnDiagnostics
    } & WriterBriefPlan)
  | ({
      outcome: "draft_ready"
      answer: string
      diagnostics: WriterTurnDiagnostics
    } & WriterBriefPlan)

type WriterSkillsRuntime = {
  getBriefingGuide: typeof getWriterBriefingGuide
  getRuntimeGuide: typeof getWriterRuntimeGuide
  extractBrief: typeof extractWriterBriefWithModel
  generateDraft: typeof generateWriterDraftWithSkills
}

function createEmptyWriterBrief(): WriterConversationBrief {
  return {
    topic: "",
    audience: "",
    objective: "",
    tone: "",
    constraints: "",
  }
}

function createEmptyWriterDiagnostics(
  retrievalStrategy: WriterRetrievalStrategy = "rewrite_only",
): WriterTurnDiagnostics {
  return {
    retrievalStrategy,
    enterpriseKnowledgeEnabled: false,
    enterpriseKnowledgeUsed: false,
    enterpriseDatasetCount: 0,
    enterpriseSourceCount: 0,
    enterpriseDatasets: [],
    enterpriseTitles: [],
    webResearchUsed: false,
    webResearchStatus: "skipped",
    webSourceCount: 0,
  }
}

function detectRewriteOnlyIntent(query: string) {
  return /(?:改写|润色|缩写|缩短|翻译|提炼|总结|优化标题|换个语气|调整语气|改成|rewrite|polish|shorten|summari[sz]e|translate|edit this|revise)/iu.test(
    query,
  )
}

function detectEnterpriseGroundingNeed(query: string, brief: WriterConversationBrief) {
  const haystack = [query, brief.topic, brief.objective, brief.constraints].filter(Boolean).join("\n")

  return /(?:我们|我们的|本公司|品牌|产品|服务|解决方案|客户案例|案例|官网|企业介绍|公司介绍|品牌定位|卖点|优势|工厂|交付|打样|认证|机型|型号|设备|参数|能力|产品线|our company|our product|brand|case study|factory|equipment|model|spec|solution)/iu.test(
    haystack,
  )
}

function detectFreshResearchNeed(query: string, brief: WriterConversationBrief) {
  const haystack = [query, brief.topic, brief.objective].filter(Boolean).join("\n")

  return /(?:最新|趋势|报告|调研|数据|统计|行业洞察|市场规模|竞品|新闻|今年|明年|202[4-9]|latest|trend|report|research|market|benchmark|news|forecast|survey)/iu.test(
    haystack,
  )
}

function decideWriterRetrievalStrategy(params: {
  query: string
  brief: WriterConversationBrief
  enterpriseId?: number | null
}): WriterRetrievalStrategy {
  const rewriteOnly = detectRewriteOnlyIntent(params.query)
  const enterpriseNeeded = Boolean(params.enterpriseId) && detectEnterpriseGroundingNeed(params.query, params.brief)
  const freshResearchNeeded = detectFreshResearchNeed(params.query, params.brief)

  if (rewriteOnly && !enterpriseNeeded && !freshResearchNeeded) {
    return "rewrite_only"
  }
  if (enterpriseNeeded && freshResearchNeeded) {
    return "hybrid_grounded"
  }
  if (enterpriseNeeded) {
    return "enterprise_grounded"
  }
  if (freshResearchNeeded) {
    return "fresh_external"
  }
  return params.enterpriseId ? "enterprise_grounded" : "fresh_external"
}

function getPreferredEnterpriseScopes(
  query: string,
  brief: WriterConversationBrief,
  retrievalStrategy: WriterRetrievalStrategy,
): EnterpriseKnowledgeScope[] {
  if (retrievalStrategy === "rewrite_only" || retrievalStrategy === "fresh_external") {
    return []
  }

  const haystack = [query, brief.topic, brief.objective, brief.constraints].filter(Boolean).join("\n")
  const scopes = new Set<EnterpriseKnowledgeScope>(["general"])

  if (/(?:品牌|语气|定位|介绍|brand|positioning|about us)/iu.test(haystack)) {
    scopes.add("brand")
  }
  if (/(?:产品|服务|解决方案|机型|型号|设备|参数|能力|产品线|product|solution|equipment|model|spec)/iu.test(haystack)) {
    scopes.add("product")
  }
  if (/(?:案例|客户|应用场景|客户价值|roi|case|customer|scenario)/iu.test(haystack)) {
    scopes.add("case-study")
  }
  if (/(?:合规|禁用|风险|免责声明|compliance|legal|risk)/iu.test(haystack)) {
    scopes.add("compliance")
  }
  if (/(?:campaign|活动|投放|广告|营销战役)/iu.test(haystack)) {
    scopes.add("campaign")
  }

  return [...scopes]
}

function buildEnterpriseQueryVariants(
  baseQuery: string,
  scopes: EnterpriseKnowledgeScope[],
): string[] {
  const variants = [baseQuery.trim()]

  if (scopes.includes("general")) {
    variants.push(`${baseQuery}\n聚焦：企业基础事实、业务介绍、可复用的一方信息`)
  }
  if (scopes.includes("brand")) {
    variants.push(`${baseQuery}\n聚焦：企业介绍、品牌定位、核心事实`)
  }
  if (scopes.includes("product")) {
    variants.push(`${baseQuery}\n聚焦：核心产品、产品体系、解决方案、机型或参数`)
  } else if (scopes.includes("case-study")) {
    variants.push(`${baseQuery}\n聚焦：客户类型、应用场景、客户价值、案例成效`)
  }

  return [...new Set(variants.map((item) => item.trim()).filter(Boolean))].slice(0, 2)
}

function buildWriterTurnDiagnostics(params: {
  retrievalStrategy: WriterRetrievalStrategy
  enterpriseKnowledge: EnterpriseKnowledgeContext | null
  enterpriseKnowledgeEnabled: boolean
  research: WriterResearchResult
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
  }
}

async function getWriterBriefingGuide() {
  return getWriterBriefingSkillDocument({
    runtimeLabel: "Writer Brief Intake",
    requiredBriefFields: [
      "Topic and core angle",
      "Target audience",
      "Primary objective or desired outcome",
      "Tone, voice, or style preference",
    ],
    collectionRules: [
      "Collect the brief through conversation, not through a form.",
      "Ask at most two missing items in each follow-up.",
      "Reuse what the user already provided instead of asking again.",
      "Stop clarification once the brief is usable, or once five user turns have been reached.",
    ],
    followUpStyle: "Be concise, practical, and editorial.",
    defaultAssumptions: [
      "If tone is missing near the turn limit, fall back to the selected platform tone.",
      "If constraints are missing, use a clean publish-ready structure for the selected platform.",
    ],
  } satisfies WriterBriefingSkillDocument)
}

async function getWriterRuntimeGuide(platform: WriterPlatform) {
  const fallback = WRITER_PLATFORM_GUIDE[platform]
  return getWriterRepoHostedSkillDocument(platform, {
    runtimeLabel: fallback.label,
    tone: fallback.tone,
    contentFormat: fallback.format,
    lengthTarget: fallback.length,
    imageGuidance: fallback.image,
    promptRules: fallback.promptRules,
    articleStructureGuidance: fallback.articleStructureGuidance,
    threadStructureGuidance: fallback.threadStructureGuidance,
  } satisfies WriterRuntimeSkillDocument)
}

function normalizeBriefValue(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function joinBriefValues(current: string, next: string) {
  const normalizedCurrent = normalizeBriefValue(current)
  const normalizedNext = normalizeBriefValue(next)

  if (!normalizedNext) return normalizedCurrent
  if (!normalizedCurrent) return normalizedNext
  if (normalizedCurrent.includes(normalizedNext)) return normalizedCurrent
  if (normalizedNext.includes(normalizedCurrent)) return normalizedNext
  return `${normalizedCurrent}; ${normalizedNext}`
}

function clipBriefField(value: string, maxLength = WRITER_BRIEF_EXTRACTION_MAX_CHARS) {
  return compactText(normalizeBriefValue(value), maxLength)
}

function mergeStructuredWriterBrief(
  base: WriterConversationBrief,
  resolvedBrief?: Partial<WriterConversationBrief> | null,
): WriterConversationBrief {
  if (!resolvedBrief) {
    return base
  }

  return {
    topic: clipBriefField(resolvedBrief.topic || base.topic),
    audience: clipBriefField(resolvedBrief.audience || base.audience),
    objective: clipBriefField(resolvedBrief.objective || base.objective),
    tone: clipBriefField(resolvedBrief.tone || base.tone),
    constraints: clipBriefField(resolvedBrief.constraints || base.constraints, 320),
  }
}

function sanitizeWriterBriefFields(fields: WriterBriefFieldId[]) {
  return fields.filter((field, index) => WRITER_BRIEF_FIELD_IDS.includes(field) && fields.indexOf(field) === index)
}

function extractJsonObjectFromText(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return ""
  const fenced = /```(?:json)?\s*([\s\S]*?)```/iu.exec(trimmed)
  if (fenced?.[1]) {
    return fenced[1].trim()
  }
  const startIndex = trimmed.indexOf("{")
  const endIndex = trimmed.lastIndexOf("}")
  if (startIndex >= 0 && endIndex > startIndex) {
    return trimmed.slice(startIndex, endIndex + 1)
  }
  return trimmed
}

function extractFirstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    const value = normalizeBriefValue(match?.[1] || "")
    if (value) {
      return value
    }
  }

  return ""
}

function extractToneKeywords(text: string) {
  const normalized = text.toLowerCase()
  const hits = CLEAN_WRITER_TONE_KEYWORDS.filter((keyword) => normalized.includes(keyword.toLowerCase()))
  return hits.join(", ")
}

type WriterBriefExtractionResult = {
  resolvedBrief: WriterConversationBrief
  answeredFields: WriterBriefFieldId[]
  suggestedFollowUpFields: WriterBriefFieldId[]
  suggestedFollowUpQuestion: string
  userWantsDirectOutput: boolean
  briefSufficient: boolean
  confidence: number
}

function _legacyExtractTopicFromText(text: string) {
  const explicit = extractFirstMatch(text, [
    /(?:主题|话题|选题|标题方向|核心角度)\s*(?:是|为|:|：)?\s*([^，。；;\n]+)/iu,
    /(?:关于|围绕|聚焦于?)\s*([^，。；;\n]+)/iu,
    /(?:write|draft|create)\s+(?:an?|the)?\s*(?:article|post|thread|wechat article|xiaohongshu note)?\s*(?:about|on)\s+([^,.;\n]+)/iu,
    /(?:article|post|thread)\s+(?:about|on)\s+([^,.;\n]+)/iu,
  ])
  if (explicit) {
    return explicit
  }

  if (!/[。！？!?]/u.test(text) && text.length <= 120) {
    return compactText(text, 90)
  }

  return ""
}

function _legacyExtractAudienceFromText(text: string) {
  return extractFirstMatch(text, [
    /(?:面向|针对|适合|读者是|受众是|目标读者|目标用户|目标受众)\s*(?:是|为|:|：)?\s*([^，。；;\n]+)/iu,
    /(?:for|target(?:ing)?|audience(?: is)?)\s+([^,.;\n]+)/iu,
  ])
}

function _legacyExtractObjectiveFromText(text: string) {
  return extractFirstMatch(text, [
    /(?:目标是|目的是|诉求是|希望|用于|想达到|想实现|想让读者)\s*(?:是|为|:|：)?\s*([^，。；;\n]+)/iu,
    /(?:goal|objective|cta|call to action)(?: is|:)?\s*([^,.;\n]+)/iu,
  ])
}

function _legacyExtractToneFromText(text: string) {
  const explicit = extractFirstMatch(text, [
    /(?:语气|口吻|风格|基调|文风|tone|style)\s*(?:是|为|:|：)?\s*([^，。；;\n]+)/iu,
  ])
  if (explicit) {
    return explicit
  }

  return extractToneKeywords(text)
}

function _legacyExtractConstraintsFromText(text: string) {
  return extractFirstMatch(text, [
    /(?:篇幅|长度|结构|格式|必须包含|需要包含|字数|限制)\s*(?:是|为|:|：)?\s*([^。；;\n]+)/iu,
    /(?:length|format|structure|must include|constraints?)(?: is|:)?\s*([^.\n]+)/iu,
  ])
}

function _extractTopicFromText(text: string) {
  const explicit = extractFirstMatch(text, [
    /(?:主题|话题|选题|标题方向|核心角度)\s*(?::|：)?\s*([^，。；;\n]+)/iu,
    /(?:关于|围绕|聚焦于?)\s*([^，。；;\n]+)/iu,
    /(?:write|draft|create)\s+(?:an?|the)?\s*(?:article|post|thread|wechat article|xiaohongshu note)?\s*(?:about|on)\s+([^,.;\n]+)/iu,
    /(?:article|post|thread)\s+(?:about|on)\s+([^,.;\n]+)/iu,
  ])
  if (explicit) {
    return explicit
  }

  if (!/[。！？?]/u.test(text) && text.length <= 120) {
    return compactText(text, 90)
  }

  return ""
}

function _extractAudienceFromText(text: string) {
  return extractFirstMatch(text, [
    /(?:面向|针对|适合|读者是|受众是|目标读者|目标用户|目标受众)\s*(?::|：)?\s*([^，。；;\n]+)/iu,
    /(?:for|target(?:ing)?|audience(?: is)?)\s+([^,.;\n]+)/iu,
  ])
}

function _extractObjectiveFromText(text: string) {
  return extractFirstMatch(text, [
    /(?:目标是|目的是|诉求是|希望|用于|想达到|想实现|想让读者)\s*(?::|：)?\s*([^，。；;\n]+)/iu,
    /(?:goal|objective|cta|call to action)(?: is|:)?\s*([^,.;\n]+)/iu,
  ])
}

function _extractToneFromText(text: string) {
  const explicit = extractFirstMatch(text, [
    /(?:语气|口吻|风格|基调|文风|tone|style)\s*(?::|：)?\s*([^，。；;\n]+)/iu,
  ])
  if (explicit) {
    return explicit
  }

  return extractToneKeywords(text)
}

function _extractConstraintsFromText(text: string) {
  return extractFirstMatch(text, [
    /(?:篇幅|长度|结构|格式|必须包含|需要包含|字数|限制)\s*(?::|：)?\s*([^。；;\n]+)/iu,
    /(?:length|format|structure|must include|constraints?)(?: is|:)?\s*([^.\n]+)/iu,
  ])
}

function getWriterBriefMissingFields(brief: WriterConversationBrief) {
  const missingFields: WriterBriefFieldId[] = []
  if (!brief.topic) missingFields.push("topic")
  if (!brief.audience) missingFields.push("audience")
  if (!brief.objective) missingFields.push("objective")
  if (!brief.tone) missingFields.push("tone")
  return missingFields
}

function getWriterActionableMissingFields(brief: WriterConversationBrief) {
  const missingFields: WriterBriefFieldId[] = []

  if (!brief.topic) {
    missingFields.push("topic")
  }

  if (!brief.audience && !brief.objective) {
    missingFields.push("audience", "objective")
  }

  return missingFields
}

function _inferWriterRequestedFieldsFromAnswer(answer: string) {
  const requestedFields: WriterBriefFieldId[] = []

  if (/(topic|angle|主题|话题|选题|角度)/iu.test(answer)) {
    requestedFields.push("topic")
  }
  if (/(audience|reader|target user|受众|读者|面向|写给谁)/iu.test(answer)) {
    requestedFields.push("audience")
  }
  if (/(objective|goal|result|cta|转化|咨询|结果|目标|达成什么)/iu.test(answer)) {
    requestedFields.push("objective")
  }
  if (/(tone|voice|style|语气|风格|口吻|文风)/iu.test(answer)) {
    requestedFields.push("tone")
  }

  return requestedFields.filter((field, index) => requestedFields.indexOf(field) === index)
}

function _isLowSignalWriterReply(text: string) {
  return /^(ok|okay|yes|no|好的|好|行|可以|收到|明白了|嗯|恩|随便|都行)$/iu.test(text.trim())
}

function _legacyInferWriterRequestedFieldsFromAnswer(answer: string) {
  const requestedFields: WriterBriefFieldId[] = []

  if (/(topic|angle|主题|话题|选题|角度)/iu.test(answer)) {
    requestedFields.push("topic")
  }
  if (/(audience|reader|target user|受众|读者|面向|写给谁)/iu.test(answer)) {
    requestedFields.push("audience")
  }
  if (/(objective|goal|result|cta|转化|咨询|结果|目标|达成什么)/iu.test(answer)) {
    requestedFields.push("objective")
  }
  if (/(tone|voice|style|语气|风格|口吻|文风)/iu.test(answer)) {
    requestedFields.push("tone")
  }

  return requestedFields.filter((field, index) => requestedFields.indexOf(field) === index)
}

function _legacyIsLowSignalWriterReply(text: string) {
  return /^(ok|okay|yes|no|好的|好|行|可以|收到|明白了|嗯|恩|随便|都行)$/iu.test(text.trim())
}

function coerceWriterReplyForField(text: string, field: WriterBriefFieldId) {
  const normalized = normalizeBriefValue(text)
  if (!normalized || safeIsLowSignalWriterReply(normalized)) {
    return ""
  }

  if (field === "tone") {
    return safeExtractToneFromText(normalized) || (normalized.length <= 48 ? normalized : "")
  }

  if (field === "topic") {
    return normalized.length <= 120 ? compactText(normalized, 90) : ""
  }

  if (field === "audience") {
    return normalized.length <= 120 ? compactText(normalized, 90) : ""
  }

  return normalized.length <= 120 ? compactText(normalized, 90) : ""
}

function mergeWriterTurnIntoBrief(
  brief: WriterConversationBrief,
  turn: string,
  requestedFields: WriterBriefFieldId[] = [],
) {
  if (!turn.trim()) return brief

  const nextBrief: WriterConversationBrief = {
    topic: joinBriefValues(brief.topic, safeExtractTopicFromText(turn)),
    audience: joinBriefValues(brief.audience, safeExtractAudienceFromText(turn)),
    objective: joinBriefValues(brief.objective, safeExtractObjectiveFromText(turn)),
    tone: joinBriefValues(brief.tone, safeExtractToneFromText(turn)),
    constraints: joinBriefValues(brief.constraints, safeExtractConstraintsFromText(turn)),
  }

  if (requestedFields.length === 1) {
    const field = requestedFields[0]
    if (!nextBrief[field]) {
      nextBrief[field] = joinBriefValues(nextBrief[field], coerceWriterReplyForField(turn, field))
    }
  }

  return nextBrief
}

function collectWriterBriefFromConversation(history: WriterHistoryEntry[], currentQuery: string) {
  let brief = createEmptyWriterBrief()

  for (const entry of history) {
    const requestedFields = safeInferWriterRequestedFieldsFromAnswer(entry.answer || "")
    brief = mergeWriterTurnIntoBrief(brief, entry.query || entry.inputs?.contents || "", requestedFields)
  }

  const currentRequestedFields = safeInferWriterRequestedFieldsFromAnswer(history[history.length - 1]?.answer || "")
  return mergeWriterTurnIntoBrief(brief, currentQuery, currentRequestedFields)
}

function stripHiddenReasoning(raw: string) {
  return raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim()
}

function stripMarkdownForContext(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#-]/g, " ")
    .replace(/\n{2,}/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
}

function isLikelyWriterDraft(text: string) {
  const sanitized = stripHiddenReasoning(text)
  if (!sanitized) return false
  if (/^#{1,3}\s+/m.test(sanitized)) return true
  return stripMarkdownForContext(sanitized).length >= 280 && sanitized.split(/\n{2,}/).length >= 3
}

function extractLatestWriterDraft(history: WriterHistoryEntry[]) {
  for (const entry of [...history].reverse()) {
    const answer = stripHiddenReasoning(entry.answer || "")
    if (answer && isLikelyWriterDraft(answer)) {
      return answer
    }
  }

  return ""
}

function summarizeWriterAnswerForContext(answer: string) {
  const sanitized = stripHiddenReasoning(answer)
  if (!sanitized) return ""
  return compactText(stripMarkdownForContext(sanitized) || sanitized, WRITER_CONTEXT_ENTRY_MAX_CHARS)
}

function buildRecentWriterConversationContext(history: WriterHistoryEntry[]) {
  const contextualTurns = history.slice(-WRITER_CONTEXT_WINDOW_TURNS)
  if (contextualTurns.length === 0) return ""

  return contextualTurns
    .map((entry, index) =>
      [
        `Turn ${index + 1}:`,
        `User: ${compactText(entry.query || entry.inputs?.contents || "", WRITER_CONTEXT_ENTRY_MAX_CHARS)}`,
        `Assistant: ${summarizeWriterAnswerForContext(entry.answer || "") || "No stored reply."}`,
      ].join("\n"),
    )
    .join("\n\n")
}

function buildWriterBriefExtractionContext(history: WriterHistoryEntry[], currentQuery: string) {
  const turns = history.map((entry, index) =>
    [
      `Turn ${index + 1}:`,
      `User: ${compactText(entry.query || entry.inputs?.contents || "", WRITER_CONTEXT_ENTRY_MAX_CHARS) || "None"}`,
      `Assistant: ${compactText(stripHiddenReasoning(entry.answer || ""), WRITER_CONTEXT_ENTRY_MAX_CHARS) || "None"}`,
    ].join("\n"),
  )

  turns.push(`Current user turn:\n${compactText(currentQuery, WRITER_CONTEXT_ENTRY_MAX_CHARS) || "None"}`)
  return turns.join("\n\n")
}

function buildWriterBriefExtractionPrompt(params: {
  query: string
  history: WriterHistoryEntry[]
  brief: WriterConversationBrief
  platform: WriterPlatform
  mode: WriterMode
  preferredLanguage: WriterLanguage
  briefingGuide: WriterBriefingSkillDocument
}) {
  const conversationContext = buildWriterBriefExtractionContext(params.history, params.query)
  const currentBriefSummary = [
    `topic=${params.brief.topic || "missing"}`,
    `audience=${params.brief.audience || "missing"}`,
    `objective=${params.brief.objective || "missing"}`,
    `tone=${params.brief.tone || "missing"}`,
    `constraints=${params.brief.constraints || "missing"}`,
  ].join("\n")

  const outputLanguage = isChineseConversation(params.query, params.preferredLanguage) ? "Chinese" : "English"
  const systemPrompt = [
    "You extract a writing brief from a multi-turn conversation.",
    "Return JSON only. Do not write the article. Do not add markdown fences.",
    "Resolve the current best brief using the whole conversation, especially short replies to prior follow-up questions.",
    "Only fill fields that are explicit or strongly implied.",
    "If a field is still unclear, return an empty string for that field.",
    "Use concise field values, not full sentences unless necessary.",
  ].join("\n")

  const userPrompt = [
    `Platform: ${params.platform}`,
    `Mode: ${params.mode}`,
    `Preferred response language: ${outputLanguage}`,
    "Required brief fields:",
    ...params.briefingGuide.requiredBriefFields.map((field) => `- ${field}`),
    "Collection rules:",
    ...params.briefingGuide.collectionRules.map((rule) => `- ${rule}`),
    "Current heuristic brief:",
    currentBriefSummary,
    "Conversation:",
    conversationContext,
    "Return exactly one JSON object with this shape:",
    JSON.stringify({
      resolvedBrief: {
        topic: "",
        audience: "",
        objective: "",
        tone: "",
        constraints: "",
      },
      answeredFields: ["topic"],
      suggestedFollowUpFields: ["audience"],
      suggestedFollowUpQuestion: "question text here",
      userWantsDirectOutput: false,
      briefSufficient: false,
      confidence: 0.8,
    }),
    "Rules for the JSON response:",
    "- answeredFields must only contain topic, audience, objective, or tone.",
    "- suggestedFollowUpFields must contain at most two items from topic, audience, objective, or tone.",
    "- suggestedFollowUpQuestion must be empty if no clarification is needed.",
    "- briefSufficient should be true when the topic is clear and the assistant can reasonably draft now.",
    "- userWantsDirectOutput should be true if the latest user turn asks to start writing immediately.",
  ].join("\n")

  return { systemPrompt, userPrompt }
}

const WRITER_OBJECTIVE_SIGNAL_RE =
  /(?:咨询|转化|认知|获客|线索|留资|预约|试用|成交|下单|报名|涨粉|曝光|awareness|trust|conversion|lead|signup|sign-up|trial|purchase|consultation|demo)/iu

const WRITER_AUDIENCE_SIGNAL_RE =
  /(?:老板|创始人|创业者|制造业|企业主|高管|决策者|销售|运营|市场|用户|客户|团队|读者|founder|buyer|leader|executive|sales|operator|marketer|customer|team)/iu

function inferWriterBriefFromPromptedReply(
  query: string,
  requestedFields: WriterBriefFieldId[],
  brief: WriterConversationBrief,
) {
  const normalized = query.trim()
  if (!normalized || safeIsLowSignalWriterReply(normalized)) {
    return createEmptyWriterBrief()
  }

  const inferred = createEmptyWriterBrief()
  const objectiveCandidate = safeExtractObjectiveFromText(normalized)
  const audienceCandidate = safeExtractAudienceFromText(normalized)
  const toneCandidate = safeExtractToneFromText(normalized)
  const topicCandidate = safeExtractTopicFromText(normalized)
  const objectiveLike = WRITER_OBJECTIVE_SIGNAL_RE.test(normalized)
  const audienceLike = WRITER_AUDIENCE_SIGNAL_RE.test(normalized)
  const looksLikeShortFollowUpReply = normalized.length <= 32 && Boolean(brief.topic)

  if (requestedFields.includes("objective") && objectiveCandidate) {
    inferred.objective = objectiveCandidate
  }
  if (requestedFields.includes("audience") && audienceCandidate) {
    inferred.audience = audienceCandidate
  }
  if (requestedFields.includes("tone") && toneCandidate) {
    inferred.tone = toneCandidate
  }
  if (
    requestedFields.includes("topic") &&
    topicCandidate &&
    (requestedFields.length === 1 || (!objectiveLike && !audienceLike))
  ) {
    inferred.topic = topicCandidate
  }

  if (!inferred.objective && requestedFields.includes("objective") && objectiveLike && !audienceLike) {
    inferred.objective = compactText(normalized, WRITER_BRIEF_EXTRACTION_MAX_CHARS)
  }
  if (!inferred.audience && requestedFields.includes("audience") && audienceLike && !objectiveLike) {
    inferred.audience = compactText(normalized, WRITER_BRIEF_EXTRACTION_MAX_CHARS)
  }
  if (
    !inferred.objective &&
    !inferred.audience &&
    !inferred.topic &&
    requestedFields.includes("objective") &&
    requestedFields.includes("audience") &&
    normalized.length <= 24
  ) {
    inferred.objective = compactText(normalized, WRITER_BRIEF_EXTRACTION_MAX_CHARS)
  }

  if (!inferred.objective && !brief.objective && objectiveLike && !audienceLike && looksLikeShortFollowUpReply) {
    inferred.objective = compactText(normalized, WRITER_BRIEF_EXTRACTION_MAX_CHARS)
  }
  if (!inferred.audience && !brief.audience && audienceLike && !objectiveLike && looksLikeShortFollowUpReply) {
    inferred.audience = compactText(normalized, WRITER_BRIEF_EXTRACTION_MAX_CHARS)
  }

  return inferred
}

function extractWriterBriefWithFixture(params: {
  query: string
  history: WriterHistoryEntry[]
  brief: WriterConversationBrief
  platform: WriterPlatform
  mode: WriterMode
  preferredLanguage: WriterLanguage
  briefingGuide: WriterBriefingSkillDocument
}): WriterBriefExtractionResult {
  const latestAssistantAnswer = params.history[params.history.length - 1]?.answer || ""
  const requestedFields = safeInferWriterRequestedFieldsFromAnswer(latestAssistantAnswer)
  const inferredFromPromptedReply = inferWriterBriefFromPromptedReply(params.query, requestedFields, params.brief)
  const resolvedBrief = mergeStructuredWriterBrief(params.brief, inferredFromPromptedReply)
  const actionableMissingFields = getWriterActionableMissingFields(resolvedBrief)
  const chinese = isChineseConversation(params.query, params.preferredLanguage)
  const userWantsDirectOutput = safeWantsDirectWriterOutput(params.query)
  const briefSufficient = actionableMissingFields.length === 0

  return {
    resolvedBrief,
    answeredFields: sanitizeWriterBriefFields([
      ...requestedFields.filter((field) => Boolean(inferredFromPromptedReply[field])),
      ...WRITER_BRIEF_FIELD_IDS.filter((field) => Boolean(resolvedBrief[field]) && !params.brief[field]),
    ]),
    suggestedFollowUpFields: briefSufficient ? [] : actionableMissingFields.slice(0, 2),
    suggestedFollowUpQuestion:
      briefSufficient || userWantsDirectOutput
        ? ""
        : safeBuildWriterFollowUpQuestion({
          brief: resolvedBrief,
          missingFields: actionableMissingFields,
          chinese,
        }),
    userWantsDirectOutput,
    briefSufficient,
    confidence: inferredFromPromptedReply.objective || inferredFromPromptedReply.audience ? 0.96 : 0.72,
  }
}

async function extractWriterBriefWithModel(params: {
  query: string
  history: WriterHistoryEntry[]
  brief: WriterConversationBrief
  platform: WriterPlatform
  mode: WriterMode
  preferredLanguage: WriterLanguage
  briefingGuide: WriterBriefingSkillDocument
}): Promise<WriterBriefExtractionResult | null> {
  if (shouldUseWriterE2EFixtures()) {
    return extractWriterBriefWithFixture(params)
  }

  if (!hasWriterTextProvider()) {
    return null
  }

  try {
    const { systemPrompt, userPrompt } = buildWriterBriefExtractionPrompt(params)
    const raw = await generateTextWithWriterModel(systemPrompt, userPrompt, WRITER_TEXT_MODEL, {
      temperature: 0,
      maxTokens: 900,
    })
    const parsed = WRITER_BRIEF_EXTRACTION_SCHEMA.safeParse(JSON.parse(extractJsonObjectFromText(raw)))
    if (!parsed.success) {
      console.warn("writer.brief-extraction.invalid", parsed.error.flatten())
      return null
    }

    return {
      resolvedBrief: mergeStructuredWriterBrief(createEmptyWriterBrief(), parsed.data.resolvedBrief),
      answeredFields: sanitizeWriterBriefFields(parsed.data.answeredFields),
      suggestedFollowUpFields: sanitizeWriterBriefFields(parsed.data.suggestedFollowUpFields),
      suggestedFollowUpQuestion: parsed.data.suggestedFollowUpQuestion.trim(),
      userWantsDirectOutput: parsed.data.userWantsDirectOutput,
      briefSufficient: parsed.data.briefSufficient,
      confidence: parsed.data.confidence,
    }
  } catch (error) {
    console.warn("writer.brief-extraction.failed", error instanceof Error ? error.message : String(error))
    return null
  }
}

function _legacyWantsDirectWriterOutput(query: string) {
  return /(?:直接写|直接生成|直接出稿|直接开始|直接给我成稿|go ahead|just write|draft it now|generate now)/iu.test(query)
}

function isChineseConversation(query: string, preferredLanguage: WriterLanguage) {
  if (preferredLanguage === "zh") return true
  if (preferredLanguage === "en") return false
  return /[\u4e00-\u9fff]/u.test(query)
}

function _wantsDirectWriterOutput(query: string) {
  return /(?:直接写|直接生成|直接出稿|直接开始|直接给我成稿|go ahead|just write|draft it now|generate now)/iu.test(query)
}

function _legacySummarizeCollectedWriterBrief(brief: WriterConversationBrief, chinese: boolean) {
  const rows = [
    chinese ? `主题：${brief.topic || "待补充"}` : `Topic: ${brief.topic || "Missing"}`,
    chinese ? `受众：${brief.audience || "待补充"}` : `Audience: ${brief.audience || "Missing"}`,
    chinese ? `目标：${brief.objective || "待补充"}` : `Objective: ${brief.objective || "Missing"}`,
    chinese ? `语气：${brief.tone || "待补充"}` : `Tone: ${brief.tone || "Missing"}`,
  ]

  if (brief.constraints) {
    rows.push(chinese ? `约束：${brief.constraints}` : `Constraints: ${brief.constraints}`)
  }

  return rows.join(chinese ? "；" : "; ")
}

function __legacySummarizeCollectedWriterBrief(brief: WriterConversationBrief, chinese: boolean) {
  const rows = [
    chinese ? `主题：${brief.topic || "待补充"}` : `Topic: ${brief.topic || "Missing"}`,
    chinese ? `受众：${brief.audience || "待补充"}` : `Audience: ${brief.audience || "Missing"}`,
    chinese ? `目标：${brief.objective || "待补充"}` : `Objective: ${brief.objective || "Missing"}`,
    chinese ? `语气：${brief.tone || "待补充"}` : `Tone: ${brief.tone || "Missing"}`,
  ]

  if (brief.constraints) {
    rows.push(chinese ? `约束：${brief.constraints}` : `Constraints: ${brief.constraints}`)
  }

  return rows.join(chinese ? "；" : "; ")
}

function summarizeCollectedWriterBrief(brief: WriterConversationBrief, chinese: boolean) {
  const rows = [
    chinese ? `主题：${brief.topic || "待补充"}` : `Topic: ${brief.topic || "Missing"}`,
    chinese ? `受众：${brief.audience || "待补充"}` : `Audience: ${brief.audience || "Missing"}`,
    chinese ? `目标：${brief.objective || "待补充"}` : `Objective: ${brief.objective || "Missing"}`,
    chinese ? `语气：${brief.tone || "待补充"}` : `Tone: ${brief.tone || "Missing"}`,
  ]

  if (brief.constraints) {
    rows.push(chinese ? `约束：${brief.constraints}` : `Constraints: ${brief.constraints}`)
  }

  return rows.join(chinese ? "；" : "; ")
}

function _legacyBuildWriterFollowUpQuestion(params: {
  brief: WriterConversationBrief
  missingFields: WriterBriefFieldId[]
  turnCount: number
  maxTurns: number
  chinese: boolean
}) {
  const followUpFields = params.missingFields.slice(0, 2)
  const fieldPrompts = followUpFields.map((field) => {
    if (params.chinese) {
      if (field === "topic") return "这篇文章最想聚焦的主题或核心角度是什么？"
      if (field === "audience") return "主要是写给谁看的？"
      if (field === "objective") return "你最希望这篇文章达成什么结果，例如建立认知、促成咨询或带来转化？"
      return "希望整体语气更偏专业、克制、故事感，还是更轻松直接？"
    }

    if (field === "topic") return "What exact topic or angle should the article focus on?"
    if (field === "audience") return "Who is the primary audience?"
    if (field === "objective") return "What result should the article drive, such as awareness, trust, or conversion?"
    return "What tone should it carry: professional, restrained, narrative, or something else?"
  })

  if (params.chinese) {
    return [
      `我先确认一下当前信息：${summarizeCollectedWriterBrief(params.brief, true)}。`,
      `为了把文章写得更贴合预期，还差 ${params.missingFields.length} 项关键信息。`,
      fieldPrompts.map((prompt, index) => `${index + 1}. ${prompt}`).join("\n"),
      `当前为第 ${params.turnCount}/${params.maxTurns} 轮，补充后我就继续出稿。`,
    ].join("\n")
  }

  return [
    `Here is what I already have: ${summarizeCollectedWriterBrief(params.brief, false)}.`,
    `I still need ${params.missingFields.length} key detail(s) before drafting.`,
    fieldPrompts.map((prompt, index) => `${index + 1}. ${prompt}`).join("\n"),
    "Once you answer those points, I can move straight into the draft.",
  ].join("\n")
}

function _legacyBuildWriterFollowUpQuestionCurrent(params: {
  brief: WriterConversationBrief
  missingFields: WriterBriefFieldId[]
  turnCount: number
  maxTurns: number
  chinese: boolean
}) {
  const followUpFields = params.missingFields.slice(0, 2)
  const fieldPrompts = followUpFields.map((field) => {
    if (params.chinese) {
      if (field === "topic") return "这篇文章最想聚焦的主题或核心角度是什么？"
      if (field === "audience") return "这篇文章主要是写给谁看的？"
      if (field === "objective") return "你最希望这篇文章达成什么结果，例如建立认知、促成咨询或带来转化？"
      return "整体语气希望更偏专业、克制、故事感，还是更轻松直接？"
    }

    if (field === "topic") return "What exact topic or angle should the article focus on?"
    if (field === "audience") return "Who is the primary audience?"
    if (field === "objective") return "What result should the article drive, such as awareness, trust, or conversion?"
    return "What tone should it carry: professional, restrained, narrative, or something else?"
  })

  if (params.chinese) {
    return [
      `我先确认一下当前信息：${summarizeCollectedWriterBrief(params.brief, true)}。`,
      `为了把文章写得更贴合预期，还差 ${params.missingFields.length} 项关键信息。`,
      fieldPrompts.map((prompt, index) => `${index + 1}. ${prompt}`).join("\n"),
      "补充这些信息后，我就可以直接开始生成文章。",
    ].join("\n")
  }

  return [
    `Here is what I already have: ${summarizeCollectedWriterBrief(params.brief, false)}.`,
    `I still need ${params.missingFields.length} key detail(s) before drafting.`,
    fieldPrompts.map((prompt, index) => `${index + 1}. ${prompt}`).join("\n"),
    "Once you answer those points, I can move straight into the draft.",
  ].join("\n")
}

function _buildWriterFollowUpQuestion(params: {
  brief: WriterConversationBrief
  missingFields: WriterBriefFieldId[]
  turnCount: number
  maxTurns: number
  chinese: boolean
}) {
  const followUpFields = params.missingFields.slice(0, 2)
  const fieldPrompts = followUpFields.map((field) => {
    if (params.chinese) {
      if (field === "topic") return "这篇文章最想聚焦的主题或核心角度是什么？"
      if (field === "audience") return "这篇文章主要是写给谁看的？"
      if (field === "objective") return "你最希望这篇文章达成什么结果，例如建立认知、促成咨询或带来转化？"
      return "整体语气希望更偏专业、克制、故事感，还是更轻松直接？"
    }

    if (field === "topic") return "What exact topic or angle should the article focus on?"
    if (field === "audience") return "Who is the primary audience?"
    if (field === "objective") return "What result should the article drive, such as awareness, trust, or conversion?"
    return "What tone should it carry: professional, restrained, narrative, or something else?"
  })

  if (params.chinese) {
    return [
      `我先确认一下当前信息：${summarizeCollectedWriterBrief(params.brief, true)}。`,
      `为了把文章写得更贴合预期，还差 ${params.missingFields.length} 项关键信息。`,
      fieldPrompts.map((prompt, index) => `${index + 1}. ${prompt}`).join("\n"),
      "补充这些信息后，我就可以直接开始生成文章。",
    ].join("\n")
  }

  return [
    `Here is what I already have: ${summarizeCollectedWriterBrief(params.brief, false)}.`,
    `I still need ${params.missingFields.length} key detail(s) before drafting.`,
    fieldPrompts.map((prompt, index) => `${index + 1}. ${prompt}`).join("\n"),
    "Once you answer those points, I can move straight into the draft.",
  ].join("\n")
}

function buildWriterBriefPrompt(
  originalQuery: string,
  brief: WriterConversationBrief,
  platform: WriterPlatform,
  mode: WriterMode,
  options?: {
    history?: WriterHistoryEntry[]
    latestDraft?: string | null
  },
) {
  const recentConversationContext = buildRecentWriterConversationContext(options?.history || [])
  const latestDraft = options?.latestDraft
    ? stripHiddenReasoning(options.latestDraft).slice(0, WRITER_PRIOR_DRAFT_MAX_CHARS)
    : ""

  return [
    originalQuery.trim(),
    ...(latestDraft ? ["", "Current working draft to revise or continue:", latestDraft] : []),
    ...(recentConversationContext ? ["", "Recent conversation context:", recentConversationContext] : []),
    "",
    "Approved writing brief:",
    `- Topic and angle: ${brief.topic}`,
    `- Target audience: ${brief.audience || "Readers who care about this topic on the selected platform."}`,
    `- Primary objective: ${brief.objective || "Help readers quickly understand the topic and build trust."}`,
    `- Tone and voice: ${brief.tone || "Use the platform-native default tone."}`,
    `- Platform: ${platform}`,
    `- Output mode: ${mode}`,
    brief.constraints ? `- Constraints: ${brief.constraints}` : "",
    "",
    latestDraft
      ? "Revise or continue the existing draft above. Keep useful structure and facts unless the user explicitly asks to replace them."
      : "Write the first full draft based on this approved brief.",
    "Do not ask follow-up questions in the final output.",
  ]
    .filter(Boolean)
    .join("\n")
}

function shouldUseWriterE2EFixtures() {
  return process.env.WRITER_E2E_FIXTURES === "true"
}

function hasWriterResearchConfig() {
  return Boolean(GOOGLE_SEARCH_API_KEY && GOOGLE_SEARCH_ENGINE_ID && JINA_API_KEY)
}

function createEmptyResearchResult(status: WriterResearchResult["status"]): WriterResearchResult {
  return {
    items: [],
    extracts: [],
    status,
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: () => T): Promise<T> {
  if (timeoutMs <= 0) {
    return fallback()
  }

  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback()), timeoutMs)
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

function _legacyBuildFixtureKnowledgeBlock(enterpriseKnowledge?: EnterpriseKnowledgeContext | null) {
  if (!enterpriseKnowledge?.snippets?.length) {
    return ""
  }

  return `\n## 企业知识锚点\n\n${enterpriseKnowledge.snippets.map((snippet) => `- ${snippet.content}`).join("\n")}\n`
}

function _legacyBuildFixtureDraft(
  platform: WriterPlatform,
  mode: WriterMode,
  preferredLanguage: WriterLanguage,
  enterpriseKnowledge?: EnterpriseKnowledgeContext | null,
) {
  const language = preferredLanguage === "auto" ? "zh" : preferredLanguage
  const knowledgeBlock = buildFixtureKnowledgeBlock(enterpriseKnowledge)

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
    return `### 第 1 段
**先说结论：** AI 创业真正稀缺的不是模型，而是贴着业务流程落地的能力。

### 第 2 段
很多团队把时间花在追新模型上，却没有把用户旅程、数据回流和自动化闭环做扎实。

### 第 3 段
> 如果一个 Agent 不能稳定完成任务，它就只是一个会聊天的界面。

### 第 4 段
- 先选垂直场景
- 再补自动化能力
- 最后再优化模型效果

![Cover](writer-asset://cover)

### 第 5 段
把工程能力、工作流和反馈回路放在第一位，增长效率会高很多。

### 第 6 段
${enterpriseKnowledge?.snippets?.[0]?.content || "如果你也在做 AI 产品，欢迎交流你最关心的落地问题。"}
`
  }

  return `# AI 创业团队如何避免内容空转

${knowledgeBlock}
公众号内容真正稀缺的，不是“写得多”，而是“写了之后能形成增长资产”。

## 先明确内容服务的业务目标

很多团队一开始就追求选题数量，但没有先定义内容要服务哪一段业务链路：获客、教育、转化，还是客户成功。

> 没有业务目标的内容生产，通常只会变成内部自我感动。

## 建立稳定的内容复用机制

把一次调研拆成多个可复用资产，例如文章、社媒摘录、销售跟进素材和知识库更新，才能让内容真正沉淀下来。

**关键做法：** 每次发布后都要记录阅读、转发、咨询和转化反馈。

## 用固定工作流降低内容波动

- 先做研究和资料归纳
- 再产出首稿并确认文案
- 最后生成配图并统一预览

![Cover](writer-asset://cover)

## 让内容与团队协作闭环

运营、销售和产品都应该能从同一篇文章里抽取可用信息，避免内容停留在单点产出。

写到最后，真正有价值的内容，不是更花哨，而是更能帮助团队稳定复用、持续转化。
`
}

function buildFixtureKnowledgeBlock(enterpriseKnowledge?: EnterpriseKnowledgeContext | null) {
  if (!enterpriseKnowledge?.snippets?.length) {
    return ""
  }

  return `\n## 企业知识要点\n\n${enterpriseKnowledge.snippets.map((snippet) => `- ${snippet.content}`).join("\n")}\n`
}

function _buildFixtureDraft(
  platform: WriterPlatform,
  mode: WriterMode,
  preferredLanguage: WriterLanguage,
  enterpriseKnowledge?: EnterpriseKnowledgeContext | null,
) {
  const language = preferredLanguage === "auto" ? "zh" : preferredLanguage
  const knowledgeBlock = buildFixtureKnowledgeBlock(enterpriseKnowledge)

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
The real bottleneck for AI teams is usually not the model itself, but the ability to connect it to real workflows.

### Segment 2
Many teams spend too much energy chasing the newest model and too little on user journeys, data feedback, and automation loops.

### Segment 3
> If an agent cannot complete real tasks consistently, it is still just a chat surface.

### Segment 4
- Start with a narrow use case
- Build the workflow end to end
- Optimize the model after the system is usable

![Cover](writer-asset://cover)

### Segment 5
When engineering, workflow, and feedback loops come first, growth efficiency usually improves much faster.

### Segment 6
${enterpriseKnowledge?.snippets?.[0]?.content || "If you are also building AI products, start from the hardest real workflow problem."}
`
  }

  return `# AI 创业团队如何避免内容空转

${knowledgeBlock}
团队真正缺的，往往不是“写得更多”，而是“写完以后能沉淀为增长资产”。

## 先明确内容服务的业务目标

很多团队一开始就追求选题数量，却没有先定义内容到底要服务哪一段业务链路，例如获客、教育、转化，还是客户成功。

> 没有业务目标的内容生产，通常只会变成内部自我感动。

## 建立稳定的内容复用机制

把一次调研拆成多个可复用资产，例如文章、社媒摘要、销售跟进素材和知识库更新，才能让内容真正沉淀下来。

**关键做法：** 每次发布后都记录阅读、转发、咨询和转化反馈。

## 用固定工作流降低内容波动

- 先做研究和资料归纳
- 再产出首稿并确认文案
- 最后生成配图并统一预览

![Cover](writer-asset://cover)

## 让内容与团队协作形成闭环

运营、销售和产品都应该能从同一篇文章里提取可用信息，避免内容停留在单点产出。

写到最后，真正有价值的内容，不是更花哨，而是更能帮助团队稳定复用、持续转化。
`
}

function normalizeLineBreaks(value: string) {
  return value.replace(/\r\n/g, "\n").trim()
}

function _detectRequestedLanguage(query: string, preferredLanguage: WriterLanguage = "auto") {
  if (preferredLanguage !== "auto") {
    const explicitMap: Record<Exclude<WriterLanguage, "auto">, { label: string; instruction: string }> = {
      zh: { label: "Chinese", instruction: "Write the final output fully in Chinese." },
      en: { label: "English", instruction: "Write the final output fully in English." },
      ja: { label: "Japanese", instruction: "Write the final output fully in Japanese." },
      ko: { label: "Korean", instruction: "Write the final output fully in Korean." },
      fr: { label: "French", instruction: "Write the final output fully in French." },
      de: { label: "German", instruction: "Write the final output fully in German." },
      es: { label: "Spanish", instruction: "Write the final output fully in Spanish." },
    }

    return explicitMap[preferredLanguage]
  }

  const normalized = query.toLowerCase()

  if (/\b(in|use|write|generate|output)\s+english\b/.test(normalized) || /英文|英语/.test(query)) {
    return { label: "English", instruction: "Write the final output fully in English." }
  }
  if (/日文|日语|日本語|japanese/i.test(query)) {
    return { label: "Japanese", instruction: "Write the final output fully in Japanese." }
  }
  if (/韩文|韩语|한국어|korean/i.test(query)) {
    return { label: "Korean", instruction: "Write the final output fully in Korean." }
  }
  if (/法文|法语|français|french/i.test(query)) {
    return { label: "French", instruction: "Write the final output fully in French." }
  }
  if (/德文|德语|deutsch|german/i.test(query)) {
    return { label: "German", instruction: "Write the final output fully in German." }
  }
  if (/西班牙文|西班牙语|español|spanish/i.test(query)) {
    return { label: "Spanish", instruction: "Write the final output fully in Spanish." }
  }

  return { label: "Chinese", instruction: "Write the final output fully in Chinese." }
}

function _legacyDetectRequestedLanguage(query: string, preferredLanguage: WriterLanguage = "auto") {
  if (preferredLanguage !== "auto") {
    const explicitMap: Record<Exclude<WriterLanguage, "auto">, { label: string; instruction: string }> = {
      zh: { label: "Chinese", instruction: "Write the final output fully in Chinese." },
      en: { label: "English", instruction: "Write the final output fully in English." },
      ja: { label: "Japanese", instruction: "Write the final output fully in Japanese." },
      ko: { label: "Korean", instruction: "Write the final output fully in Korean." },
      fr: { label: "French", instruction: "Write the final output fully in French." },
      de: { label: "German", instruction: "Write the final output fully in German." },
      es: { label: "Spanish", instruction: "Write the final output fully in Spanish." },
    }

    return explicitMap[preferredLanguage]
  }

  const normalized = query.toLowerCase()

  if (/\b(in|use|write|generate|output)\s+english\b/.test(normalized) || /英文|英语/.test(query)) {
    return { label: "English", instruction: "Write the final output fully in English." }
  }
  if (/日文|日语|日本語|japanese/i.test(query)) {
    return { label: "Japanese", instruction: "Write the final output fully in Japanese." }
  }
  if (/韩文|韩语|한국어|korean/i.test(query)) {
    return { label: "Korean", instruction: "Write the final output fully in Korean." }
  }
  if (/法文|法语|français|french/i.test(query)) {
    return { label: "French", instruction: "Write the final output fully in French." }
  }
  if (/德文|德语|deutsch|german/i.test(query)) {
    return { label: "German", instruction: "Write the final output fully in German." }
  }
  if (/西班牙文|西班牙语|español|spanish/i.test(query)) {
    return { label: "Spanish", instruction: "Write the final output fully in Spanish." }
  }

  return { label: "Chinese", instruction: "Write the final output fully in Chinese." }
}

function splitMarkdownSections(markdown: string) {
  const lines = markdown.split("\n")
  const sections: Array<{ heading: string | null; lines: string[] }> = []
  let current: { heading: string | null; lines: string[] } = { heading: null, lines: [] }

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (current.lines.length > 0) {
        sections.push(current)
      }
      current = { heading: line.replace(/^##\s+/, "").trim(), lines: [line] }
      continue
    }

    current.lines.push(line)
  }

  if (current.lines.length > 0) {
    sections.push(current)
  }

  return sections
}

function _stripWechatMetaSections(markdown: string) {
  const blockedHeadings = [
    "title options",
    "publishing notes",
    "image notes",
    "配图说明",
    "图片说明",
    "发布说明",
    "发布建议",
    "标题备选",
    "备选标题",
  ]

  const sections = splitMarkdownSections(markdown).filter((section) => {
    const heading = (section.heading || "").toLowerCase()
    return !blockedHeadings.some((blocked) => heading.includes(blocked))
  })

  return sections
    .map((section) => section.lines.join("\n").trim())
    .filter(Boolean)
    .join("\n\n")
}

function _legacyStripWechatMetaSections(markdown: string) {
  const blockedHeadings = [
    "title options",
    "publishing notes",
    "image notes",
    "配图说明",
    "图片说明",
    "发布说明",
    "发布建议",
    "标题备选",
    "备选标题",
  ]

  const sections = splitMarkdownSections(markdown).filter((section) => {
    const heading = (section.heading || "").toLowerCase()
    return !blockedHeadings.some((blocked) => heading.includes(blocked))
  })

  return sections
    .map((section) => section.lines.join("\n").trim())
    .filter(Boolean)
    .join("\n\n")
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
  if (firstContentIndex < 0) {
    return `# ${fallbackTitle}`
  }

  const title = lines[firstContentIndex].replace(/^#+\s*/, "").trim() || fallbackTitle
  const rest = lines.filter((_, index) => index !== firstContentIndex)
  return [`# ${title}`, ...rest].join("\n").trim()
}

function _legacyNormalizeWechatTitle(markdown: string, languageLabel: string) {
  const fallbackTitle = languageLabel === "Chinese" ? "未命名文章" : "Untitled Article"
  const lines = markdown.split("\n")
  const titleIndex = lines.findIndex((line) => /^#\s+/.test(line))

  if (titleIndex >= 0) {
    const title = lines[titleIndex].replace(/^#\s+/, "").trim()
    const rest = lines.filter((_, index) => index !== titleIndex && !/^#\s+/.test(lines[index]))
    return [`# ${title || fallbackTitle}`, ...rest].join("\n").trim()
  }

  const firstContentIndex = lines.findIndex((line) => line.trim())
  if (firstContentIndex < 0) {
    return `# ${fallbackTitle}`
  }

  const title = lines[firstContentIndex].replace(/^#+\s*/, "").trim() || fallbackTitle
  const rest = lines.filter((_, index) => index !== firstContentIndex)
  return [`# ${title}`, ...rest].join("\n").trim()
}

function postProcessWriterDraft(platform: WriterPlatform, mode: WriterMode, markdown: string, languageLabel: string) {
  const normalized = normalizeLineBreaks(markdown)

  if (platform !== "wechat" || mode !== "article") {
    return normalized
  }

  let next = safeNormalizeWechatTitle(normalized, languageLabel)
  next = safeStripWechatMetaSections(next)
  return next.replace(/\n{3,}/g, "\n\n").trim()
}

function safeExtractFirstChineseMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    const value = normalizeBriefValue(match?.[1] || "")
    if (value) return value
  }
  return ""
}

function safeExtractTopicFromText(text: string) {
  const explicit = safeExtractFirstChineseMatch(text, [
    /(?:\u4e3b\u9898|\u8bdd\u9898|\u9009\u9898|\u6807\u9898\u65b9\u5411|\u6838\u5fc3\u89d2\u5ea6)\s*(?::|\uff1a)?\s*([^\uff0c\u3002\uff1b;\n]+)/iu,
    /(?:\u5173\u4e8e|\u56f4\u7ed5|\u805a\u7126\u4e8e?)\s*([^\uff0c\u3002\uff1b;\n]+)/iu,
    /(?:write|draft|create)\s+(?:an?|the)?\s*(?:article|post|thread|wechat article|xiaohongshu note)?\s*(?:about|on)\s+([^,.;\n]+)/iu,
    /(?:article|post|thread)\s+(?:about|on)\s+([^,.;\n]+)/iu,
  ])
  if (explicit) return explicit
  const objectiveLike = WRITER_OBJECTIVE_SIGNAL_RE.test(text)
  const audienceLike = WRITER_AUDIENCE_SIGNAL_RE.test(text)
  if (!/[\u3002\uff01\uff1f?]/u.test(text) && text.length <= 120 && !objectiveLike && !audienceLike) {
    return compactText(text, 90)
  }
  return ""
}

function safeExtractAudienceFromText(text: string) {
  return safeExtractFirstChineseMatch(text, [
    /(?:\u9762\u5411|\u9488\u5bf9|\u9002\u5408|\u8bfb\u8005\u662f|\u53d7\u4f17\u662f|\u76ee\u6807\u8bfb\u8005|\u76ee\u6807\u7528\u6237|\u76ee\u6807\u53d7\u4f17)\s*(?::|\uff1a)?\s*([^\uff0c\u3002\uff1b;\n]+)/iu,
    /(?:for|target(?:ing)?|audience(?: is)?)\s+([^,.;\n]+)/iu,
  ])
}

function safeExtractObjectiveFromText(text: string) {
  return safeExtractFirstChineseMatch(text, [
    /(?:\u76ee\u6807\u662f|\u76ee\u7684\u662f|\u8bc9\u6c42\u662f|\u5e0c\u671b|\u7528\u4e8e|\u60f3\u8fbe\u5230|\u60f3\u5b9e\u73b0|\u60f3\u8ba9\u8bfb\u8005)\s*(?::|\uff1a)?\s*([^\uff0c\u3002\uff1b;\n]+)/iu,
    /(?:goal|objective|cta|call to action)(?: is|:)?\s*([^,.;\n]+)/iu,
  ])
}

function safeExtractToneFromText(text: string) {
  const explicit = safeExtractFirstChineseMatch(text, [
    /(?:\u8bed\u6c14|\u53e3\u543b|\u98ce\u683c|\u57fa\u8c03|\u6587\u98ce|tone|style)\s*(?::|\uff1a)?\s*([^\uff0c\u3002\uff1b;\n]+)/iu,
  ])
  if (explicit) return explicit

  const safeToneKeywords = [
    "professional",
    "conversational",
    "friendly",
    "sharp",
    "formal",
    "casual",
    "analytical",
    "story-driven",
    "direct",
    "warm",
    "playful",
    "authoritative",
    "\u4e13\u4e1a",
    "\u6b63\u5f0f",
    "\u8f7b\u677e",
    "\u53e3\u8bed\u5316",
    "\u514b\u5236",
    "\u7280\u5229",
    "\u6545\u4e8b\u611f",
    "\u5206\u6790\u578b",
    "\u4eb2\u5207",
    "\u6743\u5a01",
    "\u5e7d\u9ed8",
  ]
  const normalized = text.toLowerCase()
  return safeToneKeywords.filter((keyword) => normalized.includes(keyword.toLowerCase())).join(", ")
}

function safeExtractConstraintsFromText(text: string) {
  return safeExtractFirstChineseMatch(text, [
    /(?:\u7bc7\u5e45|\u957f\u5ea6|\u7ed3\u6784|\u683c\u5f0f|\u5fc5\u987b\u5305\u542b|\u9700\u8981\u5305\u542b|\u5b57\u6570|\u9650\u5236)\s*(?::|\uff1a)?\s*([^\u3002\uff1b;\n]+)/iu,
    /(?:length|format|structure|must include|constraints?)(?: is|:)?\s*([^.\n]+)/iu,
  ])
}

function safeInferWriterRequestedFieldsFromAnswer(answer: string) {
  const requestedFields: WriterBriefFieldId[] = []
  if (/(topic|angle|\u4e3b\u9898|\u8bdd\u9898|\u9009\u9898|\u89d2\u5ea6)/iu.test(answer)) requestedFields.push("topic")
  if (/(audience|reader|target user|\u53d7\u4f17|\u8bfb\u8005|\u9762\u5411|\u5199\u7ed9\u8c01)/iu.test(answer)) requestedFields.push("audience")
  if (/(objective|goal|result|cta|\u8f6c\u5316|\u54a8\u8be2|\u7ed3\u679c|\u76ee\u6807|\u8fbe\u6210\u4ec0\u4e48)/iu.test(answer)) requestedFields.push("objective")
  if (/(tone|voice|style|\u8bed\u6c14|\u98ce\u683c|\u53e3\u543b|\u6587\u98ce)/iu.test(answer)) requestedFields.push("tone")
  return requestedFields.filter((field, index) => requestedFields.indexOf(field) === index)
}

function safeIsLowSignalWriterReply(text: string) {
  return /^(ok|okay|yes|no|\u597d\u7684|\u597d|\u884c|\u53ef\u4ee5|\u6536\u5230|\u660e\u767d\u4e86|\u55ef|\u6069|\u968f\u4fbf|\u90fd\u884c)$/iu.test(text.trim())
}

function safeWantsDirectWriterOutput(query: string) {
  return /(?:\u76f4\u63a5\u5199|\u76f4\u63a5\u751f\u6210|\u76f4\u63a5\u51fa\u7a3f|\u76f4\u63a5\u5f00\u59cb|\u76f4\u63a5\u7ed9\u6211\u6210\u7a3f|\u7acb\u5373\u51fa\u7a3f|\u5e2e\u6211\u8d77\u8349|\u4e3b\u9898\u662f|\u6807\u9898\u662f|Markdown \u8f93\u51fa|Markdown output|\u5305\u542b\u4e00\u4e2a\u4e3b\u6807\u9898|\u81f3\u5c11\u4e24\u4e2a\u4e8c\u7ea7\u6807\u9898|quote block|bullet list|go ahead|just write|draft it now|generate now)/iu.test(query)
}

function safeSummarizeCollectedWriterBrief(brief: WriterConversationBrief, chinese: boolean) {
  const rows = [
    chinese ? `\u4e3b\u9898\uff1a${brief.topic || "\u5f85\u8865\u5145"}` : `Topic: ${brief.topic || "Missing"}`,
    chinese ? `\u53d7\u4f17\uff1a${brief.audience || "\u5f85\u8865\u5145"}` : `Audience: ${brief.audience || "Missing"}`,
    chinese ? `\u76ee\u6807\uff1a${brief.objective || "\u5f85\u8865\u5145"}` : `Objective: ${brief.objective || "Missing"}`,
    chinese ? `\u8bed\u6c14\uff1a${brief.tone || "\u5f85\u8865\u5145"}` : `Tone: ${brief.tone || "Missing"}`,
  ]
  if (brief.constraints) rows.push(chinese ? `\u7ea6\u675f\uff1a${brief.constraints}` : `Constraints: ${brief.constraints}`)
  return rows.join(chinese ? "\uff1b" : "; ")
}

function safeBuildWriterFollowUpQuestion(params: {
  brief: WriterConversationBrief
  missingFields: WriterBriefFieldId[]
  chinese: boolean
}) {
  const followUpFields = params.missingFields.slice(0, 2)
  const fieldPrompts = followUpFields.map((field) => {
    if (params.chinese) {
      if (field === "topic") return "\u8fd9\u7bc7\u6587\u7ae0\u6700\u60f3\u805a\u7126\u7684\u4e3b\u9898\u6216\u6838\u5fc3\u89d2\u5ea6\u662f\u4ec0\u4e48\uff1f"
      if (field === "audience") return "\u8fd9\u7bc7\u6587\u7ae0\u4e3b\u8981\u662f\u5199\u7ed9\u8c01\u770b\u7684\uff1f"
      if (field === "objective") return "\u4f60\u6700\u5e0c\u671b\u8fd9\u7bc7\u6587\u7ae0\u8fbe\u6210\u4ec0\u4e48\u7ed3\u679c\uff0c\u4f8b\u5982\u5efa\u7acb\u8ba4\u77e5\u3001\u4fc3\u6210\u54a8\u8be2\u6216\u5e26\u6765\u8f6c\u5316\uff1f"
      return "\u6574\u4f53\u8bed\u6c14\u5e0c\u671b\u66f4\u504f\u4e13\u4e1a\u3001\u514b\u5236\u3001\u6545\u4e8b\u611f\uff0c\u8fd8\u662f\u66f4\u8f7b\u677e\u76f4\u63a5\uff1f"
    }
    if (field === "topic") return "What exact topic or angle should the article focus on?"
    if (field === "audience") return "Who is the primary audience?"
    if (field === "objective") return "What result should the article drive, such as awareness, trust, or conversion?"
    return "What tone should it carry: professional, restrained, narrative, or something else?"
  })

  if (params.chinese) {
    return [
      `\u6211\u5148\u786e\u8ba4\u4e00\u4e0b\u5f53\u524d\u4fe1\u606f\uff1a${safeSummarizeCollectedWriterBrief(params.brief, true)}\u3002`,
      `\u4e3a\u4e86\u628a\u6587\u7ae0\u5199\u5f97\u66f4\u8d34\u5408\u9884\u671f\uff0c\u8fd8\u5dee ${params.missingFields.length} \u9879\u5173\u952e\u4fe1\u606f\u3002`,
      fieldPrompts.map((prompt, index) => `${index + 1}. ${prompt}`).join("\n"),
      "\u8865\u5145\u8fd9\u4e9b\u4fe1\u606f\u540e\uff0c\u6211\u5c31\u53ef\u4ee5\u76f4\u63a5\u5f00\u59cb\u751f\u6210\u6587\u7ae0\u3002",
    ].join("\n")
  }

  return [
    `Here is what I already have: ${safeSummarizeCollectedWriterBrief(params.brief, false)}.`,
    `I still need ${params.missingFields.length} key detail(s) before drafting.`,
    fieldPrompts.map((prompt, index) => `${index + 1}. ${prompt}`).join("\n"),
    "Once you answer those points, I can move straight into the draft.",
  ].join("\n")
}

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

function safeDetectRequestedLanguage(query: string, preferredLanguage: WriterLanguage = "auto") {
  if (preferredLanguage !== "auto") {
    const explicitMap: Record<Exclude<WriterLanguage, "auto">, { label: string; instruction: string }> = {
      zh: { label: "Chinese", instruction: "Write the final output fully in Chinese." },
      en: { label: "English", instruction: "Write the final output fully in English." },
      ja: { label: "Japanese", instruction: "Write the final output fully in Japanese." },
      ko: { label: "Korean", instruction: "Write the final output fully in Korean." },
      fr: { label: "French", instruction: "Write the final output fully in French." },
      de: { label: "German", instruction: "Write the final output fully in German." },
      es: { label: "Spanish", instruction: "Write the final output fully in Spanish." },
    }
    return explicitMap[preferredLanguage]
  }

  const normalized = query.toLowerCase()
  if (/\b(in|use|write|generate|output)\s+english\b/.test(normalized) || /\u82f1\u6587|\u82f1\u8bed/.test(query)) {
    return { label: "English", instruction: "Write the final output fully in English." }
  }
  if (/\u65e5\u6587|\u65e5\u8bed|\u65e5\u672c\u8a9e|japanese/i.test(query)) {
    return { label: "Japanese", instruction: "Write the final output fully in Japanese." }
  }
  if (/\u97e9\u6587|\u97e9\u8bed|\ud55c\uad6d\uc5b4|korean/i.test(query)) {
    return { label: "Korean", instruction: "Write the final output fully in Korean." }
  }
  if (/\u6cd5\u6587|\u6cd5\u8bed|fran\u00e7ais|french/i.test(query)) {
    return { label: "French", instruction: "Write the final output fully in French." }
  }
  if (/\u5fb7\u6587|\u5fb7\u8bed|deutsch|german/i.test(query)) {
    return { label: "German", instruction: "Write the final output fully in German." }
  }
  if (/\u897f\u73ed\u7259\u6587|\u897f\u73ed\u7259\u8bed|espa\u00f1ol|spanish/i.test(query)) {
    return { label: "Spanish", instruction: "Write the final output fully in Spanish." }
  }
  return { label: "Chinese", instruction: "Write the final output fully in Chinese." }
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
  const fallbackTitle = languageLabel === "Chinese" ? "\u672a\u547d\u540d\u6587\u7ae0" : "Untitled Article"
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

function compactText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim()
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}...`
}

async function googleSearch(query: string, num = 5): Promise<SearchItem[]> {
  if (!GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
    throw new Error("writer_search_config_missing")
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1")
  url.searchParams.set("key", GOOGLE_SEARCH_API_KEY)
  url.searchParams.set("cx", GOOGLE_SEARCH_ENGINE_ID)
  url.searchParams.set("q", query)
  url.searchParams.set("num", String(Math.min(Math.max(num, 1), 10)))

  const response = await writerRequestJson(url.toString(), {}, { attempts: 2, timeoutMs: 60_000 })
  if (!response.ok) {
    throw new Error(`google_search_http_${response.status}`)
  }

  const data = response.data as any
  return Array.isArray(data?.items)
    ? data.items.map((item: any) => ({
        title: item?.title || "",
        snippet: item?.snippet || "",
        link: item?.link || "",
      }))
    : []
}

async function readWithJina(url: string) {
  if (!JINA_API_KEY) {
    throw new Error("writer_jina_config_missing")
  }

  const headers: Record<string, string> = {
    Accept: "text/markdown",
    Authorization: `Bearer ${JINA_API_KEY}`,
  }

  const response = await writerRequestText(`https://r.jina.ai/${url}`, { headers }, { attempts: 2, timeoutMs: 90_000 })
  if (!response.ok) {
    throw new Error(`jina_http_${response.status}`)
  }

  return response.text
}

async function buildResearchContext(query: string, options?: { skip?: boolean }): Promise<WriterResearchResult> {
  if (options?.skip) {
    return createEmptyResearchResult("skipped")
  }

  if (!WRITER_ENABLE_WEB_RESEARCH) {
    return createEmptyResearchResult("disabled")
  }

  if (!hasWriterResearchConfig()) {
    if (WRITER_REQUIRE_WEB_RESEARCH) {
      throw new Error("writer_search_config_missing")
    }

    return createEmptyResearchResult("unavailable")
  }

  const cacheKey = query.trim().toLowerCase()
  const cached = writerResearchCache.get(cacheKey)
  const now = Date.now()
  if (cached && cached.expiresAt > now) {
    return cached.value
  }

  const nextValue = withTimeout(buildResearchContextFresh(query), WRITER_RESEARCH_BUDGET_MS, () =>
    createEmptyResearchResult("timed_out"),
  )
  writerResearchCache.set(cacheKey, {
    expiresAt: now + WRITER_RESEARCH_CACHE_TTL_MS,
    value: nextValue,
  })

  try {
    return await nextValue
  } catch (error) {
    writerResearchCache.delete(cacheKey)
    throw error
  }
}

async function buildResearchContextFresh(query: string): Promise<WriterResearchResult> {
  const items = await googleSearch(`${query} latest trends case study`, WRITER_SEARCH_RESULT_LIMIT)
  if (items.length === 0) {
    return createEmptyResearchResult("unavailable")
  }

  const extracts = (
    await Promise.all(
      items.slice(0, WRITER_SEARCH_EXTRACT_LIMIT).map(async (item) => {
        if (!item.link) return null

        try {
          const content = await readWithJina(item.link)
          if (!content.trim()) return null

          return {
            url: item.link,
            content: compactText(content, 2400),
          }
        } catch {
          return null
        }
      }),
    )
  ).filter((item): item is WriterResearchResult["extracts"][number] => Boolean(item))

  return { items, extracts, status: "ready" }
}

async function buildSystemPrompt(
  platform: WriterPlatform,
  mode: WriterMode,
  languageInstruction: string,
  research: WriterResearchResult,
  enterpriseKnowledge?: EnterpriseKnowledgeContext | null,
) {
  const guide = await getWriterRuntimeGuide(platform)
  const modeLabel = mode === "thread" ? "thread or multi-part post" : "single long-form article"

  return [
    `You are a ${guide.runtimeLabel}.`,
    "You are implementing the same writing-skill approach used by the reference project at D:/OpenCode/writer.",
    `Tone: ${guide.tone}.`,
    `Output mode: ${modeLabel}.`,
    `Content format: ${guide.contentFormat}.`,
    `Length target: ${guide.lengthTarget}.`,
    `Image guidance: ${guide.imageGuidance}.`,
    ...guide.promptRules,
    languageInstruction,
    enterpriseKnowledge?.snippets?.length
      ? "Enterprise knowledge is provided separately. Treat it as first-party brand truth and prefer it over generic assumptions."
      : "No enterprise knowledge is attached for this request.",
    "Return a publish-ready Markdown draft.",
    research.status === "ready"
      ? "Absorb the research first, then write."
      : research.status === "skipped"
        ? "Live web research was intentionally skipped for this request. Do not imply that outside research was performed."
      : "External research may be partial or unavailable. If so, rely on enterprise knowledge and broadly known information, and avoid precise unsupported claims.",
    "Do not reveal chain-of-thought, hidden reasoning, or internal analysis.",
    "Use writer-asset://cover, writer-asset://section-1, and writer-asset://section-2 as image placeholders inside the Markdown body when images are useful.",
  ].join("\n")
}

async function buildUserPrompt(
  query: string,
  platform: WriterPlatform,
  mode: WriterMode,
  research: WriterResearchResult,
  languageInstruction: string,
  enterpriseKnowledge?: EnterpriseKnowledgeContext | null,
) {
  const researchAvailabilityNote =
    research.status === "ready"
      ? "Live web research was included."
      : research.status === "skipped"
        ? "Live web research was intentionally skipped for this request."
      : research.status === "timed_out"
        ? "Live web research timed out, so continue with partial context."
        : research.status === "disabled"
          ? "Live web research is disabled for this environment."
          : "Live web research was unavailable for this request."

  const references = research.items
    .slice(0, 5)
    .map((item, index) => `${index + 1}. ${item.title}\nURL: ${item.link}\nSummary: ${item.snippet}`)
    .join("\n\n")

  const extracts = research.extracts
    .map((item, index) => `Source ${index + 1}: ${item.url}\n${item.content}`)
    .join("\n\n")

  const enterpriseKnowledgeText = enterpriseKnowledge?.snippets?.length
    ? enterpriseKnowledge.snippets
        .map(
          (snippet, index) =>
            `${index + 1}. [${snippet.scope}] ${snippet.datasetName} - ${snippet.title}\n${snippet.content}`,
        )
        .join("\n\n")
    : ""

  const guide = await getWriterRuntimeGuide(platform)
  const platformStructureGuide =
    platform === "wechat" || platform === "xiaohongshu"
      ? guide.articleStructureGuidance
      : mode === "thread"
        ? guide.threadStructureGuidance || WRITER_PLATFORM_GUIDE[platform].threadStructureGuidance
        : guide.articleStructureGuidance

  return [
    "User request:",
    query.trim(),
    "",
    "Enterprise knowledge:",
    enterpriseKnowledgeText || "No enterprise knowledge context was attached.",
    "",
    "Search findings:",
    researchAvailabilityNote,
    references || "No search results.",
    "",
    "Extracted source material:",
    extracts || "No extracted source text.",
    "",
    "Platform-specific writing guidance:",
    platformStructureGuide,
    "",
    "Requirements:",
    languageInstruction,
    "- Output only the final draft. Do not explain the process.",
    "- Use enterprise knowledge first when it directly answers the topic.",
    "- Use the source material for trends, external facts, and cases. Do not invent specific data.",
    "- The result must be clean Markdown suitable for continued editing and publishing.",
    "- Keep the structure native to the selected platform and selected mode.",
  ].join("\n")
}

export function isWriterSkillsAvailable() {
  return hasWriterTextProvider() && isWriterR2Available() && (hasWriterResearchConfig() || !WRITER_REQUIRE_WEB_RESEARCH)
}

export type WriterSkillsAvailability = {
  enabled: boolean
  provider: "aiberm" | "openrouter" | "unavailable"
  reason: "ok" | "llm_api_key_missing" | "research_config_missing" | "writer_r2_config_missing"
  requiresWebResearch: boolean
  webResearchEnabled: boolean
}

export function getWriterSkillsAvailability(): WriterSkillsAvailability {
  const preferredProvider = hasAibermApiKey() ? "aiberm" : hasOpenRouterApiKey() ? "openrouter" : "unavailable"

  if (!hasWriterTextProvider()) {
    return {
      enabled: false,
      provider: "unavailable",
      reason: "llm_api_key_missing",
      requiresWebResearch: WRITER_REQUIRE_WEB_RESEARCH,
      webResearchEnabled: WRITER_ENABLE_WEB_RESEARCH,
    }
  }

  if (WRITER_REQUIRE_WEB_RESEARCH && !hasWriterResearchConfig()) {
    return {
      enabled: false,
      provider: preferredProvider,
      reason: "research_config_missing",
      requiresWebResearch: true,
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

export async function generateWriterDraftWithSkills(
  query: string,
  platform: WriterPlatform,
  mode: WriterMode,
  preferredLanguage: WriterLanguage = "auto",
  options?: {
    enterpriseId?: number | null
    researchQuery?: string
    retrievalStrategy?: WriterRetrievalStrategy
    enterpriseQueryVariants?: string[]
    preferredEnterpriseScopes?: EnterpriseKnowledgeScope[]
  },
): Promise<WriterDraftGenerationResult> {
  const contextQuery = options?.researchQuery?.trim() || query
  const retrievalStrategy = options?.retrievalStrategy || (options?.enterpriseId ? "enterprise_grounded" : "fresh_external")
  const shouldUseEnterpriseKnowledge =
    Boolean(options?.enterpriseId) &&
    (retrievalStrategy === "enterprise_grounded" || retrievalStrategy === "hybrid_grounded")
  const shouldUseWebResearch =
    retrievalStrategy === "fresh_external" || retrievalStrategy === "hybrid_grounded"

  const enterpriseKnowledgePromise = shouldUseEnterpriseKnowledge
    ? withTimeout(
        loadEnterpriseKnowledgeContext({
          enterpriseId: options?.enterpriseId,
          query: contextQuery,
          queryVariants: options?.enterpriseQueryVariants,
          preferredScopes: options?.preferredEnterpriseScopes,
          platform,
          mode,
        }).catch(() => null),
        WRITER_ENTERPRISE_KNOWLEDGE_BUDGET_MS,
        () => null,
      )
    : Promise.resolve(null)

  if (shouldUseWriterE2EFixtures()) {
    const enterpriseKnowledge = await enterpriseKnowledgePromise
    return {
      answer: safeBuildFixtureDraft(platform, mode, preferredLanguage, enterpriseKnowledge),
      diagnostics: buildWriterTurnDiagnostics({
        retrievalStrategy,
        enterpriseKnowledge,
        enterpriseKnowledgeEnabled: shouldUseEnterpriseKnowledge,
        research: createEmptyResearchResult(shouldUseWebResearch ? "unavailable" : "skipped"),
      }),
    }
  }

  const language = safeDetectRequestedLanguage(query, preferredLanguage)
  const researchPromise = buildResearchContext(contextQuery, { skip: !shouldUseWebResearch })
  const [enterpriseKnowledge, research] = await Promise.all([enterpriseKnowledgePromise, researchPromise])
  const [systemPrompt, userPrompt] = await Promise.all([
    buildSystemPrompt(platform, mode, language.instruction, research, enterpriseKnowledge),
    buildUserPrompt(query, platform, mode, research, language.instruction, enterpriseKnowledge),
  ])
  const answer = await generateTextWithWriterModel(systemPrompt, userPrompt, WRITER_TEXT_MODEL)

  return {
    answer: postProcessWriterDraft(platform, mode, answer, language.label),
    diagnostics: buildWriterTurnDiagnostics({
      retrievalStrategy,
      enterpriseKnowledge,
      enterpriseKnowledgeEnabled: shouldUseEnterpriseKnowledge,
      research,
    }),
  }
}

const defaultWriterSkillsRuntime: WriterSkillsRuntime = {
  getBriefingGuide: getWriterBriefingGuide,
  getRuntimeGuide: getWriterRuntimeGuide,
  extractBrief: extractWriterBriefWithModel,
  generateDraft: generateWriterDraftWithSkills,
}

export async function runWriterSkillsTurnWithRuntime(
  params: {
    query: string
    platform: WriterPlatform
    mode: WriterMode
    preferredLanguage?: WriterLanguage
    history?: WriterHistoryEntry[]
    conversationStatus?: WriterConversationStatus
    enterpriseId?: number | null
  },
  runtime: WriterSkillsRuntime,
): Promise<WriterSkillsTurnResult> {
  const preferredLanguage = params.preferredLanguage || "auto"
  const contextHistory = (params.history || []).slice(-WRITER_CONTEXT_MAX_TURNS)
  const recentHistory = contextHistory.slice(-WRITER_BRIEF_MAX_TURNS)
  const turnCount = Math.min(WRITER_BRIEF_MAX_TURNS, recentHistory.length + 1)
  const heuristicBrief = collectWriterBriefFromConversation(recentHistory, params.query)
  const briefingGuide = await runtime.getBriefingGuide()
  const structuredExtraction = await runtime.extractBrief({
    query: params.query,
    history: recentHistory,
    brief: heuristicBrief,
    platform: params.platform,
    mode: params.mode,
    preferredLanguage,
    briefingGuide,
  })
  const mergedBrief =
    structuredExtraction && structuredExtraction.confidence >= 0.45
      ? mergeStructuredWriterBrief(heuristicBrief, structuredExtraction.resolvedBrief)
      : heuristicBrief
  const retrievalStrategy = decideWriterRetrievalStrategy({
    query: params.query,
    brief: mergedBrief,
    enterpriseId: params.enterpriseId,
  })
  const codeMissingFields = getWriterActionableMissingFields(mergedBrief)
  const structuredMissingFields = structuredExtraction?.suggestedFollowUpFields?.filter((field) =>
    codeMissingFields.includes(field),
  )
  const actionableMissingFields =
    structuredMissingFields && structuredMissingFields.length > 0 ? structuredMissingFields : codeMissingFields

  if (!mergedBrief.tone && (turnCount >= WRITER_BRIEF_MAX_TURNS || actionableMissingFields.length === 0)) {
    const platformGuide = await runtime.getRuntimeGuide(params.platform)
    mergedBrief.tone = platformGuide.tone
  }

  const shouldClarify =
    (params.conversationStatus || "drafting") === "drafting" &&
    actionableMissingFields.length > 0 &&
    turnCount < WRITER_BRIEF_MAX_TURNS &&
    !safeWantsDirectWriterOutput(params.query) &&
    !structuredExtraction?.userWantsDirectOutput

  if (shouldClarify) {
    const chinese = isChineseConversation(params.query, preferredLanguage)
    const suggestedAnswer = structuredExtraction?.suggestedFollowUpQuestion.trim()
    const answer =
      suggestedAnswer && actionableMissingFields.length > 0
        ? suggestedAnswer
        : safeBuildWriterFollowUpQuestion({
          brief: mergedBrief,
          missingFields: actionableMissingFields,
          chinese,
        })

    return {
      outcome: "needs_clarification",
      answer,
      diagnostics: createEmptyWriterDiagnostics(retrievalStrategy),
      brief: mergedBrief,
      missingFields: actionableMissingFields,
      turnCount,
      maxTurns: WRITER_BRIEF_MAX_TURNS,
      readyForGeneration: false,
      selectedSkill: {
        id: "writer-briefing",
        label: briefingGuide.runtimeLabel,
        stage: "briefing",
      },
    }
  }

  const latestDraft = extractLatestWriterDraft(contextHistory)
  const compiledPrompt = buildWriterBriefPrompt(params.query, mergedBrief, params.platform, params.mode, {
    history: contextHistory,
    latestDraft: (params.conversationStatus || "drafting") !== "drafting" ? latestDraft : null,
  })
  const preferredEnterpriseScopes = getPreferredEnterpriseScopes(params.query, mergedBrief, retrievalStrategy)
  const draftResult = await runtime.generateDraft(compiledPrompt, params.platform, params.mode, preferredLanguage, {
    enterpriseId: params.enterpriseId,
    researchQuery: mergedBrief.topic || params.query,
    retrievalStrategy,
    enterpriseQueryVariants: buildEnterpriseQueryVariants(mergedBrief.topic || params.query, preferredEnterpriseScopes),
    preferredEnterpriseScopes,
  })

  return {
    outcome: "draft_ready",
    answer: draftResult.answer,
    diagnostics: draftResult.diagnostics,
    brief: mergedBrief,
    missingFields: getWriterBriefMissingFields(mergedBrief),
    turnCount,
    maxTurns: WRITER_BRIEF_MAX_TURNS,
    readyForGeneration: true,
    selectedSkill: {
      id: "writer-platform-generation",
      label: WRITER_PLATFORM_GUIDE[params.platform].label,
      stage: "execution",
    },
  }
}

export async function runWriterSkillsTurn(params: {
  query: string
  platform: WriterPlatform
  mode: WriterMode
  preferredLanguage?: WriterLanguage
  history?: WriterHistoryEntry[]
  conversationStatus?: WriterConversationStatus
  enterpriseId?: number | null
}): Promise<WriterSkillsTurnResult> {
  return runWriterSkillsTurnWithRuntime(params, defaultWriterSkillsRuntime)
}
