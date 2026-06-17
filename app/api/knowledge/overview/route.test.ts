import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

const currentUser: any = { enterpriseId: 9, enterpriseRole: "admin" }
const overviewSnapshot: any = {
  overview: {
    source: { provider: "ragflow", status: "healthy", label: "RAGFlow 已连接", lastCheckedAt: null, name: "RAGFlow" },
    stats: { documentCount: 2, processingCount: 1, chunkCount: 12, lastUpdatedAt: null },
    datasets: { total: 1, enabled: 1 },
  },
}

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
      getKnowledgeWorkspaceSnapshot: async () => overviewSnapshot,
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let GET: typeof import("./route").GET

test.before(async () => {
  const route = await import("./route")
  GET = route.GET
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("knowledge overview route returns workspace overview for enterprise users", async () => {
  const response = await GET({} as any)

  assert.equal((response as any).status, 200)
  assert.equal((response as any).body?.data?.stats?.documentCount, 2)
  assert.equal((response as any).body?.data?.source?.provider, "ragflow")
})
