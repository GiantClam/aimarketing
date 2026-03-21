import { asc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { enterpriseDifyBindings, enterpriseDifyDatasets } from "@/lib/db/schema"
import { writerRequestJson } from "@/lib/writer/network"
import type { WriterMode, WriterPlatform } from "@/lib/writer/config"

export type EnterpriseKnowledgeScope = "general" | "brand" | "product" | "case-study" | "compliance" | "campaign"

export type EnterpriseDifyDatasetInput = {
  datasetId: string
  datasetName: string
  scope: EnterpriseKnowledgeScope
  priority: number
  enabled: boolean
}

export type EnterpriseDifyBindingRecord = {
  id: number
  enterpriseId: number
  baseUrl: string
  apiKey: string
  enabled: boolean
  datasets: Array<
    EnterpriseDifyDatasetInput & {
      id: number
      bindingId: number
    }
  >
}

export type EnterpriseKnowledgeSnippet = {
  datasetId: string
  datasetName: string
  scope: EnterpriseKnowledgeScope
  inferredScope?: EnterpriseKnowledgeScope
  score: number | null
  title: string
  content: string
}

export type EnterpriseKnowledgeContext = {
  source: "dify"
  datasetsUsed: Array<{ datasetId: string; datasetName: string; scope: EnterpriseKnowledgeScope }>
  snippets: EnterpriseKnowledgeSnippet[]
}

export type EnterpriseKnowledgeProfile = {
  configuredScopes: EnterpriseKnowledgeScope[]
  datasetScopeCounts: Partial<Record<EnterpriseKnowledgeScope, number>>
  primaryScope: EnterpriseKnowledgeScope | "mixed" | "unknown"
  hasGeneralDataset: boolean
}

export type EnterpriseKnowledgeCoverageTag =
  | "company-facts"
  | "product-system"
  | "application-scenarios"
  | "technical-proof"
  | "delivery-service"
  | "brand-proof"
  | "faq"

export type RemoteEnterpriseDifyDatasetRecord = {
  id: string
  name: string
  description: string
  suggestedScope: EnterpriseKnowledgeScope
  coverageTags: EnterpriseKnowledgeCoverageTag[]
  documentCount: number
  sampleDocuments: string[]
}

const DEFAULT_RETRIEVAL_TOP_K = 3
const DEFAULT_RETRIEVAL_SCORE_THRESHOLD = 0.35
const DEFAULT_FALLBACK_RETRIEVAL_TOP_K = 5
const DEFAULT_MAX_QUERY_VARIANTS = 4
const DIFY_RETRIEVAL_QUERY_MAX_CHARS = Math.min(
  250,
  Math.max(120, Number.parseInt(process.env.DIFY_RETRIEVAL_QUERY_MAX_CHARS || "240", 10) || 240),
)
const WRITER_ENTERPRISE_KNOWLEDGE_CACHE_TTL_MS = Math.max(
  0,
  Number.parseInt(process.env.WRITER_ENTERPRISE_KNOWLEDGE_CACHE_TTL_MS || "300000", 10) || 300_000,
)
const WRITER_ENTERPRISE_KNOWLEDGE_STATUS_CACHE_TTL_MS = Math.max(
  0,
  Number.parseInt(process.env.WRITER_ENTERPRISE_KNOWLEDGE_STATUS_CACHE_TTL_MS || "60000", 10) || 60_000,
)

const enterpriseKnowledgeCache = new Map<string, { expiresAt: number; value: Promise<EnterpriseKnowledgeContext | null> }>()
const enterpriseKnowledgeStatusCache = new Map<
  string,
  {
    expiresAt: number
    value: Promise<{ enabled: boolean; datasetCount: number; source?: "dify"; profile?: EnterpriseKnowledgeProfile }>
  }
>()

const FIXTURE_DATASETS: Array<{ id: string; name: string; description: string }> = [
  { id: "fixture-brand", name: "品牌手册", description: "品牌定位、品牌语调、禁止表述" },
  { id: "fixture-product", name: "产品资料", description: "产品介绍、适用场景、核心卖点" },
  { id: "fixture-case", name: "案例资料", description: "案例数据、客户成果、落地经验" },
]

const FIXTURE_SNIPPETS: Record<string, Omit<EnterpriseKnowledgeSnippet, "datasetId" | "datasetName" | "scope">> = {
  "fixture-brand": {
    score: 0.92,
    title: "品牌语调",
    content: "品牌语调：专业、克制、结果导向，避免浮夸承诺，强调可验证的业务改进。",
  },
  "fixture-product": {
    score: 0.9,
    title: "核心产品",
    content: "核心产品：AI 外呼与线索转化自动化平台，适用于线索筛选、意向分级和销售跟进提效。",
  },
  "fixture-case": {
    score: 0.88,
    title: "代表案例",
    content: "代表案例：某 B2B SaaS 团队通过自动化线索筛选将销售线索成本降低 32%，提升销售跟进效率。",
  },
}

function shouldUseWriterE2EFixtures() {
  return process.env.WRITER_E2E_FIXTURES === "true"
}

function normalizeDifyApiBase(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "")
  if (!trimmed) {
    return ""
  }

  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`
}

function getDifyHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey.trim()}`,
    "Content-Type": "application/json",
  }
}

