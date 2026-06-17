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
      updateKnowledgeDocumentChunking: async (documentId: number, enterpriseId: number, config: unknown) => {
        updatedArgs = { documentId, enterpriseId, config }
        return { id: documentId, chunkingOverride: config }
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let PATCH: typeof import("./documents/[documentId]/chunking/route").PATCH

test.before(async () => {
  const route = await import("./documents/[documentId]/chunking/route")
  PATCH = route.PATCH
})

test.beforeEach(() => {
  currentUser = { enterpriseId: 9, enterpriseRole: "admin" }
  updatedArgs = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("knowledge document chunking route persists chunking config for admins", async () => {
  const response = await PATCH(
    {
      json: async () => ({
        method: "manual",
        chunkSize: 640,
        overlap: 0.2,
        delimiter: "\\n\\n",
        parser: "general",
      }),
    } as any,
    { params: Promise.resolve({ documentId: "17" }) },
  )

  assert.equal((response as any).status, 200)
  assert.equal(updatedArgs.documentId, 17)
  assert.equal(updatedArgs.enterpriseId, 9)
  assert.equal(updatedArgs.config.chunkSize, 640)
})

test("knowledge document chunking route rejects non-admins", async () => {
  currentUser = { enterpriseId: 9, enterpriseRole: "member" }

  const response = await PATCH(
    {
      json: async () => ({
        method: "manual",
        chunkSize: 640,
        overlap: 0.2,
        delimiter: "\\n\\n",
      }),
    } as any,
    { params: Promise.resolve({ documentId: "17" }) },
  )

  assert.equal((response as any).status, 403)
  assert.equal((response as any).body?.error, "admin_required")
})
