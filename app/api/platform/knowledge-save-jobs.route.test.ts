import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let currentUser: any = { id: 7, enterpriseId: 3, enterpriseRole: "admin", enterpriseStatus: "active" }
let currentJob: any = {
  id: 18,
  artifactId: 12,
  enterpriseId: 3,
  ownerUserId: 7,
  status: "queued",
  targetType: "knowledge_base",
  requestPayload: {
    datasetId: 88,
    datasetScope: "enterprise",
    knowledgeCategory: "campaign",
    manualConfirmationRequired: true,
  },
}
let artifact: any = {
  id: 12,
  enterpriseId: 3,
  ownerUserId: 7,
  title: "Workflow recap",
  mimeType: "text/markdown",
  payload: {
    text: "# Workflow recap\n\nApproved summary",
  },
}
const updateCalls: any[] = []
let ingestArgs: any = null

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
      assertArtifactEnterpriseAccess: (_user: unknown, item: unknown) => item,
    }
  }

  if (request === "@/lib/platform/task-run-store") {
    return {
      getPlatformKnowledgeSaveJob: async () => currentJob,
      getPlatformArtifact: async () => artifact,
      updatePlatformKnowledgeSaveJob: async (...args: unknown[]) => {
        updateCalls.push(args)
        return {
          ...currentJob,
          ...(args[2] as Record<string, unknown>),
        }
      },
    }
  }

  if (request === "@/lib/knowledge/service") {
    return {
      ingestKnowledgeFile: async (args: unknown) => {
        ingestArgs = args
        return { id: 501 }
      },
    }
  }

  if (request === "@/lib/knowledge/personal-datasets") {
    return {
      createPersonalKnowledgeDocument: async () => ({ id: 601 }),
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let POST: typeof import("./knowledge-save-jobs/[jobId]/route").POST

test.before(async () => {
  const route = await import("./knowledge-save-jobs/[jobId]/route")
  POST = route.POST
})

test.beforeEach(() => {
  currentUser = { id: 7, enterpriseId: 3, enterpriseRole: "admin", enterpriseStatus: "active" }
  currentJob = {
    id: 18,
    artifactId: 12,
    enterpriseId: 3,
    ownerUserId: 7,
    status: "queued",
    targetType: "knowledge_base",
    requestPayload: {
      datasetId: 88,
      datasetScope: "enterprise",
      knowledgeCategory: "campaign",
      manualConfirmationRequired: true,
    },
  }
  artifact = {
    id: 12,
    enterpriseId: 3,
    ownerUserId: 7,
    title: "Workflow recap",
    mimeType: "text/markdown",
    payload: {
      text: "# Workflow recap\n\nApproved summary",
    },
  }
  updateCalls.length = 0
  ingestArgs = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("knowledge save job approve ingests artifact markdown into the target dataset", async () => {
  const response = await POST(
    {
      json: async () => ({ action: "approve" }),
    } as any,
    { params: Promise.resolve({ jobId: "18" }) },
  )

  assert.equal((response as any).status, 200)
  assert.deepEqual(ingestArgs, {
    enterpriseId: 3,
    datasetId: 88,
    category: "campaign",
    fileName: "Workflow-recap.md",
    contentType: "text/markdown",
    bytes: Buffer.from("# Workflow recap\n\nApproved summary", "utf8"),
  })
  assert.equal(updateCalls.length, 2)
  assert.equal(updateCalls[0]?.[2]?.status, "running")
  assert.equal(updateCalls[1]?.[2]?.status, "succeeded")
})

test("knowledge save job reject marks the job as rejected", async () => {
  const response = await POST(
    {
      json: async () => ({ action: "reject" }),
    } as any,
    { params: Promise.resolve({ jobId: "18" }) },
  )

  assert.equal((response as any).status, 200)
  assert.equal(updateCalls.length, 1)
  assert.equal(updateCalls[0]?.[2]?.status, "rejected")
  assert.equal((response as any).body?.data?.status, "rejected")
})