function normalizeSnippetContent(content: string) {
  const compact = content.replace(/\s+/g, " ").trim()
  return compact.length > 700 ? `${compact.slice(0, 700)}...` : compact
}

function normalizeScope(value: unknown): EnterpriseKnowledgeScope {
  if (
    value === "general" ||
    value === "product" ||
    value === "case-study" ||
    value === "compliance" ||
    value === "campaign"
  ) {
    return value
  }
  return "brand"
}

function normalizeCoverageTags(value: unknown): EnterpriseKnowledgeCoverageTag[] {
  const values = Array.isArray(value) ? value : []
  return [...new Set(values)]
    .filter((item): item is EnterpriseKnowledgeCoverageTag =>
      item === "company-facts" ||
      item === "product-system" ||
      item === "application-scenarios" ||
      item === "technical-proof" ||
      item === "delivery-service" ||
      item === "brand-proof" ||
      item === "faq",
    )
}

function normalizePriority(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 100
  return Math.min(Math.max(Math.round(parsed), 1), 999)
}

function buildEnterpriseKnowledgeProfile(
  datasets: Array<Pick<EnterpriseDifyBindingRecord["datasets"][number], "scope" | "enabled">>,
): EnterpriseKnowledgeProfile {
  const enabledDatasets = datasets.filter((dataset) => dataset.enabled)
  if (enabledDatasets.length === 0) {
    return {
      configuredScopes: [],
      datasetScopeCounts: {},
      primaryScope: "unknown",
      hasGeneralDataset: false,
    }
  }

  const datasetScopeCounts = enabledDatasets.reduce<Partial<Record<EnterpriseKnowledgeScope, number>>>((acc, dataset) => {
    const scope = normalizeScope(dataset.scope)
    acc[scope] = (acc[scope] || 0) + 1
    return acc
  }, {})

  const configuredScopes = Object.keys(datasetScopeCounts)
    .map((scope) => normalizeScope(scope))
    .sort((left, right) => (datasetScopeCounts[right] || 0) - (datasetScopeCounts[left] || 0))

  const primaryScope =
    configuredScopes.length === 0
      ? "unknown"
      : configuredScopes.length === 1
        ? configuredScopes[0]
        : "mixed"

  return {
    configuredScopes,
    datasetScopeCounts,
    primaryScope,
    hasGeneralDataset: Boolean(datasetScopeCounts.general),
  }
}

function truncateDifyRetrievalQuery(query: string, maxChars = DIFY_RETRIEVAL_QUERY_MAX_CHARS) {
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
      const compact = line.slice(0, maxChars).trim()
      return compact.length <= maxChars ? compact : compact.slice(0, maxChars)
    }

    break
  }

  return selectedLines.join("\n")
}

function normalizeQueryVariants(query: string, queryVariants?: string[]) {
  const variants = [query, ...(queryVariants || [])]
    .map((item) => truncateDifyRetrievalQuery(item))
    .filter(Boolean)

  return [...new Set(variants)].slice(0, DEFAULT_MAX_QUERY_VARIANTS)
}

function normalizePreferredScopes(scopes?: EnterpriseKnowledgeScope[]) {
  return [...new Set((scopes || []).map((scope) => normalizeScope(scope)).filter(Boolean))]
}

