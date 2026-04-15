import { readFile } from "node:fs/promises"
import path from "node:path"

import { loadEnterpriseKnowledgeContext, type EnterpriseKnowledgeContext } from "@/lib/dify/enterprise-knowledge"
import { generateTextWithWriterModel } from "@/lib/writer/aiberm"
import type { LeadHunterEvidenceItem } from "@/lib/lead-hunter/evidence-types"
import { getLeadHunterAgentName, type LeadHunterAdvisorType } from "@/lib/lead-hunter/types"
import {
  hasAnyWebSearchProviderConfig,
  searchWithSerperWeb,
  searchWithTavilyWeb,
} from "@/lib/skills/tools/web-search"

const LEAD_HUNTER_SKILL_MODEL =
  process.env.LEAD_HUNTER_SKILL_MODEL ||
  process.env.WRITER_TEXT_MODEL ||
  process.env.WRITER_SKILL_MODEL ||
  "google/gemini-3-flash"

const DEFAULT_MAX_SEARCH_QUERIES_COMPANY = 6
const DEFAULT_MAX_SEARCH_QUERIES_CONTACT = 5
const MAX_SEARCH_QUERY_LIMIT = 12
const SEARCH_QUERY_CONCURRENCY = 3
const SEARCH_EARLY_STOP_SIGNALS = 14
const SEARCH_RESULT_CACHE_TTL_MS = 120_000
const SERPER_RESULT_NUM = 4
const TAVILY_RESULT_NUM = 4
const MAX_ENTERPRISE_KNOWLEDGE_QUERY_VARIANTS = 3
const MAX_EVIDENCE_ITEMS = 24
const MAX_ENTERPRISE_SNIPPETS = 8
const DEFAULT_REPORT_PROMPT_EVIDENCE_LIMIT = 12
const DEFAULT_REPORT_ENTERPRISE_SNIPPET_LIMIT = 4
const DEFAULT_REPORT_MAX_TOKENS = 1600
const DEFAULT_REPORT_TIMEOUT_MS = 60_000
const DEFAULT_REPORT_PROVIDER_TIMEOUT_MS = 35_000
const DEFAULT_VBUY_FIT_LAYER_CHARS = 6_000
const MAX_VBUY_FIT_LAYER_CHARS = 14_000
const REPORT_TIMEOUT_MS = 120_000

export type LeadHunterSkillEventPayload = {
  event: string
  conversation_id?: string
  answer?: string
  agent_name?: string
  metadata?: {
    agent_name?: string
  }
  data?: Record<string, unknown>
  error?: string
}

export type LeadHunterSkillRunResult = {
  answer: string
  evidence: LeadHunterEvidenceItem[]
  language: "zh" | "en"
  vbuyMode: boolean
}

export type LeadHunterSkillRunInput = {
  advisorType: LeadHunterAdvisorType
  query: string
  conversationId?: string | null
  enterpriseId?: number | null
  enterpriseCode?: string | null
  memoryContext?: string | null
  soulCard?: string | null
  signal?: AbortSignal
  onSseEvent?: (payload: LeadHunterSkillEventPayload) => void | Promise<void>
}

type SearchHit = {
  title: string
  url: string
  snippet: string
  provider: "tavily" | "serper"
}

type SearchCacheEntry = {
  expiresAt: number
  hits: SearchHit[]
}

const SEARCH_QUERY_CACHE = new Map<string, SearchCacheEntry>()

