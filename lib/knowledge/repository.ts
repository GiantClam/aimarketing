import "server-only"

import { and, desc, eq, inArray, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { createRetryableDbErrorMatcher, withDbRetry } from "@/lib/db/retry"
import {
  enterpriseKnowledgeBindings,
  enterpriseKnowledgeChunks,
  enterpriseKnowledgeDatasets,
  enterpriseKnowledgeDocuments,
  enterpriseKnowledgeSources,
} from "@/lib/db/schema"
import type {
  KnowledgeBinding,
  KnowledgeChunk,
  KnowledgeChunkingConfig,
  KnowledgeDataset,
  KnowledgeDocument,
  KnowledgeOverview,
  KnowledgeRecentActivity,
  KnowledgeRetrievalConfig,
  KnowledgeScope,
  KnowledgeSource,
  KnowledgeSourceStatus,
  KnowledgeSourceType,
} from "@/lib/knowledge/types"

const isRetryableKnowledgeDbError = createRetryableDbErrorMatcher(["timeout exceeded"])

function withKnowledgeDbRetry<T>(label: string, operation: () => Promise<T>) {
  return withDbRetry(label, operation, {
    isRetryable: isRetryableKnowledgeDbError,
    logPrefix: "knowledge.db.retry",
    exhaustedErrorPrefix: "knowledge_db_retry_exhausted",
  })
}

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null
}

function normalizeScope(value: string | null | undefined): KnowledgeScope {
  switch (value) {
    case "brand":
    case "product":
    case "case-study":
    case "compliance":
    case "campaign":
    case "general":
      return value
    default:
      return "general"
  }
}

function normalizeSourceStatus(value: string | null | undefined): KnowledgeSourceStatus {
  return value === "healthy" || value === "degraded" ? value : "unavailable"
}

function normalizeChunkingConfig(value: Record<string, unknown> | null | undefined): KnowledgeChunkingConfig | null {
  if (!value) return null
  const chunkSize = Number(value.chunkSize)
  const overlap = Number(value.overlap)
  return {
    method: typeof value.method === "string" && value.method.trim() ? value.method : "general",
    chunkSize: Number.isFinite(chunkSize) && chunkSize > 0 ? chunkSize : 512,
    overlap: Number.isFinite(overlap) && overlap >= 0 ? overlap : 0.1,
    delimiter: typeof value.delimiter === "string" ? value.delimiter : "\\n",
    parser: typeof value.parser === "string" && value.parser.trim() ? value.parser : null,
  }
}

function normalizeRetrievalConfig(value: Record<string, unknown> | null | undefined): KnowledgeRetrievalConfig | null {
  if (!value) return null
  const similarityThreshold = Number(value.similarityThreshold)
  const topK = Number(value.topK)
  const topN = Number(value.topN)
  return {
    similarityThreshold: Number.isFinite(similarityThreshold) ? similarityThreshold : 0.35,
    topK: Number.isFinite(topK) && topK > 0 ? Math.round(topK) : 8,
    topN: Number.isFinite(topN) && topN > 0 ? Math.round(topN) : null,
    rerankEnabled: value.rerankEnabled !== false,
    metadataFilter:
      value.metadataFilter && typeof value.metadataFilter === "object"
        ? (value.metadataFilter as Record<string, unknown>)
        : null,
  }
}

function mapSourceRow(row: typeof enterpriseKnowledgeSources.$inferSelect): KnowledgeSource {
  return {
    id: row.id,
    enterpriseId: row.enterpriseId,
    providerType: row.providerType as KnowledgeSource["providerType"],
    name: row.name,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey || null,
    status: normalizeSourceStatus(row.status),
    enabled: row.enabled,
    lastCheckedAt: toIso(row.lastCheckedAt),
    lastError: row.lastError || null,
  }
}

