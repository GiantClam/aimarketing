import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let currentUser: any = { enterpriseId: 9, enterpriseRole: "admin" }
let reparseArgs: any = null

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
      requestKnowledgeDocumentReparse: async (documentId: number, enterpriseId: number) => {
        reparseArgs = { documentId, enterpriseId }
        return { id: documentId, status: "reparsing" }
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let POST: typeof import("./documents/[documentId]/reparse/route").POST

test.before(async () => {
  const route = await import("./documents/[documentId]/reparse/route")
  POST = route.POST
})

test.beforeEach(() => {
  currentUser = { enterpriseId: 9, enterpriseRole: "admin" }
  reparseArgs = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("knowledge document reparse route requests reparse for admins", async () => {
  const response = await POST({} as any, { params: Promise.resolve({ documentId: "17" }) })

  assert.equal((response as any).status, 200)
  assert.deepEqual(reparseArgs, { documentId: 17, enterpriseId: 9 })
  assert.equal((response as any).body?.data?.status, "reparsing")
})

test("knowledge document reparse route rejects non-admins", async () => {
  currentUser = { enterpriseId: 9, enterpriseRole: "member" }

  const response = await POST({} as any, { params: Promise.resolve({ documentId: "17" }) })

  assert.equal((response as any).status, 403)
  assert.equal((response as any).body?.error, "admin_required")
})
