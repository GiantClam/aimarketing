import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let currentUser: any = { enterpriseId: 9, enterpriseRole: "admin" }
let listItems: any[] = [{ id: 2, name: "Brand KB", category: "brand" }]
let createArgs: any = null

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
      listKnowledgeDatasetsSnapshot: async () => listItems,
      createKnowledgeDataset: async (args: unknown) => {
        createArgs = args
        return {
          id: 8,
          providerDatasetId: "ds_8",
          name: "Campaign KB",
          category: "campaign",
          enabled: true,
        }
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let GET: typeof import("./route").GET
let POST: typeof import("./route").POST

test.before(async () => {
  const route = await import("./route")
  GET = route.GET
  POST = route.POST
})

test.beforeEach(() => {
  currentUser = { enterpriseId: 9, enterpriseRole: "admin" }
  listItems = [{ id: 2, name: "Brand KB", category: "brand" }]
  createArgs = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("knowledge datasets route returns snapshot items", async () => {
  const response = await GET({} as any)

  assert.equal((response as any).status, 200)
  assert.equal((response as any).body?.data?.items?.length, 1)
  assert.equal((response as any).body?.data?.items?.[0]?.name, "Brand KB")
})

test("knowledge datasets route creates a dataset for admins", async () => {
  const request = {
    json: async () => ({
      name: "Campaign KB",
      category: "campaign",
      chunkMethod: "manual",
      description: "Campaign docs",
    }),
  } as any

  const response = await POST(request)

  assert.equal((response as any).status, 200)
  assert.deepEqual(createArgs, {
    enterpriseId: 9,
    name: "Campaign KB",
    category: "campaign",
    chunkMethod: "manual",
    description: "Campaign docs",
  })
  assert.equal((response as any).body?.data?.id, 8)
})

test("knowledge datasets route rejects empty names", async () => {
  const request = {
    json: async () => ({
      name: "   ",
    }),
  } as any

  const response = await POST(request)

  assert.equal((response as any).status, 400)
  assert.equal((response as any).body?.error, "knowledge_dataset_name_required")
})

test("knowledge datasets route rejects non-admins", async () => {
  currentUser = { enterpriseId: 9, enterpriseRole: "member" }
  const request = {
    json: async () => ({
      name: "Campaign KB",
    }),
  } as any

  const response = await POST(request)

  assert.equal((response as any).status, 403)
  assert.equal((response as any).body?.error, "admin_required")
})
