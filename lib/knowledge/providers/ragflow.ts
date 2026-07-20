import "server-only"

import type { KnowledgeProvider, KnowledgeRemoteChunk, KnowledgeRemoteDocument } from "@/lib/knowledge/provider"
import {
  getKnowledgeSourceByEnterprise,
  listKnowledgeDatasetsByEnterprise,
} from "@/lib/knowledge/repository"
import type {
  EnterpriseKnowledgeContext,
  KnowledgeDataset,
  KnowledgeDocument,
  KnowledgeSource,
  KnowledgeSourceTestResult,
} from "@/lib/knowledge/types"

const DEFAULT_TOP_K = 5
const DEFAULT_SCORE_THRESHOLD = 0.35
const DEFAULT_RETRIEVAL_TIMEOUT_MS = 12_000

type RagflowApiResponse<T> = {
  code?: number
  message?: string
  data?: T
}

type RagflowRetrievalResponse = {
  chunks?: Array<Record<string, unknown>>
  [key: string]: unknown
}

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "")
  if (!trimmed) return ""
  return /\/api\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/api/v1`
}

function buildHeaders(source: KnowledgeSource) {
  return {
    Authorization: `Bearer ${source.apiKey?.trim() || ""}`,
    "Content-Type": "application/json",
  }
}

async function requestRagflow<T>(
  source: KnowledgeSource,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const baseUrl = normalizeBaseUrl(source.baseUrl)
  if (!baseUrl || !source.apiKey) {
    throw new Error("knowledge_source_not_configured")
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...buildHeaders(source),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => null)) as RagflowApiResponse<T> | null
  if (!response.ok) {
    throw new Error(payload?.message || `ragflow_http_${response.status}`)
  }
  if (typeof payload?.code === "number" && payload.code !== 0) {
    throw new Error(payload?.message || `ragflow_api_${payload.code}`)
  }

  const data = payload?.data as T | undefined
  return data as T
}

async function requestRagflowWithTimeout<T>(source: KnowledgeSource, path: string, timeoutMs: number, init?: RequestInit) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await requestRagflow<T>(source, path, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function retrievalTimeoutMs() {
  const parsed = Number.parseInt(process.env.RAGFLOW_RETRIEVAL_TIMEOUT_MS || "", 10)
  return Number.isFinite(parsed) && parsed >= 1_000 ? parsed : DEFAULT_RETRIEVAL_TIMEOUT_MS
}

function isExpectedDatasetRetrievalFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /aborted|embedding models|provider .* not found for model|model .* not found/iu.test(message)
}

async function requestRagflowBinary(
  source: KnowledgeSource,
  path: string,
  init?: RequestInit,
): Promise<{
  bytes: Buffer
  contentType: string
}> {
  const baseUrl = normalizeBaseUrl(source.baseUrl)
  if (!baseUrl || !source.apiKey) {
    throw new Error("knowledge_source_not_configured")
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${source.apiKey?.trim() || ""}`,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as RagflowApiResponse<unknown> | null
    throw new Error(payload?.message || `ragflow_http_${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return {
    bytes: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type") || "application/octet-stream",
  }
}

function toSnippetContent(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function resolveDatasetScope(dataset: KnowledgeDataset | undefined) {
  return dataset?.category || "general"
}

function extractDocumentId(value: unknown) {
  if (!value || typeof value !== "object") return null
  const row = value as { id?: unknown; document_id?: unknown; documentId?: unknown }
  if (typeof row.document_id === "string" && row.document_id) return row.document_id
  if (typeof row.documentId === "string" && row.documentId) return row.documentId
  if (typeof row.id === "string" && row.id) return row.id
  return null
}

function extractDocumentIds(value: unknown) {
  const rows = Array.isArray(value) ? value : [value]
  return rows.map(extractDocumentId).filter((item): item is string => Boolean(item))
}

function extractDatasetDocuments(value: unknown) {
  if (Array.isArray(value)) return value
  if (value && typeof value === "object" && Array.isArray((value as { docs?: unknown[] }).docs)) {
    return (value as { docs: unknown[] }).docs
  }
  return []
}

function extractDatasetChunks(value: unknown) {
  if (Array.isArray(value)) return { chunks: value, total: value.length }
  if (value && typeof value === "object") {
    const row = value as { chunks?: unknown[]; total?: unknown }
    if (Array.isArray(row.chunks)) {
      return {
        chunks: row.chunks,
        total: Number(row.total ?? row.chunks.length) || row.chunks.length,
      }
    }
  }
  return { chunks: [], total: 0 }
}

function toRemoteDocumentStatus(value: unknown): KnowledgeDocument["status"] {
  if (!value || typeof value !== "object") {
    return "parsing"
  }

  const row = value as {
    run?: unknown
    progress?: unknown
    chunk_count?: unknown
    chunkCount?: unknown
  }
  const run = String(row.run || "").trim().toUpperCase()
  const progress = Number(row.progress)
  const chunkCount = Number(row.chunk_count ?? row.chunkCount ?? 0)

  if (
    run === "FAIL" ||
    run === "FAILED" ||
    run === "ERROR" ||
    run === "CANCELLED" ||
    run === "ABORTED" ||
    progress < 0
  ) {
    return "failed"
  }

  if (
    run === "DONE" ||
    run === "SUCCESS" ||
    run === "FINISH" ||
    run === "FINISHED" ||
    run === "GREEN" ||
    chunkCount > 0
  ) {
    return "ready"
  }

  return "parsing"
}

function toRemoteDocumentSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return null
  }

  const row = value as Record<string, unknown>
  return {
    run: typeof row.run === "string" ? row.run : null,
    progress: typeof row.progress === "number" ? row.progress : Number(row.progress ?? null),
    progressMsg: typeof row.progress_msg === "string" ? row.progress_msg : null,
    chunkCount: Number(row.chunk_count ?? row.chunkCount ?? 0),
    chunkMethod: typeof row.chunk_method === "string" ? row.chunk_method : null,
    pipelineName: typeof row.pipeline_name === "string" ? row.pipeline_name : null,
    processDuration: Number(row.process_duration ?? 0) || null,
  }
}

function toRemoteDocument(value: unknown): KnowledgeRemoteDocument | null {
  const providerDocumentId = extractDocumentId(value)
  if (!providerDocumentId || !value || typeof value !== "object") {
    return null
  }

  const row = value as {
    chunk_count?: unknown
    chunkCount?: unknown
    progress_msg?: unknown
  }
  const status = toRemoteDocumentStatus(value)
  const errorMessage =
    status === "failed" && typeof row.progress_msg === "string" && row.progress_msg.trim()
      ? row.progress_msg.trim()
      : status === "failed"
        ? "ragflow_document_parse_failed"
        : null

  return {
    providerDocumentId,
    status,
    chunkCount: Number(row.chunk_count ?? row.chunkCount ?? 0) || 0,
    parseSummary: toRemoteDocumentSummary(value),
    errorMessage,
  }
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : []
}

function buildChunkExcerpt(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim()
  if (normalized.length <= 280) return normalized
  return `${normalized.slice(0, 277)}...`
}

function toRemoteChunk(value: unknown, chunkIndex: number): KnowledgeRemoteChunk | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const row = value as {
    id?: unknown
    content?: unknown
    important_keywords?: unknown
    questions?: unknown
    tag_kwd?: unknown
    available?: unknown
  }
  const content = typeof row.content === "string" ? row.content.trim() : ""
  if (!content) return null

  return {
    providerChunkId: typeof row.id === "string" && row.id ? row.id : null,
    chunkIndex,
    content,
    excerpt: buildChunkExcerpt(content),
    keywords: normalizeStringArray(row.important_keywords),
    questions: normalizeStringArray(row.questions),
    tags: normalizeStringArray(row.tag_kwd),
    status: row.available === false ? "disabled" : "active",
  }
}

async function resolveDocumentIdsByName(
  source: KnowledgeSource,
  dataset: KnowledgeDataset,
  name: string,
): Promise<string[]> {
  if (!dataset.providerDatasetId) {
    throw new Error("knowledge_dataset_provider_missing")
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const data = await requestRagflow<unknown>(
      source,
      `/datasets/${dataset.providerDatasetId}/documents?page=1&page_size=100`,
      {
        method: "GET",
      },
    )
    const matches = extractDatasetDocuments(data)
      .filter((item) => {
        if (!item || typeof item !== "object") return false
        const row = item as { name?: unknown; location?: unknown }
        return row.name === name || row.location === name
      })
      .sort((left, right) => {
        const leftTime =
          Number((left as { update_time?: unknown; create_time?: unknown }).update_time) ||
          Number((left as { create_time?: unknown }).create_time) ||
          0
        const rightTime =
          Number((right as { update_time?: unknown; create_time?: unknown }).update_time) ||
          Number((right as { create_time?: unknown }).create_time) ||
          0
        return rightTime - leftTime
      })

    const documentIds = extractDocumentIds(matches)
    if (documentIds.length > 0) {
      return documentIds
    }

    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  return []
}

async function triggerDocumentParse(source: KnowledgeSource, dataset: KnowledgeDataset, documentIds: string[]) {
  if (!dataset.providerDatasetId) {
    throw new Error("knowledge_dataset_provider_missing")
  }
  if (documentIds.length === 0) {
    throw new Error("knowledge_document_id_missing")
  }
  await requestRagflow(source, `/datasets/${dataset.providerDatasetId}/chunks`, {
    method: "POST",
    body: JSON.stringify({
      document_ids: documentIds,
    }),
  })
}

export const ragflowKnowledgeProvider: KnowledgeProvider = {
  type: "ragflow",

  async testConnection(source): Promise<KnowledgeSourceTestResult> {
    try {
      const datasets = await requestRagflow<Array<{ id?: string; name?: string }>>(source, "/datasets", {
        method: "GET",
      })
      return {
        ok: true,
        status: "healthy",
        message: "RAGFlow connection healthy",
        checkedAt: new Date().toISOString(),
        remoteDatasetCount: Array.isArray(datasets) ? datasets.length : 0,
      }
    } catch (error) {
      return {
        ok: false,
        status: "unavailable",
        message: error instanceof Error ? error.message : "ragflow_connection_failed",
        checkedAt: new Date().toISOString(),
      }
    }
  },

  async retrieve(params): Promise<EnterpriseKnowledgeContext | null> {
    const source = await getKnowledgeSourceByEnterprise(params.enterpriseId, "ragflow")
    if (!source || !source.enabled) return null

    const datasets = await listKnowledgeDatasetsByEnterprise(params.enterpriseId)
    const preferredDatasetIdSet = new Set(
      Array.isArray(params.preferredDatasetIds)
        ? params.preferredDatasetIds.filter((datasetId) => Number.isInteger(datasetId) && datasetId > 0)
        : [],
    )
    const enabledDatasets = datasets.filter(
      (dataset) =>
        dataset.enabled &&
        dataset.providerDatasetId &&
        (preferredDatasetIdSet.size === 0 || preferredDatasetIdSet.has(dataset.id)),
    )
    if (enabledDatasets.length === 0) return null

    // RAGFlow rejects a single retrieval request when dataset_ids contain
    // datasets backed by different embedding models. Query each dataset in
    // isolation so legacy datasets cannot take down the whole knowledge path.
    const retrievalResults = await Promise.allSettled(
      enabledDatasets.map(async (dataset) => ({
        dataset,
        response: await requestRagflowWithTimeout<RagflowRetrievalResponse | Array<Record<string, unknown>>>(source, "/retrieval", retrievalTimeoutMs(), {
          method: "POST",
          body: JSON.stringify({
            question: params.query,
            dataset_ids: [dataset.providerDatasetId],
            similarity_threshold: params.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD,
            top_k: params.topK ?? DEFAULT_TOP_K,
          }),
        }),
      })),
    )
    const successfulResults = retrievalResults
      .filter((result): result is PromiseFulfilledResult<{ dataset: KnowledgeDataset; response: RagflowRetrievalResponse | Array<Record<string, unknown>> }> => result.status === "fulfilled")
      .map((result) => result.value)
    if (successfulResults.length === 0) {
      const unexpectedFailure = retrievalResults.find(
        (result): result is PromiseRejectedResult => result.status === "rejected" && !isExpectedDatasetRetrievalFailure(result.reason),
      )
      if (!unexpectedFailure) return null
      throw unexpectedFailure.reason
    }

    const snippets = successfulResults.flatMap(({ dataset, response }) => {
      const hits = Array.isArray(response)
        ? response
        : Array.isArray(response?.chunks)
          ? response.chunks
          : []
      return hits.map((item) => {
        const datasetId =
          typeof item.dataset_id === "string"
            ? item.dataset_id
            : typeof item.datasetId === "string"
              ? item.datasetId
              : ""
        const matchedDataset = enabledDatasets.find((candidate) => candidate.providerDatasetId === datasetId) || dataset
        const content =
          toSnippetContent(item.content) ||
          toSnippetContent(item.chunk) ||
          toSnippetContent(item.text)
        if (!content) return null
        return {
          datasetId: datasetId || matchedDataset?.providerDatasetId || "unknown",
          datasetName:
            (typeof item.dataset_name === "string" && item.dataset_name) ||
            matchedDataset?.name ||
            "Unknown dataset",
          scope: resolveDatasetScope(matchedDataset),
          score:
            typeof item.score === "number"
              ? item.score
              : typeof item.similarity === "number"
                ? item.similarity
                : null,
          title:
            (typeof item.title === "string" && item.title) ||
            (typeof item.document_name === "string" && item.document_name) ||
            "Snippet",
          content,
        }
      }).filter((item): item is NonNullable<typeof item> => Boolean(item))
    })
      .sort((left, right) => (right.score ?? -Infinity) - (left.score ?? -Infinity))
      .slice(0, params.topK ?? DEFAULT_TOP_K)

    if (snippets.length === 0) return null

    const datasetsUsed = snippets.reduce<EnterpriseKnowledgeContext["datasetsUsed"]>((acc, snippet) => {
      if (!acc.some((item) => item.datasetId === snippet.datasetId)) {
        acc.push({
          datasetId: snippet.datasetId,
          datasetName: snippet.datasetName,
          scope: snippet.scope,
        })
      }
      return acc
    }, [])

    return {
      source: "ragflow",
      datasetsUsed,
      snippets,
    }
  },

  async listRemoteDatasets(source) {
    const response = await requestRagflow<Array<{ id?: string; name?: string }>>(source, "/datasets", {
      method: "GET",
    })
    return Array.isArray(response)
      ? response
          .map((dataset) => ({
            id: typeof dataset.id === "string" ? dataset.id : "",
            name: typeof dataset.name === "string" ? dataset.name : "Untitled dataset",
          }))
          .filter((dataset) => dataset.id)
      : []
  },

  async createRemoteDataset({ source, name, description, chunkMethod }) {
    const response = await requestRagflow<{
      id?: string
      name?: string
    }>(source, "/datasets", {
      method: "POST",
      body: JSON.stringify({
        name,
        description: description?.trim() || undefined,
        permission: "me",
        chunk_method: chunkMethod?.trim() || "naive",
      }),
    })

    const providerDatasetId = typeof response?.id === "string" ? response.id.trim() : ""
    if (!providerDatasetId) {
      throw new Error("knowledge_dataset_create_failed")
    }

    return {
      providerDatasetId,
      name: typeof response?.name === "string" && response.name.trim() ? response.name.trim() : name,
    }
  },

  async listRemoteDocuments({ source, dataset }) {
    if (!dataset.providerDatasetId) {
      throw new Error("knowledge_dataset_provider_missing")
    }

    const items: KnowledgeRemoteDocument[] = []
    let page = 1
    const pageSize = 100

    while (page <= 10) {
      const response = await requestRagflow<unknown>(
        source,
        `/datasets/${dataset.providerDatasetId}/documents?page=${page}&page_size=${pageSize}`,
        {
          method: "GET",
        },
      )
      const documents = extractDatasetDocuments(response)
      items.push(...documents.map(toRemoteDocument).filter((item): item is KnowledgeRemoteDocument => Boolean(item)))
      if (documents.length < pageSize) {
        break
      }
      page += 1
    }

    return items
  },

  async listRemoteChunks({ source, dataset, document }) {
    if (!dataset.providerDatasetId) {
      throw new Error("knowledge_dataset_provider_missing")
    }
    if (!document.providerDocumentId) {
      throw new Error("knowledge_document_provider_id_missing")
    }

    const pageSize = 100
    const items: KnowledgeRemoteChunk[] = []

    for (let page = 1; page <= 100; page += 1) {
      const response = await requestRagflow<unknown>(
        source,
        `/datasets/${dataset.providerDatasetId}/documents/${document.providerDocumentId}/chunks?page=${page}&page_size=${pageSize}`,
        {
          method: "GET",
        },
      )
      const { chunks, total } = extractDatasetChunks(response)
      const baseIndex = items.length
      items.push(
        ...chunks
          .map((chunk, index) => toRemoteChunk(chunk, baseIndex + index + 1))
          .filter((item): item is KnowledgeRemoteChunk => Boolean(item)),
      )
      if (chunks.length < pageSize || items.length >= total) {
        break
      }
    }

    return items
  },

  async uploadDocument({ source, dataset, fileName, contentType, bytes }) {
    if (!dataset.providerDatasetId) {
      throw new Error("knowledge_dataset_provider_missing")
    }
    const formData = new FormData()
    formData.append(
      "file",
      new File([new Uint8Array(bytes)], fileName, { type: contentType || "application/octet-stream" }),
    )
    const response = await fetch(
      `${normalizeBaseUrl(source.baseUrl)}/datasets/${dataset.providerDatasetId}/documents`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${source.apiKey?.trim() || ""}`,
        },
        body: formData,
        cache: "no-store",
      },
    )
    const payload = (await response.json().catch(() => null)) as RagflowApiResponse<
      | {
          id?: string
          document_id?: string
        }
      | Array<{
          id?: string
          document_id?: string
        }>
    > | null
    if (!response.ok) {
      throw new Error(payload?.message || `ragflow_document_upload_${response.status}`)
    }

    const documentIds = extractDocumentIds(payload?.data)
    const resolvedDocumentIds =
      documentIds.length > 0 ? documentIds : await resolveDocumentIdsByName(source, dataset, fileName)
    await triggerDocumentParse(source, dataset, resolvedDocumentIds)

    const providerDocumentId = resolvedDocumentIds[0] || null
    return {
      providerDocumentId,
      status: "parsing" as KnowledgeDocument["status"],
      parseSummary: null,
    }
  },

  async uploadWebDocument({ source, dataset, name, url }) {
    if (!dataset.providerDatasetId) {
      throw new Error("knowledge_dataset_provider_missing")
    }
    const response = await requestRagflow<unknown>(source, `/datasets/${dataset.providerDatasetId}/documents`, {
      method: "POST",
      body: JSON.stringify({
        name,
        url,
        type: "web",
      }),
    })

    const documentIds = extractDocumentIds(response)
    const resolvedDocumentIds =
      documentIds.length > 0 ? documentIds : await resolveDocumentIdsByName(source, dataset, name)
    await triggerDocumentParse(source, dataset, resolvedDocumentIds)

    const providerDocumentId = resolvedDocumentIds[0] || null
    return {
      providerDocumentId,
      status: "parsing" as KnowledgeDocument["status"],
      parseSummary: null,
    }
  },

  async reparseDocument({ source, dataset, document }) {
    if (!document.providerDocumentId) {
      throw new Error("knowledge_document_provider_id_missing")
    }
    await triggerDocumentParse(source, dataset, [document.providerDocumentId])
    return {
      status: "reparsing" as KnowledgeDocument["status"],
      parseSummary: null,
    }
  },

  async migrateDocument({ source, fromDataset, toDataset, document }) {
    if (!fromDataset.providerDatasetId || !toDataset.providerDatasetId) {
      throw new Error("knowledge_dataset_provider_missing")
    }
    if (!document.providerDocumentId) {
      throw new Error("knowledge_document_provider_id_missing")
    }

    if (document.sourceType === "url" && document.sourceUrl) {
      return this.uploadWebDocument?.({
        source,
        dataset: toDataset,
        name: document.name,
        url: document.sourceUrl,
      }) || {
        providerDocumentId: null,
        status: "uploaded" as KnowledgeDocument["status"],
        parseSummary: null,
      }
    }

    const downloaded = await requestRagflowBinary(
      source,
      `/datasets/${fromDataset.providerDatasetId}/documents/${document.providerDocumentId}`,
      {
        method: "GET",
      },
    )

    return this.uploadDocument?.({
      source,
      dataset: toDataset,
      fileName: document.name,
      contentType: downloaded.contentType,
      bytes: downloaded.bytes,
    }) || {
      providerDocumentId: null,
      status: "uploaded" as KnowledgeDocument["status"],
      parseSummary: null,
    }
  },

  async deleteDocument({ source, dataset, document }) {
    if (!dataset.providerDatasetId) {
      throw new Error("knowledge_dataset_provider_missing")
    }
    if (!document.providerDocumentId) {
      throw new Error("knowledge_document_provider_id_missing")
    }

    await requestRagflow(source, `/datasets/${dataset.providerDatasetId}/documents`, {
      method: "DELETE",
      body: JSON.stringify({
        ids: [document.providerDocumentId],
        delete_all: false,
      }),
    })
  },
}