function inferSnippetScope(
  title: string,
  content: string,
  fallback: EnterpriseKnowledgeScope,
): EnterpriseKnowledgeScope {
  const haystack = `${title}\n${content}`.toLowerCase()

  if (
    /产品|机型|型号|解决方案|参数|规格|设备|工艺|product|solution|machine|model|spec/i.test(haystack)
  ) {
    return "product"
  }
  if (/案例|客户|场景|应用|roi|成效|客户价值|case|customer|scenario/i.test(haystack)) {
    return "case-study"
  }
  if (/合规|禁用|风险|免责声明|compliance|regulation|legal/i.test(haystack)) {
    return "compliance"
  }
  if (/campaign|活动|投放|营销战役|广告活动/i.test(haystack)) {
    return "campaign"
  }

  return fallback
}

function filterActiveDatasetsByScope(
  datasets: EnterpriseDifyBindingRecord["datasets"],
  preferredScopes?: EnterpriseKnowledgeScope[],
) {
  const activeDatasets = datasets.filter((dataset) => dataset.enabled)
  const normalizedScopes = normalizePreferredScopes(preferredScopes)
  if (normalizedScopes.length === 0) {
    return activeDatasets
  }

  const matched = activeDatasets.filter(
    (dataset) => dataset.scope === "general" || normalizedScopes.includes(dataset.scope),
  )
  return matched.length > 0 ? matched : activeDatasets
}

function sortSnippetsByScore(snippets: EnterpriseKnowledgeSnippet[]) {
  return [...snippets].sort((left, right) => {
    const rightScore = typeof right.score === "number" ? right.score : -1
    const leftScore = typeof left.score === "number" ? left.score : -1
    return rightScore - leftScore
  })
}

function getEnterpriseKnowledgeCacheKey(enterpriseId: number | null | undefined) {
  return String(enterpriseId || 0)
}

function clearEnterpriseKnowledgeCaches(enterpriseId: number | null | undefined) {
  const enterpriseKey = `${enterpriseId || 0}:`

  for (const key of enterpriseKnowledgeCache.keys()) {
    if (key.startsWith(enterpriseKey)) {
      enterpriseKnowledgeCache.delete(key)
    }
  }

  enterpriseKnowledgeStatusCache.delete(getEnterpriseKnowledgeCacheKey(enterpriseId))
}

export async function getEnterpriseDifyBinding(enterpriseId: number | null | undefined) {
  if (!enterpriseId || !Number.isFinite(enterpriseId) || enterpriseId <= 0) {
    return null
  }

  const bindings = await db
    .select()
    .from(enterpriseDifyBindings)
    .where(eq(enterpriseDifyBindings.enterpriseId, enterpriseId))
    .limit(1)

  const binding = bindings[0]
  if (!binding) {
    return null
  }

  const datasets = await db
    .select()
    .from(enterpriseDifyDatasets)
    .where(eq(enterpriseDifyDatasets.bindingId, binding.id))
    .orderBy(asc(enterpriseDifyDatasets.priority), asc(enterpriseDifyDatasets.id))

  return {
    id: binding.id,
    enterpriseId: binding.enterpriseId,
    baseUrl: binding.baseUrl,
    apiKey: binding.apiKey || "",
    enabled: Boolean(binding.enabled),
    datasets: datasets.map((dataset) => ({
      id: dataset.id,
      bindingId: dataset.bindingId,
      datasetId: dataset.datasetId,
      datasetName: dataset.datasetName,
      scope: normalizeScope(dataset.scope),
      priority: normalizePriority(dataset.priority),
      enabled: Boolean(dataset.enabled),
    })),
  } satisfies EnterpriseDifyBindingRecord
}

