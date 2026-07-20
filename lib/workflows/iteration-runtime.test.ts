import assert from "node:assert/strict"
import test from "node:test"

import {
  createWorkflowConfirmationToken,
  runPersistedWorkflowIterations,
  runWorkflowIterations,
  verifyWorkflowConfirmationToken,
  type IterationRuntimeItem,
} from "@/lib/workflows/iteration-runtime"

const requestId = "123e4567-e89b-12d3-a456-426614174000"
const secret = "s".repeat(32)

function rejectionCode(value: ReturnType<typeof verifyWorkflowConfirmationToken>) {
  return value.ok ? null : value.code
}

test("confirmation token is bound to request scope and rejects tampering/expiry", () => {
  const payload = {
    enterpriseId: 7,
    workflowId: 11,
    revision: 4,
    requestId,
    taskCount: 3,
    maxCredits: 9,
    expiresAt: Date.now() + 60_000,
  }
  const token = createWorkflowConfirmationToken(payload, secret)
  assert.deepEqual(verifyWorkflowConfirmationToken(token, secret, payload).ok, true)
  assert.equal(
    rejectionCode(verifyWorkflowConfirmationToken(token, secret, { ...payload, workflowId: 12 })),
    "invalid_confirmation_token",
  )
  assert.equal(
    rejectionCode(verifyWorkflowConfirmationToken(token, secret, payload, payload.expiresAt + 1)),
    "confirmation_token_expired",
  )
  assert.equal(rejectionCode(verifyWorkflowConfirmationToken(`${token}x`, secret, payload)), "invalid_confirmation_token")
})

test("runtime respects concurrency, preserves input ordering, and reports failures", async () => {
  const items: IterationRuntimeItem<number>[] = [0, 1, 2, 3, 4].map((value) => ({
    iterationKey: `asset-${value}`,
    iterationIndex: value,
    input: value,
  }))
  let active = 0
  let peak = 0
  const completion: number[] = []
  const result = await runWorkflowIterations({
    runId: 10,
    scopeNodeKey: "foreach",
    items,
    concurrency: 3,
    execute: async (value, _context) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, (4 - value) * 2))
      active -= 1
      completion.push(value)
      if (value === 2) throw new Error("provider_submit_failed")
      return { output: value * 2, creditsConsumed: value }
    },
  })
  assert.equal(peak, 3)
  assert.notDeepEqual(completion, [0, 1, 2, 3, 4])
  assert.deepEqual(result.outcomes.map((item) => item.iterationKey), items.map((item) => item.iterationKey))
  assert.deepEqual(result.outcomes.map((item) => item.status), ["succeeded", "succeeded", "failed", "succeeded", "succeeded"])
  assert.deepEqual(result.successfulOutputs, [0, 2, 6, 8])
  assert.equal(result.warningCount, 1)
  assert.equal(result.status, "succeeded")
})

test("fail_fast cancels queued work and aborts the run", async () => {
  const controller = new AbortController()
  const result = await runWorkflowIterations({
    runId: 10,
    scopeNodeKey: "foreach",
    items: [0, 1, 2, 3].map((value) => ({ iterationKey: String(value), iterationIndex: value, input: value })),
    concurrency: 1,
    failurePolicy: "fail_fast",
    execute: async (value) => {
      if (value === 0) throw new Error("provider_submit_failed")
      return value
    },
    signal: controller.signal,
  })
  assert.equal(result.status, "failed")
  assert.deepEqual(result.outcomes.map((item) => item.status), ["failed", "cancelled", "cancelled", "cancelled"])
})

test("external cancellation produces cancelled terminal status", async () => {
  const controller = new AbortController()
  const promise = runWorkflowIterations({
    runId: 10,
    scopeNodeKey: "foreach",
    items: [0, 1, 2].map((value) => ({ iterationKey: String(value), iterationIndex: value, input: value })),
    concurrency: 1,
    execute: async (_value, context) => {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 50)
        context.signal.addEventListener("abort", () => {
          clearTimeout(timer)
          reject(new DOMException("cancelled", "AbortError"))
        }, { once: true })
      })
      return "done"
    },
    signal: controller.signal,
  })
  setTimeout(() => controller.abort("user_cancelled"), 5)
  const result = await promise
  assert.equal(result.status, "cancelled")
  assert.deepEqual(result.outcomes.map((item) => item.status), ["cancelled", "cancelled", "cancelled"])
})

test("persisted runtime uses deterministic attempt idempotency keys", async () => {
  const calls: string[] = []
  let id = 0
  const persistence = {
    async createIterationsForResolvedInput() { return [] },
    async startAttempt(input: any) {
      calls.push(`start:${input.idempotencyKey}`)
      return { id: ++id }
    },
    async markAttemptSubmitted(input: any) { calls.push(`submit:${input.attemptId}`); return input },
    async completeAttempt(input: any) { calls.push(`complete:${input.attemptId}:${input.status}`); return input },
  }
  const result = await runPersistedWorkflowIterations({
    runId: 20,
    nodeExecutionId: 3,
    scopeNodeKey: "foreach",
    items: [{ iterationKey: "asset-a", iterationIndex: 0, input: { url: "a" } }],
    persistence,
    execute: async () => ({ output: { artifactId: 1 }, creditsConsumed: 2 }),
  })
  assert.equal(result.status, "succeeded")
  assert.deepEqual(calls, [
    "start:20:foreach:asset-a:1",
    "submit:1",
    "complete:1:succeeded",
  ])
})
