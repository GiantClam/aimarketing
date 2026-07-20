import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let featureState = { iterationsV1: false }
let currentUser: any = { id: 1, enterpriseId: 9 }
let workflow: any = {
  id: 7,
  enterpriseId: 9,
  slug: "demo",
  nodes: [{ nodeKey: "prompt", type: "text_input" }],
  edges: [],
}
let detail: any = {
  run: { id: 101, status: "queued", normalizedResult: null },
  workflow,
  nodeExecutions: [],
}
let revisionRecord: any = {
  id: 12,
  revision: 3,
  definitionHash: "a".repeat(64),
  definition: { schemaVersion: 2, revision: 3, nodes: [], edges: [] },
}
let createdRevisionRun: any = {
  run: { id: 101, status: "queued", normalizedResult: null },
  reused: false,
}
let tokenVerification: any = { ok: true, payload: {} }
let confirmationExpected: any = null
let createCalls = 0
let createdRevisionInput: any = null

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "next/server") {
    return {
      NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({ status: init?.status || 200, body }),
      },
    }
  }
  if (request === "@/lib/auth/session") return { getSessionUser: async () => currentUser }
  if (request === "@/lib/platform/task-run-store") return { listRecentWorkflowTaskRunsForEnterprise: async () => [] }
  if (request === "@/lib/platform/workflow-runner") {
    return {
      createPlatformWorkflowRun: async () => {
        createCalls += 1
        return { id: 99 }
      },
      serializePlatformWorkflowRun: (run: unknown) => run,
      updatePlatformWorkflowRun: async () => undefined,
    }
  }
  if (request === "@/lib/workflows/execution") {
    return {
      collectWorkflowRetryNodeKeys: () => ["prompt"],
    }
  }
  if (request === "@/lib/workflows/manual-resume") {
    return {
      findLatestWorkflowRunRecordForWorkflow: () => null,
      resolveWorkflowResumeNodeKey: () => null,
    }
  }
  if (request === "@/lib/workflows/store") {
    return {
      createWorkflowNodeExecutionRecords: async () => undefined,
      getWorkflowDefinition: async () => workflow,
      getWorkflowRunDetail: async () => detail,
      resetWorkflowNodeExecutions: async () => undefined,
    }
  }
  if (request === "@/lib/workflows/resume-compatibility") return { isWorkflowResumeCompatible: () => true }
  if (request === "@/lib/workflows/task-runner") return { runWorkflowTaskRecoveryPass: async () => undefined }
  if (request === "@/lib/workflows/features") return { resolveWorkflowFeatures: () => featureState }
  if (request === "@/lib/workflows/workflow-attempts") {
    return {
      createWorkflowRunFromRevision: async (input: unknown) => {
        createdRevisionInput = input
        return createdRevisionRun
      },
      getWorkflowRevisionForRun: async () => revisionRecord,
    }
  }
  if (request === "@/lib/workflows/iteration-runtime") {
    return {
      isWorkflowRequestId: (value: unknown) => typeof value === "string" && value.length > 0,
      createWorkflowConfirmationToken: (payload: unknown) => {
        confirmationExpected = payload
        return "signed-token"
      },
      verifyWorkflowConfirmationToken: (_token: unknown, _secret: string, expected: unknown) => {
        confirmationExpected = expected
        return tokenVerification
      },
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

let POST: typeof import("./route").POST

function request(body: Record<string, unknown> = {}) {
  return { url: "http://localhost/api/workflows/7/run", json: async () => body } as any
}

test.before(async () => {
  POST = (await import("./route")).POST
})

test.beforeEach(() => {
  featureState = { iterationsV1: false }
  currentUser = { id: 1, enterpriseId: 9 }
  workflow = { id: 7, enterpriseId: 9, slug: "demo", nodes: [{ nodeKey: "prompt", type: "text_input" }], edges: [] }
  detail = { run: { id: 101, status: "queued", normalizedResult: null }, workflow, nodeExecutions: [] }
  revisionRecord = { id: 12, revision: 3, definitionHash: "a".repeat(64), definition: { schemaVersion: 2, revision: 3, nodes: [], edges: [] } }
  createdRevisionRun = { run: { id: 101, status: "queued", normalizedResult: null }, reused: false }
  createdRevisionInput = null
  tokenVerification = { ok: true, payload: {} }
  confirmationExpected = null
  createCalls = 0
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("iterations flag rejects missing UUID requestId before legacy prompt resume", async () => {
  featureState = { iterationsV1: true }
  const response = await POST(request({ prompt: "same prompt" }), { params: Promise.resolve({ workflowId: "7" }) })
  assert.equal((response as any).status, 400)
  assert.equal((response as any).body?.error, "workflow_request_id_invalid")
  assert.equal(createCalls, 0)
})

test("iterations flag rejects invalid confirmation token", async () => {
  featureState = { iterationsV1: true }
  tokenVerification = { ok: false, code: "invalid_confirmation_token" }
  const response = await POST(
    request({
      requestId: "request-1",
      revision: 3,
      taskCount: 2,
      maxCredits: 4,
      confirmationToken: "tampered",
      confirmationExpiresAt: Date.now() + 60_000,
    }),
    { params: Promise.resolve({ workflowId: "7" }) },
  )
  assert.equal((response as any).status, 400)
  assert.equal((response as any).body?.error, "invalid_confirmation_token")
  assert.equal(createCalls, 0)
})

test("iterations flag creates a request-keyed revision run and returns its identity", async () => {
  featureState = { iterationsV1: true }
  const response = await POST(
    request({ requestId: "request-1", revision: 3, iterationsEnabled: true }),
    { params: Promise.resolve({ workflowId: "7" }) },
  )
  assert.equal((response as any).status, 202)
  assert.equal((response as any).body?.data?.runId, 101)
  assert.equal((response as any).body?.data?.requestId, "request-1")
  assert.equal((response as any).body?.data?.definitionHash, "a".repeat(64))
})

test("historical revision run creates node executions from the immutable revision envelope", async () => {
  featureState = { iterationsV1: true }
  workflow = {
    ...workflow,
    // Current draft intentionally differs from the selected historical
    // revision.  The draft node must never leak into this run.
    nodes: [{ nodeKey: "draft-only", type: "image_generate" }],
  }
  revisionRecord = {
    ...revisionRecord,
    definition: {
      schemaVersion: 2,
      revision: 3,
      nodes: [
        { nodeKey: "historical-prompt", type: "text_input" },
        { nodeKey: "historical-output", type: "output" },
      ],
      edges: [],
    },
  }

  const response = await POST(
    request({ requestId: "00000000-0000-4000-8000-000000000001", revision: 3 }),
    { params: Promise.resolve({ workflowId: "7" }) },
  )

  assert.equal((response as any).status, 202)
  assert.deepEqual(
    createdRevisionInput?.nodes,
    [
      { nodeKey: "historical-prompt", nodeType: "text_input" },
      { nodeKey: "historical-output", nodeType: "output" },
    ],
  )
})

test("budget confirmation is derived from the revision, not client-supplied estimates", async () => {
  featureState = { iterationsV1: true }
  workflow = {
    ...workflow,
    nodes: [{ nodeKey: "generate", type: "image_generate" }],
  }
  revisionRecord = {
    ...revisionRecord,
    definition: {
      schemaVersion: 2,
      revision: 3,
      nodes: [{ nodeKey: "generate", type: "image_generate", config: {} }],
      edges: [],
    },
  }
  const previousSecret = process.env.WORKFLOW_CONFIRMATION_SECRET
  process.env.WORKFLOW_CONFIRMATION_SECRET = "s".repeat(32)
  try {
    const pending = await POST(
      request({ requestId: "00000000-0000-4000-8000-000000000001", revision: 3, taskCount: 0, maxCredits: 0 }),
      { params: Promise.resolve({ workflowId: "7" }) },
    )
    assert.equal((pending as any).status, 409)
    assert.equal((pending as any).body?.error, "workflow_budget_confirmation_required")
    assert.equal((pending as any).body?.details?.taskCount, 1)
    assert.equal((pending as any).body?.details?.maxCredits, -1)
    assert.equal((pending as any).body?.details?.confirmationToken, "signed-token")

    const confirmed = await POST(
      request({
        requestId: "00000000-0000-4000-8000-000000000001",
        revision: 3,
        taskCount: 0,
        maxCredits: 0,
        confirmationToken: "signed-token",
        confirmationExpiresAt: Date.now() + 60_000,
      }),
      { params: Promise.resolve({ workflowId: "7" }) },
    )
    assert.equal((confirmed as any).status, 202)
    assert.equal((confirmationExpected as any).taskCount, 1)
    assert.equal((confirmationExpected as any).maxCredits, -1)
  } finally {
    if (previousSecret === undefined) delete process.env.WORKFLOW_CONFIRMATION_SECRET
    else process.env.WORKFLOW_CONFIRMATION_SECRET = previousSecret
  }
})

test("flag off preserves the legacy prompt execution path", async () => {
  const response = await POST(request({ prompt: "legacy" }), { params: Promise.resolve({ workflowId: "7" }) })
  assert.equal((response as any).status, 202)
  assert.equal((response as any).body?.data?.executionMode, "fresh")
})
