import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let currentUser: any = { id: 7, enterpriseId: 3 }
let listArgs: any = null

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

  if (request === "@/lib/platform/task-run-store") {
    return {
      listPlatformKnowledgeSaveJobsForEnterprise: async (...args: unknown[]) => {
        listArgs = args
        return [
          {
            id: 18,
            artifactId: 12,
            enterpriseId: 3,
            ownerUserId: 7,
            status: "queued",
            targetType: "knowledge_base",
            requestPayload: { artifactTitle: "Workflow recap" },
            resultPayload: null,
            errorMessage: null,
            createdAt: new Date("2026-06-30T10:00:00.000Z"),
            updatedAt: new Date("2026-06-30T10:00:00.000Z"),
          },
        ]
      },
      getPlatformArtifact: async () => ({
        id: 12,
        runId: 9,
        title: "Workflow recap",
        mimeType: "text/markdown",
        createdAt: new Date("2026-06-30T10:00:00.000Z"),
      }),
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let GET: typeof import("./knowledge-save-jobs/route").GET

test.before(async () => {
  const route = await import("./knowledge-save-jobs/route")
  GET = route.GET
})

test.beforeEach(() => {
  currentUser = { id: 7, enterpriseId: 3 }
  listArgs = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("knowledge save jobs list route returns enterprise-scoped items", async () => {
  const response = await GET(
    {
      nextUrl: new URL("http://localhost:3000/api/platform/knowledge-save-jobs?status=queued&limit=10"),
    } as any,
  )

  assert.equal((response as any).status, 200)
  assert.deepEqual(listArgs, [3, 10, "queued"])
  assert.equal((response as any).body?.data?.items?.[0]?.artifact?.title, "Workflow recap")
})