export async function getEnterpriseDifyKnowledgeStatus(enterpriseId: number | null | undefined) {
  const cacheKey = getEnterpriseKnowledgeCacheKey(enterpriseId)
  const now = Date.now()
  const cached = enterpriseKnowledgeStatusCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.value
  }

  const nextValue = (async () => {
    const binding = await getEnterpriseDifyBinding(enterpriseId)
    if (!binding || !binding.enabled || !normalizeDifyApiBase(binding.baseUrl) || !binding.apiKey.trim()) {
      return { enabled: false, datasetCount: 0 }
    }

    const datasetCount = binding.datasets.filter((dataset) => dataset.enabled).length
    return {
      enabled: datasetCount > 0,
      datasetCount,
      source: "dify" as const,
      profile: buildEnterpriseKnowledgeProfile(binding.datasets),
    }
  })()

  enterpriseKnowledgeStatusCache.set(cacheKey, {
    expiresAt: now + WRITER_ENTERPRISE_KNOWLEDGE_STATUS_CACHE_TTL_MS,
    value: nextValue,
  })

  try {
    return await nextValue
  } catch (error) {
    enterpriseKnowledgeStatusCache.delete(cacheKey)
    throw error
  }
}

export async function upsertEnterpriseDifyBinding(
  enterpriseId: number,
  input: {
    baseUrl: string
    apiKey: string
    enabled: boolean
    datasets: EnterpriseDifyDatasetInput[]
  },
) {
  clearEnterpriseKnowledgeCaches(enterpriseId)

  const baseUrl = normalizeDifyApiBase(input.baseUrl)
  if (!baseUrl) {
    throw new Error("base_url_required")
  }

  const apiKey = input.apiKey.trim()
  const datasets = input.datasets
    .filter((dataset) => dataset.datasetId.trim() && dataset.datasetName.trim())
    .map((dataset) => ({
      datasetId: dataset.datasetId.trim(),
      datasetName: dataset.datasetName.trim(),
      scope: normalizeScope(dataset.scope),
      priority: normalizePriority(dataset.priority),
      enabled: Boolean(dataset.enabled),
    }))

  if (input.enabled && !apiKey) {
    throw new Error("api_key_required_when_enabled")
  }
  if (input.enabled && datasets.length === 0) {
    throw new Error("datasets_required_when_enabled")
  }

  const existing = await getEnterpriseDifyBinding(enterpriseId)

  let bindingId = existing?.id
  if (bindingId) {
    await db
      .update(enterpriseDifyBindings)
      .set({
        baseUrl,
        apiKey,
        enabled: Boolean(input.enabled),
        updatedAt: new Date(),
      })
      .where(eq(enterpriseDifyBindings.id, bindingId))
  } else {
    const inserted = await db
      .insert(enterpriseDifyBindings)
      .values({
        enterpriseId,
        baseUrl,
        apiKey,
        enabled: Boolean(input.enabled),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: enterpriseDifyBindings.id })

    bindingId = inserted[0]?.id
  }

  if (!bindingId) {
    throw new Error("enterprise_dify_binding_save_failed")
  }

  await db.delete(enterpriseDifyDatasets).where(eq(enterpriseDifyDatasets.bindingId, bindingId))

  if (datasets.length > 0) {
    await db.insert(enterpriseDifyDatasets).values(
      datasets.map((dataset) => ({
        bindingId,
        datasetId: dataset.datasetId,
        datasetName: dataset.datasetName,
        scope: dataset.scope,
        priority: dataset.priority,
        enabled: dataset.enabled,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    )
  }

  clearEnterpriseKnowledgeCaches(enterpriseId)
  return getEnterpriseDifyBinding(enterpriseId)
}

function parseDatasetList(data: any) {
  const rows = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.datasets)
      ? data.datasets
      : Array.isArray(data)
        ? data
        : []

  return rows
    .map((item: any) => ({
      id: String(item?.id || "").trim(),
      name: String(item?.name || "").trim(),
      description: String(item?.description || "").trim(),
    }))
    .filter((item: { id: string; name: string }) => item.id && item.name)
}

function parseDatasetDocumentList(data: any) {
  const rows = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.documents)
      ? data.documents
      : Array.isArray(data)
        ? data
        : []

  return rows
    .map((item: any) => String(item?.name || item?.title || "").trim())
    .filter(Boolean)
}

function inferCoverageTagsFromDocuments(documentNames: string[]) {
  const tags = new Set<EnterpriseKnowledgeCoverageTag>()

  for (const name of documentNames) {
    if (/(?:企业总览|核心事实|公司简介|企业简介|about|overview)/iu.test(name)) {
      tags.add("company-facts")
    }
    if (/(?:产品体系|标签词典|产品矩阵|产品目录|机型家族|产品线|product|solution)/iu.test(name)) {
      tags.add("product-system")
    }
    if (/(?:客户类型|应用映射|应用场景|行业场景|客户场景|scenario|customer)/iu.test(name)) {
      tags.add("application-scenarios")
    }
    if (/(?:技术档案|制造能力|认证资质|研发资质|工厂布局|技术能力|机型技术|参数|规格|spec)/iu.test(name)) {
      tags.add("technical-proof")
    }
    if (/(?:交付|实施|服务|质检|质控|售前|售后|support)/iu.test(name)) {
      tags.add("delivery-service")
    }
    if (/(?:品牌表达|竞争优势|市场证据|品牌定位|brand|proof)/iu.test(name)) {
      tags.add("brand-proof")
    }
    if (/(?:^|[_-])(?:qa|q&a)(?:[_-]|$)|问答|FAQ|常见问题/iu.test(name)) {
      tags.add("faq")
    }
  }

  return normalizeCoverageTags([...tags])
}

function inferSuggestedScopeFromCoverageTags(coverageTags: EnterpriseKnowledgeCoverageTag[]): EnterpriseKnowledgeScope {
  const tags = new Set(coverageTags)
  const hasBrand =
    tags.has("company-facts") ||
    tags.has("brand-proof")
  const hasProduct =
    tags.has("product-system") ||
    tags.has("application-scenarios") ||
    tags.has("technical-proof") ||
    tags.has("delivery-service")

  if (hasBrand && hasProduct) {
    return "general"
  }
  if (hasProduct) {
    return "product"
  }
  if (hasBrand) {
    return "brand"
  }
  return "general"
}

async function inspectRemoteEnterpriseDifyDataset(
  normalizedBaseUrl: string,
  apiKey: string,
  dataset: { id: string; name: string; description: string },
): Promise<RemoteEnterpriseDifyDatasetRecord> {
  try {
    const response = await writerRequestJson(
      `${normalizedBaseUrl}/datasets/${dataset.id}/documents?page=1&limit=20`,
      {
        headers: getDifyHeaders(apiKey),
      },
      { attempts: 2, timeoutMs: 60_000 },
    )

    if (!response.ok) {
      return {
        ...dataset,
        suggestedScope: "general",
        coverageTags: [],
        documentCount: 0,
        sampleDocuments: [],
      }
    }

    const sampleDocuments = parseDatasetDocumentList(response.data)
    const coverageTags = inferCoverageTagsFromDocuments(sampleDocuments)
    return {
      ...dataset,
      suggestedScope: inferSuggestedScopeFromCoverageTags(coverageTags),
      coverageTags,
      documentCount:
        typeof response.data?.total === "number"
          ? response.data.total
          : sampleDocuments.length,
      sampleDocuments: sampleDocuments.slice(0, 5),
    }
  } catch {
    return {
      ...dataset,
      suggestedScope: "general",
      coverageTags: [],
      documentCount: 0,
      sampleDocuments: [],
    }
  }
}

export async function listRemoteEnterpriseDifyDatasets(baseUrl: string, apiKey: string) {
  if (shouldUseWriterE2EFixtures()) {
    return FIXTURE_DATASETS.map((dataset) => ({
      ...dataset,
      suggestedScope: inferSuggestedScopeFromCoverageTags(inferCoverageTagsFromDocuments([dataset.name])),
      coverageTags: inferCoverageTagsFromDocuments([dataset.name]),
      documentCount: 1,
      sampleDocuments: [dataset.name],
    }))
  }

  const normalizedBaseUrl = normalizeDifyApiBase(baseUrl)
  if (!normalizedBaseUrl || !apiKey.trim()) {
    throw new Error("dify_config_incomplete")
  }

  const response = await writerRequestJson(
    `${normalizedBaseUrl}/datasets?page=1&limit=100`,
    {
      headers: getDifyHeaders(apiKey),
    },
    { attempts: 2, timeoutMs: 60_000 },
  )

  if (!response.ok) {
    throw new Error(`dify_datasets_http_${response.status}`)
  }

  const datasets = parseDatasetList(response.data)
  return Promise.all(
    datasets.map((dataset: { id: string; name: string; description: string }) =>
      inspectRemoteEnterpriseDifyDataset(normalizedBaseUrl, apiKey, dataset),
    ),
  )
}

function parseRetrieveRecords(data: any) {
  const rows = Array.isArray(data?.records)
    ? data.records
    : Array.isArray(data?.data?.records)
      ? data.data.records
      : Array.isArray(data?.data)
        ? data.data
        : []

  return rows
    .map((row: any) => {
      const content =
        typeof row?.segment?.content === "string"
          ? row.segment.content
          : typeof row?.content === "string"
            ? row.content
            : typeof row?.document?.content === "string"
              ? row.document.content
              : ""

      const title =
        typeof row?.title === "string"
          ? row.title
          : typeof row?.segment?.document?.name === "string"
            ? row.segment.document.name
            : typeof row?.document_name === "string"
              ? row.document_name
              : "知识片段"

      const score = typeof row?.score === "number" ? row.score : typeof row?.similarity === "number" ? row.similarity : null

      return {
        title: title.trim(),
        content: normalizeSnippetContent(content),
        score,
      }
    })
    .filter((row: { content: string }) => row.content)
}

function buildDifyRetrievalBody(query: string, options?: { relaxThreshold?: boolean }) {
  return {
    query,
    retrieval_model: {
      search_method: "semantic_search",
      reranking_enable: true,
      top_k: options?.relaxThreshold ? DEFAULT_FALLBACK_RETRIEVAL_TOP_K : DEFAULT_RETRIEVAL_TOP_K,
      score_threshold_enabled: !options?.relaxThreshold,
      ...(options?.relaxThreshold ? {} : { score_threshold: DEFAULT_RETRIEVAL_SCORE_THRESHOLD }),
    },
  }
}

async function retrieveEnterpriseDatasetRecords(params: {
  difyBaseUrl: string
  headers: Record<string, string>
  datasetId: string
  queryVariants: string[]
}) {
  const requestDataset = async (query: string, options?: { relaxThreshold?: boolean }) =>
    writerRequestJson(
      `${params.difyBaseUrl}/datasets/${encodeURIComponent(params.datasetId)}/retrieve`,
      {
        method: "POST",
        headers: params.headers,
        body: JSON.stringify(buildDifyRetrievalBody(query, options)),
      },
      { attempts: 2, timeoutMs: 60_000 },
    )

  const primaryResponses = await Promise.all(params.queryVariants.map((query) => requestDataset(query)))
  const primaryRecords = primaryResponses
    .filter((response) => response.ok)
    .flatMap((response) => parseRetrieveRecords(response.data))

  if (primaryRecords.length > 0 || params.queryVariants.length === 0) {
    return primaryRecords
  }

  const relaxedQueries = [...new Set(params.queryVariants.map((query) => query.trim()).filter(Boolean))]
    .sort((left, right) => left.length - right.length)
    .slice(0, DEFAULT_MAX_QUERY_VARIANTS)

  for (const relaxedQuery of relaxedQueries) {
    const relaxedResponse = await requestDataset(relaxedQuery, { relaxThreshold: true })
    if (!relaxedResponse.ok) continue

    const relaxedRecords = parseRetrieveRecords(relaxedResponse.data)
    if (relaxedRecords.length > 0) {
      return relaxedRecords
    }
  }

  return []
}

export async function loadEnterpriseKnowledgeContext(params: {
  enterpriseId: number | null | undefined
  query: string
  queryVariants?: string[]
  preferredScopes?: EnterpriseKnowledgeScope[]
  platform: WriterPlatform
  mode: WriterMode
}) {
  const normalizedVariants = normalizeQueryVariants(params.query, params.queryVariants)
  const normalizedScopes = normalizePreferredScopes(params.preferredScopes)
  const cacheKey = [
    params.enterpriseId || 0,
    normalizedVariants.join("|").toLowerCase(),
    normalizedScopes.join(","),
  ].join(":")
  const now = Date.now()
  const cached = enterpriseKnowledgeCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.value
  }

  const nextValue = loadEnterpriseKnowledgeContextFresh(params)
  enterpriseKnowledgeCache.set(cacheKey, {
    expiresAt: now + WRITER_ENTERPRISE_KNOWLEDGE_CACHE_TTL_MS,
    value: nextValue,
  })

  try {
    return await nextValue
  } catch (error) {
    enterpriseKnowledgeCache.delete(cacheKey)
    throw error
  }
}

