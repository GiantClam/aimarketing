import { asc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { enterpriseDifyBindings, enterpriseDifyDatasets } from "@/lib/db/schema"
import { writerRequestJson } from "@/lib/writer/network"
import type { WriterMode, WriterPlatform } from "@/lib/writer/config"

export type EnterpriseKnowledgeScope = "brand" | "product" | "case-study" | "compliance" | "campaign"

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
  score: number | null
  title: string
  content: string
}

export type EnterpriseKnowledgeContext = {
  source: "dify"
  datasetsUsed: Array<{ datasetId: string; datasetName: string; scope: EnterpriseKnowledgeScope }>
  snippets: EnterpriseKnowledgeSnippet[]
}

const DEFAULT_RETRIEVAL_TOP_K = 3
const DEFAULT_RETRIEVAL_SCORE_THRESHOLD = 0.35
const WRITER_ENTERPRISE_KNOWLEDGE_CACHE_TTL_MS = Math.max(
  0,
  Number.parseInt(process.env.WRITER_ENTERPRISE_KNOWLEDGE_CACHE_TTL_MS || "300000", 10) || 300_000,
)

const enterpriseKnowledgeCache = new Map<string, { expiresAt: number; value: Promise<EnterpriseKnowledgeContext | null> }>()

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
  if (value === "product" || value === "case-study" || value === "compliance" || value === "campaign") {
    return value
  }
  return "brand"
}

function normalizePriority(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 100
  return Math.min(Math.max(Math.round(parsed), 1), 999)
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
  const binding = await getEnterpriseDifyBinding(enterpriseId)
  if (!binding || !binding.enabled) {
    return { enabled: false, datasetCount: 0 }
  }

  const datasetCount = binding.datasets.filter((dataset) => dataset.enabled).length
  return {
    enabled: datasetCount > 0,
    datasetCount,
    source: "dify" as const,
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
  const baseUrl = normalizeDifyApiBase(input.baseUrl)
  if (!baseUrl) {
    throw new Error("base_url_required")
  }

  const datasets = input.datasets
    .filter((dataset) => dataset.datasetId.trim() && dataset.datasetName.trim())
    .map((dataset) => ({
      datasetId: dataset.datasetId.trim(),
      datasetName: dataset.datasetName.trim(),
      scope: normalizeScope(dataset.scope),
      priority: normalizePriority(dataset.priority),
      enabled: Boolean(dataset.enabled),
    }))

  const existing = await getEnterpriseDifyBinding(enterpriseId)

  let bindingId = existing?.id
  if (bindingId) {
    await db
      .update(enterpriseDifyBindings)
      .set({
        baseUrl,
        apiKey: input.apiKey.trim(),
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
        apiKey: input.apiKey.trim(),
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

export async function listRemoteEnterpriseDifyDatasets(baseUrl: string, apiKey: string) {
  if (shouldUseWriterE2EFixtures()) {
    return FIXTURE_DATASETS
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

  return parseDatasetList(response.data)
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

export async function loadEnterpriseKnowledgeContext(params: {
  enterpriseId: number | null | undefined
  query: string
  platform: WriterPlatform
  mode: WriterMode
}) {
  const cacheKey = `${params.enterpriseId || 0}:${params.query.trim().toLowerCase()}`
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
  platform: WriterPlatform
  mode: WriterMode
}) {
  const binding = await getEnterpriseDifyBinding(params.enterpriseId)
  if (!binding || !binding.enabled || !binding.apiKey.trim()) {
    return null
  }

  const activeDatasets = binding.datasets.filter((dataset) => dataset.enabled)
  if (activeDatasets.length === 0) {
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
  const datasetsUsed: EnterpriseKnowledgeContext["datasetsUsed"] = []
  const snippets: EnterpriseKnowledgeSnippet[] = []

  const retrievalResults = await Promise.all(
    activeDatasets.slice(0, 4).map(async (dataset) => {
      const response = await writerRequestJson(
        `${difyBaseUrl}/datasets/${encodeURIComponent(dataset.datasetId)}/retrieve`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            query: params.query,
            retrieval_model: {
              search_method: "semantic_search",
              reranking_enable: true,
              top_k: DEFAULT_RETRIEVAL_TOP_K,
              score_threshold_enabled: true,
              score_threshold: DEFAULT_RETRIEVAL_SCORE_THRESHOLD,
            },
          }),
        },
        { attempts: 2, timeoutMs: 60_000 },
      )

      if (!response.ok) {
        return null
      }

      const records = parseRetrieveRecords(response.data).slice(0, 2)
      if (records.length === 0) {
        return null
      }

      return { dataset, records }
    }),
  )

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
      ...item.records.map((record: { score: number | null; title: string; content: string }) => ({
        datasetId: item.dataset.datasetId,
        datasetName: item.dataset.datasetName,
        scope: item.dataset.scope,
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
    snippets: snippets.slice(0, 6),
  } satisfies EnterpriseKnowledgeContext
}
