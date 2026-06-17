import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let currentUser: any = { enterpriseId: 9, enterpriseRole: "admin" }
let updatedArgs: any = null

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
      saveKnowledgeDocumentChunkEdit: async (args: unknown) => {
        updatedArgs = args
        return { id: 3, status: "edited", content: "Manual rewrite" }
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let PATCH: typeof import("./documents/[documentId]/chunks/[chunkId]/route").PATCH

test.before(async () => {
  const route = await import("./documents/[documentId]/chunks/[chunkId]/route")
  PATCH = route.PATCH
})

test.beforeEach(() => {
  currentUser = { enterpriseId: 9, enterpriseRole: "admin" }
  updatedArgs = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("knowledge chunk edit route saves manual rewrite for admins", async () => {
  const response = await PATCH(
    {
      json: async () => ({
        content: "Manual rewrite",
        excerpt: "Manual rewrite",
      }),
    } as any,
    { params: Promise.resolve({ documentId: "17", chunkId: "3" }) },
  )

  assert.equal((response as any).status, 200)
  assert.equal(updatedArgs.documentId, 17)
  assert.equal(updatedArgs.chunkId, 3)
  assert.equal(updatedArgs.enterpriseId, 9)
  assert.equal(updatedArgs.content, "Manual rewrite")
})

test("knowledge chunk edit route rejects non-admins", async () => {
  currentUser = { enterpriseId: 9, enterpriseRole: "member" }

  const response = await PATCH(
    {
      json: async () => ({
        content: "Manual rewrite",
      }),
    } as any,
    { params: Promise.resolve({ documentId: "17", chunkId: "3" }) },
  )

  assert.equal((response as any).status, 403)
  assert.equal((response as any).body?.error, "admin_required")
})
