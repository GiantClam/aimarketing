import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as { _load: (request: string, parent: unknown, isMain: boolean) => unknown }
const originalLoad = nodeModule._load

let currentUser: any = { id: 1, enterpriseId: 9 }
let detail: any = { run: { status: "running" } }
let cancellation: any = {
  taskRunId: 12,
  alreadyRequested: false,
  cancelledIterationCount: 2,
  cancelRequestedAttemptCount: 1,
}

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "next/server") {
    return { NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status || 200, body }) } }
  }
  if (request === "@/lib/auth/session") return { getSessionUser: async () => currentUser }
  if (request === "@/lib/workflows/store") return { getWorkflowRunDetail: async () => detail }
  if (request === "@/lib/workflows/workflow-attempts") return { requestRunCancellation: async () => cancellation }
  return originalLoad.call(this, request, parent, isMain)
}

let POST: typeof import("./route").POST

test.before(async () => {
  POST = (await import("./route")).POST
})

test.beforeEach(() => {
  currentUser = { id: 1, enterpriseId: 9 }
  detail = { run: { status: "running" } }
  cancellation = { taskRunId: 12, alreadyRequested: false, cancelledIterationCount: 2, cancelRequestedAttemptCount: 1 }
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("cancel route is tenant scoped and returns 202 for first request", async () => {
  const response = await POST({} as any, { params: Promise.resolve({ runId: "12" }) })
  assert.equal((response as any).status, 202)
  assert.equal((response as any).body?.data?.status, "cancel_requested")
  assert.equal((response as any).body?.data?.cancelledIterationCount, 2)
  assert.equal((response as any).body?.data?.providerCancelNotSupportedCount, 0)
})

test("cancel route exposes provider cancellation audit counts", async () => {
  cancellation = { ...cancellation, providerCancelRequestedCount: 1, providerCancelNotSupportedCount: 2 }
  const response = await POST({} as any, { params: Promise.resolve({ runId: "12" }) })
  assert.equal((response as any).body?.data?.providerCancelRequestedCount, 1)
  assert.equal((response as any).body?.data?.providerCancelNotSupportedCount, 2)
})

test("cancel route is idempotent and preserves terminal state", async () => {
  cancellation = { ...cancellation, alreadyRequested: true }
  const repeated = await POST({} as any, { params: Promise.resolve({ runId: "12" }) })
  assert.equal((repeated as any).status, 200)

  detail = { run: { status: "succeeded" } }
  cancellation = { ...cancellation, alreadyRequested: true }
  const terminal = await POST({} as any, { params: Promise.resolve({ runId: "12" }) })
  assert.equal((terminal as any).status, 200)
  assert.equal((terminal as any).body?.data?.status, "succeeded")
})

test("cancel route returns uniform errors for auth, id and tenant misses", async () => {
  currentUser = null
  assert.equal((await POST({} as any, { params: Promise.resolve({ runId: "12" }) }) as any).status, 401)
  currentUser = { id: 1, enterpriseId: null }
  assert.equal((await POST({} as any, { params: Promise.resolve({ runId: "12" }) }) as any).status, 403)
  currentUser = { id: 1, enterpriseId: 9 }
  assert.equal((await POST({} as any, { params: Promise.resolve({ runId: "bad" }) }) as any).status, 400)
  detail = null
  assert.equal((await POST({} as any, { params: Promise.resolve({ runId: "12" }) }) as any).status, 404)
})
