import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let source: any = null
let datasets: any[] = []
let documents: any[] = []
let overview: any = null
let recentActivity: any[] = []
let documentDetail: any = null
let difyStatus: any = { enabled: false, datasetCount: 0, source: "dify" }
let difyContext: any = null
let ragflowRetrieveResult: any = null
let ragflowRemoteDocuments: any[] = []
let ragflowRemoteChunks: any[] = []
let documentUpdates: Array<{ id: number; patch: Record<string, unknown> }> = []
let replacedChunkSets: Array<{ documentId: number; chunks: Record<string, unknown>[] }> = []
let updatedChunkEdit: any = null
let deletedDocumentArgs: any = null
let datasetDetail: any = null
let deletedRemoteDocument: any = null
let ragflowRetrieveArgs: any = null
let ragflowRemoteDatasets: Array<{ id: string; name: string }> = []
let migratedRemoteDocument: any = null
let createdRemoteDatasetArgs: any = null
let savedSourceRows: any[] = []

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only") {
    return {}
  }
  if (request === "@/lib/knowledge/repository") {
    return {
      getKnowledgeSourceByEnterprise: async () => source,
      listKnowledgeDatasetsByEnterprise: async () => datasets,
      saveKnowledgeSource: async (payload: any) => {
        savedSourceRows.push(payload)
        source = {
          ...(source || {}),
          ...payload,
          id: source?.id ?? 10,
          providerType: payload.providerType || source?.providerType || "ragflow",
          enabled: typeof payload.enabled === "boolean" ? payload.enabled : (source?.enabled ?? true),
          lastCheckedAt: payload.checkedAt?.toISOString?.() || payload.checkedAt || null,
        }
        return source
      },
      syncKnowledgeDatasets: async (enterpriseId: number, sourceId: number, syncedDatasets: Array<{ providerDatasetId: string; name: string; category?: string }>) => {
        datasets = syncedDatasets.map((dataset, index) => ({
          id: index + 1,
          enterpriseId,
          sourceId,
          providerDatasetId: dataset.providerDatasetId,
          name: dataset.name,
          category: dataset.category || "general",
          enabled: true,
        }))
        return datasets
      },
      getKnowledgeDatasetById: async () => datasetDetail,
      createKnowledgeDocument: async () => null,
      deleteKnowledgeDocument: async (documentId: number, enterpriseId: number) => {
        deletedDocumentArgs = { documentId, enterpriseId }
        const document = documents.find((item) => item.id === documentId)
        return document || documentDetail?.document || null
      },
      getKnowledgeChunkCountsByDocumentIds: async (documentIds: number[]) =>
        new Map(
          documentIds.map((documentId) => {
            const count = documentDetail?.document?.id === documentId ? documentDetail.chunks.length : 0
            return [documentId, count]
          }),
        ),
      listKnowledgeChunksByDocument: async () => documentDetail?.chunks || [],
      replaceKnowledgeChunksForDocument: async (documentId: number, chunks: Record<string, unknown>[]) => {
        replacedChunkSets.push({ documentId, chunks })
        if (documentDetail?.document?.id === documentId) {
          documentDetail = {
            ...documentDetail,
            chunks,
          }
        }
        return chunks
      },
      updateKnowledgeChunkContent: async (args: Record<string, unknown>) => {
        updatedChunkEdit = args
        const chunk = documentDetail?.chunks?.find((item: any) => item.id === args.chunkId)
        return chunk
          ? {
              ...chunk,
              content: args.content,
              excerpt: args.excerpt || args.content,
              status: "edited",
            }
          : null
      },
      updateKnowledgeDocument: async (id: number, patch: Record<string, unknown>) => {
        documentUpdates.push({ id, patch })
        documents = documents.map((document) => (document.id === id ? { ...document, ...patch } : document))
        if (documentDetail?.document?.id === id) {
          documentDetail = {
            ...documentDetail,
            document: {
              ...documentDetail.document,
              ...patch,
            },
          }
        }
        return documents.find((document) => document.id === id) || null
      },
      getKnowledgeDocumentDetail: async () => documentDetail,
      getKnowledgeOverview: async () => overview,
      listKnowledgeDocumentsByEnterprise: async () => documents,
      listKnowledgeRecentActivity: async () => recentActivity,
    }
  }
  if (request === "@/lib/dify/enterprise-knowledge") {
    return {
      getEnterpriseDifyKnowledgeStatus: async () => difyStatus,
      loadEnterpriseKnowledgeContext: async () => difyContext,
    }
  }
  if (request === "@/lib/knowledge/providers/ragflow") {
    return {
      ragflowKnowledgeProvider: {
        type: "ragflow",
        testConnection: async () => ({
          ok: true,
          status: "healthy",
          message: "ok",
          checkedAt: new Date("2026-06-12T00:00:00Z").toISOString(),
          remoteDatasetCount: 2,
        }),
        retrieve: async (args: unknown) => {
          ragflowRetrieveArgs = args
          return ragflowRetrieveResult
        },
        listRemoteDatasets: async () => ragflowRemoteDatasets,
        createRemoteDataset: async (args: unknown) => {
          createdRemoteDatasetArgs = args
          const row = args as { name?: string }
          return {
            providerDatasetId: "ds_created_1",
            name: typeof row?.name === "string" && row.name.trim() ? row.name.trim() : "Campaign Ops",
          }
        },
        listRemoteDocuments: async () => ragflowRemoteDocuments,
        listRemoteChunks: async () => ragflowRemoteChunks,
        migrateDocument: async (args: unknown) => {
          migratedRemoteDocument = args
          return {
            providerDocumentId: "doc_migrated_1",
            status: "parsing",
            parseSummary: null,
          }
        },
        deleteDocument: async (args: unknown) => {
          deletedRemoteDocument = args
        },
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let getEnterpriseKnowledgeStatus: typeof import("./service").getEnterpriseKnowledgeStatus
let loadEnterpriseKnowledgeContext: typeof import("./service").loadEnterpriseKnowledgeContext
let getKnowledgeWorkspaceSnapshot: typeof import("./service").getKnowledgeWorkspaceSnapshot
let listKnowledgeDatasetsSnapshot: typeof import("./service").listKnowledgeDatasetsSnapshot
let createKnowledgeDataset: typeof import("./service").createKnowledgeDataset
let refreshKnowledgeSourceConnection: typeof import("./service").refreshKnowledgeSourceConnection
let ensureEnterpriseDefaultKnowledgeWorkspace: typeof import("./service").ensureEnterpriseDefaultKnowledgeWorkspace
let saveKnowledgeDocumentChunkEdit: typeof import("./service").saveKnowledgeDocumentChunkEdit
let removeKnowledgeDocument: typeof import("./service").removeKnowledgeDocument
let migrateKnowledgeDocumentDataset: typeof import("./service").migrateKnowledgeDocumentDataset

test.before(async () => {
  const service = await import("./service")
  getEnterpriseKnowledgeStatus = service.getEnterpriseKnowledgeStatus
  loadEnterpriseKnowledgeContext = service.loadEnterpriseKnowledgeContext
  getKnowledgeWorkspaceSnapshot = service.getKnowledgeWorkspaceSnapshot
  listKnowledgeDatasetsSnapshot = service.listKnowledgeDatasetsSnapshot
  createKnowledgeDataset = service.createKnowledgeDataset
  refreshKnowledgeSourceConnection = service.refreshKnowledgeSourceConnection
  ensureEnterpriseDefaultKnowledgeWorkspace = service.ensureEnterpriseDefaultKnowledgeWorkspace
  saveKnowledgeDocumentChunkEdit = service.saveKnowledgeDocumentChunkEdit
  removeKnowledgeDocument = service.removeKnowledgeDocument
  migrateKnowledgeDocumentDataset = service.migrateKnowledgeDocumentDataset
})

test.beforeEach(() => {
  source = null
  datasets = []
  documents = []
  overview = null
  recentActivity = []
  documentDetail = null
  difyStatus = { enabled: false, datasetCount: 0, source: "dify" }
  difyContext = null
  ragflowRetrieveResult = null
  ragflowRemoteDocuments = []
  ragflowRemoteChunks = []
  documentUpdates = []
  replacedChunkSets = []
  updatedChunkEdit = null
  deletedDocumentArgs = null
  datasetDetail = null
  deletedRemoteDocument = null
  ragflowRetrieveArgs = null
  ragflowRemoteDatasets = []
  migratedRemoteDocument = null
  createdRemoteDatasetArgs = null
  savedSourceRows = []
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("enterprise knowledge status prefers ragflow when a healthy source and enabled datasets exist", async () => {
  source = {
    id: 10,
    enterpriseId: 7,
    providerType: "ragflow",
    name: "RAGFlow Enterprise Knowledge",
    baseUrl: "https://ragflow.example.com",
    apiKey: "secret",
    status: "healthy",
    enabled: true,
    lastCheckedAt: null,
    lastError: null,
  }
  datasets = [
    { id: 1, category: "brand", enabled: true },
    { id: 2, category: "general", enabled: true },
  ]

  const status = await getEnterpriseKnowledgeStatus(7)

  assert.equal(status.enabled, true)
  assert.equal(status.datasetCount, 2)
  assert.equal(status.source, "ragflow")
  assert.equal(status.profile?.hasGeneralDataset, true)
})

test("enterprise knowledge status falls back to dify when ragflow is not configured", async () => {
  difyStatus = { enabled: true, datasetCount: 3, source: "dify" }

  const status = await getEnterpriseKnowledgeStatus(7)

  assert.equal(status.enabled, true)
  assert.equal(status.datasetCount, 3)
  assert.equal(status.source, "dify")
})

test("loadEnterpriseKnowledgeContext prefers ragflow retrieval when available", async () => {
  source = {
    id: 10,
    enterpriseId: 7,
    providerType: "ragflow",
    name: "RAGFlow Enterprise Knowledge",
    baseUrl: "https://ragflow.example.com",
    apiKey: "secret",
    status: "healthy",
    enabled: true,
    lastCheckedAt: null,
    lastError: null,
  }
  ragflowRetrieveResult = {
    source: "ragflow",
    datasetsUsed: [{ datasetId: "ds_1", datasetName: "Brand", scope: "brand" }],
    snippets: [{ datasetId: "ds_1", datasetName: "Brand", scope: "brand", score: 0.92, title: "Brand", content: "Brand facts" }],
  }

  const context = await loadEnterpriseKnowledgeContext({
    enterpriseId: 7,
    query: "brand facts",
  })

  assert.equal(context?.source, "ragflow")
  assert.equal(context?.snippets.length, 1)
})

test("loadEnterpriseKnowledgeContext forwards preferred dataset ids to ragflow retrieval", async () => {
  source = {
    id: 10,
    enterpriseId: 7,
    providerType: "ragflow",
    name: "RAGFlow Enterprise Knowledge",
    baseUrl: "https://ragflow.example.com",
    apiKey: "secret",
    status: "healthy",
    enabled: true,
    lastCheckedAt: null,
    lastError: null,
  }
  ragflowRetrieveResult = {
    source: "ragflow",
    datasetsUsed: [{ datasetId: "ds_1", datasetName: "Brand", scope: "brand" }],
    snippets: [{ datasetId: "ds_1", datasetName: "Brand", scope: "brand", score: 0.92, title: "Brand", content: "Brand facts" }],
  }

  await loadEnterpriseKnowledgeContext({
    enterpriseId: 7,
    query: "brand facts",
    preferredDatasetIds: [11, 12],
  })

  assert.deepEqual(ragflowRetrieveArgs?.preferredDatasetIds, [11, 12])
})

test("loadEnterpriseKnowledgeContext falls back to dify context when ragflow returns null", async () => {
  difyContext = {
    source: "dify",
    datasetsUsed: [{ datasetId: "legacy", datasetName: "Legacy", scope: "general" }],
    snippets: [{ datasetId: "legacy", datasetName: "Legacy", scope: "general", score: 0.8, title: "Legacy", content: "Legacy facts" }],
  }

  const context = await loadEnterpriseKnowledgeContext({
    enterpriseId: 7,
    query: "legacy facts",
  })

  assert.equal(context?.source, "dify")
  assert.equal(context?.snippets[0]?.content, "Legacy facts")
})

test("getKnowledgeWorkspaceSnapshot syncs processing document states from ragflow before returning", async () => {
  source = {
    id: 10,
    enterpriseId: 7,
    providerType: "ragflow",
    name: "RAGFlow Enterprise Knowledge",
    baseUrl: "https://ragflow.example.com",
    apiKey: "secret",
    status: "healthy",
    enabled: true,
    lastCheckedAt: null,
    lastError: null,
  }
  datasets = [{ id: 2, providerDatasetId: "ds_2", category: "general", enabled: true }]
  documents = [
    {
      id: 11,
      datasetId: 2,
      providerDocumentId: "doc_11",
      name: "Report.docx",
      status: "parsing",
      chunkCount: 0,
      parseSummary: null,
      errorMessage: null,
    },
  ]
  overview = {
    source: { provider: "ragflow", status: "healthy", label: "RAGFlow 已连接", lastCheckedAt: null, name: "RAGFlow" },
    stats: { documentCount: 1, processingCount: 1, chunkCount: 0, lastUpdatedAt: null },
    datasets: { total: 1, enabled: 1 },
  }
  recentActivity = []
  ragflowRemoteDocuments = [
    {
      providerDocumentId: "doc_11",
      status: "ready",
      chunkCount: 26,
      parseSummary: { run: "DONE", progress: 1, chunkCount: 26 },
      errorMessage: null,
    },
  ]
  ragflowRemoteChunks = [
    {
      providerChunkId: "chunk_1",
      chunkIndex: 1,
      content: "Brand facts",
      excerpt: "Brand facts",
      keywords: [],
      questions: [],
      tags: [],
      status: "active",
    },
  ]

  const snapshot = await getKnowledgeWorkspaceSnapshot(7)

  assert.equal(documentUpdates.length, 2)
  assert.deepEqual(documentUpdates[0], {
    id: 11,
    patch: {
      status: "ready",
      chunkCount: 26,
      parseSummary: { run: "DONE", progress: 1, chunkCount: 26 },
    },
  })
  assert.deepEqual(documentUpdates[1], {
    id: 11,
    patch: {
      chunkCount: 1,
    },
  })
  assert.equal(replacedChunkSets.length, 1)
  assert.equal(replacedChunkSets[0]?.documentId, 11)
  assert.equal(snapshot.documents[0]?.status, "ready")
  assert.equal(snapshot.documents[0]?.chunkCount, 1)
})

test("getKnowledgeDocumentSnapshot backfills missing local chunks for ready documents", async () => {
  source = {
    id: 10,
    enterpriseId: 7,
    providerType: "ragflow",
    name: "RAGFlow Enterprise Knowledge",
    baseUrl: "https://ragflow.example.com",
    apiKey: "secret",
    status: "healthy",
    enabled: true,
    lastCheckedAt: null,
    lastError: null,
  }
  datasets = [{ id: 2, providerDatasetId: "ds_2", name: "General", category: "general", enabled: true }]
  documentDetail = {
    document: {
      id: 21,
      enterpriseId: 7,
      sourceId: 10,
      datasetId: 2,
      providerDocumentId: "doc_21",
      name: "General.docx",
      sourceType: "file",
      sourceUrl: null,
      category: "general",
      status: "ready",
      chunkCount: 2,
      parseSummary: null,
      chunkingOverride: null,
      errorMessage: null,
      createdAt: null,
      updatedAt: null,
    },
    dataset: datasets[0],
    bindings: [],
    chunks: [],
  }
  ragflowRemoteChunks = [
    {
      providerChunkId: "chunk_1",
      chunkIndex: 1,
      content: "Chunk A",
      excerpt: "Chunk A",
      keywords: [],
      questions: [],
      tags: [],
      status: "active",
    },
    {
      providerChunkId: "chunk_2",
      chunkIndex: 2,
      content: "Chunk B",
      excerpt: "Chunk B",
      keywords: [],
      questions: [],
      tags: [],
      status: "active",
    },
  ]

  const service = await import("./service")
  const detail = await service.getKnowledgeDocumentSnapshot(21, 7)

  assert.equal(replacedChunkSets.length, 1)
  assert.equal(replacedChunkSets[0]?.chunks.length, 2)
  assert.equal(detail?.chunks.length, 2)
  assert.equal(detail?.chunks[0]?.content, "Chunk A")
})

test("getKnowledgeWorkspaceSnapshot backfills chunk rows for ready documents with missing local chunks", async () => {
  source = {
    id: 10,
    enterpriseId: 7,
    providerType: "ragflow",
    name: "RAGFlow Enterprise Knowledge",
    baseUrl: "https://ragflow.example.com",
    apiKey: "secret",
    status: "healthy",
    enabled: true,
    lastCheckedAt: null,
    lastError: null,
  }
  datasets = [{ id: 2, providerDatasetId: "ds_2", category: "general", enabled: true }]
  documents = [
    {
      id: 31,
      datasetId: 2,
      providerDocumentId: "doc_31",
      name: "Ready.docx",
      status: "ready",
      chunkCount: 2,
      parseSummary: null,
      errorMessage: null,
    },
  ]
  overview = {
    source: { provider: "ragflow", status: "healthy", label: "RAGFlow 已连接", lastCheckedAt: null, name: "RAGFlow" },
    stats: { documentCount: 1, processingCount: 0, chunkCount: 2, lastUpdatedAt: null },
    datasets: { total: 1, enabled: 1 },
  }
  recentActivity = []
  ragflowRemoteDocuments = [
    {
      providerDocumentId: "doc_31",
      status: "ready",
      chunkCount: 2,
      parseSummary: { run: "DONE", progress: 1, chunkCount: 2 },
      errorMessage: null,
    },
  ]
  ragflowRemoteChunks = [
    {
      providerChunkId: "chunk_1",
      chunkIndex: 1,
      content: "Chunk A",
      excerpt: "Chunk A",
      keywords: [],
      questions: [],
      tags: [],
      status: "active",
    },
    {
      providerChunkId: "chunk_2",
      chunkIndex: 2,
      content: "Chunk B",
      excerpt: "Chunk B",
      keywords: [],
      questions: [],
      tags: [],
      status: "active",
    },
  ]

  await getKnowledgeWorkspaceSnapshot(7)

  assert.equal(replacedChunkSets.length, 1)
  assert.equal(replacedChunkSets[0]?.documentId, 31)
  assert.equal(replacedChunkSets[0]?.chunks.length, 2)
})

test("listKnowledgeDatasetsSnapshot creates an isolated default dataset when the local dataset table is empty", async () => {
  source = {
    id: 10,
    enterpriseId: 7,
    providerType: "ragflow",
    name: "RAGFlow Enterprise Knowledge",
    baseUrl: "https://ragflow.example.com",
    apiKey: "secret",
    status: "healthy",
    enabled: true,
    lastCheckedAt: null,
    lastError: null,
  }
  datasets = []
  ragflowRemoteDatasets = [
    { id: "ds_general", name: "General" },
    { id: "ds_brand", name: "Brand" },
  ]

  const snapshot = await listKnowledgeDatasetsSnapshot(7)

  assert.equal(snapshot.length, 1)
  assert.equal(snapshot[0]?.providerDatasetId, "ds_created_1")
  assert.equal(snapshot[0]?.name, "Enterprise 7 Knowledge Base")
  assert.equal(snapshot[0]?.enabled, true)
  assert.equal(createdRemoteDatasetArgs.name, "Enterprise 7 Knowledge Base")
  assert.equal(createdRemoteDatasetArgs.category, "general")
})

test("ensureEnterpriseDefaultKnowledgeWorkspace reuses the enterprise-matched remote dataset when it already exists", async () => {
  source = {
    id: 10,
    enterpriseId: 7,
    providerType: "ragflow",
    name: "RAGFlow Enterprise Knowledge",
    baseUrl: "https://ragflow.example.com",
    apiKey: "secret",
    status: "healthy",
    enabled: true,
    lastCheckedAt: null,
    lastError: null,
  }
  ragflowRemoteDatasets = [
    { id: "ds_general", name: "General" },
    { id: "ds_enterprise_7", name: "Enterprise 7 Knowledge Base" },
  ]

  const result = await ensureEnterpriseDefaultKnowledgeWorkspace(7)

  assert.equal(result.datasets.length, 1)
  assert.equal(result.datasets[0]?.providerDatasetId, "ds_enterprise_7")
  assert.equal(createdRemoteDatasetArgs, null)
})

test("createKnowledgeDataset creates a remote ragflow dataset and persists the synced local record", async () => {
  source = {
    id: 10,
    enterpriseId: 7,
    providerType: "ragflow",
    name: "RAGFlow Enterprise Knowledge",
    baseUrl: "https://ragflow.example.com",
    apiKey: "secret",
    status: "healthy",
    enabled: true,
    lastCheckedAt: null,
    lastError: null,
  }

  const dataset = await createKnowledgeDataset({
    enterpriseId: 7,
    name: "Campaign Ops",
    category: "campaign",
    chunkMethod: "manual",
    description: "Campaign playbooks and assets",
  })

  assert.equal(createdRemoteDatasetArgs.name, "Campaign Ops")
  assert.equal(createdRemoteDatasetArgs.chunkMethod, "manual")
  assert.equal(createdRemoteDatasetArgs.description, "Campaign playbooks and assets")
  assert.equal(dataset.providerDatasetId, "ds_created_1")
  assert.equal(dataset.category, "campaign")
  assert.equal(dataset.name, "Campaign Ops")
})

test("createKnowledgeDataset persists env-backed source before syncing the new dataset", async () => {
  source = {
    id: null,
    enterpriseId: 7,
    providerType: "ragflow",
    name: "RAGFlow Enterprise Knowledge",
    baseUrl: "https://ragflow.example.com",
    apiKey: "secret",
    status: "healthy",
    enabled: true,
    lastCheckedAt: null,
    lastError: null,
  }

  const dataset = await createKnowledgeDataset({
    enterpriseId: 7,
    name: "Brand KB",
    category: "brand",
    chunkMethod: "naive",
  })

  assert.equal(savedSourceRows.length, 1)
  assert.equal(savedSourceRows[0]?.enterpriseId, 7)
  assert.equal(createdRemoteDatasetArgs.source.id, 10)
  assert.equal(dataset.providerDatasetId, "ds_created_1")
})

test("refreshKnowledgeSourceConnection persists healthy status and ensures only the isolated default dataset", async () => {
  source = {
    id: 10,
    enterpriseId: 7,
    providerType: "ragflow",
    name: "RAGFlow Enterprise Knowledge",
    baseUrl: "https://ragflow.example.com",
    apiKey: "secret",
    status: "degraded",
    enabled: true,
    lastCheckedAt: null,
    lastError: "old_error",
  }
  ragflowRemoteDatasets = [
    { id: "ds_general", name: "General" },
  ]

  const result = await refreshKnowledgeSourceConnection({
    enterpriseId: 7,
  })

  assert.equal(result.test.ok, true)
  assert.equal(result.source.status, "healthy")
  assert.equal(datasets.length, 1)
  assert.equal(datasets[0]?.providerDatasetId, "ds_created_1")
  assert.equal(datasets[0]?.name, "Enterprise 7 Knowledge Base")
  assert.equal(createdRemoteDatasetArgs.name, "Enterprise 7 Knowledge Base")
})

test("saveKnowledgeDocumentChunkEdit preserves enterprise boundary and marks the chunk as edited", async () => {
  documentDetail = {
    document: {
      id: 41,
      enterpriseId: 9,
      sourceId: 10,
      datasetId: 2,
      providerDocumentId: "doc_41",
      name: "Edited.docx",
      sourceType: "file",
      sourceUrl: null,
      category: "general",
      status: "ready",
      chunkCount: 1,
      parseSummary: null,
      chunkingOverride: null,
      errorMessage: null,
      createdAt: null,
      updatedAt: null,
    },
    dataset: null,
    bindings: [],
    chunks: [
      {
        id: 8,
        documentId: 41,
        chunkIndex: 1,
        content: "Original chunk",
        excerpt: "Original chunk",
        status: "active",
      },
    ],
  }

  const chunk = await saveKnowledgeDocumentChunkEdit({
    documentId: 41,
    chunkId: 8,
    enterpriseId: 9,
    content: "Manual rewrite",
    excerpt: "Manual rewrite",
  })

  assert.equal(updatedChunkEdit.documentId, 41)
  assert.equal(updatedChunkEdit.chunkId, 8)
  assert.equal(chunk.content, "Manual rewrite")
  assert.equal(chunk.status, "edited")
})

test("migrateKnowledgeDocumentDataset copies remote document to target dataset and clears local chunks", async () => {
  source = {
    id: 10,
    enterpriseId: 9,
    providerType: "ragflow",
    name: "RAGFlow Enterprise Knowledge",
    baseUrl: "https://ragflow.example.com",
    apiKey: "secret",
    status: "healthy",
    enabled: true,
    lastCheckedAt: null,
    lastError: null,
  }
  datasetDetail = { id: 8, providerDatasetId: "ds_8", name: "Campaign", category: "campaign", enabled: true }
  documentDetail = {
    document: {
      id: 52,
      enterpriseId: 9,
      sourceId: 10,
      datasetId: 2,
      providerDocumentId: "doc_52",
      name: "Move me.pdf",
      sourceType: "file",
      sourceUrl: null,
      category: "general",
      status: "ready",
      chunkCount: 3,
      parseSummary: { run: "DONE" },
      chunkingOverride: null,
      errorMessage: null,
      createdAt: null,
      updatedAt: null,
    },
    dataset: { id: 2, providerDatasetId: "ds_2", name: "General", category: "general", enabled: true },
    bindings: [],
    chunks: [
      { id: 1, documentId: 52, chunkIndex: 1, content: "a", excerpt: "a", status: "active" },
    ],
  }
  documents = [documentDetail.document]

  const migrated = await migrateKnowledgeDocumentDataset(52, 9, 8)

  assert.equal(migratedRemoteDocument.fromDataset.id, 2)
  assert.equal(migratedRemoteDocument.toDataset.id, 8)
  assert.deepEqual(replacedChunkSets.at(-1), { documentId: 52, chunks: [] })
  assert.deepEqual(documentUpdates.at(-1), {
    id: 52,
    patch: {
      datasetId: 8,
      providerDocumentId: "doc_migrated_1",
      status: "parsing",
      chunkCount: 0,
      parseSummary: null,
      errorMessage: null,
    },
  })
  assert.equal(deletedRemoteDocument.dataset.id, 2)
  assert.equal(migrated.datasetId, 8)
})

test("removeKnowledgeDocument deletes remote ragflow document before removing local record", async () => {
  source = {
    id: 10,
    enterpriseId: 9,
    providerType: "ragflow",
    name: "RAGFlow Enterprise Knowledge",
    baseUrl: "https://ragflow.example.com",
    apiKey: "secret",
    status: "healthy",
    enabled: true,
    lastCheckedAt: null,
    lastError: null,
  }
  datasetDetail = { id: 2, providerDatasetId: "ds_2", name: "General", category: "general", enabled: true }
  documentDetail = {
    document: {
      id: 55,
      enterpriseId: 9,
      sourceId: 10,
      datasetId: 2,
      providerDocumentId: "doc_55",
      name: "Delete me.docx",
      sourceType: "file",
      sourceUrl: null,
      category: "general",
      status: "ready",
      chunkCount: 1,
      parseSummary: null,
      chunkingOverride: null,
      errorMessage: null,
      createdAt: null,
      updatedAt: null,
    },
    dataset: datasetDetail,
    bindings: [],
    chunks: [],
  }
  documents = [documentDetail.document]

  const deleted = await removeKnowledgeDocument(55, 9)

  assert.equal(deletedRemoteDocument.document.providerDocumentId, "doc_55")
  assert.deepEqual(deletedDocumentArgs, { documentId: 55, enterpriseId: 9 })
  assert.equal(deleted.id, 55)
})
