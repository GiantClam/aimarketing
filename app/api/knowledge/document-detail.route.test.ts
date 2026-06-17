import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

const currentUser: any = { enterpriseId: 9, enterpriseRole: "admin" }
let detailSnapshot: any = {
  document: { id: 7, name: "Brand.pdf", status: "ready", chunkCount: 3 },
  dataset: { id: 4, name: "Brand dataset" },
  bindings: [],
  chunks: [],
}
let removedDocument: any = { id: 7, name: "Brand.pdf" }
let migratedDocument: any = { id: 7, datasetId: 8, status: "parsing" }
let migrateArgs: any = null

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "next/server") {
    return {
      NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({
          status: init?.status || 200,
          body,
        }),
      },
    }
  }
  if (request === "@/lib/auth/session") {
    return {
      getSessionUser: async () => currentUser,
    }
  }
  if (request === "@/lib/knowledge/service") {
    return {
      getKnowledgeDocumentSnapshot: async () => detailSnapshot,
      migrateKnowledgeDocumentDataset: async (documentId: number, enterpriseId: number, datasetId: number) => {
        migrateArgs = { documentId, enterpriseId, datasetId }
        return migratedDocument
      },
      removeKnowledgeDocument: async () => removedDocument,
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let GET: typeof import("./documents/[documentId]/route").GET
let DELETE: typeof import("./documents/[documentId]/route").DELETE
let PATCH: typeof import("./documents/[documentId]/route").PATCH

test.before(async () => {
  const route = await import("./documents/[documentId]/route")
  GET = route.GET
  DELETE = route.DELETE
  PATCH = route.PATCH
})

test.beforeEach(() => {
  detailSnapshot = {
    document: { id: 7, name: "Brand.pdf", status: "ready", chunkCount: 3 },
    dataset: { id: 4, name: "Brand dataset" },
    bindings: [],
    chunks: [],
  }
  removedDocument = { id: 7, name: "Brand.pdf" }
  migratedDocument = { id: 7, datasetId: 8, status: "parsing" }
  migrateArgs = null
  currentUser.enterpriseRole = "admin"
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("knowledge document route returns detail snapshot", async () => {
  const response = await GET({} as any, { params: Promise.resolve({ documentId: "7" }) })

  assert.equal((response as any).status, 200)
  assert.equal((response as any).body?.data?.document?.name, "Brand.pdf")
})

test("knowledge document route returns 404 when detail is missing", async () => {
  detailSnapshot = null
  const response = await GET({} as any, { params: Promise.resolve({ documentId: "7" }) })

  assert.equal((response as any).status, 404)
  assert.equal((response as any).body?.error, "knowledge_document_not_found")
})

test("knowledge document route deletes document for admins", async () => {
  const response = await DELETE({} as any, { params: Promise.resolve({ documentId: "7" }) })

  assert.equal((response as any).status, 200)
  assert.equal((response as any).body?.data?.id, 7)
})

test("knowledge document route migrates dataset for admins", async () => {
  const request = {
    json: async () => ({ datasetId: 8 }),
  } as any

  const response = await PATCH(request, { params: Promise.resolve({ documentId: "7" }) })

  assert.equal((response as any).status, 200)
  assert.deepEqual(migrateArgs, { documentId: 7, enterpriseId: 9, datasetId: 8 })
  assert.equal((response as any).body?.data?.datasetId, 8)
})

test("knowledge document route rejects invalid dataset id", async () => {
  const request = {
    json: async () => ({ datasetId: "" }),
  } as any

  const response = await PATCH(request, { params: Promise.resolve({ documentId: "7" }) })

  assert.equal((response as any).status, 400)
  assert.equal((response as any).body?.error, "knowledge_dataset_required")
})

test("knowledge document route rejects delete for non-admins", async () => {
  currentUser.enterpriseRole = "member"

  const response = await DELETE({} as any, { params: Promise.resolve({ documentId: "7" }) })

  assert.equal((response as any).status, 403)
  assert.equal((response as any).body?.error, "admin_required")
})

test("knowledge document route rejects migration for non-admins", async () => {
  currentUser.enterpriseRole = "member"
  const request = {
    json: async () => ({ datasetId: 8 }),
  } as any

  const response = await PATCH(request, { params: Promise.resolve({ documentId: "7" }) })

  assert.equal((response as any).status, 403)
  assert.equal((response as any).body?.error, "admin_required")
})
