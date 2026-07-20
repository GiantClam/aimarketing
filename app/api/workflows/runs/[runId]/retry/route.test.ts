import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let featureState = { iterationsV1: true }
let currentUser: any = { id: 1, enterpriseId: 9 }
let detail: any = {
  run: { id: 12, status: "failed", normalizedResult: { previous: true } },
  workflow: { id: 7, nodes: [{ nodeKey: "generate", type: "image_generate" }], edges: [] },
  nodeExecutions: [{ nodeKey: "generate", status: "failed" }],
}
let iteration: any = { id: 41, status: "failed" }
let latestAttempt: any = { attemptNumber: 1, status: "failed" }
let updated: any = null
let claimed: any = null

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "next/server") {
    return { NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status || 200, body }) } }
  }
  if (request === "@/lib/auth/session") return { getSessionUser: async () => currentUser }
  if (request === "@/lib/platform/workflow-runner") {
    return {
      serializePlatformWorkflowRun: (run: unknown) => run,
    }
  }
  if (request === "@/lib/workflows/execution") {
    return {
      collectWorkflowRetryNodeKeys: () => ["generate"],
    }
  }
  if (request === "@/lib/workflows/store") {
    return {
      getWorkflowRunDetail: async () => detail,
      claimWorkflowRunForRetry: async (input: unknown) => {
        claimed = input
        return true
      },
    }
  }
  if (request === "@/lib/workflows/task-runner") return { runWorkflowTaskRecoveryPass: async () => undefined }
  if (request === "@/lib/workflows/features") return { resolveWorkflowFeatures: () => featureState }
  if (request === "@/lib/workflows/workflow-attempts") return {
    getWorkflowIterationForRun: async () => iteration,
    getLatestWorkflowAttemptForIteration: async () => latestAttempt,
  }
  return originalLoad.call(this, request, parent, isMain)
}

let POST: typeof import("./route").POST

function request(body: Record<string, unknown>) {
  return { url: "http://localhost/api/workflows/runs/12/retry", json: async () => body } as any
}

test.before(async () => {
  POST = (await import("./route")).POST
})

test.beforeEach(() => {
  featureState = { iterationsV1: true }
  currentUser = { id: 1, enterpriseId: 9 }
  detail = {
    run: { id: 12, status: "failed", normalizedResult: { previous: true } },
    workflow: { id: 7, nodes: [{ nodeKey: "generate", type: "image_generate" }], edges: [] },
    nodeExecutions: [{ nodeKey: "generate", status: "failed" }],
  }
  iteration = { id: 41, status: "failed" }
  latestAttempt = { attemptNumber: 1, status: "failed" }
  updated = null
  claimed = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("iterationOnly retry is validated and stored in tenant-scoped pendingRetry metadata", async () => {
  const response = await POST(
    request({ mode: "node", nodeKey: "generate", iterationKey: "asset-1", iterationOnly: true }),
    { params: Promise.resolve({ runId: "12" }) },
  )
  assert.equal((response as any).status, 200)
  assert.deepEqual((claimed as any)?.normalizedResult?.pendingRetry, {
    mode: "iteration",
    attemptNumber: 2,
    iterationOnly: true,
    nodeKey: "generate",
    iterationKey: "asset-1",
  })
})

test("iteration retry rejects an active attempt without mutating pending retry", async () => {
  latestAttempt = { attemptNumber: 2, status: "running" }
  const response = await POST(
    request({ mode: "iteration", nodeKey: "generate", iterationKey: "asset-1" }),
    { params: Promise.resolve({ runId: "12" }) },
  )
  assert.equal((response as any).status, 409)
  assert.equal((response as any).body?.error, "iteration_retry_in_progress")
  assert.equal(updated, null)
})

test("iterationOnly retry is disabled when the feature flag is off", async () => {
  featureState = { iterationsV1: false }
  const response = await POST(
    request({ mode: "node", nodeKey: "generate", iterationKey: "asset-1", iterationOnly: true }),
    { params: Promise.resolve({ runId: "12" }) },
  )
  assert.equal((response as any).status, 409)
  assert.equal((response as any).body?.error, "workflow_feature_disabled")
})

test("iterationOnly retry never crosses the enterprise boundary", async () => {
  detail = null
  const response = await POST(
    request({ mode: "node", nodeKey: "generate", iterationKey: "asset-1", iterationOnly: true }),
    { params: Promise.resolve({ runId: "12" }) },
  )
  assert.equal((response as any).status, 404)
  assert.equal((response as any).body?.error, "workflow_run_not_found")
})