function sanitizeAssistantContent(raw: string) {
  return raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim()
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function parseEnvInt(name: string, fallback: number, range: { min: number; max: number }) {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(range.max, Math.max(range.min, parsed))
}

function resolveMaxSearchQueries(advisorType: LeadHunterAdvisorType) {
  const fallback =
    advisorType === "contact-mining" ? DEFAULT_MAX_SEARCH_QUERIES_CONTACT : DEFAULT_MAX_SEARCH_QUERIES_COMPANY
  return parseEnvInt("LEAD_HUNTER_MAX_SEARCH_QUERIES", fallback, { min: 1, max: MAX_SEARCH_QUERY_LIMIT })
}

function resolveSearchConcurrency(queryCount: number) {
  return Math.min(
    queryCount,
    parseEnvInt("LEAD_HUNTER_SEARCH_QUERY_CONCURRENCY", SEARCH_QUERY_CONCURRENCY, { min: 1, max: 6 }),
  )
}

function resolveSearchEarlyStopSignals() {
  return parseEnvInt("LEAD_HUNTER_SEARCH_EARLY_STOP_SIGNALS", SEARCH_EARLY_STOP_SIGNALS, { min: 4, max: 48 })
}

function resolveSearchCacheTtlMs() {
  return parseEnvInt("LEAD_HUNTER_SEARCH_CACHE_TTL_MS", SEARCH_RESULT_CACHE_TTL_MS, {
    min: 0,
    max: 10 * 60_000,
  })
}

function resolveSerperResultNum() {
  return parseEnvInt("LEAD_HUNTER_SERPER_RESULT_NUM", SERPER_RESULT_NUM, { min: 2, max: 10 })
}

function resolveTavilyResultNum() {
  return parseEnvInt("LEAD_HUNTER_TAVILY_RESULT_NUM", TAVILY_RESULT_NUM, { min: 2, max: 10 })
}

function resolveEnterpriseKnowledgeQueryVariantLimit() {
  return parseEnvInt("LEAD_HUNTER_ENTERPRISE_QUERY_VARIANTS", MAX_ENTERPRISE_KNOWLEDGE_QUERY_VARIANTS, {
    min: 1,
    max: 4,
  })
}

function resolveReportPromptEvidenceLimit() {
  return parseEnvInt("LEAD_HUNTER_REPORT_PROMPT_EVIDENCE_LIMIT", DEFAULT_REPORT_PROMPT_EVIDENCE_LIMIT, {
    min: 6,
    max: MAX_EVIDENCE_ITEMS,
  })
}

function resolveReportEnterpriseSnippetLimit() {
  return parseEnvInt("LEAD_HUNTER_REPORT_ENTERPRISE_SNIPPETS", DEFAULT_REPORT_ENTERPRISE_SNIPPET_LIMIT, {
    min: 2,
    max: MAX_ENTERPRISE_SNIPPETS,
  })
}

function resolveReportMaxTokens() {
  return parseEnvInt("LEAD_HUNTER_REPORT_MAX_TOKENS", DEFAULT_REPORT_MAX_TOKENS, {
    min: 800,
    max: 3200,
  })
}

function resolveReportTimeoutMs() {
  return parseEnvInt("LEAD_HUNTER_REPORT_TIMEOUT_MS", DEFAULT_REPORT_TIMEOUT_MS, {
    min: 30_000,
    max: REPORT_TIMEOUT_MS,
  })
}

function resolveReportProviderTimeoutMs() {
  return parseEnvInt("LEAD_HUNTER_REPORT_PROVIDER_TIMEOUT_MS", DEFAULT_REPORT_PROVIDER_TIMEOUT_MS, {
    min: 20_000,
    max: 120_000,
  })
}

function resolveVbuyFitLayerChars() {
  return parseEnvInt("LEAD_HUNTER_VBUY_FIT_LAYER_CHARS", DEFAULT_VBUY_FIT_LAYER_CHARS, {
    min: 0,
    max: MAX_VBUY_FIT_LAYER_CHARS,
  })
}

function isLikelyChinese(text: string) {
  return /[\u4e00-\u9fa5]/.test(text)
}

function detectLanguage(text: string): "zh" | "en" {
  return isLikelyChinese(text) ? "zh" : "en"
}

function toSseWireChunk(payload: LeadHunterSkillEventPayload) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function pickCompanyName(query: string) {
  const normalized = normalizeWhitespace(query)
  if (!normalized) return ""

  const explicit =
    normalized.match(/(?:company[_\s-]*name|company)\s*[:=]\s*([^;,\n]+)/i) ||
    normalized.match(/��˾����\s*[:��]\s*([^;,\n]+)/)
  if (explicit?.[1]) return explicit[1].trim().slice(0, 120)

  return normalized.slice(0, 120)
}

function pickWebsiteUrl(query: string) {
  const normalized = normalizeWhitespace(query)
  const explicit =
    normalized.match(/(?:website|domain|url)\s*[:=]\s*([^;,\n]+)/i) ||
    normalized.match(/����\s*[:��]\s*([^;,\n]+)/)
  const candidate = explicit?.[1] || ""
  if (!candidate.trim()) return ""
  if (/^https?:\/\//i.test(candidate)) return candidate.trim()
  return `https://${candidate.trim()}`
}

function shouldEnableVbuyMode(query: string) {
  const text = query.toLowerCase()
  return (
    text.includes("vbuy") ||
    query.includes("����") ||
    query.includes("����������ʵҵ���޹�˾") ||
    query.includes("Jiangsu Vbuy Textile Group") ||
    query.includes("our company knowledge base")
  )
}

function normalizeEnterpriseCode(value: string | null | undefined) {
  return (value || "").trim().toLowerCase()
}

function matchesVbuyEnterpriseById(enterpriseId: number | null | undefined) {
  if (typeof enterpriseId !== "number" || !Number.isFinite(enterpriseId) || enterpriseId <= 0) return false
  const expectedId = Number.parseInt(process.env.VBUY_ENTERPRISE_ID || "", 10)
  return Number.isFinite(expectedId) && expectedId > 0 ? enterpriseId === expectedId : false
}

function shouldEnableVbuyModeFromContext(input: {
  query: string
  enterpriseCode?: string | null
  enterpriseId?: number | null
}) {
  const enterpriseCode = normalizeEnterpriseCode(input.enterpriseCode)
  if (enterpriseCode === "vbuy" || enterpriseCode.includes("vbuy")) {
    return true
  }
  if (matchesVbuyEnterpriseById(input.enterpriseId)) {
    return true
  }
  return shouldEnableVbuyMode(input.query)
}

async function loadVbuyFitLayer() {
  const filePath = path.join(process.cwd(), "content", "skills", "customer-intelligence-risk", "references", "vbuy-fit-layer.md")
  try {
    const text = await readFile(filePath, "utf8")
    return text.slice(0, resolveVbuyFitLayerChars())
  } catch {
    return ""
  }
}

function dedupeHits(hits: SearchHit[]) {
  const seen = new Set<string>()
  const output: SearchHit[] = []
  for (const hit of hits) {
    const key = hit.url.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(hit)
  }
  return output
}

function buildSearchQueries(input: { advisorType: LeadHunterAdvisorType; query: string; companyName: string; website: string }) {
  const root = input.companyName || input.query
  const queries: string[] = []

  const push = (value: string) => {
    const trimmed = normalizeWhitespace(value)
    if (!trimmed) return
    if (queries.includes(trimmed)) return
    queries.push(trimmed)
  }

  push(`${root} official website profile`)
  push(`${root} market positioning customers`)
  push(`${root} products pricing`)

  if (input.advisorType === "contact-mining") {
    push(`${root} linkedin leadership team`)
    push(`${root} contact email sales procurement`)
    push(`${root} founder ceo cmo`)
  } else {
    push(`${root} customer reviews complaints lawsuit`)
    push(`${root} headquarters employees linkedin`)
    push(`${root} partnership distributor`)
  }

  if (input.website) {
    push(`site:${input.website.replace(/^https?:\/\//i, "")} ${root}`)
  }

  return queries.slice(0, resolveMaxSearchQueries(input.advisorType))
}

function classifySourceType(url: string) {
  const normalized = url.toLowerCase()
  if (/linkedin\.com|wikipedia\.org|crunchbase\.com/.test(normalized)) return "directory"
  if (/trustpilot|reddit|bbb\.org/.test(normalized)) return "review_site"
  if (/gov|court|sec\.|regulator/.test(normalized)) return "regulatory"
  if (/news|press|media/.test(normalized)) return "media"
  return "web"
}

function toEvidenceItem(hit: SearchHit): LeadHunterEvidenceItem {
  const confidence = hit.provider === "tavily" ? "high" : hit.snippet ? "medium" : "low"
  return {
    claim: hit.snippet || `Signal from ${hit.title || hit.url}`,
    source_title: hit.title || hit.url,
    source_url: hit.url,
    source_type: classifySourceType(hit.url),
    source_provider: hit.provider,
    extracted_by: hit.provider === "tavily" ? "tavily" : "not_extracted",
    confidence,
  }
}

function toEvidenceSummary(evidence: LeadHunterEvidenceItem[], limit = MAX_EVIDENCE_ITEMS) {
  return evidence
    .slice(0, limit)
    .map((item, index) => {
      const claim = item.claim.slice(0, 240)
      return `${index + 1}. [${item.source_provider}/${item.confidence}] ${item.source_title} | ${item.source_url}\n   claim: ${claim}`
    })
    .join("\n")
}

function buildEnterpriseKnowledgeQueryVariants(query: string, companyName: string) {
  const variants = [query]
  if (companyName) {
    variants.push(`${companyName} company profile`)
    variants.push(`${companyName} customer profile`)
    variants.push(`${companyName} products and market positioning`)
  }
  return [...new Set(variants.map((item) => normalizeWhitespace(item)).filter(Boolean))].slice(
    0,
    resolveEnterpriseKnowledgeQueryVariantLimit(),
  )
}

function buildLeadHunterKnowledgeScopes(advisorType: LeadHunterAdvisorType) {
  if (advisorType === "contact-mining") {
    return ["general", "brand", "case-study"] as const
  }
  return ["general", "brand", "product", "case-study"] as const
}

function toEnterpriseKnowledgeEvidence(context: EnterpriseKnowledgeContext | null) {
  if (!context?.snippets?.length) return [] as LeadHunterEvidenceItem[]
  return context.snippets.slice(0, MAX_ENTERPRISE_SNIPPETS).map((snippet) => ({
    claim: snippet.content,
    source_title: `${snippet.datasetName} - ${snippet.title}`,
    source_url: `dify-dataset://${snippet.datasetId}`,
    source_type: "enterprise_kb",
    source_provider: "other" as const,
    extracted_by: "not_extracted" as const,
    confidence: "high" as const,
  }))
}

function buildEnterpriseKnowledgeSummary(context: EnterpriseKnowledgeContext | null, limit = MAX_ENTERPRISE_SNIPPETS) {
  if (!context?.snippets?.length) return ""
  return context.snippets
    .slice(0, limit)
    .map((snippet, index) => {
      const content = normalizeWhitespace(snippet.content).slice(0, 220)
      return `${index + 1}. [${snippet.datasetName} / ${snippet.scope}] ${snippet.title}\n   ${content}`
    })
    .join("\n")
}

function toPromptEvidenceMatrix(evidence: LeadHunterEvidenceItem[], limit: number) {
  return evidence.slice(0, limit).map((item) => ({
    claim: item.claim.slice(0, 220),
    source_title: item.source_title,
    source_url: item.source_url,
    source_type: item.source_type,
    confidence: item.confidence,
  }))
}

function makeSearchCacheKey(query: string) {
  return normalizeWhitespace(query).toLowerCase()
}

function getCachedSearchHits(query: string) {
  const ttlMs = resolveSearchCacheTtlMs()
  if (ttlMs <= 0) return null
  const entry = SEARCH_QUERY_CACHE.get(makeSearchCacheKey(query))
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    SEARCH_QUERY_CACHE.delete(makeSearchCacheKey(query))
    return null
  }
  return [...entry.hits]
}

function setCachedSearchHits(query: string, hits: SearchHit[]) {
  const ttlMs = resolveSearchCacheTtlMs()
  if (ttlMs <= 0 || hits.length === 0) return
  SEARCH_QUERY_CACHE.set(makeSearchCacheKey(query), {
    hits: [...hits],
    expiresAt: Date.now() + ttlMs,
  })
}

async function runWebSearchForQuery(query: string, signal?: AbortSignal) {
  const cached = getCachedSearchHits(query)
  if (cached) return cached

  const [serperHits, tavilyHits] = await Promise.all([
    searchWithSerperWeb(query, { signal, num: resolveSerperResultNum() }).catch(() => [] as SearchHit[]),
    searchWithTavilyWeb(query, {
      signal,
      maxResults: resolveTavilyResultNum(),
      searchDepth: "basic",
      includeAnswer: false,
      includeRawContent: false,
    }).catch(() => [] as SearchHit[]),
  ])

  const merged = [...serperHits, ...tavilyHits]
  setCachedSearchHits(query, merged)
  return merged
}

async function collectSearchHits(input: { queries: string[]; signal?: AbortSignal }) {
  const concurrency = resolveSearchConcurrency(input.queries.length)
  const earlyStopSignals = resolveSearchEarlyStopSignals()
  const hits: SearchHit[] = []
  const seenUrls = new Set<string>()
  let uniqueSignals = 0
  let nextIndex = 0
  let stop = false

  const worker = async () => {
    while (true) {
      if (input.signal?.aborted) throw new Error("lead_hunter_skill_aborted")
      if (stop) return
      const currentIndex = nextIndex
      if (currentIndex >= input.queries.length) return
      nextIndex += 1

      const query = input.queries[currentIndex]
      const batch = await runWebSearchForQuery(query, input.signal)
      if (!batch.length) continue

      hits.push(...batch)
      for (const item of batch) {
        const url = item.url.toLowerCase()
        if (seenUrls.has(url)) continue
        seenUrls.add(url)
        uniqueSignals += 1
      }
      if (uniqueSignals >= earlyStopSignals) {
        stop = true
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()))
  return dedupeHits(hits)
}

function buildFallbackBrief(input: {
  companyName: string
  query: string
  advisorType: LeadHunterAdvisorType
  evidence: LeadHunterEvidenceItem[]
  language: "zh" | "en"
  vbuyMode: boolean
}) {
  const topEvidence = input.evidence.slice(0, 6)
  const risk = topEvidence.some((item) => /complaint|lawsuit|dispute|refund|negative|risk/i.test(item.claim))
    ? "��"
    : topEvidence.length >= 3
      ? "��"
      : "֤�ݲ���"

  if (input.language === "en") {
    const company = input.companyName || "Target Company"
    return `# ${company} Customer Profile and Cooperation Risk Brief\n\n## 1. Company Overview\n- Target: ${company}\n- Current request: ${input.query}\n- Public coverage: ${topEvidence.length > 0 ? "available" : "limited"}\n\n## 2. Business and Market Positioning\n- Preliminary positioning inferred from search signals.\n- Recommend validation against official site and recent announcements.\n\n## 3. Product and Price Range\n- Public product and pricing detail extraction is limited in this run.\n- Suggest follow-up extraction on official catalog pages.\n\n## 4. Target Customer Profile\n- Likely serves customers reflected in current public mentions.\n- Need first-party validation before qualification.\n\n## 5. Buying and Cooperation Chain\n- Decision chain cannot be fully confirmed from public snippets.\n- Prioritize role mapping in first outreach round.\n\n## 6. Sentiment and Commercial Fulfillment Risk\n- Overall risk: ${risk}\n- Payment risk: pending validation\n- Delivery risk: pending validation\n- Service risk: pending validation\n- Contract entity risk: pending validation\n- Channel stability risk: pending validation\n\n## 7. ${input.vbuyMode ? "VBUY Cooperation Entry" : "Cooperation Entry"}\n- Start with low-commitment discovery call and qualification checklist.\n\n## 8. First Outreach Suggestions\n- Confirm procurement owner, timeline, and quality/compliance requirements.\n- Bring concrete samples, MOQ, lead-time, and fulfillment evidence.`
  }

  const company = input.companyName || "Ŀ�깫˾"
  return `# ${company} �ͻ�������������ռ�\n\n## 1. ��˾����\n- Ŀ�깫˾��${company}\n- ��ǰ����${input.query}\n- ������Ϣ���ǣ�${topEvidence.length > 0 ? "��һ������" : "��������"}\n\n## 2. ҵ�����г���λ\n- ���ڹ����źų����ж���ҵ��λ��\n- �������״ι�ͨ�в������������ҵ�񹫸���֤��\n\n## 3. ��Ʒ��۸�����\n- ���ֹ�����Ϣ�п�ֱ����ȡ�ļ۸���Ϣ���ޡ�\n- ���������Թ�����Ʒҳ�����򲹳���ȡ��\n\n## 4. Ŀ��ͻ�����\n- ��ǰ�ɼ��ź���ʾ��ͻ����������һ��ϸ��ȷ�ϡ�\n- ���鰴��ҵ���������ɹ��������ж��λ���\n\n## 5. �ɹ������������\n- ��������ɫ��δ��ȫ��ȷ��\n- ���ֽ�Ǣ���������ɹ�/��Ӫ/������ظ����ˡ�\n\n## 6. ��������ҵ��Լ����\n- �ܷ��յȼ���${risk}\n- ������գ�����֤\n- �������գ�����֤\n- �ۺ�/�ͷ����գ�����֤\n- ǩԼ������գ�����֤\n- ����/�����ȶ��Է��գ�����֤\n\n## 7. ${input.vbuyMode ? "VBUY ���������" : "���������"}\n- �����Եͳ�ŵ�ɱ���̽���Թ�ͨ���룬����֤ƥ��ȡ�\n\n## 8. �״ν�Ǣ����\n- �״ι�ͨ�۽��ɹ�ʱ�䡢������׼�����ڡ�������Ϲ�Ҫ��\n- ��ǰ׼����Ʒ�����������������ȶ�����֤����`
}

async function emitEvent(input: {
  onSseEvent?: (payload: LeadHunterSkillEventPayload) => void | Promise<void>
  payload: LeadHunterSkillEventPayload
}) {
  if (!input.onSseEvent) return
  await input.onSseEvent(input.payload)
}

async function generateReportWithModel(input: {
  advisorType: LeadHunterAdvisorType
  language: "zh" | "en"
  query: string
  companyName: string
  website: string
  evidence: LeadHunterEvidenceItem[]
  enterpriseKnowledge: EnterpriseKnowledgeContext | null
  vbuyMode: boolean
  vbuyFitLayer: string
  memoryContext?: string | null
  soulCard?: string | null
  signal?: AbortSignal
}) {
  const promptEvidenceLimit = resolveReportPromptEvidenceLimit()
  const enterpriseSnippetLimit = resolveReportEnterpriseSnippetLimit()
  const reportMaxTokens = resolveReportMaxTokens()
  const reportTimeoutMs = resolveReportTimeoutMs()
  const reportProviderTimeoutMs = resolveReportProviderTimeoutMs()
  const section7Title = input.vbuyMode ? "VBUY Cooperation Entry" : "Cooperation Entry"
  const systemPrompt = `You are a commercial due-diligence advisor.
Produce a concise, practical BD brief in ${input.language === "zh" ? "Chinese" : "English"}.
Requirements:
1) Exactly 8 sections with fixed headings.
2) Do not expose tool/provider implementation details.
3) Use uncertainty wording when evidence is thin.
4) Risk means commercial fulfillment risk, not legal conclusion.
5) Section 7 title must be "${section7Title}".`

  const userPrompt = [
    `advisor_type: ${input.advisorType}`
    ,`company_name: ${input.companyName || ""}`
    ,`website_url: ${input.website || ""}`
    ,`user_query: ${input.query}`
    ,input.memoryContext ? `memory_context: ${input.memoryContext}` : ""
    ,input.soulCard ? `soul_card: ${input.soulCard}` : ""
    ,input.vbuyMode ? "vbuy_mode: true" : "vbuy_mode: false"
    ,input.vbuyMode && input.vbuyFitLayer
      ? `vbuy_fit_reference (internal, summarize only relevant lines):\n${input.vbuyFitLayer}`
      : ""
    ,input.enterpriseKnowledge
      ? `enterprise_knowledge_summary:\n${buildEnterpriseKnowledgeSummary(input.enterpriseKnowledge, enterpriseSnippetLimit)}`
      : ""
    ,`evidence_summary:\n${toEvidenceSummary(input.evidence, promptEvidenceLimit)}`
    ,`evidence_matrix_json_compact:\n${JSON.stringify(toPromptEvidenceMatrix(input.evidence, promptEvidenceLimit))}`
  ]
    .filter(Boolean)
    .join("\n\n")

  const answer = await generateTextWithWriterModel(systemPrompt, userPrompt, LEAD_HUNTER_SKILL_MODEL, {
    temperature: 0.2,
    maxTokens: reportMaxTokens,
    timeoutMs: reportTimeoutMs,
    totalTimeoutMs: REPORT_TIMEOUT_MS,
    providerTimeoutMs: reportProviderTimeoutMs,
    signal: input.signal,
  })

  return sanitizeAssistantContent(answer)
}
export async function runLeadHunterSkillConversation(input: LeadHunterSkillRunInput): Promise<LeadHunterSkillRunResult> {
  const language = detectLanguage(input.query)
  const companyName = pickCompanyName(input.query)
  const website = pickWebsiteUrl(input.query)
  const vbuyMode = shouldEnableVbuyModeFromContext({
    query: input.query,
    enterpriseCode: input.enterpriseCode,
    enterpriseId: input.enterpriseId,
  })

  const emit = async (payload: LeadHunterSkillEventPayload) => {
    const agentName = getLeadHunterAgentName(input.advisorType)
    const enriched: LeadHunterSkillEventPayload = {
      ...payload,
      conversation_id: input.conversationId || payload.conversation_id,
      agent_name: payload.agent_name || agentName,
      metadata: payload.metadata || { agent_name: agentName },
    }
    await emitEvent({ onSseEvent: input.onSseEvent, payload: enriched })
  }

  await emit({ event: "workflow_started", data: { status: "running" } })

  await emit({ event: "node_started", data: { node_name: "query_planning" } })
  const searchQueries = buildSearchQueries({
    advisorType: input.advisorType,
    query: input.query,
    companyName,
    website,
  })
  await emit({ event: "node_finished", data: { node_name: "query_planning", status: "succeeded", count: searchQueries.length } })

  const shouldLoadEnterpriseKnowledge =
    vbuyMode && typeof input.enterpriseId === "number" && Number.isFinite(input.enterpriseId) && input.enterpriseId > 0
  const enterpriseKnowledgePromise: Promise<EnterpriseKnowledgeContext | null> = shouldLoadEnterpriseKnowledge
    ? (async () => {
        await emit({ event: "node_started", data: { node_name: "enterprise_knowledge_retrieval" } })
        try {
          const context = await loadEnterpriseKnowledgeContext({
            enterpriseId: input.enterpriseId as number,
            query: input.query,
            queryVariants: buildEnterpriseKnowledgeQueryVariants(input.query, companyName),
            preferredScopes: [...buildLeadHunterKnowledgeScopes(input.advisorType)],
            platform: "generic",
            mode: "article",
          })
          await emit({
            event: "node_finished",
            data: {
              node_name: "enterprise_knowledge_retrieval",
              status: context?.snippets?.length ? "succeeded" : "completed",
              snippets: context?.snippets?.length || 0,
              datasets: context?.datasetsUsed?.length || 0,
            },
          })
          return context
        } catch (error) {
          await emit({
            event: "node_finished",
            data: {
              node_name: "enterprise_knowledge_retrieval",
              status: "failed",
              message: error instanceof Error ? error.message : String(error),
            },
          })
          console.warn("lead_hunter.skill.enterprise_knowledge_failed", {
            advisorType: input.advisorType,
            enterpriseId: input.enterpriseId,
            enterpriseCode: input.enterpriseCode || null,
            message: error instanceof Error ? error.message : String(error),
          })
          return null
        }
      })()
    : Promise.resolve(null)

  const hits: SearchHit[] = []
  await emit({ event: "node_started", data: { node_name: "search_collect" } })
  if (!hasAnyWebSearchProviderConfig()) {
    await emit({
      event: "info",
      data: {
        node_name: "search_collect",
        status: "degraded",
        message: "web_search_provider_missing",
      },
    })
  }
  hits.push(...(await collectSearchHits({ queries: searchQueries, signal: input.signal })))
  const dedupedHits = dedupeHits(hits)
  await emit({
    event: "node_finished",
    data: {
      node_name: "search_collect",
      status: dedupedHits.length > 0 ? "succeeded" : "failed",
      signals: dedupedHits.length,
    },
  })

  const enterpriseKnowledge = await enterpriseKnowledgePromise

  const webEvidence = dedupedHits.map(toEvidenceItem)
  const enterpriseEvidence = toEnterpriseKnowledgeEvidence(enterpriseKnowledge)
  const evidence = [...enterpriseEvidence, ...webEvidence].slice(0, MAX_EVIDENCE_ITEMS)

  await emit({ event: "node_started", data: { node_name: "report_synthesis" } })
  const vbuyFitLayer = vbuyMode ? await loadVbuyFitLayer() : ""

  let answer: string
  try {
    answer = await generateReportWithModel({
      advisorType: input.advisorType,
      language,
      query: input.query,
      companyName,
      website,
      evidence,
      enterpriseKnowledge,
      vbuyMode,
      vbuyFitLayer,
      memoryContext: input.memoryContext,
      soulCard: input.soulCard,
      signal: input.signal,
    })
  } catch (error) {
    console.warn("lead_hunter.skill.model_fallback", {
      message: error instanceof Error ? error.message : String(error),
      advisorType: input.advisorType,
    })
    answer = buildFallbackBrief({
      companyName,
      query: input.query,
      advisorType: input.advisorType,
      evidence,
      language,
      vbuyMode,
    })
  }

  answer = sanitizeAssistantContent(answer)
  await emit({ event: "node_finished", data: { node_name: "report_synthesis", status: "succeeded" } })

  if (answer) {
    await emit({ event: "text_chunk", data: { text: answer }, answer })
  }

  await emit({ event: "message_end", data: { status: "completed" } })
  await emit({
    event: "workflow_finished",
    data: {
      status: "succeeded",
      outputs: answer,
      evidence_count: evidence.length,
      language,
      vbuy_mode: vbuyMode,
    },
  })

  return {
    answer,
    evidence,
    language,
    vbuyMode,
  }
}

export function createLeadHunterSkillSseStream(input: LeadHunterSkillRunInput) {
  const encoder = new TextEncoder()
  let resolveDone: (value: LeadHunterSkillRunResult) => void = () => undefined
  let rejectDone: (reason?: unknown) => void = () => undefined

  const done = new Promise<LeadHunterSkillRunResult>((resolve, reject) => {
    resolveDone = resolve
    rejectDone = reject
  })

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void runLeadHunterSkillConversation({
        ...input,
        onSseEvent: async (payload) => {
          controller.enqueue(encoder.encode(toSseWireChunk(payload)))
          await input.onSseEvent?.(payload)
        },
      })
        .then((result) => {
          controller.close()
          resolveDone(result)
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          controller.enqueue(
            encoder.encode(
              toSseWireChunk({
                event: "error",
                conversation_id: input.conversationId || undefined,
                data: { error: message },
                error: message,
              }),
            ),
          )
          controller.close()
          rejectDone(error)
        })
    },
  })

  return { stream, done }
}





