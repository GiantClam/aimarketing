import "server-only"

import {
  getEnterpriseDifyKnowledgeStatus,
  loadEnterpriseKnowledgeContext as loadDifyEnterpriseKnowledgeContext,
} from "@/lib/dify/enterprise-knowledge"
import type { KnowledgeProvider } from "@/lib/knowledge/provider"
import {
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  listKnowledgeBindingsForDataset,
  getKnowledgeDatasetById,
  getKnowledgeChunkCountsByDocumentIds,
  getKnowledgeDocumentDetail,
  getKnowledgeOverview,
  getKnowledgeSourceByEnterprise,
  listKnowledgeDatasetsByEnterprise,
  listKnowledgeDocumentsByEnterprise,
  listKnowledgeRecentActivity,
  replaceKnowledgeChunksForDocument,
  saveKnowledgeSource,
  syncKnowledgeDatasets,
  updateKnowledgeChunkContent,
  updateKnowledgeDocument,
} from "@/lib/knowledge/repository"
import { ragflowKnowledgeProvider } from "@/lib/knowledge/providers/ragflow"
import type {
  EnterpriseKnowledgeContext,
  KnowledgeChunkingConfig,
  KnowledgeDataset,
  KnowledgeDocument,
  KnowledgeOverview,
  KnowledgeRecentActivity,
  KnowledgeScope,
  KnowledgeSource,
  KnowledgeSourceClientState,
  KnowledgeSourceTestResult,
} from "@/lib/knowledge/types"

const DEFAULT_SOURCE_NAME = "RAGFlow Enterprise Knowledge"
const DEFAULT_RAGFLOW_DATASET_CATEGORY: KnowledgeScope = "general"

function isProcessingDocumentStatus(status: KnowledgeDocument["status"]) {
  return status === "uploaded" || status === "parsing" || status === "reparsing"
}

function buildDefaultRagflowDatasetName(enterpriseId: number) {
  return `Enterprise ${enterpriseId} Knowledge Base`
}

function buildDefaultRagflowDatasetDescription(enterpriseId: number) {
  return `Default isolated knowledge dataset for enterprise ${enterpriseId}.`
}

async function syncKnowledgeDocumentsFromProvider(enterpriseId: number) {
  const source = await getKnowledgeSource(enterpriseId)
  if (!source?.enabled) return

  const provider = getProviderForType(source.providerType)
  if (!provider.listRemoteDocuments) return

  const documents = await listKnowledgeDocumentsByEnterprise(enterpriseId)
  const chunkCounts = await getKnowledgeChunkCountsByDocumentIds(documents.map((document) => document.id))
  const candidateDocuments = documents.filter(
    (document) =>
      Boolean(document.datasetId && document.providerDocumentId) &&
      (isProcessingDocumentStatus(document.status) ||
        (document.status === "ready" && (chunkCounts.get(document.id) || 0) !== document.chunkCount) ||
        (document.status === "failed" && (chunkCounts.get(document.id) || 0) > 0)),
  )
  if (candidateDocuments.length === 0) return

  const datasets = await listKnowledgeDatasetsByEnterprise(enterpriseId)
  const datasetMap = new Map(datasets.map((dataset) => [dataset.id, dataset]))
  const groups = new Map<number, typeof candidateDocuments>()

  for (const document of candidateDocuments) {
    const datasetId = document.datasetId
    if (!datasetId) continue
    const bucket = groups.get(datasetId) || []
    bucket.push(document)
    groups.set(datasetId, bucket)
  }

  for (const [datasetId, datasetDocuments] of groups) {
    const dataset = datasetMap.get(datasetId)
    if (!dataset?.providerDatasetId) continue

    const remoteDocuments = await provider.listRemoteDocuments({ source, dataset })
    const remoteMap = new Map(remoteDocuments.map((document) => [document.providerDocumentId, document]))

    for (const document of datasetDocuments) {
      if (!document.providerDocumentId) continue
      const localChunkCount = chunkCounts.get(document.id) || 0
      const remote = remoteMap.get(document.providerDocumentId)
      if (!remote) continue

      const patch: Partial<{
        status: KnowledgeDocument["status"]
        chunkCount: number
        parseSummary: Record<string, unknown> | null
        errorMessage: string | null
      }> = {}

      if (remote.status !== document.status) {
        patch.status = remote.status
      }
      if (remote.chunkCount !== document.chunkCount) {
        patch.chunkCount = remote.chunkCount
      }

      const nextSummary = remote.parseSummary || null
      if (JSON.stringify(nextSummary) !== JSON.stringify(document.parseSummary || null)) {
        patch.parseSummary = nextSummary
      }

      const nextError = remote.status === "failed" ? remote.errorMessage || "ragflow_document_parse_failed" : null
      if ((document.errorMessage || null) !== nextError) {
        patch.errorMessage = nextError
      }

      if (Object.keys(patch).length > 0) {
        await updateKnowledgeDocument(document.id, patch)
      }

      if (remote.status === "ready" && provider.listRemoteChunks && localChunkCount !== remote.chunkCount) {
        const remoteChunks = await provider.listRemoteChunks({
          source,
          dataset,
          document: {
            ...document,
            status: remote.status,
            chunkCount: remote.chunkCount,
            parseSummary: remote.parseSummary || null,
            errorMessage: remote.errorMessage || null,
          },
        })
        await replaceKnowledgeChunksForDocument(document.id, remoteChunks)
        if (remote.chunkCount !== remoteChunks.length) {
          await updateKnowledgeDocument(document.id, {
            chunkCount: remoteChunks.length,
          })
        }
      } else if (remote.status === "failed" && provider.listRemoteChunks && localChunkCount > 0) {
        await replaceKnowledgeChunksForDocument(document.id, [])
      }
    }
  }
}

