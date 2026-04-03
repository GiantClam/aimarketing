import {
  loadEnterpriseKnowledgeContext,
  type EnterpriseKnowledgeContext,
  type EnterpriseKnowledgeScope,
} from "@/lib/dify/enterprise-knowledge"
/* eslint-disable no-useless-escape */
import { z } from "zod"
import {
  generateTextWithWriterModel,
  hasAibermApiKey,
  hasOpenRouterApiKey,
  hasWriterTextProvider,
} from "@/lib/writer/aiberm"
import {
  WRITER_CONTENT_TYPE_CONFIG,
  WRITER_PLATFORM_CONFIG,
  isWriterContentType,
  type WriterContentType,
  type WriterLanguage,
  type WriterMode,
  type WriterPlatform,
} from "@/lib/writer/config"
import { writerRequestJson, writerRequestText } from "@/lib/writer/network"
import { isWriterR2Available } from "@/lib/writer/r2"
import { buildWriterRoutingDecision, describeWriterRoute, hasWriterXPlatformSignal } from "@/lib/writer/routing"
import { listWriterPlatformSkills } from "@/lib/writer/skill-catalog"
import {
  getWriterBriefingSkillDocument,
  getWriterContentSkillDocument,
  getWriterRepoHostedSkillDocument,
  getWriterStyleSkillDocument,
  type WriterBriefingSkillDocument,
  type WriterContentSkillDocument,
  type WriterRuntimeSkillDocument,
} from "@/lib/writer/skill-documents"
import type {
  WriterConversationStatus,
  WriterHistoryEntry,
  WriterPreloadedBrief,
  WriterRetrievalStrategy,
  WriterRoutingDecision,
  WriterTurnDiagnostics,
} from "@/lib/writer/types"

const SERPER_API_KEY = process.env.SERPER_API_KEY || ""
const SERPER_API_BASE = (process.env.SERPER_API_BASE || "https://google.serper.dev").replace(/\/+$/, "")
const SERPER_SCRAPE_API_BASE = (process.env.SERPER_SCRAPE_API_BASE || "https://scrape.serper.dev").replace(/\/+$/, "")

const WRITER_TEXT_MODEL = process.env.WRITER_TEXT_MODEL || "google/gemini-3-flash"
const WRITER_SKILL_MODEL = process.env.WRITER_SKILL_MODEL || "gpt-5.3-codex"
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
  Number.parseInt(process.env.WRITER_ENTERPRISE_KNOWLEDGE_BUDGET_MS || "6000", 10) || 6_000,
)
const WRITER_BRIEF_EXTRACTION_TIMEOUT_MS = Math.min(
  120_000,
  Math.max(10_000, Number.parseInt(process.env.WRITER_BRIEF_EXTRACTION_TIMEOUT_MS || "35000", 10) || 35_000),
)
const WRITER_BRIEF_EXTRACTION_PROVIDER_TIMEOUT_MS = Math.min(
  WRITER_BRIEF_EXTRACTION_TIMEOUT_MS,
  Math.max(
    8_000,
    Number.parseInt(process.env.WRITER_BRIEF_EXTRACTION_PROVIDER_TIMEOUT_MS || "25000", 10) || 25_000,
  ),
)
const WRITER_DRAFT_GENERATION_TIMEOUT_MS = Math.min(
  300_000,
  Math.max(20_000, Number.parseInt(process.env.WRITER_DRAFT_GENERATION_TIMEOUT_MS || "120000", 10) || 120_000),
)
const WRITER_DRAFT_PROVIDER_TIMEOUT_MS = Math.min(
  WRITER_DRAFT_GENERATION_TIMEOUT_MS,
  Math.max(15_000, Number.parseInt(process.env.WRITER_DRAFT_PROVIDER_TIMEOUT_MS || "75000", 10) || 75_000),
)
const WRITER_SEARCH_RESULT_LIMIT = Math.min(
  10,
  Math.max(1, Number.parseInt(process.env.WRITER_SEARCH_RESULT_LIMIT || "4", 10) || 4),
)
const WRITER_SEARCH_EXTRACT_LIMIT = Math.min(
  3,
  Math.max(1, Number.parseInt(process.env.WRITER_SEARCH_EXTRACT_LIMIT || "2", 10) || 2),
)
const WRITER_RESEARCH_EXTRACT_MAX_CHARS = Math.min(
  8_000,
  Math.max(1_600, Number.parseInt(process.env.WRITER_RESEARCH_EXTRACT_MAX_CHARS || "3600", 10) || 3_600),
)
const WRITER_ENTERPRISE_QUERY_MAX_CHARS = Math.min(
  240,
  Math.max(120, Number.parseInt(process.env.WRITER_ENTERPRISE_QUERY_MAX_CHARS || "220", 10) || 220),
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
      "When images help readability, place `![Cover](writer-asset://cover)` near the opening and add only the inline image placeholders that the article actually needs, such as `writer-asset://inline-1` or `writer-asset://inline-2`, close to the most visual sections.",
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
      "Use `![Cover](writer-asset://cover)` plus only the inline image placeholders that match the note's visual cards, such as `writer-asset://inline-1`, `writer-asset://inline-2`, or `writer-asset://inline-3`.",
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
  weibo: {
    label: "Weibo writer",
    tone: "direct, timely, spreadable",
    format: "short post or short social sequence",
    length: "80-300 Chinese characters or short sequence",
    image: "16:9 social visual with 1-2 assets",
    promptRules: [
      "Prioritize speed, clarity, and spreadability.",
      "Enter the event, viewpoint, or update immediately.",
      "Avoid WeChat-style exposition or dense narrative framing.",
    ],
    articleStructureGuidance: [
      "Write as a concise Weibo-native post.",
      "Use hashtags only when they materially improve platform fit.",
    ].join("\n"),
    threadStructureGuidance: [
      "Write as a short connected sequence.",
      "Keep each segment tight and postable on its own.",
    ].join("\n"),
  },
  douyin: {
    label: "Douyin script writer",
    tone: "spoken, fast, hook-first",
    format: "short spoken script",
    length: "15-60 second script",
    image: "9:16 cover image with 1 asset",
    promptRules: [
      "Write for spoken delivery, not article reading.",
      "Front-load the first 1-3 seconds with a clear hook.",
      "Prefer short lines and natural spoken rhythm.",
    ],
    articleStructureGuidance: [
      "Write as a short script with hook, setup, value, and CTA.",
      "Keep each line natural to say out loud.",
    ].join("\n"),
    threadStructureGuidance: "",
  },
  linkedin: {
    label: "LinkedIn writer",
    tone: "credible, professional, insight-led",
    format: "professional social post",
    length: "300-1200 words or medium-length post",
    image: "16:9 professional visual with 1-3 assets",
    promptRules: [
      "Lead with a strong first line before the fold.",
      "Use short paragraphs and visible line breaks.",
      "Keep the tone professional and specific rather than motivational fluff.",
    ],
    articleStructureGuidance: [
      "Write as a LinkedIn-native post.",
      "Use line breaks for readability, not article headings by default.",
    ].join("\n"),
    threadStructureGuidance: "",
  },
  instagram: {
    label: "Instagram writer",
    tone: "visual-first, emotional, concise",
    format: "caption or carousel copy",
    length: "caption or slide-length copy",
    image: "4:5 visual-first asset set",
    promptRules: [
      "Support the visual rather than carrying the whole message in prose.",
      "Use a strong opening line and short blocks.",
      "Keep the pacing fit for caption or carousel reading.",
    ],
    articleStructureGuidance: [
      "Write as caption or carousel copy.",
      "Avoid article-like exposition.",
    ].join("\n"),
    threadStructureGuidance: "",
  },
  tiktok: {
    label: "TikTok script writer",
    tone: "spoken, energetic, fast-moving",
    format: "short spoken script",
    length: "15-45 second script",
    image: "9:16 short-video cover visual",
    promptRules: [
      "Write for the ear, not the page.",
      "Use fast setup and quick payoff.",
      "Avoid long explanatory paragraphs.",
    ],
    articleStructureGuidance: [
      "Write as hook-first short-video script.",
      "Keep lines brief and natural for speaking.",
    ].join("\n"),
    threadStructureGuidance: "",
  },
  generic: {
    label: "Generic content writer",
    tone: "clear, credible, scenario-aware",
    format: "scenario-native structured draft",
    length: "fit the requested scenario",
    image: "optional generic editorial visuals",
    promptRules: [
      "Use the content-type skill guidance as the primary structure source.",
      "Avoid forcing social-platform conventions when the scenario is email, website, product, case study, or speech.",
    ],
    articleStructureGuidance: "Write using the scenario-native structure described in the routed skill.",
    threadStructureGuidance: "",
  },
}

const WRITER_BRIEF_MAX_TURNS = 5
const WRITER_CONTEXT_MAX_TURNS = 12
const WRITER_CONTEXT_WINDOW_TURNS = 4
const WRITER_CONTEXT_ENTRY_MAX_CHARS = 360
const WRITER_PRIOR_DRAFT_MAX_CHARS = 6_000
const WRITER_BRIEF_EXTRACTION_MAX_CHARS = 220
const WRITER_BRIEF_FIELD_IDS = ["contentType", "targetPlatform", "topic", "audience", "objective", "tone"] as const
const WRITER_TURN_INTENT_IDS = ["capability_question", "briefing", "direct_draft", "rewrite"] as const
const WRITER_RETRIEVAL_HINT_SCHEMA = z
  .object({
    enterpriseKnowledgeNeeded: z.boolean().default(false),
    freshResearchNeeded: z.boolean().default(false),
    confidence: z.number().min(0).max(1).default(0),
    reason: z.string().max(200).default(""),
  })
  .default({
    enterpriseKnowledgeNeeded: false,
    freshResearchNeeded: false,
    confidence: 0,
    reason: "",
  })
