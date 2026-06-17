import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only") {
    return {}
  }
  if (request === "@/lib/db") {
    return {
      db: {},
    }
  }
  if (request === "@/lib/db/retry") {
    return {
      createRetryableDbErrorMatcher: () => () => false,
      withDbRetry: async (_label: string, operation: () => Promise<unknown>) => operation(),
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let mergeKnowledgeChunksWithLocalEdits: typeof import("./repository").mergeKnowledgeChunksWithLocalEdits

test.before(async () => {
  const repository = await import("./repository")
  mergeKnowledgeChunksWithLocalEdits = repository.mergeKnowledgeChunksWithLocalEdits
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("mergeKnowledgeChunksWithLocalEdits preserves manual chunk content for edited rows", () => {
  const merged = mergeKnowledgeChunksWithLocalEdits(
    [
      {
        id: 12,
        documentId: 3,
        providerChunkId: "chunk_1",
        chunkIndex: 1,
        content: "Manual rewrite",
        excerpt: "Manual rewrite",
        keywords: ["local"],
        questions: [],
        tags: ["edited"],
        enabled: true,
        edited: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    ],
    [
      {
        providerChunkId: "chunk_1",
        chunkIndex: 1,
        content: "Remote content",
        excerpt: "Remote content",
        keywords: ["remote"],
        questions: ["remote?"],
        tags: ["remote"],
        status: "active",
      },
    ],
  )

  assert.equal(merged.deletedChunkIds.length, 0)
  assert.equal(merged.mergedChunks[0]?.content, "Manual rewrite")
  assert.equal(merged.mergedChunks[0]?.excerpt, "Manual rewrite")
  assert.deepEqual(merged.mergedChunks[0]?.keywords, ["local"])
  assert.equal(merged.mergedChunks[0]?.edited, true)
})

test("mergeKnowledgeChunksWithLocalEdits refreshes untouched rows from remote content", () => {
  const merged = mergeKnowledgeChunksWithLocalEdits(
    [
      {
        id: 18,
        documentId: 3,
        providerChunkId: "chunk_2",
        chunkIndex: 2,
        content: "Old local content",
        excerpt: "Old local content",
        keywords: [],
        questions: [],
        tags: [],
        enabled: true,
        edited: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    ],
    [
      {
        providerChunkId: "chunk_2",
        chunkIndex: 2,
        content: "Fresh remote content",
        excerpt: "Fresh remote content",
        keywords: ["fresh"],
        questions: [],
        tags: [],
        status: "active",
      },
    ],
  )

  assert.equal(merged.mergedChunks[0]?.content, "Fresh remote content")
  assert.equal(merged.mergedChunks[0]?.edited, false)
})