async function syncKnowledgeDocumentChunksForDetail(params: {
  enterpriseId: number
  source: KnowledgeSource
  dataset: NonNullable<Awaited<ReturnType<typeof getKnowledgeDatasetById>>>
  detail: NonNullable<Awaited<ReturnType<typeof getKnowledgeDocumentDetail>>>
}) {
  const { source, dataset, detail } = params
  const provider = getProviderForType(source.providerType)
  if (!provider.listRemoteChunks || !detail.document.providerDocumentId) {
    return detail
  }

  const shouldPullRemoteChunks =
    detail.document.status === "ready" && detail.chunks.length !== detail.document.chunkCount
  const shouldClearLocalChunks =
    detail.document.status !== "ready" && detail.document.chunkCount === 0 && detail.chunks.length > 0

  if (!shouldPullRemoteChunks && !shouldClearLocalChunks) {
    return detail
  }

  if (shouldClearLocalChunks) {
    await replaceKnowledgeChunksForDocument(detail.document.id, [])
    return getKnowledgeDocumentDetail(detail.document.id, params.enterpriseId)
  }

  const remoteChunks = await provider.listRemoteChunks({
    source,
    dataset,
    document: detail.document,
  })
  await replaceKnowledgeChunksForDocument(detail.document.id, remoteChunks)
  if (detail.document.chunkCount !== remoteChunks.length) {
    await updateKnowledgeDocument(detail.document.id, {
      chunkCount: remoteChunks.length,
    })
  }
  return getKnowledgeDocumentDetail(detail.document.id, params.enterpriseId)
}

async function resolveActiveDataset(enterpriseId: number, datasetId?: number | null) {
  const explicitDataset =
    typeof datasetId === "number" ? await getKnowledgeDatasetById(datasetId, enterpriseId) : null
  if (explicitDataset) return explicitDataset

  const datasets = await listKnowledgeDatasetsWithAutoSync(enterpriseId)
  return datasets.find((item) => item.enabled) || null
}

function buildEnvSource(enterpriseId: number): KnowledgeSource | null {
  const baseUrl = process.env.RAGFLOW_BASE_URL?.trim() || ""
  const apiKey = process.env.RAGFLOW_API_KEY?.trim() || ""
  if (!baseUrl || !apiKey) return null
  return {
    id: null,
    enterpriseId,
    providerType: "ragflow",
    name: DEFAULT_SOURCE_NAME,
    baseUrl,
    apiKey,
    status: "degraded",
    enabled: true,
    lastCheckedAt: null,
    lastError: null,
  }
}

function getProviderForType(type: KnowledgeSource["providerType"]): KnowledgeProvider {
  if (type === "ragflow") return ragflowKnowledgeProvider
  throw new Error(`knowledge_provider_unsupported:${type}`)
}

