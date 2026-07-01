import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let currentUser: any = { id: 7, enterpriseId: 3 }
let artifacts: any[] = []
const deleteCalls: Array<{ artifactId: number; enterpriseId: number }> = []

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

  if (request === "@/lib/platform/artifact-actions") {
    return {
      hasPlatformArtifactAccessibleContent: (artifact: { payload?: Record<string, unknown> | null; storageKey?: string | null; externalUrl?: string | null }) => {
        if (artifact.storageKey || artifact.externalUrl) return true
        if (typeof artifact.payload?.embeddedContentBase64 === "string" && artifact.payload.embeddedContentBase64.trim()) return true
        return typeof artifact.payload?.text === "string" && artifact.payload.text.trim().length > 0
      },
    }
  }

  if (request === "@/lib/platform/task-run-store") {
    return {
      listPlatformArtifactsForEnterprise: async () => artifacts,
      deletePlatformArtifactPermanently: async (artifactId: number, enterpriseId: number) => {
        deleteCalls.push({ artifactId, enterpriseId })
        return {
          artifactId,
          deletedWorkItemIds: artifactId === 136 ? [901] : [],
          deletedStorage: false,
        }
      },
    }
  }

  if (request === "@/lib/r2") {
    return {
      deleteR2Object: async () => true,
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let POST: typeof import("./cleanup-unavailable/route").POST

test.before(async () => {
  const route = await import("./cleanup-unavailable/route")
  POST = route.POST
})

test.beforeEach(() => {
  currentUser = { id: 7, enterpriseId: 3 }
  artifacts = [
    {
      id: 145,
      enterpriseId: 3,
      storageKey: null,
      externalUrl: null,
      payload: { source: "workflow", text: "hello" },
    },
    {
      id: 136,
      enterpriseId: 3,
      storageKey: null,
      externalUrl: null,
      payload: { source: "upload" },
    },
    {
      id: 135,
      enterpriseId: 3,
      storageKey: null,
      externalUrl: null,
      payload: { source: "upload" },
    },
    {
      id: 134,
      enterpriseId: 3,
      storageKey: "platform-artifacts/3/134.docx",
      externalUrl: null,
      payload: { source: "upload" },
    },
  ]
  deleteCalls.length = 0
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("cleanup unavailable route deletes only artifacts without accessible content", async () => {
  const response = await POST(
    {
      json: async () => null,
    } as any,
  )

  assert.equal((response as any).status, 200)
  assert.deepEqual(deleteCalls, [
    { artifactId: 136, enterpriseId: 3 },
    { artifactId: 135, enterpriseId: 3 },
  ])
  assert.equal((response as any).body?.data?.totalUnavailableBefore, 2)
  assert.equal((response as any).body?.data?.deletedCount, 2)
  assert.deepEqual((response as any).body?.data?.deletedArtifactIds, [136, 135])
})

test("cleanup unavailable route honors requested artifact ids and ignores accessible ones", async () => {
  const response = await POST(
    {
      json: async () => ({ artifactIds: [145, 136, 134, 999] }),
    } as any,
  )

  assert.equal((response as any).status, 200)
  assert.deepEqual(deleteCalls, [{ artifactId: 136, enterpriseId: 3 }])
  assert.deepEqual((response as any).body?.data?.ignoredArtifactIds, [145, 134, 999])
  assert.equal((response as any).body?.data?.deletedCount, 1)
})
