import { asc, desc, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { createRetryableDbErrorMatcher, withDbRetry } from "@/lib/db/retry"
import { userKnowledgeDatasets, userKnowledgeDocuments } from "@/lib/db/schema"
import { ensureEnterpriseAuthTables } from "@/lib/enterprise/server"
import type { EnterpriseKnowledgeContext, KnowledgeDocumentStatus, KnowledgeScope } from "@/lib/knowledge/types"

export type PersonalKnowledgeDataset = {
  id: number
  userId: number
  enterpriseId: number | null
  name: string
  category: KnowledgeScope
  description: string | null
  enabled: boolean
  metadata: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

export type PersonalKnowledgeDocument = {
  id: number
  datasetId: number
  datasetName: string
  userId: number
  enterpriseId: number | null
  name: string
  sourceType: string
  status: KnowledgeDocumentStatus
  chunkCount: number
  metadata: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

export type PersonalKnowledgeRecentActivity = {
  id: string
  documentId: number
  title: string
  datasetName: string
  status: KnowledgeDocumentStatus
  at: string | null
}

type PersonalKnowledgeRetrievalDocument = Pick<
  PersonalKnowledgeDocument,
  "id" | "datasetId" | "datasetName" | "name" | "metadata" | "updatedAt"
>

const RETRY_DELAYS_MS = [250, 750] as const
const isRetryable = createRetryableDbErrorMatcher(["timeout exceeded"])

async function withPersonalKnowledgeDbRetry<T>(label: string, operation: () => Promise<T>) {
  return withDbRetry(label, operation, {
    retryDelaysMs: RETRY_DELAYS_MS,
    isRetryable,
    logPrefix: "knowledge.personal-datasets.db.retry",
    exhaustedErrorPrefix: "knowledge_personal_datasets_db_retry_exhausted",
  })
}

type GlobalWithEnsureState = typeof globalThis & {
  __aimarketingEnsurePersonalKnowledgeTablesPromise__?: Promise<void> | null
}

const ensureState = globalThis as GlobalWithEnsureState
let ensureTablesPromise = ensureState.__aimarketingEnsurePersonalKnowledgeTablesPromise__ ?? null

export async function ensurePersonalKnowledgeTables() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = (async () => {
      await ensureEnterpriseAuthTables()

      await withPersonalKnowledgeDbRetry("ensure-user-knowledge-datasets-table", () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_user_knowledge_datasets" (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE,
            enterprise_id INTEGER REFERENCES "AI_MARKETING_enterprises"(id) ON DELETE SET NULL,
            name VARCHAR(255) NOT NULL,
            category VARCHAR(32) NOT NULL DEFAULT 'general',
            description TEXT,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            metadata JSONB,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
      )

      await withPersonalKnowledgeDbRetry("ensure-user-knowledge-documents-table", () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_user_knowledge_documents" (
            id SERIAL PRIMARY KEY,
            dataset_id INTEGER NOT NULL REFERENCES "AI_MARKETING_user_knowledge_datasets"(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE,
            enterprise_id INTEGER REFERENCES "AI_MARKETING_enterprises"(id) ON DELETE SET NULL,
            name VARCHAR(255) NOT NULL,
            source_type VARCHAR(24) NOT NULL DEFAULT 'manual',
            source_url TEXT,
            status VARCHAR(24) NOT NULL DEFAULT 'ready',
            chunk_count INTEGER NOT NULL DEFAULT 0,
            metadata JSONB,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
      )

      await withPersonalKnowledgeDbRetry("ensure-user-knowledge-datasets-user-name-index", () =>
        db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_user_knowledge_datasets_user_name_idx"
          ON "AI_MARKETING_user_knowledge_datasets"(user_id, name)
        `),
      )

      await withPersonalKnowledgeDbRetry("ensure-user-knowledge-datasets-user-updated-index", () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_user_knowledge_datasets_user_updated_idx"
          ON "AI_MARKETING_user_knowledge_datasets"(user_id, updated_at DESC)
        `),
      )
    })().catch((error) => {
      ensureTablesPromise = null
      ensureState.__aimarketingEnsurePersonalKnowledgeTablesPromise__ = null
      throw error
    })
    ensureState.__aimarketingEnsurePersonalKnowledgeTablesPromise__ = ensureTablesPromise
  }

  await ensureTablesPromise
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return ""
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : ""
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  const normalized = normalizeText(value, maxLength)
  return normalized || null
}

function normalizeScope(value: unknown): KnowledgeScope {
  if (
    value === "brand" ||
    value === "product" ||
    value === "case-study" ||
    value === "compliance" ||
    value === "campaign"
  ) {
    return value
  }
  return "general"
}

function normalizeDocumentStatus(value: unknown): KnowledgeDocumentStatus {
  if (
    value === "uploaded" ||
    value === "parsing" ||
    value === "ready" ||
    value === "failed" ||
    value === "reparsing" ||
    value === "disabled"
  ) {
    return value
  }
  return "ready"
}

function normalizeMetadata(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

export async function listPersonalKnowledgeDatasets(userId: number) {
  await ensurePersonalKnowledgeTables()
  const rows = await withPersonalKnowledgeDbRetry("personal-knowledge-datasets.list", () =>
    db
      .select()
      .from(userKnowledgeDatasets)
      .where(eq(userKnowledgeDatasets.userId, userId))
      .orderBy(desc(userKnowledgeDatasets.updatedAt), asc(userKnowledgeDatasets.id)),
  )
  return rows.map<PersonalKnowledgeDataset>((row) => ({
    id: row.id,
    userId: row.userId,
    enterpriseId: row.enterpriseId ?? null,
    name: row.name,
    category: normalizeScope(row.category),
    description: row.description ?? null,
    enabled: Boolean(row.enabled),
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

export async function createPersonalKnowledgeDataset(input: {
  userId: number
  enterpriseId?: number | null
  name: string
  category?: KnowledgeScope | null
  description?: string | null
  metadata?: Record<string, unknown> | null
}) {
  await ensurePersonalKnowledgeTables()
  const name = normalizeText(input.name, 255)
  if (!name) throw new Error("knowledge_dataset_name_required")
  const now = new Date()

  const [row] = await withPersonalKnowledgeDbRetry("personal-knowledge-datasets.create", () =>
    db
      .insert(userKnowledgeDatasets)
      .values({
        userId: input.userId,
        enterpriseId: input.enterpriseId ?? null,
        name,
        category: normalizeScope(input.category),
        description: normalizeOptionalText(input.description, 5000),
        enabled: true,
        metadata: normalizeMetadata(input.metadata),
        createdAt: now,
        updatedAt: now,
      })
      .returning(),
  )

  return {
    id: row.id,
    userId: row.userId,
    enterpriseId: row.enterpriseId ?? null,
    name: row.name,
    category: normalizeScope(row.category),
    description: row.description ?? null,
    enabled: Boolean(row.enabled),
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } satisfies PersonalKnowledgeDataset
}

export async function listPersonalKnowledgeDocuments(userId: number, limit = 20) {
  await ensurePersonalKnowledgeTables()
  const rows = await withPersonalKnowledgeDbRetry("personal-knowledge-documents.list", () =>
    db
      .select({
        id: userKnowledgeDocuments.id,
        datasetId: userKnowledgeDocuments.datasetId,
        datasetName: userKnowledgeDatasets.name,
        userId: userKnowledgeDocuments.userId,
        enterpriseId: userKnowledgeDocuments.enterpriseId,
        name: userKnowledgeDocuments.name,
        sourceType: userKnowledgeDocuments.sourceType,
        status: userKnowledgeDocuments.status,
        chunkCount: userKnowledgeDocuments.chunkCount,
        metadata: userKnowledgeDocuments.metadata,
        createdAt: userKnowledgeDocuments.createdAt,
        updatedAt: userKnowledgeDocuments.updatedAt,
      })
      .from(userKnowledgeDocuments)
      .innerJoin(userKnowledgeDatasets, eq(userKnowledgeDocuments.datasetId, userKnowledgeDatasets.id))
      .where(eq(userKnowledgeDocuments.userId, userId))
      .orderBy(desc(userKnowledgeDocuments.updatedAt), desc(userKnowledgeDocuments.id))
      .limit(Math.max(1, Math.min(limit, 100))),
  )

  return rows.map<PersonalKnowledgeDocument>((row) => ({
    id: row.id,
    datasetId: row.datasetId,
    datasetName: row.datasetName,
    userId: row.userId,
    enterpriseId: row.enterpriseId ?? null,
    name: row.name,
    sourceType: row.sourceType,
    status: normalizeDocumentStatus(row.status),
    chunkCount: row.chunkCount,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

export async function listRecentPersonalKnowledgeActivity(userId: number, limit = 5) {
  const documents = await listPersonalKnowledgeDocuments(userId, limit)
  return documents.map<PersonalKnowledgeRecentActivity>((document) => ({
    id: `personal-${document.id}`,
    documentId: document.id,
    title: document.name,
    datasetName: document.datasetName,
    status: document.status,
    at: document.updatedAt?.toISOString?.() || null,
  }))
}

export async function createPersonalKnowledgeDocument(input: {
  userId: number
  enterpriseId?: number | null
  datasetId: number
  name: string
  sourceType?: string | null
  status?: KnowledgeDocumentStatus | null
  contentMarkdown?: string | null
  metadata?: Record<string, unknown> | null
}) {
  await ensurePersonalKnowledgeTables()

  const name = normalizeText(input.name, 255)
  if (!name) throw new Error("personal_knowledge_document_name_required")

  const [dataset] = await withPersonalKnowledgeDbRetry("personal-knowledge-datasets.select-one", () =>
    db
      .select()
      .from(userKnowledgeDatasets)
      .where(eq(userKnowledgeDatasets.id, input.datasetId))
      .limit(1),
  )
  if (!dataset || dataset.userId !== input.userId) {
    throw new Error("personal_knowledge_dataset_not_found")
  }

  const metadata = normalizeMetadata(input.metadata) ?? {}
  if (typeof input.contentMarkdown === "string" && input.contentMarkdown.trim()) {
    metadata.contentMarkdown = input.contentMarkdown.slice(0, 50000)
    metadata.contentPreview = input.contentMarkdown.slice(0, 5000)
  }

  const now = new Date()
  const [row] = await withPersonalKnowledgeDbRetry("personal-knowledge-documents.create", () =>
    db
      .insert(userKnowledgeDocuments)
      .values({
        datasetId: dataset.id,
        userId: input.userId,
        enterpriseId: input.enterpriseId ?? dataset.enterpriseId ?? null,
        name,
        sourceType: normalizeText(input.sourceType ?? "workflow", 24) || "workflow",
        sourceUrl: null,
        status: normalizeDocumentStatus(input.status ?? "ready"),
        chunkCount: typeof input.contentMarkdown === "string" && input.contentMarkdown.trim() ? 1 : 0,
        metadata,
        createdAt: now,
        updatedAt: now,
      })
      .returning(),
  )

  return {
    id: row.id,
    datasetId: row.datasetId,
    datasetName: dataset.name,
    userId: row.userId,
    enterpriseId: row.enterpriseId ?? null,
    name: row.name,
    sourceType: row.sourceType,
    status: normalizeDocumentStatus(row.status),
    chunkCount: row.chunkCount,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } satisfies PersonalKnowledgeDocument
}

function extractPersonalKnowledgeContent(metadata: Record<string, unknown> | null) {
  if (!metadata) return ""
  if (typeof metadata.contentMarkdown === "string" && metadata.contentMarkdown.trim()) {
    return metadata.contentMarkdown
  }
  if (typeof metadata.contentPreview === "string" && metadata.contentPreview.trim()) {
    return metadata.contentPreview
  }
  return ""
}

function scorePersonalKnowledgeMatch(content: string, queryTokens: string[]) {
  if (!content.trim() || queryTokens.length === 0) return 0
  const haystack = content.toLowerCase()
  let score = 0
  for (const token of queryTokens) {
    if (!token) continue
    if (haystack.includes(token)) score += 1
  }
  return score
}

export function buildPersonalKnowledgeRetrievalContext(input: {
  documents: PersonalKnowledgeRetrievalDocument[]
  query: string
  preferredDatasetIds?: number[]
  topK?: number
}): EnterpriseKnowledgeContext | null {
  const normalizedQuery = input.query.trim().toLowerCase()
  if (!normalizedQuery) return null

  const preferredDatasetIds = new Set(
    (input.preferredDatasetIds ?? []).filter((item): item is number => Number.isInteger(item) && item > 0),
  )
  const queryTokens = [...new Set(normalizedQuery.split(/\s+/).map((token) => token.trim()).filter(Boolean))]
  const topK = Math.max(1, Math.min(input.topK ?? 4, 10))

  const ranked = input.documents
    .filter((document) => preferredDatasetIds.size === 0 || preferredDatasetIds.has(document.datasetId))
    .map((document) => {
      const content = extractPersonalKnowledgeContent(document.metadata)
      return {
        document,
        content,
        score: scorePersonalKnowledgeMatch(`${document.name}\n${content}`, queryTokens),
      }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.document.updatedAt.getTime() - left.document.updatedAt.getTime())
    .slice(0, topK)

  if (ranked.length === 0) return null

  const datasetsUsedMap = new Map<number, { datasetId: string; datasetName: string; scope: KnowledgeScope }>()
  for (const item of ranked) {
    if (!datasetsUsedMap.has(item.document.datasetId)) {
      datasetsUsedMap.set(item.document.datasetId, {
        datasetId: `personal:${item.document.datasetId}`,
        datasetName: item.document.datasetName,
        scope: "general",
      })
    }
  }

  return {
    source: "hybrid",
    datasetsUsed: [...datasetsUsedMap.values()],
    snippets: ranked.map((item) => ({
      datasetId: `personal:${item.document.datasetId}`,
      datasetName: item.document.datasetName,
      scope: "general",
      score: item.score,
      title: item.document.name,
      content: item.content.slice(0, 1200),
    })),
  }
}

export async function loadPersonalKnowledgeContext(params: {
  userId: number
  query: string
  preferredDatasetIds?: number[]
  topK?: number
}) {
  const documents = await listPersonalKnowledgeDocuments(params.userId, 100)
  return buildPersonalKnowledgeRetrievalContext({
    documents,
    query: params.query,
    preferredDatasetIds: params.preferredDatasetIds,
    topK: params.topK,
  })
}
