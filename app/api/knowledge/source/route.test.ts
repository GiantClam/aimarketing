import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let currentUser: any = { enterpriseId: 9, enterpriseRole: "admin" }
let savedPayload: any = null

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
      getKnowledgeSource: async () => null,
      saveRagflowKnowledgeSource: async (payload: unknown) => {
        savedPayload = payload
        return {
          source: { id: 1, providerType: "ragflow" },
          test: { ok: true, status: "healthy" },
        }
      },
      toKnowledgeSourceClientState: (value: unknown) => value,
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let PATCH: typeof import("./route").PATCH

test.before(async () => {
  const route = await import("./route")
  PATCH = route.PATCH
})

test.beforeEach(() => {
  currentUser = { enterpriseId: 9, enterpriseRole: "admin" }
  savedPayload = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("knowledge source patch persists ragflow source settings for admins", async () => {
  const response = await PATCH({
    json: async () => ({
      name: "Company RAGFlow",
      baseUrl: "https://ragflow.example.com",
      apiKey: "secret",
      enabled: true,
    }),
  } as any)

  assert.equal(response.status, 200)
  assert.equal(savedPayload.enterpriseId, 9)
  assert.equal(savedPayload.baseUrl, "https://ragflow.example.com")
  assert.equal(savedPayload.apiKey, "secret")
})

test("knowledge source patch rejects non-admins", async () => {
  currentUser = { enterpriseId: 9, enterpriseRole: "member" }

  const response = await PATCH({
    json: async () => ({
      name: "Company RAGFlow",
      baseUrl: "https://ragflow.example.com",
      apiKey: "secret",
    }),
  } as any)

  assert.equal((response as any).status, 403)
  assert.equal((response as any).body?.error, "admin_required")
})
