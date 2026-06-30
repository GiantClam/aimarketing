import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let currentUser: any = { id: 7, enterpriseId: 11 }
let listItems: any[] = [{ id: 3, name: "My Brief", datasetName: "Founder Notes", status: "ready" }]

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
      listPersonalKnowledgeDocuments: async () => listItems,
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let GET: typeof import("./route").GET

test.before(async () => {
  const route = await import("./route")
  GET = route.GET
})

test.beforeEach(() => {
  currentUser = { id: 7, enterpriseId: 11 }
  listItems = [{ id: 3, name: "My Brief", datasetName: "Founder Notes", status: "ready" }]
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("personal documents GET returns current user items", async () => {
  const response = await GET({} as any)

  assert.equal((response as any).status, 200)
  assert.equal((response as any).body?.data?.items?.[0]?.name, "My Brief")
})

test("personal documents route requires authentication", async () => {
  currentUser = null

  const response = await GET({} as any)
  assert.equal((response as any).status, 401)
})