async function loadEnterpriseKnowledgeContextFresh(params: {
  enterpriseId: number | null | undefined
  query: string
  queryVariants?: string[]
  preferredScopes?: EnterpriseKnowledgeScope[]
  platform: WriterPlatform
  mode: WriterMode
}) {
  const binding = await getEnterpriseDifyBinding(params.enterpriseId)
  if (!binding || !binding.enabled || !binding.apiKey.trim()) {
    return null
  }

  const allActiveDatasets = binding.datasets.filter((dataset) => dataset.enabled)
  const activeDatasets = filterActiveDatasetsByScope(binding.datasets, params.preferredScopes)
  if (activeDatasets.length === 0) {
    return null
  }

  const queryVariants = normalizeQueryVariants(params.query, params.queryVariants)
  if (queryVariants.length === 0) {
    return null
  }

  if (shouldUseWriterE2EFixtures()) {
    const snippets = activeDatasets
      .map((dataset) => {
        const fixture = FIXTURE_SNIPPETS[dataset.datasetId]
        if (!fixture) return null
        return {
          datasetId: dataset.datasetId,
          datasetName: dataset.datasetName,
          scope: dataset.scope,
          inferredScope: inferSnippetScope(fixture.title, fixture.content, dataset.scope),
          score: fixture.score,
          title: fixture.title,
          content: fixture.content,
        } satisfies EnterpriseKnowledgeSnippet
      })
      .filter(Boolean) as EnterpriseKnowledgeSnippet[]

    if (snippets.length === 0) {
      return null
    }

    return {
      source: "dify",
      datasetsUsed: activeDatasets.map((dataset) => ({
        datasetId: dataset.datasetId,
        datasetName: dataset.datasetName,
        scope: dataset.scope,
      })),
      snippets,
    } satisfies EnterpriseKnowledgeContext
  }

  const headers = getDifyHeaders(binding.apiKey)
  const difyBaseUrl = normalizeDifyApiBase(binding.baseUrl)
  const retrieveFromDatasets = async (datasets: typeof activeDatasets) =>
    Promise.all(
      datasets.slice(0, 4).map(async (dataset) => {
        const records = sortSnippetsByScore(
          (
            await retrieveEnterpriseDatasetRecords({
              difyBaseUrl,
              headers,
              datasetId: dataset.datasetId,
              queryVariants,
            })
          ).map((record: { score: number | null; title: string; content: string }) => ({
            datasetId: dataset.datasetId,
            datasetName: dataset.datasetName,
            scope: dataset.scope,
            inferredScope: inferSnippetScope(record.title, record.content, dataset.scope),
            score: record.score,
            title: record.title,
            content: record.content,
          })),
        ).filter((record, index, all) => all.findIndex((item) => item.title === record.title && item.content === record.content) === index)

        if (records.length === 0) {
          return null
        }

        return { dataset, records: records.slice(0, 3) }
      }),
    )

  const scopedResults = await retrieveFromDatasets(activeDatasets)
  const retrievalResults =
    scopedResults.some(Boolean) || activeDatasets.length === allActiveDatasets.length
      ? scopedResults
      : await retrieveFromDatasets(allActiveDatasets)

  const datasetsUsed: EnterpriseKnowledgeContext["datasetsUsed"] = []
  const snippets: EnterpriseKnowledgeSnippet[] = []

  for (const item of retrievalResults) {
    if (!item) {
      continue
    }

    datasetsUsed.push({
      datasetId: item.dataset.datasetId,
      datasetName: item.dataset.datasetName,
      scope: item.dataset.scope,
    })

    snippets.push(
      ...item.records.map((record: EnterpriseKnowledgeSnippet) => ({
        datasetId: item.dataset.datasetId,
        datasetName: item.dataset.datasetName,
        scope: item.dataset.scope,
        inferredScope: record.inferredScope,
        score: record.score,
        title: record.title,
        content: record.content,
      })),
    )
  }

  if (snippets.length === 0) {
    return null
  }

  return {
    source: "dify",
    datasetsUsed,
    snippets: sortSnippetsByScore(snippets).slice(0, 6),
  } satisfies EnterpriseKnowledgeContext
}