async function ensurePersistedKnowledgeSource(source: KnowledgeSource) {
  if (typeof source.id === "number") {
    return source
  }

  return saveKnowledgeSource({
    enterpriseId: source.enterpriseId,
    providerType: source.providerType,
    name: source.name,
    baseUrl: source.baseUrl,
    apiKey: source.apiKey,
    status: source.status,
    enabled: source.enabled,
    lastError: source.lastError,
    checkedAt: source.lastCheckedAt ? new Date(source.lastCheckedAt) : null,
  })
}

async function ensureDefaultRagflowDatasetForEnterprise(enterpriseId: number, requestSource?: KnowledgeSource | null) {
  const localDatasets = await listKnowledgeDatasetsByEnterprise(enterpriseId)
  if (localDatasets.length > 0) {
    return localDatasets
  }

  const source = requestSource ?? (await getKnowledgeSource(enterpriseId))
  if (!source?.enabled) {
    return localDatasets
  }

  const provider = getProviderForType(source.providerType)
  if (!provider.createRemoteDataset || !provider.listRemoteDatasets) {
    return localDatasets
  }

  const persistedSource = await ensurePersistedKnowledgeSource(source)
  const expectedDatasetName = buildDefaultRagflowDatasetName(enterpriseId)
  const remoteDatasets = await provider.listRemoteDatasets(persistedSource)
  const matchedRemoteDataset = remoteDatasets.find((dataset) => dataset.name.trim() === expectedDatasetName)
  const targetDataset = matchedRemoteDataset
    ? {
        providerDatasetId: matchedRemoteDataset.id,
        name: matchedRemoteDataset.name,
      }
    : await provider.createRemoteDataset({
        source: persistedSource,
        name: expectedDatasetName,
        description: buildDefaultRagflowDatasetDescription(enterpriseId),
        chunkMethod: "naive",
        category: DEFAULT_RAGFLOW_DATASET_CATEGORY,
      })

  return syncKnowledgeDatasets(enterpriseId, persistedSource.id || 0, [
    {
      providerDatasetId: targetDataset.providerDatasetId,
      name: targetDataset.name,
      category: DEFAULT_RAGFLOW_DATASET_CATEGORY,
    },
  ])
}

async function listKnowledgeDatasetsWithAutoSync(enterpriseId: number) {
  const localDatasets = await listKnowledgeDatasetsByEnterprise(enterpriseId)
  if (localDatasets.length > 0) return localDatasets

  return ensureDefaultRagflowDatasetForEnterprise(enterpriseId)
}

export async function getKnowledgeSource(enterpriseId: number) {
  const storedSource = await getKnowledgeSourceByEnterprise(enterpriseId, "ragflow")
  if (storedSource) return storedSource
  return buildEnvSource(enterpriseId)
}

export function toKnowledgeSourceClientState(source: KnowledgeSource | null): KnowledgeSourceClientState | null {
  if (!source) return null
  return {
    id: source.id,
    enterpriseId: source.enterpriseId,
    providerType: source.providerType,
    name: source.name,
    baseUrl: source.baseUrl,
    status: source.status,
    enabled: source.enabled,
    lastCheckedAt: source.lastCheckedAt,
    lastError: source.lastError,
    apiKeyConfigured: Boolean(source.apiKey),
  }
}

export async function listKnowledgeDatasetsSnapshot(enterpriseId: number) {
  const datasets = await listKnowledgeDatasetsWithAutoSync(enterpriseId)
  return datasets.filter((dataset) => dataset.enabled)
}

export async function listKnowledgeDatasetsGovernanceSnapshot(enterpriseId: number) {
  const datasets = await listKnowledgeDatasetsSnapshot(enterpriseId)
  return Promise.all(
    datasets.map(async (dataset) => ({
      ...dataset,
      bindings: await listKnowledgeBindingsForDataset(dataset.id),
    })),
  )
}