const WRITER_BRIEF_EXTRACTION_SCHEMA = z.object({
  resolvedBrief: z.object({
    topic: z.string().default(""),
    audience: z.string().default(""),
    objective: z.string().default(""),
    tone: z.string().default(""),
    constraints: z.string().default(""),
  }),
  routingDecision: z.object({
    contentType: z.string().default(""),
    targetPlatform: z.string().default(""),
    outputForm: z.string().default(""),
    lengthTarget: z.string().default(""),
  }).default({
    contentType: "",
    targetPlatform: "",
    outputForm: "",
    lengthTarget: "",
  }),
  answeredFields: z.array(z.enum(WRITER_BRIEF_FIELD_IDS)).default([]),
  suggestedFollowUpFields: z.array(z.enum(WRITER_BRIEF_FIELD_IDS)).max(2).default([]),
  suggestedFollowUpQuestion: z.string().default(""),
  turnIntent: z.enum(WRITER_TURN_INTENT_IDS).default("briefing"),
  userWantsDirectOutput: z.boolean().default(false),
  briefSufficient: z.boolean().default(false),
  retrievalHints: WRITER_RETRIEVAL_HINT_SCHEMA,
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

const _CLEAN_WRITER_TONE_KEYWORDS = [
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
type WriterTurnIntent = (typeof WRITER_TURN_INTENT_IDS)[number]
type WriterRetrievalHints = z.infer<typeof WRITER_RETRIEVAL_HINT_SCHEMA>

type WriterConversationBrief = {
  topic: string
  audience: string
  objective: string
  tone: string
  constraints: string
}

type WriterScopedFieldId = Exclude<WriterBriefFieldId, "contentType" | "targetPlatform">
type WriterRoutingHistory = Partial<Pick<WriterRoutingDecision, "contentType" | "targetPlatform" | "outputForm" | "lengthTarget">>
type WriterHardLengthTarget = {
  maxUnits: number
  unit: "chars" | "words"
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
  getContentGuide: typeof getWriterContentGuide
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
    memoryRetrievedCount: 0,
    memoryAppliedIds: [],
    soulCardVersion: null,
    soulCardConfidence: null,
    memoryScope: null,
    routing: null,
  }
}

function _detectRewriteOnlyIntent(query: string) {
  return /(?:改写|润色|缩写|缩短|翻译|提炼|总结|优化标题|换个语气|调整语气|改成|rewrite|polish|shorten|summari[sz]e|translate|edit this|revise)/iu.test(
    query,
  )
}

function _detectEnterpriseGroundingNeed(query: string, brief: WriterConversationBrief) {
  const haystack = [query, brief.topic, brief.objective, brief.constraints].filter(Boolean).join("\n")

  return /(?:我们|我们的|本公司|品牌|产品|服务|解决方案|客户案例|案例|官网|企业介绍|公司介绍|品牌定位|卖点|优势|工厂|交付|打样|认证|机型|型号|设备|参数|能力|产品线|our company|our product|brand|case study|factory|equipment|model|spec|solution)/iu.test(
    haystack,
  )
}

function _detectFreshResearchNeed(query: string, brief: WriterConversationBrief) {
  const haystack = [query, brief.topic, brief.objective].filter(Boolean).join("\n")

  return /(?:最新|趋势|报告|调研|数据|统计|行业洞察|市场规模|竞品|新闻|今年|明年|202[4-9]|latest|trend|report|research|market|benchmark|news|forecast|survey)/iu.test(
    haystack,
  )
}

function detectExplicitEnterpriseKnowledgeRequest(text: string) {
  return /(?:知识库|企业资料|公司资料|品牌资料|官方资料|基于.*资料|引用.*企业|use our knowledge base|based on our company info|first-party facts|brand facts)/iu.test(
    text,
  )
}

function detectExplicitEnterpriseReference(text: string) {
  return /(?:我们|我们的|本公司|我司|品牌|官网|企业|公司|our|we|our company|our brand|our team|official site)/iu.test(
    text,
  )
}

function detectEnterpriseBriefFactSignals(brief: WriterConversationBrief) {
  const haystack = [brief.topic, brief.objective, brief.constraints].filter(Boolean).join("\n")
  return /(?:我们|我们的|本公司|我司|品牌|官网|企业|公司|产品|服务|解决方案|案例|工厂|交付|打样|认证|机型|型号|设备|参数|生产|制造|能力|our|our company|our brand|our product|brand|product|solution|case study|factory|equipment|model|spec|manufacturing|capabilit(?:y|ies))/iu.test(
    haystack,
  )
}

function detectGenericWritingOnlyRequest(query: string, brief: WriterConversationBrief) {
  const haystack = [query, brief.topic, brief.objective].filter(Boolean).join("\n")

  if (detectRewriteOnlyIntentSafe(query) || safeIsWriterConfirmationReply(query)) {
    return false
  }

  if (detectFreshResearchNeedConservative(query, brief)) {
    return false
  }

  if (detectExplicitEnterpriseKnowledgeRequestNormalized(haystack) || detectExplicitEnterpriseReference(haystack)) {
    return false
  }

  return /(?:写|写一篇|写一封|生成|起草|write|draft|create|compose|article|post|email|thread|outline|headline|title)/iu.test(
    haystack,
  )
}

function createWriterRetrievalHints(overrides: Partial<WriterRetrievalHints> = {}): WriterRetrievalHints {
  return {
    enterpriseKnowledgeNeeded: false,
    freshResearchNeeded: false,
    confidence: 0,
    reason: "",
    ...overrides,
  }
}

function detectExplicitEnterpriseKnowledgeRequestNormalized(text: string) {
  return (
    detectExplicitEnterpriseKnowledgeRequest(text) ||
    /(?:based on our knowledge base|official company info|company materials|our internal materials)/iu.test(text)
  )
}

function detectFreshResearchNeedConservative(query: string, brief: WriterConversationBrief) {
  const haystack = [query, brief.topic, brief.objective].filter(Boolean).join("\n")
  if (collectWriterSourceUrls({ query, brief }).length > 0) {
    return true
  }

  return WRITER_FRESH_RESEARCH_SIGNAL_RE.test(haystack) || WRITER_SOURCE_REFERENCE_SIGNAL_RE.test(haystack)
}

function inferWriterRetrievalHintsFromSignals(query: string, brief: WriterConversationBrief): WriterRetrievalHints {
  const haystack = [query, brief.topic, brief.objective, brief.constraints].filter(Boolean).join("\n")
  const explicitKnowledgeRequest = detectExplicitEnterpriseKnowledgeRequestNormalized(haystack)
  const explicitEnterpriseReference = detectExplicitEnterpriseReference(haystack)
  const enterpriseFactSignals = detectEnterpriseGroundingNeedSafe(query, brief)
  const freshResearchSignals = detectFreshResearchNeedConservative(query, brief)
  const hasSourceUrls = collectWriterSourceUrls({ query, brief }).length > 0

  if (hasSourceUrls) {
    return createWriterRetrievalHints({
      freshResearchNeeded: true,
      confidence: 0.99,
      reason: "source_url_reference",
    })
  }

  if (detectRewriteOnlyIntentSafe(query)) {
    return createWriterRetrievalHints({ confidence: 0.98, reason: "rewrite_only" })
  }

  if (explicitKnowledgeRequest) {
    return createWriterRetrievalHints({
      enterpriseKnowledgeNeeded: true,
      freshResearchNeeded: freshResearchSignals,
      confidence: 0.98,
      reason: "explicit_enterprise_grounding",
    })
  }

  if (detectGenericWritingOnlyRequest(query, brief)) {
    return createWriterRetrievalHints({
      confidence: 0.82,
      reason: "generic_writing",
    })
  }

  if (explicitEnterpriseReference && enterpriseFactSignals) {
    return createWriterRetrievalHints({
      enterpriseKnowledgeNeeded: true,
      freshResearchNeeded: freshResearchSignals,
      confidence: 0.9,
      reason: "enterprise_fact_request",
    })
  }

  if (freshResearchSignals && !enterpriseFactSignals) {
    return createWriterRetrievalHints({
      freshResearchNeeded: true,
      confidence: 0.86,
      reason: "fresh_research_request",
    })
  }

  return createWriterRetrievalHints({
    enterpriseKnowledgeNeeded: enterpriseFactSignals && explicitEnterpriseReference,
    freshResearchNeeded: freshResearchSignals,
    confidence: enterpriseFactSignals || freshResearchSignals ? 0.62 : 0.4,
    reason: enterpriseFactSignals ? "enterprise_possible" : freshResearchSignals ? "research_possible" : "default_skip",
  })
}

function decideWriterRetrievalStrategy(params: {
  query: string
  brief: WriterConversationBrief
  history?: WriterHistoryEntry[]
  enterpriseId?: number | null
  retrievalHints?: WriterRetrievalHints | null
}): WriterRetrievalStrategy {
  const confirmationReply = safeIsWriterConfirmationReply(params.query)
  const rewriteOnly = detectRewriteOnlyIntentSafe(params.query)
  const hasSourceUrls = collectWriterSourceUrls({
    query: params.query,
    brief: params.brief,
    history: params.history,
  }).length > 0
  const fallbackHints = inferWriterRetrievalHintsFromSignals(params.query, params.brief)
  const structuredHints = params.retrievalHints
  const useStructuredHints = Boolean(structuredHints && structuredHints.confidence >= 0.7)
  const genericWritingOnly = detectGenericWritingOnlyRequest(params.query, params.brief)
  const enterpriseNeeded = Boolean(params.enterpriseId) && Boolean(
    fallbackHints.enterpriseKnowledgeNeeded || (useStructuredHints && structuredHints?.enterpriseKnowledgeNeeded),
  )
  const enterpriseContinuation = Boolean(params.enterpriseId) && detectEnterpriseBriefFactSignals(params.brief)
  const freshResearchNeeded = Boolean(
    hasSourceUrls ||
    fallbackHints.freshResearchNeeded ||
      (useStructuredHints &&
        structuredHints?.freshResearchNeeded &&
        structuredHints.confidence >= 0.88 &&
        !genericWritingOnly),
  )

  if (hasSourceUrls) {
    if (enterpriseNeeded || enterpriseContinuation) {
      return "hybrid_grounded"
    }
    return "fresh_external"
  }

  if (rewriteOnly && !enterpriseNeeded && !freshResearchNeeded) {
    return "rewrite_only"
  }
  if (genericWritingOnly && !enterpriseNeeded) {
    return "no_retrieval"
  }
  if (confirmationReply) {
    if ((enterpriseNeeded || enterpriseContinuation) && freshResearchNeeded) {
      return "hybrid_grounded"
    }
    if (enterpriseNeeded || enterpriseContinuation) {
      return "enterprise_grounded"
    }
    if (freshResearchNeeded) {
      return "fresh_external"
    }
    return "no_retrieval"
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
  return "no_retrieval"
}

function _getPreferredEnterpriseScopes(
  query: string,
  brief: WriterConversationBrief,
  retrievalStrategy: WriterRetrievalStrategy,
): EnterpriseKnowledgeScope[] {
  if (retrievalStrategy === "no_retrieval") {
    return []
  }
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

function _buildEnterpriseQueryVariants(
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

  return [...new Set(variants.map((item) => item.trim()).filter(Boolean))].slice(0, 4)
}

const ACTIVE_WRITER_TONE_KEYWORDS = [
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

function detectRewriteOnlyIntentSafe(query: string) {
  return /(?:改写|润色|缩写|缩短|翻译|提炼|总结|优化标题|换个语气|调整语气|改成|rewrite|polish|shorten|summari[sz]e|translate|edit this|revise)/iu.test(
    query,
  )
}

function detectEnterpriseGroundingNeedSafe(query: string, brief: WriterConversationBrief) {
  const haystack = [query, brief.topic, brief.objective, brief.constraints].filter(Boolean).join("\n")
  return /(?:我们|我们的|本公司|品牌|产品|服务|解决方案|客户案例|案例|官网|企业介绍|公司介绍|品牌定位|卖点|优势|工厂|交付|打样|认证|机型|型号|设备|参数|能力|产品线|生产|制造|our company|our product|brand|case study|factory|equipment|model|spec|solution|manufacturing|capabilit(?:y|ies))/iu.test(
    haystack,
  )
}

function _detectFreshResearchNeedSafe(query: string, brief: WriterConversationBrief) {
  const haystack = [query, brief.topic, brief.objective].filter(Boolean).join("\n")
  return /(?:最新|趋势|报告|调研|数据|统计|行业洞察|市场规模|竞品|新闻|今年|明年|202[4-9]|latest|trend|report|research|market|benchmark|news|forecast|survey)/iu.test(
    haystack,
  )
}

function getPreferredEnterpriseScopesSafe(
  query: string,
  brief: WriterConversationBrief,
  retrievalStrategy: WriterRetrievalStrategy,
): EnterpriseKnowledgeScope[] {
  if (retrievalStrategy === "no_retrieval") {
    return []
  }
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
  if (/(?:案例|客户|应用场景|客户价值|ROI|case|customer|scenario)/iu.test(haystack)) {
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

function _buildEnterpriseQueryVariantsSafe(
  baseQuery: string,
  scopes: EnterpriseKnowledgeScope[],
): string[] {
  const normalizedBaseQuery = clipWriterEnterpriseRetrievalQuery(baseQuery)
  const variants = [normalizedBaseQuery]

  if (scopes.includes("general")) {
    variants.push(`${baseQuery}\n聚焦：企业基础事实、业务介绍、可复用的一手信息`)
  }
  if (scopes.includes("brand")) {
    variants.push(`${baseQuery}\n聚焦：企业介绍、品牌定位、核心事实`)
  }
  if (scopes.includes("product")) {
    variants.push(`${baseQuery}\n聚焦：核心产品、产品体系、解决方案、机型或参数`)
  } else if (scopes.includes("case-study")) {
    variants.push(`${baseQuery}\n聚焦：客户类型、应用场景、客户价值、案例成效`)
  }

  return [...new Set(variants.map((item) => item.trim()).filter(Boolean))].slice(0, 4)
}

function buildRuntimeEnterpriseQueryVariants(
  baseQuery: string,
  scopes: EnterpriseKnowledgeScope[],
): string[] {
  const normalizedBaseQuery = clipWriterEnterpriseRetrievalQuery(baseQuery)
  const variants = [normalizedBaseQuery]

  if (scopes.includes("general")) {
    variants.push(
      `${normalizedBaseQuery}\nFocus on company background, core business, reusable differentiators, and first-party facts.\n聚焦：企业基础事实、业务介绍、可复用的一手信息。`,
    )
  }
  if (scopes.includes("brand")) {
    variants.push(
      `${normalizedBaseQuery}\nFocus on company introduction, brand positioning, and core differentiators.\n聚焦：企业介绍、品牌定位、核心差异化。`,
    )
  }
  if (scopes.includes("product")) {
    variants.push(
      `${normalizedBaseQuery}\nFocus on core products, product lines, equipment models, solutions, and specifications.\n聚焦：核心产品、产品体系、设备机型、解决方案与参数。`,
    )
  } else if (scopes.includes("case-study")) {
    variants.push(
      `${normalizedBaseQuery}\nFocus on customer types, application scenarios, customer value, and case-study outcomes.\n聚焦：客户类型、应用场景、客户价值与案例成效。`,
    )
  }

  return [...new Set(variants.map((item) => item.trim()).filter(Boolean))].slice(0, 4)
}

function buildWriterGroundingQuery(
  brief: WriterConversationBrief,
  fallbackQuery: string,
  history: WriterHistoryEntry[] = [],
) {
  const lastSubstantiveUserQuery =
    [...history]
      .map((entry) => normalizeBriefValue(entry.query || entry.inputs?.contents || ""))
      .reverse()
      .find((query) => query && !safeIsWriterConfirmationReply(query)) || ""
  const sourceUrls = collectWriterSourceUrls({
    query: fallbackQuery,
    brief,
    history,
  })
  const sections = [
    brief.topic ? `Topic: ${brief.topic}` : "",
    brief.audience ? `Audience: ${brief.audience}` : "",
    brief.objective ? `Objective: ${brief.objective}` : "",
    brief.constraints ? `Constraints: ${brief.constraints}` : "",
    sourceUrls.length > 0 ? `Source URLs: ${sourceUrls.join(" ")}` : "",
    lastSubstantiveUserQuery ? `Original request: ${lastSubstantiveUserQuery}` : "",
  ].filter(Boolean)

  return sections.length > 0 ? sections.join("\n") : fallbackQuery.trim()
}

function clipWriterEnterpriseRetrievalQuery(query: string, maxChars = WRITER_ENTERPRISE_QUERY_MAX_CHARS) {
  const normalizedLines = query
    .split(/\r?\n/u)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)

  if (normalizedLines.length === 0) {
    return ""
  }

  const selectedLines: string[] = []
  let totalLength = 0

  for (const line of normalizedLines) {
    const separatorLength = selectedLines.length > 0 ? 1 : 0
    if (totalLength + separatorLength + line.length <= maxChars) {
      selectedLines.push(line)
      totalLength += separatorLength + line.length
      continue
    }

    if (selectedLines.length === 0) {
      return compactText(line, maxChars)
    }

    break
  }

  if (selectedLines.length === 0) {
    return compactText(normalizedLines.join(" "), maxChars)
  }

  return selectedLines.join("\n")
}

function normalizeWriterEnterpriseQueryVariants(variants: string[]) {
  return [...new Set(variants.map((variant) => clipWriterEnterpriseRetrievalQuery(variant)).filter(Boolean))].slice(0, 4)
}

function getWriterFollowUpFieldCount(turnCount: number, maxTurns: number, missingFieldCount: number) {
  if (missingFieldCount <= 1) return 1
  return maxTurns - turnCount <= 1 ? 2 : 1
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
    memoryRetrievedCount: Math.max(0, params.memoryRetrievedCount || 0),
    memoryAppliedIds: params.memoryAppliedIds || [],
    soulCardVersion: params.soulCardVersion ?? null,
    soulCardConfidence: params.soulCardConfidence ?? null,
    memoryScope: params.memoryScope ?? null,
    routing: params.routing || null,
  }
}

async function getWriterBriefingGuide() {
  return getWriterBriefingSkillDocument({
    runtimeLabel: "Universal Content Brief Intake",
    requiredBriefFields: [
      "Content type or publishing scenario",
      "Target platform or destination surface",
      "Topic and core angle",
      "Target audience",
      "Primary objective or desired outcome",
      "Tone, voice, or style preference",
    ],
    collectionRules: [
      "Collect the brief through conversation, not through a form.",
      "Ask at most two missing items in each follow-up.",
      "Reuse what the user already provided instead of asking again.",
      "Infer platform, output form, and length from the conversation whenever possible.",
      "Stop clarification once the brief is usable, or once five user turns have been reached.",
    ],
    followUpStyle: "Be concise, practical, and editorial.",
    defaultAssumptions: [
      "If tone is missing near the turn limit, fall back to the native tone of the inferred scenario or platform.",
      "If constraints are missing, use a clean publish-ready structure for the inferred scenario.",
    ],
  } satisfies WriterBriefingSkillDocument)
}

async function getWriterContentGuide(contentType: WriterContentType) {
  const fallback = WRITER_CONTENT_TYPE_CONFIG[contentType]
  return getWriterContentSkillDocument(contentType, {
    runtimeLabel: fallback.label,
    guidance: `${fallback.label}: ${fallback.description}`,
  } satisfies WriterContentSkillDocument)
}

async function getWriterStyleGuide(styleId: string) {
  return getWriterStyleSkillDocument(styleId, {
    runtimeLabel: "Style Guidance",
    guidance: "",
  } satisfies WriterContentSkillDocument)
}

async function getWriterRuntimeGuide(params: WriterPlatform | WriterRoutingDecision) {
  const renderPlatform = typeof params === "string" ? params : params.renderPlatform
  const targetPlatform = typeof params === "string" ? "" : params.targetPlatform
  const fallback = WRITER_PLATFORM_GUIDE[renderPlatform]
  return getWriterRepoHostedSkillDocument(
    {
      renderPlatform,
      targetPlatform,
    },
    {
    runtimeLabel: fallback.label,
    tone: fallback.tone,
    contentFormat: fallback.format,
    lengthTarget: fallback.length,
    imageGuidance: fallback.image,
    promptRules: fallback.promptRules,
    articleStructureGuidance: fallback.articleStructureGuidance,
    threadStructureGuidance: fallback.threadStructureGuidance,
    } satisfies WriterRuntimeSkillDocument,
  )
}

function normalizeBriefValue(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  if (/^[,.;:!?，。；：！？、\/\\|()[\]{}"'`~-]+$/u.test(normalized)) return ""
  return normalized
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
  const hits = ACTIVE_WRITER_TONE_KEYWORDS.filter((keyword) => normalized.includes(keyword.toLowerCase()))
  return hits.join(", ")
}

type WriterBriefExtractionResult = {
  resolvedBrief: WriterConversationBrief
  routingDecision: WriterRoutingHistory
  answeredFields: WriterBriefFieldId[]
  suggestedFollowUpFields: WriterBriefFieldId[]
  suggestedFollowUpQuestion: string
  turnIntent: WriterTurnIntent
  userWantsDirectOutput: boolean
  briefSufficient: boolean
  retrievalHints: WriterRetrievalHints
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

function sanitizeStructuredRoutingDecision(routing: {
  contentType: string
  targetPlatform: string
  outputForm: string
  lengthTarget: string
}): WriterRoutingHistory {
  const contentType = routing.contentType.trim()

  return {
    contentType: isWriterContentType(contentType) ? contentType : undefined,
    targetPlatform: routing.targetPlatform.trim() || undefined,
    outputForm: routing.outputForm.trim() || undefined,
    lengthTarget: routing.lengthTarget.trim() || undefined,
  }
}

function _legacyExtractAudienceFromText(text: string) {
  return extractFirstMatch(text, [
    /(?:面向|针对|适合|读者是|受众是|目标读者|目标用户|目标受众)\s*(?:是|为|:|：)?\s*([^，。；;\n]+)/iu,
    /(?:for|target(?:ing)?|audience(?: is)?)\s+([^,.;\n]+?)(?=\s+(?:about|on)\b|[,.;\n]|$)/iu,
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
    /(?:write|draft|create)\s+(?:an?|the)?\s*[^,.;\n]*?\s+for\s+[^,.;\n]+?\s+(?:about|on)\s+([^,.;\n]+)/iu,
    /(?:article|post|thread|email)\s+for\s+[^,.;\n]+?\s+(?:about|on)\s+([^,.;\n]+)/iu,
    /(?:write|draft|create)\s+(?:an?|the)?\s*[^,.;\n]*?\s+for\s+[^,.;\n]+?\s+(?:about|on)\s+([^,.;\n]+)/iu,
    /(?:article|post|thread|email)\s+for\s+[^,.;\n]+?\s+(?:about|on)\s+([^,.;\n]+)/iu,
    /(?:write|draft|create)\s+(?:an?|the)?\s*[^,.;\n]*?\s+for\s+[^,.;\n]+?\s+(?:about|on)\s+([^,.;\n]+)/iu,
    /(?:article|post|thread|email)\s+for\s+[^,.;\n]+?\s+(?:about|on)\s+([^,.;\n]+)/iu,
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
    /(?:audience|target audience|readers?|target readers?|buyer persona)\s*(?::|is|are|\uff1a)?\s*([^,.;\n]+)/iu,
    /(?:audience|target audience|readers?|target readers?|buyer persona)\s*(?::|is|are|\uff1a)?\s*([^,.;\n]+)/iu,
    /(?:for|target(?:ing)?|audience(?: is)?)\s+([^,.;\n]+?)(?=\s+(?:about|on)\b|[,.;\n]|$)/iu,
  ])
}

function _extractObjectiveFromText(text: string) {
  return extractFirstMatch(text, [
    /(?:目标是|目的是|诉求是|希望|用于|想达到|想实现|想让读者)\s*(?::|：)?\s*([^，。；;\n]+)/iu,
    /(?:goal|objective|purpose|desired outcome|cta|call to action)(?: is|:)?\s*([^,.;\n]+)/iu,
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

function isSocialWriterContentType(contentType: string) {
  return contentType === "social_cn" || contentType === "social_global"
}

function getWriterActionableMissingFields(
  brief: WriterConversationBrief,
  routing: Partial<Pick<WriterRoutingDecision, "contentType" | "targetPlatform">> | null = null,
) {
  const missingFields: WriterBriefFieldId[] = []

  if (!routing?.contentType) {
    missingFields.push("contentType")
  }

  if (routing?.contentType && isSocialWriterContentType(routing.contentType) && !normalizeBriefValue(routing.targetPlatform || "")) {
    missingFields.push("targetPlatform")
  }

  if (!brief.topic) {
    missingFields.push("topic")
  }

  if (!brief.audience) missingFields.push("audience")
  if (!brief.objective) missingFields.push("objective")

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

function coerceWriterReplyForField(
  text: string,
  field: WriterScopedFieldId,
) {
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

function hasExplicitWriterFieldSignal(text: string, field: WriterScopedFieldId) {
  if (field === "topic") {
    return /(?:主题|话题|选题|核心角度|关于|围绕|聚焦于?|topic|angle|about|on)/iu.test(text)
  }
  if (field === "audience") {
    return /(?:面向|针对|适合|读者是|受众是|目标读者|目标用户|目标受众|写给.*看|给.*看|audience|reader|target user|for)/iu.test(
      text,
    )
  }
  if (field === "objective") {
    return /(?:目标是|目的是|诉求是|希望|用于|想达到|想实现|想让读者|objective|goal|cta|result)/iu.test(text)
  }
  return /(?:语气|口吻|风格|基调|文风|tone|style)/iu.test(text)
}

function mergeWriterFieldCandidate(
  currentValue: string,
  candidate: string,
  scopedFollowUp: boolean,
  requestedFields: WriterBriefFieldId[],
  field: WriterScopedFieldId,
  normalizedTurn: string,
) {
  const fieldWasRequested = requestedFields.includes(field)
  const hasExplicitSignal = hasExplicitWriterFieldSignal(normalizedTurn, field)
  if (!candidate) return currentValue
  if (scopedFollowUp && !fieldWasRequested && !hasExplicitSignal) {
    return currentValue
  }
  return joinBriefValues(currentValue, candidate)
}

function extractEnglishLabeledAudienceFallback(text: string) {
  return extractFirstMatch(text, [
    /(?:audience|target audience|readers?|target readers?|buyer persona)\s*(?::|is|are|\uff1a)?\s*([^,.;\n]+)/iu,
  ])
}

function sanitizeWriterAudienceCandidate(value: string) {
  const normalized = normalizeBriefValue(value)
  if (!normalized) return ""

  const looksLikePublishingSurfacePhrase =
    /(?:(?:wechat|公众号|小红书|xiaohongshu|rednote|weibo|douyin|linkedin|twitter|facebook|instagram|tiktok|\bx\b).{0,24}(?:发布|发到|发在|post|thread|article|email|newsletter|website|landing page|线程|帖子|贴文)|(?:发布|发到|发在).{0,24}(?:wechat|公众号|小红书|xiaohongshu|rednote|weibo|douyin|linkedin|twitter|facebook|instagram|tiktok|\bx\b)|发布的)/iu.test(
      normalized,
    )

  if (looksLikePublishingSurfacePhrase) {
    return ""
  }

  return normalized
}

function sanitizeWriterTopicCandidate(value: string) {
  const normalized = normalizeBriefValue(value)
  if (!normalized) return ""
  if (
    /^(?:wechat|公众号|微信公众号|公众号文章|小红书|xiaohongshu|rednote|微博|weibo|抖音|douyin|linkedin|twitter|facebook|instagram|tiktok|x|post|thread|article|email|newsletter|website|facebook post|x thread)$/iu.test(
      normalized,
    )
  ) {
    return ""
  }
  return normalized
}

function mergeWriterTurnIntoBrief(
  brief: WriterConversationBrief,
  turn: string,
  requestedFields: WriterBriefFieldId[] = [],
) {
  const normalizedTurn = normalizeBriefValue(turn)
  if (!normalizedTurn) return brief

  const scopedFollowUp = requestedFields.length > 0
  const allowTopicFallback = !scopedFollowUp || requestedFields.includes("topic")
  const topicCandidate = sanitizeWriterTopicCandidate(
    safeExtractTopicFromText(normalizedTurn, { allowShortFallback: allowTopicFallback }),
  )
  const audienceCandidate =
    sanitizeWriterAudienceCandidate(safeExtractAudienceFromText(normalizedTurn)) ||
    sanitizeWriterAudienceCandidate(extractEnglishLabeledAudienceFallback(normalizedTurn))
  const objectiveCandidate = safeExtractObjectiveFromText(normalizedTurn)
  const toneCandidate = safeExtractToneFromText(normalizedTurn)
  const constraintsCandidate = safeExtractConstraintsFromText(normalizedTurn)

  const nextBrief: WriterConversationBrief = {
    topic: mergeWriterFieldCandidate(brief.topic, topicCandidate, scopedFollowUp, requestedFields, "topic", normalizedTurn),
    audience: mergeWriterFieldCandidate(
      brief.audience,
      audienceCandidate,
      scopedFollowUp,
      requestedFields,
      "audience",
      normalizedTurn,
    ),
    objective: mergeWriterFieldCandidate(
      brief.objective,
      objectiveCandidate,
      scopedFollowUp,
      requestedFields,
      "objective",
      normalizedTurn,
    ),
    tone: mergeWriterFieldCandidate(brief.tone, toneCandidate, scopedFollowUp, requestedFields, "tone", normalizedTurn),
    constraints: joinBriefValues(brief.constraints, constraintsCandidate),
  }

  if (requestedFields.length >= 1) {
    const scopedFields = requestedFields.filter(
      (field): field is WriterScopedFieldId => field !== "contentType" && field !== "targetPlatform",
    )
    for (const field of scopedFields) {
      if (!nextBrief[field]) {
        nextBrief[field] = joinBriefValues(nextBrief[field], coerceWriterReplyForField(normalizedTurn, field))
      }
    }
  }

  return nextBrief
}

function collectWriterBriefFromConversation(history: WriterHistoryEntry[], currentQuery: string) {
  let brief = createEmptyWriterBrief()
  let requestedFieldsForNextTurn: WriterBriefFieldId[] = []

  for (const entry of history) {
    brief = mergeWriterTurnIntoBrief(brief, entry.query || entry.inputs?.contents || "", requestedFieldsForNextTurn)
    requestedFieldsForNextTurn = safeInferWriterRequestedFieldsFromAnswer(entry.answer || "")
  }

  return mergeWriterTurnIntoBrief(brief, currentQuery, requestedFieldsForNextTurn)
}

function getPriorRoutingFromHistory(history: WriterHistoryEntry[]): WriterRoutingHistory {
  for (const entry of [...history].reverse()) {
    const routing = entry.diagnostics?.routing
    if (routing?.contentType) {
      return {
        contentType: routing.contentType,
        targetPlatform: routing.targetPlatform || "",
        outputForm: routing.outputForm || "",
        lengthTarget: routing.lengthTarget || "",
      }
    }
  }
  return {}
}

function hasExplicitWriterLengthTarget(query: string) {
  return /(\d{2,5})\s*(字|words?)/iu.test(query)
}

function hasExplicitWriterPlatformTarget(query: string) {
  return (
    /(wechat|鍏紬鍙穦灏忕孩涔xiaohongshu|rednote|weibo|douyin|linkedin|twitter|x thread|x post|instagram|facebook|tiktok|\b鍙憍\b|\bto x\b)/iu.test(
      query,
    ) || hasWriterXPlatformSignal(query)
  )
}

function detectWriterLengthCorrectionIntent(query: string) {
  return /(?:字数太多|太长了|超字数|超出.?字数|压缩到|控制在|shorter|too long|over(?: the)? (?:character|word)? ?limit|exceeds? (?:the )?limit|trim it down)/iu.test(
    query,
  )
}

function detectStandaloneWriterRequest(query: string) {
  return /(?:^|\b)(?:write|draft|create|generate|compose|start|help me write)\b|(?:帮我写|写一篇|写一封|写一组|生成一篇|生成一封|起草一封|来一篇|给我一篇|给我一封|开始写)/iu.test(
    query,
  )
}

function detectTranslationIntentSafe(query: string) {
  return /(?:翻译|translate(?:\s+this)?|translation)/iu.test(query)
}

function extractInlineWriterSourceText(query: string) {
  const normalized = normalizeBriefValue(query)
  if (!normalized || !detectRewriteOnlyIntentSafe(normalized)) {
    return ""
  }

  const colonMatch = normalized.match(/^[^:\n\uFF1A]{0,120}[:\uFF1A]\s*([\s\S]{20,})$/u)
  if (colonMatch?.[1]) {
    return compactText(normalizeBriefValue(colonMatch[1]), WRITER_PRIOR_DRAFT_MAX_CHARS)
  }

  const multilineSource = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(1)
    .join("\n")
  if (multilineSource.length >= 20) {
    return compactText(normalizeBriefValue(multilineSource), WRITER_PRIOR_DRAFT_MAX_CHARS)
  }

  const quotedSourceMatch = normalized.match(/["']([^"']{20,})["']/u)
  return compactText(normalizeBriefValue(quotedSourceMatch?.[1] || ""), WRITER_PRIOR_DRAFT_MAX_CHARS)
}

function _hasInlineWriterSourceText(query: string) {
  return Boolean(extractInlineWriterSourceText(query))
}

function shouldPreservePriorWriterRouting(query: string, conversationStatus?: WriterConversationStatus) {
  if (hasExplicitWriterPlatformTarget(query)) {
    return false
  }

  if (detectRewriteOnlyIntentSafe(query) || detectWriterLengthCorrectionIntent(query)) {
    return true
  }

  if ((conversationStatus || "drafting") === "drafting") {
    return false
  }

  return !detectStandaloneWriterRequest(query)
}

function resolveWriterRoutingFromSignals(params: {
  query: string
  priorRouting: WriterRoutingHistory
  structuredRouting?: WriterRoutingHistory | null
  conversationStatus?: WriterConversationStatus
}) {
  const currentRouting = buildWriterRoutingDecision({ query: params.query })
  const preservePriorRouting = shouldPreservePriorWriterRouting(params.query, params.conversationStatus)
  const explicitScenarioShift =
    Boolean(params.priorRouting.contentType) &&
    currentRouting.contentType !== "longform" &&
    currentRouting.contentType !== params.priorRouting.contentType
  const explicitPlatformShift =
    Boolean(params.priorRouting.targetPlatform) &&
    hasExplicitWriterPlatformTarget(params.query) &&
    Boolean(currentRouting.targetPlatform) &&
    currentRouting.targetPlatform !== params.priorRouting.targetPlatform
  const explicitRouteShift = explicitScenarioShift || explicitPlatformShift
  const shouldInheritPriorLongformRouting =
    Boolean(params.priorRouting.contentType) &&
    currentRouting.contentType === "longform" &&
    !hasExplicitWriterPlatformTarget(params.query) &&
    !detectStandaloneWriterRequest(params.query)
  const effectiveContentType =
    params.structuredRouting?.contentType ||
    (shouldInheritPriorLongformRouting
      ? params.priorRouting.contentType
      : currentRouting.contentType)
  const effectiveTargetPlatform =
    params.structuredRouting?.targetPlatform ||
    ((shouldInheritPriorLongformRouting ||
      (preservePriorRouting &&
        !explicitRouteShift &&
        params.priorRouting.targetPlatform &&
        !hasExplicitWriterPlatformTarget(params.query))) &&
    params.priorRouting.targetPlatform
      ? params.priorRouting.targetPlatform
      : currentRouting.targetPlatform)
  const effectiveOutputForm =
    params.structuredRouting?.outputForm ||
    (preservePriorRouting && !explicitRouteShift && params.priorRouting.outputForm
      ? params.priorRouting.outputForm
      : currentRouting.outputForm)
  const effectiveLengthTarget =
    params.structuredRouting?.lengthTarget ||
    (!hasExplicitWriterLengthTarget(params.query) &&
    preservePriorRouting &&
    !explicitRouteShift &&
    params.priorRouting.lengthTarget
      ? params.priorRouting.lengthTarget
      : currentRouting.lengthTarget)

  return buildWriterRoutingDecision({
    query: params.query,
    contentType: effectiveContentType as WriterContentType | "" | null | undefined,
    targetPlatform: effectiveTargetPlatform,
    outputForm: effectiveOutputForm,
    lengthTarget: effectiveLengthTarget,
  })
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
  conversationStatus?: WriterConversationStatus
}) {
  const conversationContext = buildWriterBriefExtractionContext(params.history, params.query)
  const priorRouting = getPriorRoutingFromHistory(params.history)
  const heuristicRouting = resolveWriterRoutingFromSignals({
    query: params.query,
    priorRouting,
    conversationStatus: params.conversationStatus,
  })
  const currentBriefSummary = [
    `contentType=${heuristicRouting.contentType}`,
    `targetPlatform=${heuristicRouting.targetPlatform}`,
    `outputForm=${heuristicRouting.outputForm}`,
    `lengthTarget=${heuristicRouting.lengthTarget}`,
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
    `Available content types: ${Object.keys(WRITER_CONTENT_TYPE_CONFIG).join(", ")}`,
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
      routingDecision: {
        contentType: "",
        targetPlatform: "",
        outputForm: "",
        lengthTarget: "",
      },
      answeredFields: ["contentType"],
      suggestedFollowUpFields: ["targetPlatform"],
      suggestedFollowUpQuestion: "question text here",
      turnIntent: "briefing",
      userWantsDirectOutput: false,
      briefSufficient: false,
      retrievalHints: {
        enterpriseKnowledgeNeeded: false,
        freshResearchNeeded: false,
        confidence: 0.8,
        reason: "generic_writing",
      },
      confidence: 0.8,
    }),
    "Rules for the JSON response:",
    "- answeredFields must only contain contentType, targetPlatform, topic, audience, objective, or tone.",
    "- suggestedFollowUpFields must contain at most two items from contentType, targetPlatform, topic, audience, objective, or tone.",
    "- turnIntent must be one of: capability_question, briefing, direct_draft, rewrite.",
    "- routingDecision.contentType must be one of the available content types or an empty string.",
    `- If the latest reply is a short follow-up answer or revision request, inherit routing defaults from the heuristic route (${heuristicRouting.contentType} / ${heuristicRouting.targetPlatform} / ${heuristicRouting.outputForm} / ${heuristicRouting.lengthTarget}) unless the user explicitly changes them.`,
    "- suggestedFollowUpQuestion must be empty if no clarification is needed.",
    "- briefSufficient should be true when the topic is clear and the assistant can reasonably draft now.",
    "- userWantsDirectOutput should be true if the latest user turn asks to start writing immediately.",
    "- retrievalHints.enterpriseKnowledgeNeeded should be true only when accurate first-party enterprise facts, products, certifications, factory details, case studies, or brand positioning are materially needed for a good answer.",
    "- retrievalHints.freshResearchNeeded should be true only when the user explicitly asks for latest/current/trend/report/news/benchmark style information.",
    "- If the user provides one or more http/https URLs or asks to base the draft on linked sources, retrievalHints.freshResearchNeeded must be true.",
    '- For rewrite, polish, translate, shorten, title-only, structure-only, or generic writing requests, set retrievalHints.enterpriseKnowledgeNeeded to false unless the user explicitly asks to ground the answer in enterprise facts.',
  ].join("\n")

  return { systemPrompt, userPrompt }
}

const WRITER_OBJECTIVE_SIGNAL_RE =
  /(?:咨询|转化|认知|获客|线索|留资|预约|试用|成交|下单|报名|涨粉|曝光|awareness|trust|conversion|lead|signup|sign-up|trial|purchase|consultation|demo)/iu

const WRITER_AUDIENCE_SIGNAL_RE =
  /(?:老板|创始人|创业者|制造业|企业主|高管|决策者|销售|运营|市场|用户|客户|团队|读者|小白|新手|入门者|爱好者|粉丝|求职者|消费者|买家|卖家|开发者|设计师|产品经理|founder|buyer|leader|executive|sales|operator|marketer|customer|team|beginner|enthusiast)/iu

const WRITER_FRESH_RESEARCH_SIGNAL_RE =
  /(?:最新|趋势|报告|调研|数据|统计|行业洞察|市场规模|竞品|新闻|今年|明年|202[4-9]|\b(?:latest|trend(?:s)?|report(?:s)?|research|benchmark|news|forecast|survey)\b|\bmarket(?:\s+(?:size|trend|report|share|analysis|outlook))?\b)/iu

const WRITER_SOURCE_URL_RE = /https?:\/\/[^\s<>"'`)\]，。；！？、：）】》」』]+/giu
const WRITER_SOURCE_URL_BREAK_RE = /[，。；！？、：）】》」』]/u
const WRITER_SOURCE_REFERENCE_SIGNAL_RE =
  /(?:参考|參考|引用|链接|連結|网址|網址|基于链接|根據連結|read the link|read this url|based on (?:the )?(?:link|url|source)|according to (?:the )?(?:link|url|source)|crawl|scrape)/iu

function normalizeResearchUrl(raw: string) {
  let candidate = raw.trim()
  const breakIndex = candidate.search(WRITER_SOURCE_URL_BREAK_RE)
  if (breakIndex > 0) {
    candidate = candidate.slice(0, breakIndex)
  }
  candidate = candidate.replace(/[),.;!?，。；！？、：）】》」』]+$/u, "")
  if (!candidate) return ""

  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return ""
    return parsed.toString()
  } catch {
    return ""
  }
}

function extractUrlsFromText(text: string) {
  if (!text) return []

  const urls = new Set<string>()
  for (const match of text.matchAll(WRITER_SOURCE_URL_RE)) {
    const normalized = normalizeResearchUrl(match[0] || "")
    if (!normalized) continue
    urls.add(normalized)
  }

  return [...urls].slice(0, 5)
}

function collectWriterSourceUrls(params: {
  query: string
  brief?: WriterConversationBrief | null
  history?: WriterHistoryEntry[]
}) {
  const urls = new Set<string>()
  const register = (value: string) => {
    for (const url of extractUrlsFromText(value)) {
      urls.add(url)
    }
  }

  register(params.query)
  register(params.brief?.topic || "")
  register(params.brief?.constraints || "")
  register(params.brief?.objective || "")
  for (const entry of params.history || []) {
    register(entry.query || "")
    register(entry.inputs?.contents || "")
  }

  return [...urls].slice(0, 5)
}

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
  const audienceCandidate = sanitizeWriterAudienceCandidate(safeExtractAudienceFromText(normalized))
  const toneCandidate = safeExtractToneFromText(normalized)
  const topicCandidate = sanitizeWriterTopicCandidate(safeExtractTopicFromText(normalized))
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

function normalizeWriterPreloadedBrief(input?: WriterPreloadedBrief | null): Partial<WriterConversationBrief> | null {
  if (!input) return null

  const brief = {
    topic: normalizeBriefValue(input.topic || ""),
    audience: normalizeBriefValue(input.audience || ""),
    objective: normalizeBriefValue(input.objective || ""),
    tone: normalizeBriefValue(input.tone || ""),
    constraints: normalizeBriefValue(input.constraints || ""),
  }

  return Object.values(brief).some(Boolean) ? brief : null
}

function isRichFirstMessage(input: {
  query: string
  historyLength: number
  brief: WriterConversationBrief
  routing: WriterRoutingDecision | null
}) {
  if (input.historyLength > 0) return false
  const normalized = normalizeBriefValue(input.query)
  if (normalized.length < 40) return false
  return Boolean(
    input.brief.topic &&
      (input.brief.audience || input.brief.objective) &&
      (input.brief.tone || input.routing?.contentType || input.routing?.targetPlatform),
  )
}

function extractWriterBriefWithFixture(params: {
  query: string
  history: WriterHistoryEntry[]
  brief: WriterConversationBrief
  platform: WriterPlatform
  mode: WriterMode
  preferredLanguage: WriterLanguage
  briefingGuide: WriterBriefingSkillDocument
  conversationStatus?: WriterConversationStatus
}): WriterBriefExtractionResult {
  const latestAssistantAnswer = params.history[params.history.length - 1]?.answer || ""
  const requestedFields = safeInferWriterRequestedFieldsFromAnswer(latestAssistantAnswer)
  const inferredFromPromptedReply = inferWriterBriefFromPromptedReply(params.query, requestedFields, params.brief)
  const prior = getPriorRoutingFromHistory(params.history)
  const finalRouting = resolveWriterRoutingFromSignals({
    query: params.query,
    priorRouting: prior,
    conversationStatus: params.conversationStatus,
  })
  const resolvedBrief = mergeStructuredWriterBrief(params.brief, inferredFromPromptedReply)
  const actionableMissingFields = getWriterActionableMissingFields(resolvedBrief, finalRouting)
  const chinese = isChineseConversation(params.query, params.preferredLanguage)
  const userWantsDirectOutput = safeWantsDirectWriterOutput(params.query)
  const turnIntent = resolveWriterTurnIntent({
    query: params.query,
    structuredIntent: null,
  })
  const briefSufficient = actionableMissingFields.length === 0
  const turnCount = Math.min(WRITER_BRIEF_MAX_TURNS, params.history.length + 1)
  const followUpFieldCount = getWriterFollowUpFieldCount(turnCount, WRITER_BRIEF_MAX_TURNS, actionableMissingFields.length)
  const retrievalHints = inferWriterRetrievalHintsFromSignals(params.query, resolvedBrief)

  return {
    resolvedBrief,
    routingDecision: {
      contentType: finalRouting.contentType,
      targetPlatform: finalRouting.targetPlatform,
      outputForm: finalRouting.outputForm,
      lengthTarget: finalRouting.lengthTarget,
    },
    answeredFields: sanitizeWriterBriefFields([
      ...requestedFields.filter((field) => {
        if (field === "contentType") return Boolean(finalRouting.contentType)
        if (field === "targetPlatform") return Boolean(finalRouting.targetPlatform)
        return Boolean(inferredFromPromptedReply[field as keyof WriterConversationBrief])
      }),
      ...(finalRouting.contentType ? ["contentType" as const] : []),
      ...(finalRouting.targetPlatform ? ["targetPlatform" as const] : []),
      ...(resolvedBrief.topic && !params.brief.topic ? ["topic" as const] : []),
      ...(resolvedBrief.audience && !params.brief.audience ? ["audience" as const] : []),
      ...(resolvedBrief.objective && !params.brief.objective ? ["objective" as const] : []),
      ...(resolvedBrief.tone && !params.brief.tone ? ["tone" as const] : []),
    ]),
    suggestedFollowUpFields: briefSufficient ? [] : actionableMissingFields.slice(0, followUpFieldCount),
    suggestedFollowUpQuestion:
      briefSufficient || userWantsDirectOutput
        ? ""
        : safeBuildWriterFollowUpQuestion({
            brief: resolvedBrief,
          missingFields: actionableMissingFields,
          turnCount,
          maxTurns: WRITER_BRIEF_MAX_TURNS,
          chinese,
        }),
    turnIntent,
    userWantsDirectOutput,
    briefSufficient,
    retrievalHints,
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
  conversationStatus?: WriterConversationStatus
}): Promise<WriterBriefExtractionResult | null> {
  if (shouldUseWriterE2EFixtures()) {
    return extractWriterBriefWithFixture(params)
  }

  if (!hasWriterTextProvider()) {
    return null
  }

  try {
    const { systemPrompt, userPrompt } = buildWriterBriefExtractionPrompt(params)
    const raw = await generateTextWithWriterModel(systemPrompt, userPrompt, WRITER_SKILL_MODEL, {
      temperature: 0,
      maxTokens: 900,
      timeoutMs: WRITER_BRIEF_EXTRACTION_PROVIDER_TIMEOUT_MS,
      totalTimeoutMs: WRITER_BRIEF_EXTRACTION_TIMEOUT_MS,
      providerTimeoutMs: WRITER_BRIEF_EXTRACTION_PROVIDER_TIMEOUT_MS,
    })
    const parsed = WRITER_BRIEF_EXTRACTION_SCHEMA.safeParse(JSON.parse(extractJsonObjectFromText(raw)))
    if (!parsed.success) {
      console.warn("writer.brief-extraction.invalid", parsed.error.flatten())
      return null
    }

    return {
      resolvedBrief: mergeStructuredWriterBrief(createEmptyWriterBrief(), parsed.data.resolvedBrief),
      routingDecision: sanitizeStructuredRoutingDecision(parsed.data.routingDecision),
      answeredFields: sanitizeWriterBriefFields(parsed.data.answeredFields),
      suggestedFollowUpFields: sanitizeWriterBriefFields(parsed.data.suggestedFollowUpFields),
      suggestedFollowUpQuestion: parsed.data.suggestedFollowUpQuestion.trim(),
      turnIntent: parsed.data.turnIntent,
      userWantsDirectOutput: parsed.data.userWantsDirectOutput,
      briefSufficient: parsed.data.briefSufficient,
      retrievalHints: parsed.data.retrievalHints,
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

function buildWriterHandoffPrompt(brief: WriterConversationBrief, routing: WriterRoutingDecision, chinese: boolean) {
  if (chinese) {
    return [
      `请直接写一份 ${routing.outputForm}，使用场景是 ${routing.targetPlatform}。`,
      `目标受众是 ${brief.audience || "该场景下的核心受众"}，目标是 ${
        brief.objective || "帮助读者理解主题并建立信任"
      }。`,
      `核心主题与必须覆盖的信息：${brief.topic || "围绕用户请求中明确的主题展开"}。`,
      `请采用 ${brief.tone || "该场景的原生语气"}，篇幅控制在 ${routing.lengthTarget}，结构遵循 ${routing.outputForm} 的原生写法。`,
      brief.constraints
        ? `必须遵守这些限制或必带信息：${brief.constraints}。`
        : "如无额外资料，不要编造具体数据、案例或承诺。",
      "请直接输出成稿，不要重复 brief；除非存在关键事实缺口，否则不要反问。",
    ].join(" ")
  }

  return [
    `Write a ${routing.outputForm} for ${routing.targetPlatform}.`,
    `The audience is ${brief.audience || "the core audience for this scenario"}, and the goal is ${
      brief.objective || "to help the reader understand the topic and build trust"
    }.`,
    `Cover this core topic and message: ${brief.topic || "the topic clearly stated in the user request"}.`,
    `Use a ${brief.tone || "scenario-native"} tone, keep it within ${routing.lengthTarget}, and structure it natively for this format.`,
    brief.constraints
      ? `Respect these constraints or must-cover details: ${brief.constraints}.`
      : "Do not invent exact facts, data, or case studies if they were not provided.",
    "Generate the draft directly without repeating the brief unless a critical factual gap makes completion impossible.",
  ].join(" ")
}

function buildWriterBriefConfirmationPrompt(params: {
  brief: WriterConversationBrief
  routing: WriterRoutingDecision
  chinese: boolean
}) {
  if (params.chinese) {
    return [
      `我先确认一下理解：${summarizeCollectedWriterBrief(params.brief, true)}。`,
      "如果这个方向没问题，回复“确认开始写”，或者直接告诉我需要改哪里。",
      "",
      "建议写作提示词：",
      buildWriterHandoffPrompt(params.brief, params.routing, true),
    ].join("\n")
  }

  const handoffPrompt = buildWriterHandoffPrompt(params.brief, params.routing, params.chinese)

  return [
    `Here is my current understanding: ${summarizeCollectedWriterBrief(params.brief, false)}.`,
    'If this looks right, reply "confirm and write" or tell me what to change.',
    "",
    "Suggested writing prompt:",
    handoffPrompt,
  ].join("\n")
}

function buildWriterBriefPrompt(
  originalQuery: string,
  brief: WriterConversationBrief,
  routing: WriterRoutingDecision,
  options?: {
    history?: WriterHistoryEntry[]
    latestDraft?: string | null
    sourceText?: string | null
    rewriteMode?: "translate" | "rewrite" | null
  },
) {
  const recentConversationContext = buildRecentWriterConversationContext(options?.history || [])
  const latestDraft = options?.latestDraft
    ? stripHiddenReasoning(options.latestDraft).slice(0, WRITER_PRIOR_DRAFT_MAX_CHARS)
    : ""
  const sourceText = options?.sourceText
    ? normalizeBriefValue(options.sourceText).slice(0, WRITER_PRIOR_DRAFT_MAX_CHARS)
    : ""
  const rewriteInstruction =
    options?.rewriteMode === "translate"
      ? "Translate the provided source text directly. Preserve meaning, key facts, and useful structure. Do not expand it into a brand-new article unless the user explicitly asks for that. Return only the translated text, without adding a title, headings, or image placeholders unless requested."
      : sourceText || latestDraft
        ? "Revise the provided source text directly according to the user's request. Preserve core meaning and facts unless the user explicitly asks to change them. Do not invent a brand-new article. Return only the rewritten text, without adding a title, headings, or image placeholders unless requested."
        : ""

  return [
    originalQuery.trim(),
    ...(sourceText ? ["", "Source text to transform:", sourceText] : []),
    ...(latestDraft ? ["", "Current working draft to revise or continue:", latestDraft] : []),
    ...(recentConversationContext ? ["", "Recent conversation context:", recentConversationContext] : []),
    "",
    "Approved writing brief:",
    `- Content type: ${routing.selectedSkillLabel}`,
    `- Target platform: ${routing.targetPlatform}`,
    `- Output form: ${routing.outputForm}`,
    `- Length target: ${routing.lengthTarget}`,
    `- Topic and angle: ${brief.topic}`,
    `- Target audience: ${brief.audience || "Readers who care about this topic on the selected platform."}`,
    `- Primary objective: ${brief.objective || "Help readers quickly understand the topic and build trust."}`,
    `- Tone and voice: ${brief.tone || "Use the platform-native default tone."}`,
    `- Render surface: ${routing.renderPlatform}`,
    `- Render mode: ${routing.renderMode}`,
    brief.constraints ? `- Constraints: ${brief.constraints}` : "",
    "",
    rewriteInstruction ||
      (latestDraft
      ? "Revise or continue the existing draft above. Keep useful structure and facts unless the user explicitly asks to replace them."
      : "Write the first full draft based on this approved brief."),
    "Do not ask follow-up questions in the final output.",
  ]
    .filter(Boolean)
    .join("\n")
}

function parseHardWriterLengthTarget(lengthTarget: string): WriterHardLengthTarget | null {
  const match = /(\d{2,5})\s*(字|words?)/iu.exec(lengthTarget)
  if (!match) return null
  const maxUnits = Number.parseInt(match[1], 10)
  if (!Number.isFinite(maxUnits) || maxUnits <= 0) return null
  return {
    maxUnits,
    unit: /word/i.test(match[2]) ? "words" : "chars",
  }
}

function stripWriterLengthArtifacts(markdown: string) {
  return markdown
    .replace(/^writer-asset:\/\/[^\r\n]+$/gimu, " ")
    .replace(/writer-asset:\/\/[^\s)]+/gimu, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/gimu, " ")
}

function getWriterLengthPlainText(markdown: string) {
  return stripMarkdownForContext(stripWriterLengthArtifacts(stripHiddenReasoning(markdown))).replace(/\s+/g, " ").trim()
}

function countWriterLengthUnits(text: string, unit: WriterHardLengthTarget["unit"]) {
  if (!text.trim()) return 0
  if (unit === "words") {
    return text.trim().split(/\s+/u).filter(Boolean).length
  }
  return Array.from(text).length
}

function trimWriterTextToUnitLimit(text: string, target: WriterHardLengthTarget) {
  if (target.unit === "words") {
    return text
      .trim()
      .split(/\s+/u)
      .filter(Boolean)
      .slice(0, target.maxUnits)
      .join(" ")
      .trim()
  }

  return Array.from(text).slice(0, target.maxUnits).join("").trim()
}

function condenseWriterTextToHardLimit(text: string, target: WriterHardLengthTarget) {
  const hashtagPattern = /#[\p{L}\p{N}_-]+/gu
  const hashtags = [...new Set(text.match(hashtagPattern) || [])].join(" ").trim()
  const body = text.replace(hashtagPattern, " ").replace(/\s+/g, " ").trim()
  const sentences = body
    .split(/(?<=[。！？!?.])\s+|\n+/u)
    .map((part) => part.trim())
    .filter(Boolean)

  let next = ""
  for (const sentence of sentences) {
    const candidate = next ? `${next} ${sentence}` : sentence
    if (countWriterLengthUnits(candidate, target.unit) <= target.maxUnits) {
      next = candidate
      continue
    }
    break
  }

  if (!next) {
    next = trimWriterTextToUnitLimit(body, target)
  }

  if (hashtags) {
    const tagged = `${next} ${hashtags}`.trim()
    if (countWriterLengthUnits(tagged, target.unit) <= target.maxUnits) {
      return tagged
    }
  }

  return next.trim()
}

function enforceWriterHardLengthTarget(markdown: string, routing: WriterRoutingDecision) {
  const hardTarget = parseHardWriterLengthTarget(routing.lengthTarget)
  if (!hardTarget) {
    return normalizeLineBreaks(markdown).trim()
  }

  const plainText = getWriterLengthPlainText(markdown)
  if (!plainText) {
    return normalizeLineBreaks(markdown).trim()
  }

  if (countWriterLengthUnits(plainText, hardTarget.unit) <= hardTarget.maxUnits) {
    return normalizeLineBreaks(markdown).trim()
  }

  return condenseWriterTextToHardLimit(plainText, hardTarget)
}

function shouldUseWriterE2EFixtures() {
  return process.env.WRITER_E2E_FIXTURES === "true"
}

function hasWriterResearchConfig() {
  return Boolean(SERPER_API_KEY)
}

function hasWriterDirectReadConfig() {
  return true
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

function extractWriterEnterpriseBriefDefaultsFromSnippets(
  snippets: EnterpriseKnowledgeContext["snippets"],
): Partial<WriterConversationBrief> | null {
  let tone = ""
  let audience = ""

  const prioritizedSnippets = [...snippets].sort((left, right) => {
    const leftPriority = left.scope === "brand" || left.inferredScope === "brand" ? 0 : 1
    const rightPriority = right.scope === "brand" || right.inferredScope === "brand" ? 0 : 1
    return leftPriority - rightPriority
  })

  for (const snippet of prioritizedSnippets) {
    const content = normalizeBriefValue(snippet.content || "")
    if (!content) continue

    if (!tone) {
      const explicitTone = safeExtractFirstChineseMatch(content, [
        /(?:品牌语调|品牌语气|语调|语气|口吻|文风|tone|voice|style)\s*(?::|：)?\s*([^，。；;\n]+)/iu,
      ])
      tone = explicitTone || extractToneKeywords(content)
    }

    if (!audience) {
      audience = safeExtractFirstChineseMatch(content, [
        /(?:目标受众|目标读者|目标用户|适合人群|核心人群|受众|读者)\s*(?::|：)?\s*([^，。；;\n]+)/iu,
      ])
    }

    if (tone && audience) {
      break
    }
  }

  const defaults: Partial<WriterConversationBrief> = {}
  if (tone) defaults.tone = clipBriefField(tone)
  if (audience) defaults.audience = clipBriefField(audience)
  return Object.keys(defaults).length > 0 ? defaults : null
}

async function extractBriefDefaultsFromEnterpriseKnowledge(params: {
  enterpriseId?: number | null
  query: string
  brief: WriterConversationBrief
  platform: WriterPlatform
  mode: WriterMode
}) {
  if (!params.enterpriseId || (params.brief.audience && params.brief.tone)) {
    return null
  }

  const enterpriseKnowledge = await withTimeout(
    loadEnterpriseKnowledgeContext({
      enterpriseId: params.enterpriseId,
      query: clipWriterEnterpriseRetrievalQuery(params.query),
      queryVariants: normalizeWriterEnterpriseQueryVariants([
        `${params.query}\n补充品牌语气和目标受众`,
        `${params.query}\nbrand tone and target audience`,
      ]),
      preferredScopes: ["brand", "general"],
      platform: params.platform,
      mode: params.mode,
    }).catch(() => null),
    WRITER_ENTERPRISE_KNOWLEDGE_BUDGET_MS,
    () => null,
  )

  if (!enterpriseKnowledge?.snippets?.length) {
    return null
  }

  const defaults = extractWriterEnterpriseBriefDefaultsFromSnippets(enterpriseKnowledge.snippets)
  if (!defaults) {
    return null
  }

  return {
    ...(params.brief.audience ? {} : defaults.audience ? { audience: defaults.audience } : {}),
    ...(params.brief.tone ? {} : defaults.tone ? { tone: defaults.tone } : {}),
  } satisfies Partial<WriterConversationBrief>
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

function safeExtractTopicFromText(text: string, options?: { allowShortFallback?: boolean }) {
  const explicit = safeExtractFirstChineseMatch(text, [
    /(?:\u4e3b\u9898|\u8bdd\u9898|\u9009\u9898|\u6807\u9898\u65b9\u5411|\u6838\u5fc3\u89d2\u5ea6)\s*(?::|\uff1a)?\s*([^\uff0c\u3002\uff1b;\n]+)/iu,
    /(?:topic|subject|angle)\s*(?::|\uff1a)?\s*([^,.;\n]+)/iu,
    /(?:\u5173\u4e8e|\u56f4\u7ed5|\u805a\u7126\u4e8e?)\s*([^\uff0c\u3002\uff1b;\n]+)/iu,
    /(?:适合|适用于)\s*[^，。；;\n]+?\s*发布的\s*([^，。；;\n]+?)(?:文章|帖子|贴文|线程|串文|post|thread)/iu,
    /(?:写|生成|起草)\s*(?:一组|一篇|一条|一个)?\s*(?:适合\s*[^，。；;\n]+?\s*发布的\s*)?([^，。；;\n]+?)(?:文章|帖子|贴文|线程|串文|post|thread)/iu,
    /(?:write|draft|create)\s+(?:an?|the)?\s*[^,.;\n]*?\s+for\s+[^,.;\n]+?\s+(?:about|on)\s+([^,.;\n]+)/iu,
    /(?:article|post|thread|email)\s+for\s+[^,.;\n]+?\s+(?:about|on)\s+([^,.;\n]+)/iu,
    /(?:write|draft|create)\s+(?:an?|the)?\s*(?:article|post|thread|wechat article|xiaohongshu note)?\s*(?:about|on)\s+([^,.;\n]+)/iu,
    /(?:article|post|thread)\s+(?:about|on)\s+([^,.;\n]+)/iu,
    /(?:write|draft|create)\s+(?:an?|the)?\s*[^,.;\n]*?\s+introduc(?:e|ing)\s+([^.;\n]+)/iu,
    /(?:introduc(?:e|ing)|highlight(?:ing)?|focus(?:ed)?\s+on)\s+([^.;\n]+)/iu,
  ])
  const emphasizedChineseAngle = extractFirstMatch(text, [
    /(?:特别是|尤其是|重点是)\s*([^，。；;\n]+)/u,
  ])
  if (emphasizedChineseAngle) return sanitizeWriterTopicCandidate(emphasizedChineseAngle)
  if (explicit) return sanitizeWriterTopicCandidate(explicit)
  const objectiveLike = WRITER_OBJECTIVE_SIGNAL_RE.test(text)
  const audienceLike = WRITER_AUDIENCE_SIGNAL_RE.test(text)
  const allowShortFallback = options?.allowShortFallback !== false
  if (allowShortFallback && !/[\u3002\uff01\uff1f?]/u.test(text) && text.length <= 120 && !objectiveLike && !audienceLike) {
    return compactText(text, 90)
  }
  return ""
}

function safeExtractAudienceFromText(text: string) {
  const explicit = safeExtractFirstChineseMatch(text, [
    /(?:面向|针对|适合|读者是|受众是|目标读者|目标用户|目标受众)\s*(?::|：)?\s*([^，。；;\n]+)/iu,
    /(?:for|target(?:ing)?|audience(?: is)?)\s+([^,.;\n]+?)(?=\s+(?:about|on)\b|[,.;\n]|$)/iu,
  ])
  if (explicit) return explicit
  // Colloquial Chinese patterns: "主要是喜欢AI的小白看的", "写给新手看的", "给企业主看的"
  const colloquial = safeExtractFirstChineseMatch(text, [
    /(?:主要是|主要|专门)?\s*([^\s,，。；;\n]{2,30}?)\s*(?:看的|来看的)/iu,
    /(?:写给|给|面向)\s*([^\s,，。；;\n]{2,30}?)\s*(?:看|阅读|参考)/iu,
    /(?:适合|针对)\s*([^\s,，。；;\n]{2,30}?)\s*(?:小白|新手|入门|阅读)/iu,
  ])
  return sanitizeWriterAudienceCandidate(colloquial)
}

function safeExtractObjectiveFromText(text: string) {
  return safeExtractFirstChineseMatch(text, [
    /(?:\u76ee\u6807\u662f|\u76ee\u7684\u662f|\u8bc9\u6c42\u662f|\u5e0c\u671b|\u7528\u4e8e|\u60f3\u8fbe\u5230|\u60f3\u5b9e\u73b0|\u60f3\u8ba9\u8bfb\u8005)\s*(?::|\uff1a)?\s*([^\uff0c\u3002\uff1b;\n]+)/iu,
    /(?:goal|objective|desired outcome|purpose|call to action)(?: is|:)?\s*([^,.;\n]+)/iu,
  ])
}

function safeExtractToneFromText(text: string) {
  const explicit = safeExtractFirstChineseMatch(text, [
    /(?:\u8bed\u6c14|\u53e3\u543b|\u98ce\u683c|\u57fa\u8c03|\u6587\u98ce|tone|style|voice)\s*(?::|\uff1a)?\s*([^\uff0c\u3002\uff1b;\n]+)/iu,
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
    /(?:包含|包括|需要带上|需要包含|带上|带有)\s*([^\u3002\uff1b;\n]+)/iu,
    /(?:length|format|structure|must include|constraints?)(?: is|:)?\s*([^.\n]+)/iu,
    /(?:with|including|include)\s+([^.\n]+)/iu,
  ])
}

function safeInferWriterRequestedFieldsFromAnswer(answer: string) {
  const requestedFields: WriterBriefFieldId[] = []
  if (/(content type|scenario|类型|场景)/iu.test(answer)) requestedFields.push("contentType")
  if (/(platform|channel|surface|平台|渠道)/iu.test(answer)) requestedFields.push("targetPlatform")
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
  return /(?:\u76f4\u63a5\u5199|\u76f4\u63a5\u751f\u6210|\u76f4\u63a5\u51fa\u7a3f|\u76f4\u63a5\u5f00\u59cb|\u76f4\u63a5\u7ed9\u6211\u6210\u7a3f|\u7acb\u5373\u51fa\u7a3f|\u5e2e\u6211\u8d77\u8349|\u4e0d\u7528\u518d\u95ee|\u76f4\u63a5\u51fa\u5b8c\u6574\u7a3f|\u76f4\u63a5\u7ed9\u6211\u6210\u6587|go ahead|just write|draft it now|generate now|no need to ask|write it directly|without follow-up questions|without asking follow-up questions|output the full draft|full draft now|start drafting now)/iu.test(
    query,
  )
}

function safeIsWriterConfirmationReply(query: string) {
  return /^(?:confirm and write|confirm and draft|looks good[, ]*write(?: it)?|go ahead and write|approved[, ]*write(?: it)?|确认开始写|确认并开始写|确认写作|按这个写|就按这个写|可以开始写了)$/iu.test(
    normalizeBriefValue(query),
  )
}

function shouldPromptForWriterBriefConfirmation(params: {
  query: string
  recentHistoryLength: number
  answeredFields?: WriterBriefFieldId[]
}) {
  if (params.recentHistoryLength < 1) return false
  if (params.recentHistoryLength >= 2) return true

  const normalized = normalizeBriefValue(params.query)
  const answeredFieldCount = sanitizeWriterBriefFields(params.answeredFields || []).length
  const labeledFieldMatches =
    normalized.match(
      /(?:^|\b)(?:topic|audience|objective|tone|constraints?|主题|受众|目标|语气|风格|限制)\s*(?::|：)/giu,
    )?.length || 0

  return answeredFieldCount >= 2 || labeledFieldMatches >= 2 || normalized.length >= 72
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
  turnCount: number
  maxTurns: number
  chinese: boolean
}) {
  const followUpFields = params.missingFields.slice(
    0,
    getWriterFollowUpFieldCount(params.turnCount, params.maxTurns, params.missingFields.length),
  )
  const fieldPrompts = followUpFields.map((field) => {
    if (params.chinese) {
      if (field === "contentType") return "\u8fd9\u6b21\u9700\u8981\u7684\u662f\u54ea\u7c7b\u5185\u5bb9\uff0c\u6bd4\u5982\u793e\u5a92\u5e16\u5b50\u3001\u90ae\u4ef6\u3001\u7f51\u7ad9\u6587\u6848\u3001\u6848\u4f8b\u6216\u6f14\u8bb2\u7a3f\uff1f"
      if (field === "targetPlatform") return "\u8fd9\u7bc7\u5185\u5bb9\u51c6\u5907\u53d1\u5230\u54ea\u4e2a\u5e73\u53f0\u6216\u573a\u666f\uff0c\u6bd4\u5982\u516c\u4f17\u53f7\u3001\u5c0f\u7ea2\u4e66\u3001LinkedIn \u3001\u90ae\u4ef6\u6216\u843d\u5730\u9875\uff1f"
      if (field === "topic") return "\u8fd9\u7bc7\u6587\u7ae0\u6700\u60f3\u805a\u7126\u7684\u4e3b\u9898\u6216\u6838\u5fc3\u89d2\u5ea6\u662f\u4ec0\u4e48\uff1f"
      if (field === "audience") return "\u8fd9\u7bc7\u6587\u7ae0\u4e3b\u8981\u662f\u5199\u7ed9\u8c01\u770b\u7684\uff1f"
      if (field === "objective") return "\u4f60\u6700\u5e0c\u671b\u8fd9\u7bc7\u6587\u7ae0\u8fbe\u6210\u4ec0\u4e48\u7ed3\u679c\uff0c\u4f8b\u5982\u5efa\u7acb\u8ba4\u77e5\u3001\u4fc3\u6210\u54a8\u8be2\u6216\u5e26\u6765\u8f6c\u5316\uff1f"
      return "\u6574\u4f53\u8bed\u6c14\u5e0c\u671b\u66f4\u504f\u4e13\u4e1a\u3001\u514b\u5236\u3001\u6545\u4e8b\u611f\uff0c\u8fd8\u662f\u66f4\u8f7b\u677e\u76f4\u63a5\uff1f"
    }
    if (field === "contentType") return "What kind of content do you need: social post, email, website copy, case study, long-form article, or speech?"
    if (field === "targetPlatform") return "Where will this be published or used: WeChat, Xiaohongshu, X, LinkedIn, email, website, or something else?"
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
  const toCompellingTitle = (baseTitle: string, keywordSignal: KeywordSignal | null) => {
    const normalizedBaseTitle = normalizeTitleCandidate(baseTitle, fallbackTitle)
    const chineseContext = languageLabel === "Chinese" || /[\u4e00-\u9fff]/u.test(normalizedBaseTitle)
    const separator = chineseContext ? "\uFF5C" : ": "
    let nextTitle = normalizedBaseTitle
    if (keywordSignal?.value && !keywordInTitle(nextTitle, keywordSignal.value)) {
      const shouldPrefix = keywordSignal.confidence === "high" || isGenericTitle(normalizedBaseTitle)
      if (shouldPrefix) {
        nextTitle = `${keywordSignal.value}${separator}${normalizedBaseTitle}`
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

function compactText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim()
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}...`
}

function decodeBasicHtmlEntities(input: string) {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
}

function extractReadableTextFromHtml(input: string) {
  const normalized = input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?(?:h[1-6]|p|div|section|article|li|ul|ol|br|tr|td|th|blockquote)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
  return decodeBasicHtmlEntities(normalized)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

function normalizeReadableWebContent(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return ""
  const looksLikeHtml = /<html\b|<body\b|<article\b|<main\b|<\/[a-z]+>/i.test(trimmed)
  const text = looksLikeHtml ? extractReadableTextFromHtml(trimmed) : trimmed
  return text.replace(/\s+/g, " ").trim()
}

async function readWithDirectFetch(url: string) {
  const response = await writerRequestText(
    url,
    {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (compatible; AIMarketingWriter/1.0; +https://www.aimarketingsite.com/)",
      },
    },
    { attempts: 2, timeoutMs: 90_000 },
  )

  if (!response.ok) {
    throw new Error(`direct_read_http_${response.status}`)
  }

  const content = normalizeReadableWebContent(response.text || "")
  if (!content) {
    throw new Error("direct_read_empty")
  }

  return content
}

async function serperSearch(query: string, num = 5): Promise<SearchItem[]> {
  if (!SERPER_API_KEY) {
    throw new Error("writer_search_config_missing")
  }

  const response = await writerRequestJson(
    `${SERPER_API_BASE}/search`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": SERPER_API_KEY,
      },
      body: JSON.stringify({
        q: query,
        num: Math.min(Math.max(num, 1), 10),
      }),
    },
    { attempts: 2, timeoutMs: 60_000 },
  )
  if (!response.ok) {
    throw new Error(`serper_search_http_${response.status}`)
  }

  const data = response.data as any
  return Array.isArray(data?.organic)
    ? data.organic.map((item: any) => ({
        title: item?.title || "",
        snippet: item?.snippet || "",
        link: item?.link || "",
      }))
    : []
}

function extractSerperScrapeText(data: any) {
  const textCandidates = [
    data?.text,
    data?.markdown,
    data?.content,
    data?.article?.text,
    data?.article?.content,
    data?.data?.text,
    data?.data?.content,
  ]

  for (const candidate of textCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate
    }
  }

  if (Array.isArray(data?.paragraphs) && data.paragraphs.length > 0) {
    return data.paragraphs.filter((item: unknown) => typeof item === "string").join("\n")
  }

  return ""
}

async function readWithSerper(url: string) {
  if (!SERPER_API_KEY) {
    return readWithDirectFetch(url)
  }

  const scrapeEndpoints = [`${SERPER_SCRAPE_API_BASE}/scrape`]
  const fallbackEndpoint = `${SERPER_API_BASE}/scrape`
  if (!scrapeEndpoints.includes(fallbackEndpoint)) {
    scrapeEndpoints.push(fallbackEndpoint)
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-API-KEY": SERPER_API_KEY,
  }

  let lastError: Error | null = null
  for (const endpoint of scrapeEndpoints) {
    try {
      const response = await writerRequestJson(
        endpoint,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ url }),
        },
        { attempts: 2, timeoutMs: 90_000 },
      )

      if (!response.ok) {
        lastError = new Error(`serper_scrape_http_${response.status}`)
        continue
      }

      const content = extractSerperScrapeText(response.data)
      if (content.trim()) {
        return content
      }
      lastError = new Error("serper_scrape_empty")
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("serper_scrape_failed")
    }
  }

  try {
    return await readWithDirectFetch(url)
  } catch {
    throw lastError || new Error("serper_scrape_failed")
  }
}

async function buildResearchContext(
  query: string,
  options?: { skip?: boolean; sourceUrls?: string[] },
): Promise<WriterResearchResult> {
  const sourceUrls = [
    ...new Set((options?.sourceUrls?.length ? options.sourceUrls : extractUrlsFromText(query)).map(normalizeResearchUrl).filter(Boolean)),
  ].slice(0, 5)

  if (options?.skip && sourceUrls.length === 0) {
    return createEmptyResearchResult("skipped")
  }

  if (!WRITER_ENABLE_WEB_RESEARCH && sourceUrls.length === 0) {
    return createEmptyResearchResult("disabled")
  }

  if (sourceUrls.length > 0 && !hasWriterDirectReadConfig()) {
    throw new Error("writer_search_config_missing")
  }

  if (sourceUrls.length === 0 && !hasWriterResearchConfig()) {
    if (WRITER_REQUIRE_WEB_RESEARCH) {
      throw new Error("writer_search_config_missing")
    }

    return createEmptyResearchResult("unavailable")
  }

  const cacheKey = `${query.trim().toLowerCase()}::${sourceUrls.join("|")}`
  const cached = writerResearchCache.get(cacheKey)
  const now = Date.now()
  if (cached && cached.expiresAt > now) {
    return cached.value
  }

  const nextValue = withTimeout(buildResearchContextFresh(query, sourceUrls), WRITER_RESEARCH_BUDGET_MS, () =>
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

async function buildResearchContextFresh(query: string, sourceUrls: string[] = []): Promise<WriterResearchResult> {
  if (sourceUrls.length > 0) {
    const extracts = (
      await Promise.all(
        sourceUrls.map(async (url) => {
          try {
            const content = await readWithSerper(url)
            if (!content.trim()) return null
            return {
              url,
              content: compactText(content, WRITER_RESEARCH_EXTRACT_MAX_CHARS),
            }
          } catch {
            return null
          }
        }),
      )
    ).filter((item): item is WriterResearchResult["extracts"][number] => Boolean(item))

    if (!extracts.length) {
      throw new Error("writer_source_url_fetch_failed")
    }

    const items: SearchItem[] = extracts.map((extract, index) => ({
      title: `User-provided source ${index + 1}`,
      snippet: compactText(extract.content, 260),
      link: extract.url,
    }))

    return {
      items,
      extracts,
      status: "ready",
    }
  }

  const items = await serperSearch(`${query} latest trends case study`, WRITER_SEARCH_RESULT_LIMIT)
  if (items.length === 0) {
    return createEmptyResearchResult("unavailable")
  }

  const extracts = (
    await Promise.all(
      items.slice(0, WRITER_SEARCH_EXTRACT_LIMIT).map(async (item) => {
        if (!item.link) return null

        try {
          const content = await readWithSerper(item.link)
          if (!content.trim()) return null

          return {
            url: item.link,
            content: compactText(content, WRITER_RESEARCH_EXTRACT_MAX_CHARS),
          }
        } catch {
          return null
        }
      }),
    )
  ).filter((item): item is WriterResearchResult["extracts"][number] => Boolean(item))

  return { items, extracts, status: "ready" }
}

function detectWriterTransformModeFromPrompt(query: string) {
  if (/Translate the provided source text directly/i.test(query)) {
    return "translate" as const
  }
  if (/Revise the provided source text directly/i.test(query)) {
    return "rewrite" as const
  }
  return null
}

async function buildSystemPrompt(
  query: string,
  routing: WriterRoutingDecision,
  languageInstruction: string,
  research: WriterResearchResult,
  enterpriseKnowledge?: EnterpriseKnowledgeContext | null,
) {
  const transformMode = detectWriterTransformModeFromPrompt(query)
  const [guide, contentGuide, styleGuide] = await Promise.all([
    getWriterRuntimeGuide(routing),
    getWriterContentGuide(routing.contentType),
    routing.selectedStyleSkillId ? getWriterStyleGuide(routing.selectedStyleSkillId) : Promise.resolve(null),
  ])
  const modeLabel = routing.renderMode === "thread" ? "thread or multi-part post" : "single structured draft"

  return [
    `You are a ${contentGuide.runtimeLabel}.`,
    `Scenario routing: ${describeWriterRoute(routing)}.`,
    routing.selectedPlatformSkillLabel ? `Platform skill: ${routing.selectedPlatformSkillLabel}.` : null,
    styleGuide?.guidance ? `Style skill: ${styleGuide.runtimeLabel}.` : null,
    `Tone: ${guide.tone}.`,
    `Output mode: ${modeLabel}.`,
    `Content format: ${routing.outputForm}.`,
    `Length target: ${routing.lengthTarget}.`,
    `Image guidance: ${guide.imageGuidance}.`,
    ...guide.promptRules,
    "Scenario-specific guidance:",
    contentGuide.guidance,
    styleGuide?.guidance ? "Style-specific guidance:" : null,
    styleGuide?.guidance || null,
    languageInstruction,
    enterpriseKnowledge?.snippets?.length
      ? "Enterprise knowledge is provided separately. Treat it as first-party brand truth and prefer it over generic assumptions."
      : "No enterprise knowledge is attached for this request.",
    transformMode
      ? "This request is a direct source-text transformation task. Return only the transformed text."
      : "Return a publish-ready Markdown draft.",
    research.status === "ready"
      ? "Absorb the research first, then write."
      : research.status === "skipped"
        ? "Live web research was intentionally skipped for this request. Do not imply that outside research was performed."
        : "External research may be partial or unavailable. If so, rely on enterprise knowledge and broadly known information, and avoid precise unsupported claims.",
    routing.contentType === "email"
      ? "Email style rule: write in plain conversational language with short, simple sentences; avoid abstract framing and unnecessary jargon."
      : null,
    routing.contentType === "email"
      ? "Email style rule: stay brand-first by foregrounding relevant brand positioning, core offer, differentiators, and proof before broad industry commentary."
      : null,
    !transformMode && research.extracts.length > 0
      ? "Depth requirement: each substantive section should contain source-grounded specifics such as mechanisms, trade-offs, named entities, or verifiable facts."
      : null,
    !transformMode && research.extracts.length === 0
      ? "Depth requirement: avoid generic filler and explain concrete mechanisms, trade-offs, and practical implications."
      : null,
    "Do not reveal chain-of-thought, hidden reasoning, or internal analysis.",
    transformMode
      ? "Preserve the source text's structure and scope. Do not add titles, headings, markdown sections, or image placeholders unless the user explicitly asks for them or they already exist in the source text."
      : "If the length target is numeric, treat it as a hard maximum rather than a soft suggestion.",
    transformMode
      ? "Do not add `writer-asset://cover` or inline asset placeholders for a direct translation or rewrite task."
      : "Use `writer-asset://cover` for the opening image and add only the inline placeholders that the draft genuinely needs, such as `writer-asset://inline-1`, `writer-asset://inline-2`, or `writer-asset://inline-3`, placing each one beside the section it should illustrate.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")
}

async function buildUserPrompt(
  query: string,
  routing: WriterRoutingDecision,
  research: WriterResearchResult,
  languageInstruction: string,
  enterpriseKnowledge?: EnterpriseKnowledgeContext | null,
) {
  const transformMode = detectWriterTransformModeFromPrompt(query)
  const transformRequirement = transformMode === "translate"
    ? "- This is a translation task. Translate the supplied source text directly and do not expand it into a brand-new article."
    : transformMode === "rewrite"
      ? "- This is a rewrite task. Transform the supplied source text directly rather than drafting a brand-new article."
      : ""
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

  const guide = await getWriterRuntimeGuide(routing)
  const platformStructureGuide =
    routing.renderPlatform === "wechat" || routing.renderPlatform === "xiaohongshu"
      ? guide.articleStructureGuidance
      : routing.renderMode === "thread"
        ? guide.threadStructureGuidance || WRITER_PLATFORM_GUIDE[routing.renderPlatform]?.threadStructureGuidance || ""
        : guide.articleStructureGuidance

  return [
    "User request:",
    query.trim(),
    "",
    "Routing decision:",
    `- Content type: ${routing.selectedSkillLabel}`,
    `- Target platform: ${routing.targetPlatform}`,
    `- Output form: ${routing.outputForm}`,
    `- Length target: ${routing.lengthTarget}`,
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
    transformRequirement,
    transformMode
      ? "- Keep the source text's structure and scope. Do not add a title, headings, cover placeholder, or extra sections unless the user explicitly asks."
      : "",
    "- Output only the final draft. Do not explain the process.",
    "- Use enterprise knowledge first when it directly answers the topic.",
    "- Use the source material for trends, external facts, and cases. Do not invent specific data.",
    routing.contentType === "email"
      ? "- Email style rule: use conversational wording, short sentence structure, and concrete language that non-experts can understand quickly."
      : "",
    routing.contentType === "email"
      ? "- Email style rule: make the brand priorities explicit by tying the message to the brand's strongest value points, proof, and a single clear CTA."
      : "",
    transformMode
      ? ""
      : research.extracts.length > 0
        ? "- Depth requirement: keep the draft insight-dense; each major section should include concrete source-grounded details and explain why they matter."
        : "- Depth requirement: keep the draft insight-dense with concrete mechanisms, trade-offs, and practical implications.",
    "- The result must be clean Markdown suitable for continued editing and publishing.",
    "- Keep the structure native to the selected scenario, platform, and output form.",
    "- If the length target is numeric, do not exceed it.",
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
  routing: WriterRoutingDecision,
  preferredLanguage: WriterLanguage = "auto",
  options?: {
    enterpriseId?: number | null
    researchQuery?: string
    retrievalStrategy?: WriterRetrievalStrategy
    enterpriseQueryVariants?: string[]
    preferredEnterpriseScopes?: EnterpriseKnowledgeScope[]
    sourceUrls?: string[]
  },
): Promise<WriterDraftGenerationResult> {
  const contextQuery = options?.researchQuery?.trim() || query
  const retrievalStrategy = options?.retrievalStrategy || "no_retrieval"
  const sourceUrls = [
    ...new Set((options?.sourceUrls || []).map(normalizeResearchUrl).filter(Boolean)),
  ].slice(0, 5)
  const shouldUseEnterpriseKnowledge =
    Boolean(options?.enterpriseId) &&
    (retrievalStrategy === "enterprise_grounded" || retrievalStrategy === "hybrid_grounded")
  const shouldUseWebResearch =
    retrievalStrategy === "fresh_external" || retrievalStrategy === "hybrid_grounded" || sourceUrls.length > 0

  const enterpriseKnowledgePromise = shouldUseEnterpriseKnowledge
    ? withTimeout(
        loadEnterpriseKnowledgeContext({
          enterpriseId: options?.enterpriseId,
          query: contextQuery,
          queryVariants: options?.enterpriseQueryVariants,
          preferredScopes: options?.preferredEnterpriseScopes,
          platform: routing.renderPlatform,
          mode: routing.renderMode,
        }).catch(() => null),
        WRITER_ENTERPRISE_KNOWLEDGE_BUDGET_MS,
        () => null,
      )
    : Promise.resolve(null)

  if (shouldUseWriterE2EFixtures()) {
    const enterpriseKnowledge = await enterpriseKnowledgePromise
    return {
      answer: safeBuildFixtureDraft(routing.renderPlatform, routing.renderMode, preferredLanguage, enterpriseKnowledge),
      diagnostics: buildWriterTurnDiagnostics({
        retrievalStrategy,
        enterpriseKnowledge,
        enterpriseKnowledgeEnabled: shouldUseEnterpriseKnowledge,
        research: createEmptyResearchResult(shouldUseWebResearch ? "unavailable" : "skipped"),
        routing,
      }),
    }
  }

  const language = safeDetectRequestedLanguage(query, preferredLanguage)
  const researchPromise = buildResearchContext(contextQuery, {
    skip: !shouldUseWebResearch,
    sourceUrls,
  })
  const [enterpriseKnowledge, research] = await Promise.all([enterpriseKnowledgePromise, researchPromise])
  const [systemPrompt, userPrompt] = await Promise.all([
    buildSystemPrompt(query, routing, language.instruction, research, enterpriseKnowledge),
    buildUserPrompt(query, routing, research, language.instruction, enterpriseKnowledge),
  ])
  const answer = await generateTextWithWriterModel(systemPrompt, userPrompt, WRITER_TEXT_MODEL, {
    timeoutMs: WRITER_DRAFT_PROVIDER_TIMEOUT_MS,
    totalTimeoutMs: WRITER_DRAFT_GENERATION_TIMEOUT_MS,
    providerTimeoutMs: WRITER_DRAFT_PROVIDER_TIMEOUT_MS,
  })

  return {
    answer: enforceWriterHardLengthTarget(
      postProcessWriterDraft(routing.renderPlatform, routing.renderMode, answer, language.label),
      routing,
    ),
    diagnostics: buildWriterTurnDiagnostics({
      retrievalStrategy,
      enterpriseKnowledge,
      enterpriseKnowledgeEnabled: shouldUseEnterpriseKnowledge,
      research,
      routing,
    }),
  }
}

const defaultWriterSkillsRuntime: WriterSkillsRuntime = {
  getBriefingGuide: getWriterBriefingGuide,
  getContentGuide: getWriterContentGuide,
  getRuntimeGuide: getWriterRuntimeGuide,
  extractBrief: extractWriterBriefWithModel,
  generateDraft: generateWriterDraftWithSkills,
}

function detectWriterCapabilityQuestion(query: string) {
  const normalized = normalizeBriefValue(query)
  if (!normalized) return false

  if (
    detectStandaloneWriterRequest(normalized) ||
    safeWantsDirectWriterOutput(normalized) ||
    detectRewriteOnlyIntentSafe(normalized)
  ) {
    return false
  }

  const asksCapabilityInChinese =
    /(?:你支持|你能写|你会写|你能做什么|你会做什么|能力边界|支持哪些|支持什么|有哪些(?:文章|内容|文案|格式|平台)|能写哪些|会写哪些)/u.test(
      normalized,
    )
  const asksCapabilityInEnglish =
    /(?:\bwhat\s+(?:can|do)\s+you\s+(?:write|help(?:\s+with)?|support)\b|\bwhat\s+formats?\s+do\s+you\s+support\b|\bwhich\s+platforms?\s+do\s+you\s+support\b|\bwhat\s+content\s+types?\s+do\s+you\s+support\b|\bwhat\s+can\s+this\s+writer\s+do\b|\bwriter\s+capabilit(?:y|ies)\b)/iu.test(
      normalized,
    )
  const looksLikeCapabilityQuestion =
    asksCapabilityInChinese ||
    asksCapabilityInEnglish ||
    ((/[?？]/u.test(normalized) || /(?:哪些|什么|怎么|what|which|how)/iu.test(normalized)) &&
      /(?:支持|格式|平台|能力|边界|support|format|platform|capabilit(?:y|ies))/iu.test(normalized))

  return looksLikeCapabilityQuestion
}

function resolveWriterTurnIntent(params: {
  query: string
  structuredIntent?: WriterTurnIntent | null
}): WriterTurnIntent {
  if (params.structuredIntent && WRITER_TURN_INTENT_IDS.includes(params.structuredIntent)) {
    return params.structuredIntent
  }
  if (detectWriterCapabilityQuestion(params.query)) {
    return "capability_question"
  }
  if (detectRewriteOnlyIntentSafe(params.query)) {
    return "rewrite"
  }
  if (safeWantsDirectWriterOutput(params.query)) {
    return "direct_draft"
  }
  return "briefing"
}

function getWriterSupportedPlatformsText(chinese: boolean) {
  const labels = listWriterPlatformSkills().map((item) => item.label).filter(Boolean)
  return labels.length > 0 ? labels.join(chinese ? "、" : ", ") : ""
}

function buildWriterCapabilityAnswer(params: {
  preferredLanguage: WriterLanguage
  query: string
  enterpriseEnabled: boolean
}) {
  const chinese = isChineseConversation(params.query, params.preferredLanguage)
  const supportedPlatforms = getWriterSupportedPlatformsText(chinese) || [
    WRITER_PLATFORM_CONFIG.wechat.shortLabel,
    WRITER_PLATFORM_CONFIG.xiaohongshu.shortLabel,
    WRITER_PLATFORM_CONFIG.weibo.shortLabel,
    WRITER_PLATFORM_CONFIG.douyin.shortLabel,
    WRITER_PLATFORM_CONFIG.x.shortLabel,
    WRITER_PLATFORM_CONFIG.linkedin.shortLabel,
    WRITER_PLATFORM_CONFIG.instagram.shortLabel,
    WRITER_PLATFORM_CONFIG.tiktok.shortLabel,
    WRITER_PLATFORM_CONFIG.facebook.shortLabel,
  ].join(chinese ? "、" : ", ")

  if (chinese) {
    return [
      "我目前支持这些写作场景：",
      "- 长文内容：公众号文章、品牌故事、教程指南、案例分析",
      "- 社媒内容：小红书、微博、抖音、X、LinkedIn、Instagram、TikTok、Facebook",
      "- 商业文案：cold email、newsletter、网站文案、广告文案、产品介绍、案例、演讲稿",
      "- 文本改写：翻译、润色、缩写、扩写、改语气、换平台重写",
      params.enterpriseEnabled
        ? "- 企业知识库：在确实需要企业事实、产品参数、案例、认证等信息时按需调用，不会每次都检索"
        : "- 企业知识库：当前会话没有启用企业知识库，会按通用写作方式回答",
      `当前支持的平台包括：${supportedPlatforms}。`,
      "如果你愿意，可以直接告诉我：1）要写的格式或平台 2）主题 3）受众 4）目标，我就直接开始。",
    ].join("\n")
  }

  return [
    "Here is what I can help write:",
    "- Long-form content: articles, guides, tutorials, brand stories, and case studies",
    "- Social content: Xiaohongshu, Weibo, Douyin, X, LinkedIn, Instagram, TikTok, and Facebook",
    "- Business copy: cold emails, newsletters, website copy, ads, product copy, case studies, and speeches",
    "- Transformations: translate, rewrite, shorten, expand, change tone, or adapt content for another platform",
    params.enterpriseEnabled
      ? "- Enterprise knowledge: I use it only when first-party facts, product details, certifications, or case evidence are actually needed"
      : "- Enterprise knowledge: this conversation is currently operating without enterprise knowledge grounding",
    `Supported platforms include: ${supportedPlatforms}.`,
    "If you want, send me the format/platform, topic, audience, and goal, and I can draft it directly.",
  ].join("\n")
}

export async function runWriterSkillsTurnWithRuntime(
  params: {
    query: string
    preloadedBrief?: WriterPreloadedBrief | null
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
  const priorRouting = getPriorRoutingFromHistory(recentHistory)

  const heuristicBrief = mergeStructuredWriterBrief(
    collectWriterBriefFromConversation(recentHistory, params.query),
    normalizeWriterPreloadedBrief(params.preloadedBrief),
  )
  const enterpriseBriefDefaults = await extractBriefDefaultsFromEnterpriseKnowledge({
    enterpriseId: params.enterpriseId,
    query: params.query,
    brief: heuristicBrief,
    platform: params.platform,
    mode: params.mode,
  })
  const seededBrief = mergeStructuredWriterBrief(heuristicBrief, enterpriseBriefDefaults)
  const briefingGuide = await runtime.getBriefingGuide()
  const structuredExtraction = await runtime.extractBrief({
    query: params.query,
    history: recentHistory,
    brief: seededBrief,
    platform: params.platform,
    mode: params.mode,
    preferredLanguage,
    briefingGuide,
    conversationStatus: params.conversationStatus,
  })
  const mergedBrief =
    structuredExtraction && structuredExtraction.confidence >= 0.45
      ? mergeStructuredWriterBrief(seededBrief, structuredExtraction.resolvedBrief)
      : seededBrief
  const routing = resolveWriterRoutingFromSignals({
    query: params.query,
    priorRouting,
    structuredRouting: structuredExtraction?.routingDecision,
    conversationStatus: params.conversationStatus,
  })
  const retrievalStrategy = decideWriterRetrievalStrategy({
    query: params.query,
    brief: mergedBrief,
    history: contextHistory,
    enterpriseId: params.enterpriseId,
    retrievalHints: structuredExtraction?.retrievalHints,
  })
  const turnIntent = resolveWriterTurnIntent({
    query: params.query,
    structuredIntent: structuredExtraction?.turnIntent,
  })
  if (turnIntent === "capability_question") {
    return {
      outcome: "needs_clarification",
      answer: buildWriterCapabilityAnswer({
        preferredLanguage,
        query: params.query,
        enterpriseEnabled: Boolean(params.enterpriseId),
      }),
      diagnostics: { ...createEmptyWriterDiagnostics("rewrite_only"), routing },
      brief: createEmptyWriterBrief(),
      routing,
      missingFields: [],
      turnCount,
      maxTurns: WRITER_BRIEF_MAX_TURNS,
      readyForGeneration: false,
      selectedSkill: {
        id: "writer-briefing",
        label: "Writer capability guidance",
        stage: "briefing",
      },
    }
  }
  const codeMissingFields = getWriterActionableMissingFields(mergedBrief, routing)
  const structuredMissingFields = structuredExtraction?.suggestedFollowUpFields?.filter((field) =>
    codeMissingFields.includes(field),
  )
  const actionableMissingFields =
    structuredMissingFields && structuredMissingFields.length > 0 ? structuredMissingFields : codeMissingFields

  if (!mergedBrief.tone && (turnCount >= WRITER_BRIEF_MAX_TURNS || actionableMissingFields.length === 0)) {
    const platformGuide = await runtime.getRuntimeGuide(routing)
    mergedBrief.tone = platformGuide.tone
  }

  const latestDraft = extractLatestWriterDraft(contextHistory)
  const inlineSourceText = extractInlineWriterSourceText(params.query)
  const rewriteSourceAvailable =
    (turnIntent === "rewrite" || retrievalStrategy === "rewrite_only") &&
    (Boolean(inlineSourceText) || Boolean(latestDraft))
  if (rewriteSourceAvailable) {
    if (!mergedBrief.topic) {
      mergedBrief.topic = detectTranslationIntentSafe(params.query)
        ? "Translate the supplied source text faithfully"
        : "Revise the supplied source text"
    }
    if (!mergedBrief.objective) {
      mergedBrief.objective = detectTranslationIntentSafe(params.query)
        ? "Deliver a faithful translation in the requested language"
        : "Transform the supplied source text according to the user's request"
    }
  }
  const modelApprovedBrief = Boolean(
    structuredExtraction?.briefSufficient &&
      structuredExtraction.confidence >= 0.6 &&
      mergedBrief.topic &&
      (mergedBrief.audience || mergedBrief.objective),
  )
  const richBriefSignal =
    rewriteSourceAvailable ||
    turnIntent === "direct_draft" ||
    safeIsWriterConfirmationReply(params.query) ||
    Boolean(structuredExtraction?.userWantsDirectOutput) ||
    modelApprovedBrief ||
    isRichFirstMessage({
      query: params.query,
      historyLength: recentHistory.length,
      brief: mergedBrief,
      routing,
    })

  const shouldClarify =
    (params.conversationStatus || "drafting") === "drafting" &&
    actionableMissingFields.length > 0 &&
    turnCount < WRITER_BRIEF_MAX_TURNS &&
    !richBriefSignal

  if (shouldClarify) {
    const chinese = isChineseConversation(params.query, preferredLanguage)
    const modelFollowUpQuestion = structuredExtraction?.suggestedFollowUpQuestion?.trim() || ""
    const answer = modelFollowUpQuestion
      ? modelFollowUpQuestion
      : safeBuildWriterFollowUpQuestion({
          brief: mergedBrief,
          missingFields: actionableMissingFields,
          turnCount,
          maxTurns: WRITER_BRIEF_MAX_TURNS,
          chinese,
        })

    return {
      outcome: "needs_clarification",
      answer,
      diagnostics: { ...createEmptyWriterDiagnostics(retrievalStrategy), routing },
      brief: mergedBrief,
      routing,
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

  const shouldConfirmBrief =
    (params.conversationStatus || "drafting") === "drafting" &&
    shouldPromptForWriterBriefConfirmation({
      query: params.query,
      recentHistoryLength: recentHistory.length,
      answeredFields: structuredExtraction?.answeredFields,
    }) &&
    actionableMissingFields.length === 0 &&
    !safeIsWriterConfirmationReply(params.query) &&
    turnIntent !== "direct_draft" &&
    !structuredExtraction?.userWantsDirectOutput

  if (shouldConfirmBrief) {
    const chinese = isChineseConversation(params.query, preferredLanguage)

    return {
      outcome: "needs_clarification",
      answer: buildWriterBriefConfirmationPrompt({
        brief: mergedBrief,
        routing,
        chinese,
      }),
      diagnostics: { ...createEmptyWriterDiagnostics(retrievalStrategy), routing },
      brief: mergedBrief,
      routing,
      missingFields: [],
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

  const compiledPrompt = buildWriterBriefPrompt(params.query, mergedBrief, routing, {
    history: contextHistory,
    latestDraft: (params.conversationStatus || "drafting") !== "drafting" ? latestDraft : null,
    sourceText: inlineSourceText || null,
    rewriteMode: retrievalStrategy === "rewrite_only" ? (detectTranslationIntentSafe(params.query) ? "translate" : "rewrite") : null,
  })
  const groundingQuery = clipWriterEnterpriseRetrievalQuery(
    buildWriterGroundingQuery(mergedBrief, params.query, contextHistory),
  )
  const sourceUrls = collectWriterSourceUrls({
    query: params.query,
    brief: mergedBrief,
    history: contextHistory,
  })
  const preferredEnterpriseScopes = getPreferredEnterpriseScopesSafe(params.query, mergedBrief, retrievalStrategy)
  const draftResult = await runtime.generateDraft(compiledPrompt, routing, preferredLanguage, {
    enterpriseId: params.enterpriseId,
    researchQuery: groundingQuery,
    retrievalStrategy,
    sourceUrls,
    enterpriseQueryVariants: normalizeWriterEnterpriseQueryVariants(
      buildRuntimeEnterpriseQueryVariants(groundingQuery, preferredEnterpriseScopes),
    ),
    preferredEnterpriseScopes,
  })
  const finalAnswer = enforceWriterHardLengthTarget(draftResult.answer, routing)

  return {
    outcome: "draft_ready",
    answer: finalAnswer,
    diagnostics: draftResult.diagnostics,
    brief: mergedBrief,
    routing,
    missingFields: getWriterBriefMissingFields(mergedBrief),
    turnCount,
    maxTurns: WRITER_BRIEF_MAX_TURNS,
    readyForGeneration: true,
    selectedSkill: {
      id: "writer-platform-generation",
      label: routing.selectedSkillLabel,
      stage: "execution",
    },
  }
}

export async function runWriterSkillsTurn(params: {
  query: string
  preloadedBrief?: WriterPreloadedBrief | null
  platform: WriterPlatform
  mode: WriterMode
  preferredLanguage?: WriterLanguage
  history?: WriterHistoryEntry[]
  conversationStatus?: WriterConversationStatus
  enterpriseId?: number | null
}): Promise<WriterSkillsTurnResult> {
  return runWriterSkillsTurnWithRuntime(params, defaultWriterSkillsRuntime)
}

export const __writerTestHooks = {
  normalizeReadableWebContent,
  buildResearchContext,
}
