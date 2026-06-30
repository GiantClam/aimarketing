import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let currentUser: any = { id: 7, enterpriseId: 11 }
let listItems: any[] = [{ id: 1, name: "Founder Notes", category: "general" }]
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

  if (request === "@/lib/knowledge/personal-datasets") {
    return {
      listPersonalKnowledgeDatasets: async () => listItems,
      createPersonalKnowledgeDataset: async (args: unknown) => {
        createArgs = args
        return { id: 9, name: "Playbook", category: "brand" }
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
  currentUser = { id: 7, enterpriseId: 11 }
  listItems = [{ id: 1, name: "Founder Notes", category: "general" }]
  createArgs = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("personal datasets GET returns current user items", async () => {
  const response = await GET({} as any)

  assert.equal((response as any).status, 200)
  assert.equal((response as any).body?.data?.items?.[0]?.name, "Founder Notes")
})

test("personal datasets POST creates a dataset for the current user", async () => {
  const response = await POST({
    json: async () => ({
      name: "Playbook",
      category: "brand",
      description: "private notes",
      metadata: { source: "manual" },
    }),
  } as any)

  assert.equal((response as any).status, 201)
  assert.deepEqual(createArgs, {
    userId: 7,
    enterpriseId: 11,
    name: "Playbook",
    category: "brand",
    description: "private notes",
    metadata: { source: "manual" },
  })
  assert.equal((response as any).body?.data?.id, 9)
})

test("personal datasets routes require authentication", async () => {
  currentUser = null

  const getResponse = await GET({} as any)
  const postResponse = await POST({ json: async () => ({ name: "x" }) } as any)

  assert.equal((getResponse as any).status, 401)
  assert.equal((postResponse as any).status, 401)
})