export async function createKnowledgeDataset(params: {
  enterpriseId: number
  name: string
  category: KnowledgeScope
  chunkMethod?: string | null
  description?: string | null
}) {
  const source = await getKnowledgeSource(params.enterpriseId)
  if (!source || !source.enabled) {
    throw new Error("knowledge_source_not_configured")
  }

  const persistedSource =
    typeof source.id === "number"
      ? source
      : await saveKnowledgeSource({
          enterpriseId: source.enterpriseId,
          providerType: source.providerType,
          name: source.name,
          baseUrl: source.baseUrl,
          apiKey: source.apiKey,
          status: source.status,
          enabled: source.enabled,
          lastError: source.lastError,
          checkedAt: source.lastCheckedAt ? new Date(source.lastCheckedAt) : null,
        })

  const provider = getProviderForType(persistedSource.providerType)
  if (!provider.createRemoteDataset) {
    throw new Error("knowledge_dataset_create_not_supported")
  }

  const created = await provider.createRemoteDataset({
    source: persistedSource,
    name: params.name.trim(),
    category: params.category,
    chunkMethod: params.chunkMethod,
    description: params.description,
  })

  const datasets = await syncKnowledgeDatasets(
    params.enterpriseId,
    persistedSource.id || 0,
    [
      {
        providerDatasetId: created.providerDatasetId,
        name: created.name,
        category: params.category,
      },
    ],
  )

  const dataset = datasets.find((item) => item.providerDatasetId === created.providerDatasetId)
  if (!dataset) {
    throw new Error("knowledge_dataset_sync_failed")
  }

  return dataset
}

export async function getEnterpriseKnowledgeStatus(enterpriseId: number | null | undefined) {
  if (!enterpriseId || enterpriseId <= 0) {
    return { enabled: false, datasetCount: 0 as number }
  }

  const [source, datasets] = await Promise.all([
    getKnowledgeSource(enterpriseId),
    listKnowledgeDatasetsByEnterprise(enterpriseId).catch(() => []),
  ])
  const enabledDatasets = datasets.filter((dataset) => dataset.enabled)
  if (source?.enabled && enabledDatasets.length > 0) {
    return {
      enabled: true,
      datasetCount: enabledDatasets.length,
      source: "ragflow" as const,
      profile: {
        configuredScopes: [...new Set(enabledDatasets.map((dataset) => dataset.category))],
        datasetScopeCounts: enabledDatasets.reduce<Partial<Record<KnowledgeScope, number>>>((acc, dataset) => {
          acc[dataset.category] = (acc[dataset.category] || 0) + 1
          return acc
        }, {}),
        primaryScope:
          enabledDatasets.length === 1
            ? enabledDatasets[0]?.category || "unknown"
            : enabledDatasets.length > 1
              ? "mixed"
              : "unknown",
        hasGeneralDataset: enabledDatasets.some((dataset) => dataset.category === "general"),
      },
    }
  }

  return getEnterpriseDifyKnowledgeStatus(enterpriseId)
}

export async function testKnowledgeSourceConnection(source: KnowledgeSource): Promise<KnowledgeSourceTestResult> {
  const provider = getProviderForType(source.providerType)
  return provider.testConnection(source)
}

export async function refreshKnowledgeSourceConnection(params: {
  enterpriseId: number
  requestSource?: KnowledgeSource | null
  persist?: boolean
  syncDatasets?: boolean
}) {
  const source = params.requestSource ?? (await getKnowledgeSource(params.enterpriseId))
  if (!source) {
    throw new Error("knowledge_source_not_configured")
  }

  const result = await testKnowledgeSourceConnection(source)
  const shouldPersist = params.persist !== false

  const syncedSource = shouldPersist
    ? await saveKnowledgeSource({
        enterpriseId: source.enterpriseId,
        providerType: source.providerType,
        name: source.name,
        baseUrl: source.baseUrl.trim(),
        apiKey: source.apiKey,
        status: result.status,
        enabled: source.enabled,
        lastError: result.ok ? null : result.message,
        checkedAt: new Date(result.checkedAt),
      })
    : {
        ...source,
        status: result.status,
        lastCheckedAt: result.checkedAt,
        lastError: result.ok ? null : result.message,
      }

  if (result.ok && shouldPersist && params.syncDatasets !== false) {
    await ensureDefaultRagflowDatasetForEnterprise(params.enterpriseId, syncedSource)
  }

  return {
    source: syncedSource,
    test: result,
  }
}

