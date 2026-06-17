import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let currentUser: any = { enterpriseId: 9, enterpriseRole: "admin" }
const source: any = {
  id: 1,
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
let refreshArgs: any = null

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
      getKnowledgeSource: async () => source,
      refreshKnowledgeSourceConnection: async (args: unknown) => {
        refreshArgs = args
        return {
          source: {
            id: 1,
            enterpriseId: 9,
            providerType: "ragflow",
            name: "RAGFlow Enterprise Knowledge",
            baseUrl: "https://ragflow.example.com",
            status: "healthy",
            enabled: true,
            lastCheckedAt: "2026-06-14T09:00:00.000Z",
            lastError: null,
            apiKeyConfigured: true,
          },
          test: {
            ok: true,
            status: "healthy",
            message: "RAGFlow connection healthy",
            checkedAt: "2026-06-14T09:00:00.000Z",
          },
        }
      },
      toKnowledgeSourceClientState: (value: unknown) => value,
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let POST: typeof import("./route").POST

test.before(async () => {
  const route = await import("./route")
  POST = route.POST
})

test.beforeEach(() => {
  currentUser = { enterpriseId: 9, enterpriseRole: "admin" }
  refreshArgs = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("knowledge source test route refreshes and persists saved source health by default", async () => {
  const response = await POST({ json: async () => ({}) } as any)

  assert.equal((response as any).status, 200)
  assert.equal(refreshArgs.enterpriseId, 9)
  assert.equal(refreshArgs.persist, true)
  assert.equal(refreshArgs.syncDatasets, true)
  assert.equal((response as any).body?.data?.test?.status, "healthy")
})

test("knowledge source test route does not persist ad hoc credentials unless explicitly requested", async () => {
  const response = await POST({
    json: async () => ({
      name: "Ad hoc",
      baseUrl: "https://ragflow.example.com",
      apiKey: "secret",
    }),
  } as any)

  assert.equal((response as any).status, 200)
  assert.equal(refreshArgs.persist, false)
  assert.equal(refreshArgs.syncDatasets, false)
  assert.equal(refreshArgs.requestSource.name, "Ad hoc")
})
