import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

import type { KnowledgeDataset, KnowledgeSource } from "@/lib/knowledge/types"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load
const originalFetch = global.fetch

let source: KnowledgeSource | null = null
let datasets: KnowledgeDataset[] = []
let fetchCalls: Array<{ url: string; init?: RequestInit }> = []
let fetchQueue: Array<{ ok: boolean; status: number; body: unknown }> = []

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only") {
    return {}
  }
  if (request === "@/lib/knowledge/repository") {
    return {
      getKnowledgeSourceByEnterprise: async () => source,
      listKnowledgeDatasetsByEnterprise: async () => datasets,
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const next = fetchQueue.shift()
  if (!next) {
    throw new Error("unexpected_fetch_call")
  }

  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
  fetchCalls.push({ url, init })

  return {
    ok: next.ok,
    status: next.status,
    json: async () => next.body,
  } as Response
}) as typeof fetch

let ragflowKnowledgeProvider: typeof import("./ragflow").ragflowKnowledgeProvider

const baseSource: KnowledgeSource = {
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

const baseDataset: KnowledgeDataset = {
  id: 21,
  enterpriseId: 7,
  sourceId: 10,
  providerDatasetId: "ds_1",
  name: "Brand",
  category: "brand",
  priority: 100,
  enabled: true,
  chunkingConfig: null,
  retrievalConfig: null,
  createdAt: null,
  updatedAt: null,
}

test.before(async () => {
  const module = await import("./ragflow")
  ragflowKnowledgeProvider = module.ragflowKnowledgeProvider
})

test.beforeEach(() => {
  source = { ...baseSource }
  datasets = [{ ...baseDataset }]
  fetchCalls = []
  fetchQueue = []
})

test.after(() => {
  nodeModule._load = originalLoad
  global.fetch = originalFetch
})

test("ragflow provider parses retrieval chunks from object response", async () => {
  fetchQueue.push({
    ok: true,
    status: 200,
    body: {
      code: 0,
      data: {
        chunks: [
          {
            dataset_id: "ds_1",
            dataset_name: "Brand",
            document_name: "Brand Handbook",
            content: "Brand facts",
            similarity: 0.93,
          },
        ],
      },
    },
  })

  const result = await ragflowKnowledgeProvider.retrieve({
    enterpriseId: 7,
    query: "brand facts",
  })

  assert.equal(fetchCalls.length, 1)
  assert.match(fetchCalls[0]?.url || "", /\/api\/v1\/retrieval$/)
  assert.equal(result?.source, "ragflow")
  assert.equal(result?.snippets[0]?.content, "Brand facts")
  assert.equal(result?.snippets[0]?.score, 0.93)
  assert.equal(result?.datasetsUsed[0]?.datasetId, "ds_1")
})

test("ragflow provider isolates datasets with incompatible embedding models", async () => {
  datasets = [
    { ...baseDataset, id: 21, providerDatasetId: "ds_1", name: "Brand" },
    { ...baseDataset, id: 22, providerDatasetId: "ds_2", name: "Legacy" },
  ]
  fetchQueue.push(
    {
      ok: true,
      status: 200,
      body: { code: 0, data: { chunks: [{ dataset_id: "ds_1", content: "Brand facts", similarity: 0.92 }] } },
    },
    {
      ok: false,
      status: 400,
      body: { code: 100, message: "Datasets use different embedding models." },
    },
  )

  const result = await ragflowKnowledgeProvider.retrieve({ enterpriseId: 7, query: "brand facts" })

  assert.equal(fetchCalls.length, 2)
  assert.deepEqual(JSON.parse(String(fetchCalls[0]?.init?.body)).dataset_ids, ["ds_1"])
  assert.deepEqual(JSON.parse(String(fetchCalls[1]?.init?.body)).dataset_ids, ["ds_2"])
  assert.equal(result?.snippets[0]?.content, "Brand facts")
})

test("ragflow provider aborts a dataset retrieval after the configured timeout", async () => {
  datasets = [{ ...baseDataset }]
  const previousTimeout = process.env.RAGFLOW_RETRIEVAL_TIMEOUT_MS
  process.env.RAGFLOW_RETRIEVAL_TIMEOUT_MS = "1000"
  const originalFetchImpl = global.fetch
  global.fetch = (async (_input, init) => {
    await new Promise<void>((resolve, reject) => {
      const signal = init?.signal
      if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"))
      signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })
    })
    throw new Error("unexpected_fetch_completion")
  }) as typeof fetch
  try {
    assert.equal(await ragflowKnowledgeProvider.retrieve({ enterpriseId: 7, query: "slow" }), null)
  } finally {
    global.fetch = originalFetchImpl
    if (previousTimeout === undefined) delete process.env.RAGFLOW_RETRIEVAL_TIMEOUT_MS
    else process.env.RAGFLOW_RETRIEVAL_TIMEOUT_MS = previousTimeout
  }
})