export async function saveRagflowKnowledgeSource(params: {
  enterpriseId: number
  name?: string | null
  baseUrl: string
  apiKey?: string
  enabled?: boolean
}) {
  const existing = await getKnowledgeSource(params.enterpriseId)
  const nextApiKey = params.apiKey?.trim() || existing?.apiKey || ""
  const result = await refreshKnowledgeSourceConnection({
    enterpriseId: params.enterpriseId,
    persist: true,
    syncDatasets: true,
    requestSource: {
      id: null,
      enterpriseId: params.enterpriseId,
      providerType: "ragflow",
      name: params.name?.trim() || DEFAULT_SOURCE_NAME,
      baseUrl: params.baseUrl,
      apiKey: nextApiKey,
      status: "degraded",
      enabled: params.enabled !== false,
      lastCheckedAt: null,
      lastError: null,
    },
  })

  return result
}

export async function ensureEnterpriseDefaultKnowledgeWorkspace(enterpriseId: number) {
  const source = await getKnowledgeSource(enterpriseId)
  if (!source?.enabled) {
    return { source: null, datasets: [] as KnowledgeDataset[] }
  }

  const persistedSource = await ensurePersistedKnowledgeSource(source)
  const datasets = await ensureDefaultRagflowDatasetForEnterprise(enterpriseId, persistedSource)
  return {
    source: persistedSource,
    datasets,
  }
}

export async function getKnowledgeWorkspaceSnapshot(enterpriseId: number): Promise<{
  overview: KnowledgeOverview
  documents: KnowledgeDocument[]
  recentActivity: KnowledgeRecentActivity[]
}> {
  await syncKnowledgeDocumentsFromProvider(enterpriseId).catch((error) => {
    console.warn("knowledge.service.sync.failed", {
      enterpriseId,
      message: error instanceof Error ? error.message : String(error),
    })
  })

  const [overview, documents, recentActivity] = await Promise.all([
    getKnowledgeOverview(enterpriseId),
    listKnowledgeDocumentsByEnterprise(enterpriseId),
    listKnowledgeRecentActivity(enterpriseId),
  ])

  return {
    overview,
    documents,
    recentActivity,
  }
}

export async function listKnowledgeDocumentsSnapshot(
  enterpriseId: number,
  filters: Parameters<typeof listKnowledgeDocumentsByEnterprise>[1] = {},
) {
  await syncKnowledgeDocumentsFromProvider(enterpriseId).catch((error) => {
    console.warn("knowledge.service.sync.failed", {
      enterpriseId,
      message: error instanceof Error ? error.message : String(error),
    })
  })

  return listKnowledgeDocumentsByEnterprise(enterpriseId, filters)
}

export async function ingestKnowledgeFile(params: {
  enterpriseId: number
  datasetId?: number | null
  category: KnowledgeScope
  fileName: string
  contentType: string
  bytes: Buffer
}) {
  const source = await getKnowledgeSource(params.enterpriseId)
  if (!source || !source.enabled) {
    throw new Error("knowledge_source_not_configured")
  }

  const dataset = await resolveActiveDataset(params.enterpriseId, params.datasetId)

  if (!dataset) {
    throw new Error("knowledge_dataset_required")
  }

  const provider = getProviderForType(source.providerType)
  const uploaded = provider.uploadDocument
    ? await provider.uploadDocument({
        source,
        dataset,
        fileName: params.fileName,
        contentType: params.contentType,
        bytes: params.bytes,
      })
    : {
        providerDocumentId: null,
        status: "uploaded" as KnowledgeDocument["status"],
        parseSummary: null,
      }

  return createKnowledgeDocument({
    enterpriseId: params.enterpriseId,
    sourceId: source.id,
    datasetId: dataset.id,
    providerDocumentId: uploaded.providerDocumentId,
    name: params.fileName,
    sourceType: "file",
    category: params.category,
    status: uploaded.status,
    parseSummary: uploaded.parseSummary || null,
  })
}