function mapDatasetRow(row: typeof enterpriseKnowledgeDatasets.$inferSelect): KnowledgeDataset {
  return {
    id: row.id,
    enterpriseId: row.enterpriseId,
    sourceId: row.sourceId,
    providerDatasetId: row.providerDatasetId || null,
    name: row.name,
    category: normalizeScope(row.category),
    priority: row.priority,
    enabled: row.enabled,
    chunkingConfig: normalizeChunkingConfig(row.chunkingConfig as Record<string, unknown> | null),
    retrievalConfig: normalizeRetrievalConfig(row.retrievalConfig as Record<string, unknown> | null),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

function mapDocumentRow(row: typeof enterpriseKnowledgeDocuments.$inferSelect): KnowledgeDocument {
  return {
    id: row.id,
    enterpriseId: row.enterpriseId,
    sourceId: row.sourceId ?? null,
    datasetId: row.datasetId ?? null,
    providerDocumentId: row.providerDocumentId || null,
    name: row.name,
    sourceType: (row.sourceType === "url" ? "url" : "file") satisfies KnowledgeSourceType,
    sourceUrl: row.sourceUrl || null,
    category: normalizeScope(row.category),
    status: row.status as KnowledgeDocument["status"],
    chunkCount: row.chunkCount,
    parseSummary: (row.parseSummary as Record<string, unknown> | null) || null,
    chunkingOverride: normalizeChunkingConfig(row.chunkingOverride as Record<string, unknown> | null),
    errorMessage: row.errorMessage || null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

function mapChunkRow(row: typeof enterpriseKnowledgeChunks.$inferSelect): KnowledgeChunk {
  return {
    id: row.id,
    documentId: row.documentId,
    providerChunkId: row.providerChunkId || null,
    chunkIndex: row.chunkIndex,
    content: row.content || "",
    excerpt: row.excerpt || row.content || "",
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    questions: Array.isArray(row.questions) ? row.questions : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    status: !row.enabled ? "disabled" : row.edited ? "edited" : "active",
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

type KnowledgeChunkSyncPayload = {
  providerChunkId: string | null
  chunkIndex: number
  content: string
  excerpt: string
  keywords: string[]
  questions: string[]
  tags: string[]
  status: KnowledgeChunk["status"]
}

type KnowledgeChunkRow = typeof enterpriseKnowledgeChunks.$inferSelect

export function mergeKnowledgeChunksWithLocalEdits(
  existingRows: KnowledgeChunkRow[],
  remoteChunks: KnowledgeChunkSyncPayload[],
) {
  const existingByProviderId = new Map(
    existingRows
      .filter((row) => typeof row.providerChunkId === "string" && row.providerChunkId.trim().length > 0)
      .map((row) => [row.providerChunkId as string, row]),
  )
  const existingByChunkIndex = new Map(existingRows.map((row) => [row.chunkIndex, row]))
  const matchedExistingIds = new Set<number>()

  const mergedChunks = remoteChunks.map((chunk) => {
    const matchedRow =
      (chunk.providerChunkId ? existingByProviderId.get(chunk.providerChunkId) : null) ||
      existingByChunkIndex.get(chunk.chunkIndex) ||
      null

    if (matchedRow) {
      matchedExistingIds.add(matchedRow.id)
    }

    const preserveLocalEdit = Boolean(matchedRow?.edited)
    return {
      id: matchedRow?.id || null,
      providerChunkId: chunk.providerChunkId,
      chunkIndex: chunk.chunkIndex,
      content: preserveLocalEdit ? matchedRow?.content || chunk.content : chunk.content,
      excerpt: preserveLocalEdit
        ? matchedRow?.excerpt || matchedRow?.content || chunk.excerpt || chunk.content
        : chunk.excerpt,
      keywords: preserveLocalEdit && Array.isArray(matchedRow?.keywords) ? matchedRow.keywords : chunk.keywords,
      questions: preserveLocalEdit && Array.isArray(matchedRow?.questions) ? matchedRow.questions : chunk.questions,
      tags: preserveLocalEdit && Array.isArray(matchedRow?.tags) ? matchedRow.tags : chunk.tags,
      enabled: preserveLocalEdit ? Boolean(matchedRow?.enabled) : chunk.status !== "disabled",
      edited: preserveLocalEdit ? true : chunk.status === "edited",
    }
  })

  const deletedChunkIds = existingRows
    .filter((row) => !matchedExistingIds.has(row.id))
    .map((row) => row.id)

  return {
    mergedChunks,
    deletedChunkIds,
  }
}

function mapBindingRow(row: typeof enterpriseKnowledgeBindings.$inferSelect): KnowledgeBinding {
  return {
    id: row.id,
    datasetId: row.datasetId,
    targetType: row.targetType as KnowledgeBinding["targetType"],
    enabled: row.enabled,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

export async function getKnowledgeSourceByEnterprise(
  enterpriseId: number,
  providerType: KnowledgeSource["providerType"] = "ragflow",
) {
  const rows = await withKnowledgeDbRetry("get-knowledge-source-by-enterprise", () =>
    db
      .select()
      .from(enterpriseKnowledgeSources)
      .where(
        and(
          eq(enterpriseKnowledgeSources.enterpriseId, enterpriseId),
          eq(enterpriseKnowledgeSources.providerType, providerType),
        ),
      )
      .limit(1),
  )

  return rows[0] ? mapSourceRow(rows[0]) : null
}

export async function saveKnowledgeSource(
  input: Omit<KnowledgeSource, "id" | "lastCheckedAt"> & {
    checkedAt?: Date | null
  },
) {
  const existing = await getKnowledgeSourceByEnterprise(input.enterpriseId, input.providerType)
  const payload = {
    enterpriseId: input.enterpriseId,
    providerType: input.providerType,
    name: input.name,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    status: input.status,
    enabled: input.enabled,
    lastCheckedAt: input.checkedAt ?? null,
    lastError: input.lastError,
    updatedAt: new Date(),
  }

  const existingId = existing?.id
  if (typeof existingId === "number") {
    const rows = await withKnowledgeDbRetry("update-knowledge-source", () =>
      db
        .update(enterpriseKnowledgeSources)
        .set(payload)
        .where(eq(enterpriseKnowledgeSources.id, existingId))
        .returning(),
    )
    return mapSourceRow(rows[0])
  }

  const rows = await withKnowledgeDbRetry("insert-knowledge-source", () =>
    db
      .insert(enterpriseKnowledgeSources)
      .values({
        ...payload,
        createdAt: new Date(),
      })
      .returning(),
  )

  return mapSourceRow(rows[0])
}

export async function listKnowledgeDatasetsByEnterprise(enterpriseId: number) {
  const rows = await withKnowledgeDbRetry("list-knowledge-datasets-by-enterprise", () =>
    db
      .select()
      .from(enterpriseKnowledgeDatasets)
      .where(eq(enterpriseKnowledgeDatasets.enterpriseId, enterpriseId))
      .orderBy(enterpriseKnowledgeDatasets.priority, enterpriseKnowledgeDatasets.name),
  )

  return rows.map(mapDatasetRow)
}

export async function syncKnowledgeDatasets(
  enterpriseId: number,
  sourceId: number,
  datasets: Array<{
    providerDatasetId: string
    name: string
    category?: KnowledgeScope
  }>,
) {
  const existing = await withKnowledgeDbRetry("select-knowledge-datasets-for-sync", () =>
    db
      .select()
      .from(enterpriseKnowledgeDatasets)
      .where(eq(enterpriseKnowledgeDatasets.sourceId, sourceId)),
  )

  const existingByProviderId = new Map(existing.map((row) => [row.providerDatasetId || "", row]))
  const now = new Date()

  for (const dataset of datasets) {
    const match = existingByProviderId.get(dataset.providerDatasetId)
    if (match) {
      await withKnowledgeDbRetry("update-knowledge-dataset-sync", () =>
        db
          .update(enterpriseKnowledgeDatasets)
          .set({
            name: dataset.name,
            category: dataset.category || "general",
            updatedAt: now,
          })
          .where(eq(enterpriseKnowledgeDatasets.id, match.id)),
      )
      continue
    }

    await withKnowledgeDbRetry("insert-knowledge-dataset-sync", () =>
      db.insert(enterpriseKnowledgeDatasets).values({
        enterpriseId,
        sourceId,
        providerDatasetId: dataset.providerDatasetId,
        name: dataset.name,
        category: dataset.category || "general",
        priority: 100,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      }),
    )
  }

  return listKnowledgeDatasetsByEnterprise(enterpriseId)
}

export async function getKnowledgeDatasetById(id: number, enterpriseId: number) {
  const rows = await withKnowledgeDbRetry("get-knowledge-dataset-by-id", () =>
    db
      .select()
      .from(enterpriseKnowledgeDatasets)
      .where(
        and(eq(enterpriseKnowledgeDatasets.id, id), eq(enterpriseKnowledgeDatasets.enterpriseId, enterpriseId)),
      )
      .limit(1),
  )
  return rows[0] ? mapDatasetRow(rows[0]) : null
}

export async function listKnowledgeBindingsForDataset(datasetId: number) {
  const rows = await withKnowledgeDbRetry("list-knowledge-bindings-for-dataset", () =>
    db
      .select()
      .from(enterpriseKnowledgeBindings)
      .where(eq(enterpriseKnowledgeBindings.datasetId, datasetId))
      .orderBy(enterpriseKnowledgeBindings.targetType),
  )
  return rows.map(mapBindingRow)
}

export async function listKnowledgeDocumentsByEnterprise(
  enterpriseId: number,
  filters: {
    status?: KnowledgeDocument["status"] | null
    category?: KnowledgeScope | null
    q?: string | null
  } = {},
) {
  const rows = await withKnowledgeDbRetry("list-knowledge-documents-by-enterprise", async () => {
    const clauses = [eq(enterpriseKnowledgeDocuments.enterpriseId, enterpriseId)]
    if (filters.status) clauses.push(eq(enterpriseKnowledgeDocuments.status, filters.status))
    if (filters.category) clauses.push(eq(enterpriseKnowledgeDocuments.category, filters.category))
    if (filters.q) {
      const q = `%${filters.q.trim()}%`
      clauses.push(sql`${enterpriseKnowledgeDocuments.name} ILIKE ${q}`)
    }

    return db
      .select()
      .from(enterpriseKnowledgeDocuments)
      .where(and(...clauses))
      .orderBy(desc(enterpriseKnowledgeDocuments.updatedAt), desc(enterpriseKnowledgeDocuments.id))
  })

  return rows.map(mapDocumentRow)
}

export async function getKnowledgeDocumentById(id: number, enterpriseId: number) {
  const rows = await withKnowledgeDbRetry("get-knowledge-document-by-id", () =>
    db
      .select()
      .from(enterpriseKnowledgeDocuments)
      .where(
        and(eq(enterpriseKnowledgeDocuments.id, id), eq(enterpriseKnowledgeDocuments.enterpriseId, enterpriseId)),
      )
      .limit(1),
  )
  return rows[0] ? mapDocumentRow(rows[0]) : null
}

export async function deleteKnowledgeDocument(id: number, enterpriseId: number) {
  const rows = await withKnowledgeDbRetry("delete-knowledge-document", () =>
    db
      .delete(enterpriseKnowledgeDocuments)
      .where(
        and(eq(enterpriseKnowledgeDocuments.id, id), eq(enterpriseKnowledgeDocuments.enterpriseId, enterpriseId)),
      )
      .returning(),
  )

  return rows[0] ? mapDocumentRow(rows[0]) : null
}

export async function createKnowledgeDocument(input: {
  enterpriseId: number
  sourceId: number | null
  datasetId: number | null
  providerDocumentId?: string | null
  name: string
  sourceType: KnowledgeSourceType
  sourceUrl?: string | null
  category: KnowledgeScope
  status?: KnowledgeDocument["status"]
  parseSummary?: Record<string, unknown> | null
  chunkingOverride?: KnowledgeChunkingConfig | null
  errorMessage?: string | null
}) {
  const now = new Date()
  const rows = await withKnowledgeDbRetry("create-knowledge-document", () =>
    db
      .insert(enterpriseKnowledgeDocuments)
      .values({
        enterpriseId: input.enterpriseId,
        sourceId: input.sourceId,
        datasetId: input.datasetId,
        providerDocumentId: input.providerDocumentId || null,
        name: input.name,
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl || null,
        category: input.category,
        status: input.status || "uploaded",
        parseSummary: input.parseSummary || null,
        chunkingOverride: input.chunkingOverride || null,
        errorMessage: input.errorMessage || null,
        chunkCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning(),
  )
  return mapDocumentRow(rows[0])
}

export async function updateKnowledgeDocument(
  id: number,
  patch: Partial<{
    providerDocumentId: string | null
    datasetId: number | null
    status: KnowledgeDocument["status"]
    chunkCount: number
    parseSummary: Record<string, unknown> | null
    chunkingOverride: KnowledgeChunkingConfig | null
    errorMessage: string | null
  }>,
) {
  const rows = await withKnowledgeDbRetry("update-knowledge-document", () =>
    db
      .update(enterpriseKnowledgeDocuments)
      .set({
        providerDocumentId: patch.providerDocumentId,
        datasetId: patch.datasetId,
        status: patch.status,
        chunkCount: patch.chunkCount,
        parseSummary: patch.parseSummary,
        chunkingOverride: patch.chunkingOverride,
        errorMessage: patch.errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(enterpriseKnowledgeDocuments.id, id))
      .returning(),
  )
  return rows[0] ? mapDocumentRow(rows[0]) : null
}

export async function listKnowledgeChunksByDocument(documentId: number) {
  const rows = await withKnowledgeDbRetry("list-knowledge-chunks-by-document", () =>
    db
      .select()
      .from(enterpriseKnowledgeChunks)
      .where(eq(enterpriseKnowledgeChunks.documentId, documentId))
      .orderBy(enterpriseKnowledgeChunks.chunkIndex),
  )
  return rows.map(mapChunkRow)
}

export async function getKnowledgeChunkCountsByDocumentIds(documentIds: number[]) {
  if (documentIds.length === 0) {
    return new Map<number, number>()
  }

  const rows = await withKnowledgeDbRetry("get-knowledge-chunk-counts-by-document-ids", () =>
    db
      .select({
        documentId: enterpriseKnowledgeChunks.documentId,
        chunkCount: sql<number>`count(*)::int`,
      })
      .from(enterpriseKnowledgeChunks)
      .where(inArray(enterpriseKnowledgeChunks.documentId, documentIds))
      .groupBy(enterpriseKnowledgeChunks.documentId),
  )

  return new Map(rows.map((row) => [row.documentId, Number(row.chunkCount) || 0]))
}

export async function replaceKnowledgeChunksForDocument(
  documentId: number,
  chunks: KnowledgeChunkSyncPayload[],
) {
  const now = new Date()

  await withKnowledgeDbRetry("replace-knowledge-chunks-for-document", () =>
    db.transaction(async (tx) => {
      const existingRows = await tx
        .select()
        .from(enterpriseKnowledgeChunks)
        .where(eq(enterpriseKnowledgeChunks.documentId, documentId))
      const { mergedChunks } = mergeKnowledgeChunksWithLocalEdits(existingRows, chunks)

      await tx.delete(enterpriseKnowledgeChunks).where(eq(enterpriseKnowledgeChunks.documentId, documentId))
      if (mergedChunks.length === 0) {
        return
      }

      await tx.insert(enterpriseKnowledgeChunks).values(
        mergedChunks.map((chunk) => ({
          documentId,
          providerChunkId: chunk.providerChunkId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          excerpt: chunk.excerpt,
          keywords: chunk.keywords,
          questions: chunk.questions,
          tags: chunk.tags,
          enabled: chunk.enabled,
          edited: chunk.edited,
          createdAt: now,
          updatedAt: now,
        })),
      )
    }),
  )

  return listKnowledgeChunksByDocument(documentId)
}

export async function updateKnowledgeChunkContent(params: {
  documentId: number
  chunkId: number
  content: string
  excerpt?: string | null
}) {
  const normalizedContent = params.content.trim()
  if (!normalizedContent) {
    throw new Error("knowledge_chunk_content_required")
  }

  const rows = await withKnowledgeDbRetry("update-knowledge-chunk-content", () =>
    db
      .update(enterpriseKnowledgeChunks)
      .set({
        content: normalizedContent,
        excerpt: params.excerpt?.trim() || normalizedContent,
        edited: true,
        enabled: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(enterpriseKnowledgeChunks.id, params.chunkId),
          eq(enterpriseKnowledgeChunks.documentId, params.documentId),
        ),
      )
      .returning(),
  )

  return rows[0] ? mapChunkRow(rows[0]) : null
}

export async function getKnowledgeOverview(enterpriseId: number): Promise<KnowledgeOverview> {
  const [sources, datasets, documents] = await Promise.all([
    withKnowledgeDbRetry("overview-sources", () =>
      db
        .select()
        .from(enterpriseKnowledgeSources)
        .where(eq(enterpriseKnowledgeSources.enterpriseId, enterpriseId)),
    ),
    withKnowledgeDbRetry("overview-datasets", () =>
      db
        .select()
        .from(enterpriseKnowledgeDatasets)
        .where(eq(enterpriseKnowledgeDatasets.enterpriseId, enterpriseId)),
    ),
    withKnowledgeDbRetry("overview-documents", () =>
      db
        .select()
        .from(enterpriseKnowledgeDocuments)
        .where(eq(enterpriseKnowledgeDocuments.enterpriseId, enterpriseId)),
    ),
  ])

  const primarySource = sources[0] ? mapSourceRow(sources[0]) : null
  const documentCount = documents.length
  const processingCount = documents.filter((document) =>
    document.status === "uploaded" || document.status === "parsing" || document.status === "reparsing",
  ).length
  const chunkCount = documents.reduce((total, document) => total + document.chunkCount, 0)
  const lastUpdatedAt =
    documents
      .map((document) => toIso(document.updatedAt))
      .filter(Boolean)
      .sort()
      .at(-1) || null

  return {
    source: {
      provider: primarySource?.providerType || "ragflow",
      status: primarySource?.status || "unavailable",
      label:
        primarySource?.status === "healthy"
          ? "RAGFlow 已连接"
          : primarySource?.status === "degraded"
            ? "RAGFlow 连接异常"
            : "RAGFlow 未连接",
      lastCheckedAt: primarySource?.lastCheckedAt || null,
      name: primarySource?.name || null,
    },
    stats: {
      documentCount,
      processingCount,
      chunkCount,
      lastUpdatedAt,
    },
    datasets: {
      total: datasets.length,
      enabled: datasets.filter((dataset) => dataset.enabled).length,
    },
  }
}

export async function listKnowledgeRecentActivity(enterpriseId: number, limit = 5): Promise<KnowledgeRecentActivity[]> {
  const rows = await withKnowledgeDbRetry("list-knowledge-recent-activity", () =>
    db
      .select()
      .from(enterpriseKnowledgeDocuments)
      .where(eq(enterpriseKnowledgeDocuments.enterpriseId, enterpriseId))
      .orderBy(desc(enterpriseKnowledgeDocuments.updatedAt), desc(enterpriseKnowledgeDocuments.id))
      .limit(limit),
  )

  return rows.map((row) => ({
    id: `document-${row.id}`,
    documentId: row.id,
    title: row.name,
    status: row.status as KnowledgeDocument["status"],
    at: toIso(row.updatedAt),
  }))
}

export async function getKnowledgeDocumentDetail(documentId: number, enterpriseId: number) {
  const document = await getKnowledgeDocumentById(documentId, enterpriseId)
  if (!document) return null
  const [dataset, bindings, chunks] = await Promise.all([
    document.datasetId ? getKnowledgeDatasetById(document.datasetId, enterpriseId) : Promise.resolve(null),
    document.datasetId ? listKnowledgeBindingsForDataset(document.datasetId) : Promise.resolve([]),
    listKnowledgeChunksByDocument(documentId),
  ])

  return {
    document,
    dataset,
    bindings,
    chunks,
  }
}