test("ragflow provider uploadDocument triggers parse after upload", async () => {
  fetchQueue.push(
    {
      ok: true,
      status: 200,
      body: {
        code: 0,
        data: [{ id: "doc_1" }],
      },
    },
    {
      ok: true,
      status: 200,
      body: {
        code: 0,
        data: true,
      },
    },
  )

  const result = await ragflowKnowledgeProvider.uploadDocument?.({
    source: baseSource,
    dataset: baseDataset,
    fileName: "brand.txt",
    contentType: "text/plain",
    bytes: Buffer.from("brand facts"),
  })

  assert.equal(fetchCalls.length, 2)
  assert.match(fetchCalls[0]?.url || "", /\/api\/v1\/datasets\/ds_1\/documents$/)
  assert.match(fetchCalls[1]?.url || "", /\/api\/v1\/datasets\/ds_1\/chunks$/)
  assert.equal(result?.providerDocumentId, "doc_1")
  assert.equal(result?.status, "parsing")

  const parsePayload = JSON.parse(String(fetchCalls[1]?.init?.body || "{}"))
  assert.deepEqual(parsePayload.document_ids, ["doc_1"])
})

test("ragflow provider uploadDocument falls back to dataset documents when upload response omits ids", async () => {
  fetchQueue.push(
    {
      ok: true,
      status: 200,
      body: {
        code: 0,
        data: [{ name: "brand.txt" }],
      },
    },
    {
      ok: true,
      status: 200,
      body: {
        code: 0,
        data: {
          docs: [{ id: "doc_fallback_1", name: "brand.txt", update_time: 2 }],
        },
      },
    },
    {
      ok: true,
      status: 200,
      body: {
        code: 0,
        data: true,
      },
    },
  )

  const result = await ragflowKnowledgeProvider.uploadDocument?.({
    source: baseSource,
    dataset: baseDataset,
    fileName: "brand.txt",
    contentType: "text/plain",
    bytes: Buffer.from("brand facts"),
  })

  assert.equal(fetchCalls.length, 3)
  assert.match(fetchCalls[1]?.url || "", /\/api\/v1\/datasets\/ds_1\/documents\?page=1&page_size=100$/)
  assert.match(fetchCalls[2]?.url || "", /\/api\/v1\/datasets\/ds_1\/chunks$/)
  assert.equal(result?.providerDocumentId, "doc_fallback_1")

  const parsePayload = JSON.parse(String(fetchCalls[2]?.init?.body || "{}"))
  assert.deepEqual(parsePayload.document_ids, ["doc_fallback_1"])
})

test("ragflow provider uploadWebDocument posts a web document then triggers parse", async () => {
  fetchQueue.push(
    {
      ok: true,
      status: 200,
      body: {
        code: 0,
        data: [{ id: "doc_web_1" }],
      },
    },
    {
      ok: true,
      status: 200,
      body: {
        code: 0,
        data: true,
      },
    },
  )

  const result = await ragflowKnowledgeProvider.uploadWebDocument?.({
    source: baseSource,
    dataset: baseDataset,
    name: "https://example.com/brand",
    url: "https://example.com/brand",
  })

  assert.equal(fetchCalls.length, 2)
  const uploadPayload = JSON.parse(String(fetchCalls[0]?.init?.body || "{}"))
  assert.equal(uploadPayload.type, "web")
  assert.equal(uploadPayload.url, "https://example.com/brand")
  assert.equal(result?.providerDocumentId, "doc_web_1")
})

test("ragflow provider listRemoteChunks maps remote chunk payloads", async () => {
  fetchQueue.push({
    ok: true,
    status: 200,
    body: {
      code: 0,
      data: {
        total: 1,
        chunks: [
          {
            id: "chunk_1",
            content: "Brand facts and positioning",
            important_keywords: ["brand"],
            questions: ["What is the brand promise?"],
            tag_kwd: ["positioning"],
            available: true,
          },
        ],
      },
    },
  })

  const result = await ragflowKnowledgeProvider.listRemoteChunks?.({
    source: baseSource,
    dataset: baseDataset,
    document: {
      id: 8,
      enterpriseId: 7,
      sourceId: 10,
      datasetId: 21,
      providerDocumentId: "doc_1",
      name: "brand.txt",
      sourceType: "file",
      sourceUrl: null,
      category: "brand",
      status: "ready",
      chunkCount: 1,
      parseSummary: null,
      chunkingOverride: null,
      errorMessage: null,
      createdAt: null,
      updatedAt: null,
    },
  })

  assert.equal(fetchCalls.length, 1)
  assert.match(fetchCalls[0]?.url || "", /\/api\/v1\/datasets\/ds_1\/documents\/doc_1\/chunks\?page=1&page_size=100$/)
  assert.deepEqual(result, [
    {
      providerChunkId: "chunk_1",
      chunkIndex: 1,
      content: "Brand facts and positioning",
      excerpt: "Brand facts and positioning",
      keywords: ["brand"],
      questions: ["What is the brand promise?"],
      tags: ["positioning"],
      status: "active",
    },
  ])
})