export async function ingestKnowledgeUrl(params: {
  enterpriseId: number
  datasetId?: number | null
  category: KnowledgeScope
  url: string
}) {
  const title = params.url.trim()
  if (!title) {
    throw new Error("knowledge_url_required")
  }

  const source = await getKnowledgeSource(params.enterpriseId)
  const dataset = source?.enabled ? await resolveActiveDataset(params.enterpriseId, params.datasetId) : null

  if (source?.enabled && !dataset) {
    throw new Error("knowledge_dataset_required")
  }

  const provider = source?.enabled ? getProviderForType(source.providerType) : null
  const uploaded =
    source?.enabled && dataset && provider?.uploadWebDocument
      ? await provider.uploadWebDocument({
          source,
          dataset,
          name: title,
          url: params.url.trim(),
        })
      : null

  return createKnowledgeDocument({
    enterpriseId: params.enterpriseId,
    sourceId: source?.id || null,
    datasetId: dataset?.id || params.datasetId || null,
    providerDocumentId: uploaded?.providerDocumentId || null,
    name: title,
    sourceType: "url",
    sourceUrl: params.url.trim(),
    category: params.category,
    status: uploaded?.status || (source?.enabled ? "uploaded" : "failed"),
    parseSummary: uploaded?.parseSummary || null,
    errorMessage: source?.enabled ? null : "knowledge_source_not_configured",
  })
}

export async function getKnowledgeDocumentSnapshot(documentId: number, enterpriseId: number) {
  await syncKnowledgeDocumentsFromProvider(enterpriseId).catch((error) => {
    console.warn("knowledge.service.sync.failed", {
      enterpriseId,
      documentId,
      message: error instanceof Error ? error.message : String(error),
    })
  })

  const detail = await getKnowledgeDocumentDetail(documentId, enterpriseId)
  if (!detail || !detail.dataset) {
    return detail
  }

  const source = await getKnowledgeSource(enterpriseId)
  if (!source?.enabled) {
    return detail
  }

  return syncKnowledgeDocumentChunksForDetail({
    enterpriseId,
    source,
    dataset: detail.dataset,
    detail,
  }).catch((error) => {
    console.warn("knowledge.service.chunk-sync.failed", {
      enterpriseId,
      documentId,
      message: error instanceof Error ? error.message : String(error),
    })
    return detail
  })
}

export type KnowledgeDocumentSnapshot = NonNullable<
  Awaited<ReturnType<typeof getKnowledgeDocumentSnapshot>>
>

export async function updateKnowledgeDocumentChunking(
  documentId: number,
  enterpriseId: number,
  chunkingOverride: KnowledgeChunkingConfig,
) {
  const detail = await getKnowledgeDocumentDetail(documentId, enterpriseId)
  if (!detail) {
    throw new Error("knowledge_document_not_found")
  }

  return updateKnowledgeDocument(documentId, {
    chunkingOverride,
  })
}

export async function requestKnowledgeDocumentReparse(documentId: number, enterpriseId: number) {
  const detail = await getKnowledgeDocumentDetail(documentId, enterpriseId)
  if (!detail) {
    throw new Error("knowledge_document_not_found")
  }

  const source = detail.document.sourceId
    ? await getKnowledgeSource(enterpriseId)
    : await getKnowledgeSource(enterpriseId)
  if (!source || !source.enabled) {
    throw new Error("knowledge_source_not_configured")
  }

  const dataset =
    detail.dataset ||
    (detail.document.datasetId ? await getKnowledgeDatasetById(detail.document.datasetId, enterpriseId) : null)
  if (!dataset) {
    throw new Error("knowledge_dataset_required")
  }

  const provider = getProviderForType(source.providerType)
  if (!provider.reparseDocument) {
    throw new Error("knowledge_reparse_not_supported")
  }

  const result = await provider.reparseDocument({
    source,
    dataset,
    document: detail.document,
  })

  return updateKnowledgeDocument(documentId, {
    status: result.status,
    parseSummary: result.parseSummary || detail.document.parseSummary,
    errorMessage: null,
  })
}

export async function migrateKnowledgeDocumentDataset(
  documentId: number,
  enterpriseId: number,
  targetDatasetId: number,
) {
  const detail = await getKnowledgeDocumentDetail(documentId, enterpriseId)
  if (!detail) {
    throw new Error("knowledge_document_not_found")
  }

  const source = await getKnowledgeSource(enterpriseId)
  if (!source || !source.enabled) {
    throw new Error("knowledge_source_not_configured")
  }

  const fromDataset =
    detail.dataset ||
    (detail.document.datasetId ? await getKnowledgeDatasetById(detail.document.datasetId, enterpriseId) : null)
  if (!fromDataset) {
    throw new Error("knowledge_dataset_required")
  }

  const toDataset = await getKnowledgeDatasetById(targetDatasetId, enterpriseId)
  if (!toDataset || !toDataset.enabled) {
    throw new Error("knowledge_dataset_not_found")
  }

  if (fromDataset.id === toDataset.id) {
    return detail.document
  }

  const provider = getProviderForType(source.providerType)
  if (!provider.migrateDocument) {
    throw new Error("knowledge_document_migration_not_supported")
  }

  const migrated = await provider.migrateDocument({
    source,
    fromDataset,
    toDataset,
    document: detail.document,
  })

  await replaceKnowledgeChunksForDocument(documentId, [])
  const updated = await updateKnowledgeDocument(documentId, {
    datasetId: toDataset.id,
    providerDocumentId: migrated.providerDocumentId,
    status: migrated.status,
    chunkCount: 0,
    parseSummary: migrated.parseSummary || null,
    errorMessage: null,
  })

  if (detail.document.providerDocumentId && provider.deleteDocument) {
    provider.deleteDocument({
      source,
      dataset: fromDataset,
      document: detail.document,
    }).catch((error) => {
      console.warn("knowledge.service.migrate.cleanup_failed", {
        enterpriseId,
        documentId,
        fromDatasetId: fromDataset.id,
        message: error instanceof Error ? error.message : String(error),
      })
    })
  }

  if (!updated) {
    throw new Error("knowledge_document_not_found")
  }

  return updated
}

export async function saveKnowledgeDocumentChunkEdit(params: {
  documentId: number
  chunkId: number
  enterpriseId: number
  content: string
  excerpt?: string | null
}) {
  const detail = await getKnowledgeDocumentDetail(params.documentId, params.enterpriseId)
  if (!detail) {
    throw new Error("knowledge_document_not_found")
  }

  const chunk = await updateKnowledgeChunkContent({
    documentId: params.documentId,
    chunkId: params.chunkId,
    content: params.content,
    excerpt: params.excerpt,
  })

  if (!chunk) {
    throw new Error("knowledge_chunk_not_found")
  }

  return chunk
}

export async function removeKnowledgeDocument(documentId: number, enterpriseId: number) {
  const detail = await getKnowledgeDocumentDetail(documentId, enterpriseId)
  if (!detail) {
    throw new Error("knowledge_document_not_found")
  }

  const source = detail.document.sourceId ? await getKnowledgeSource(enterpriseId) : null
  const dataset =
    detail.dataset ||
    (detail.document.datasetId ? await getKnowledgeDatasetById(detail.document.datasetId, enterpriseId) : null)

  if (source?.enabled && dataset?.providerDatasetId && detail.document.providerDocumentId) {
    const provider = getProviderForType(source.providerType)
    if (provider.deleteDocument) {
      await provider.deleteDocument({
        source,
        dataset,
        document: detail.document,
      })
    }
  }

  const deleted = await deleteKnowledgeDocument(documentId, enterpriseId)
  if (!deleted) {
    throw new Error("knowledge_document_not_found")
  }

  return deleted
}

export async function loadEnterpriseKnowledgeContext(params: {
  enterpriseId: number | null | undefined
  query: string
  queryVariants?: string[]
  preferredScopes?: string[]
  preferredDatasetIds?: number[]
  topK?: number
  scoreThreshold?: number
  platform?: string
  mode?: string
}): Promise<EnterpriseKnowledgeContext | null> {
  if (typeof params.enterpriseId !== "number" || params.enterpriseId <= 0) {
    return null
  }
  const enterpriseId = params.enterpriseId
  const source = await getKnowledgeSource(enterpriseId)
  if (source?.enabled) {
    try {
      const provider = getProviderForType(source.providerType)
      const result = await provider.retrieve({
        ...params,
        enterpriseId,
      })
      if (result) return result
    } catch (error) {
      console.warn("knowledge.service.retrieve.failed", {
        enterpriseId,
        provider: source.providerType,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return loadDifyEnterpriseKnowledgeContext({
    enterpriseId,
    query: params.query,
    queryVariants: params.queryVariants,
    preferredScopes: (params.preferredScopes || []).filter(
      (scope): scope is "general" | "brand" | "product" | "case-study" | "compliance" | "campaign" =>
        scope === "general" ||
        scope === "brand" ||
        scope === "product" ||
        scope === "case-study" ||
        scope === "compliance" ||
        scope === "campaign",
    ),
    platform: "generic",
    mode: "article",
  })
}
