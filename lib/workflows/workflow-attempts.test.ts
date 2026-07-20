import assert from "node:assert/strict"
import test from "node:test"

import { createInMemoryWorkflowAttemptStore } from "@/lib/workflows/workflow-attempts"

const definition = {
  workflowId: 42,
  title: "batch image",
  definition: { schemaVersion: 2, revision: 3, definitionHash: "a".repeat(64), nodes: [], edges: [] },
}

async function createRun() {
  const store = createInMemoryWorkflowAttemptStore()
  const created = await store.createWorkflowRunFromRevision({
    enterpriseId: 1,
    userId: 2,
    workflowId: 42,
    revisionId: 3,
    definitionHash: "a".repeat(64),
    definition,
    requestId: "00000000-0000-4000-8000-000000000001",
    nodes: [{ nodeKey: "foreach", nodeType: "foreach" }, { nodeKey: "generate", nodeType: "image_generate" }],
  })
  return { store, created }
}

test("run creation is idempotent by workflow/requestId and seeds node summaries", async () => {
  const { store, created } = await createRun()
  const repeated = await store.createWorkflowRunFromRevision({
    enterpriseId: 1,
    userId: 2,
    workflowId: 42,
    revisionId: 3,
    definitionHash: "a".repeat(64),
    definition,
    requestId: "00000000-0000-4000-8000-000000000001",
    nodes: [{ nodeKey: "foreach", nodeType: "foreach" }],
  })
  assert.equal(repeated.reused, true)
  assert.equal(repeated.run.id, created.run.id)
  assert.deepEqual(repeated.nodeExecutions.map((node) => node.nodeKey), ["foreach", "generate"])
})

test("resolved input creates ordered iterations and rejects sparse/oversized input", async () => {
  const { store, created } = await createRun()
  const iterations = await store.createIterationsForResolvedInput({
    runId: created.run.id,
    scopeNodeKey: "foreach",
    items: [
      { iterationKey: "asset-a", iterationIndex: 0, inputPayload: { url: "a" }, creditsReserved: 2 },
      { iterationKey: "asset-b", iterationIndex: 1, inputPayload: { url: "b" }, creditsReserved: 2 },
    ],
  })
  assert.deepEqual(iterations.map((item) => item.iterationKey), ["asset-a", "asset-b"])
  await assert.rejects(
    store.createIterationsForResolvedInput({ runId: created.run.id, scopeNodeKey: "foreach", items: [{ iterationKey: "bad", iterationIndex: 1 }] }),
    /workflow_iteration_index_invalid/,
  )
  await assert.rejects(
    store.createIterationsForResolvedInput({ runId: created.run.id, scopeNodeKey: "foreach", maxIterations: 1, items: [{ iterationKey: "a", iterationIndex: 0 }, { iterationKey: "b", iterationIndex: 1 }] }),
    /workflow_iteration_limit_exceeded/,
  )
})

test("attempt numbers append, idempotency returns original, and terminal completion is CAS", async () => {
  const { store, created } = await createRun()
  const [node] = created.nodeExecutions
  const [iteration] = await store.createIterationsForResolvedInput({ runId: created.run.id, scopeNodeKey: "foreach", items: [{ iterationKey: "asset-a", iterationIndex: 0 }] })
  const first = await store.startAttempt({ nodeExecutionId: node.id, iterationId: iteration.id, scopeKey: "asset-a", idempotencyKey: "submit-1", creditsReserved: 4 })
  const duplicate = await store.startAttempt({ nodeExecutionId: node.id, iterationId: iteration.id, scopeKey: "asset-a", idempotencyKey: "submit-1", creditsReserved: 99 })
  assert.equal(duplicate.id, first.id)
  assert.equal(first.attemptNumber, 1)
  const submitted = await store.markAttemptSubmitted({ attemptId: first.id, providerTaskId: "provider-task-1" })
  assert.equal(submitted?.status, "running")
  const succeeded = await store.completeAttempt({ attemptId: first.id, status: "succeeded", outputPayload: { artifactId: 7 }, creditsConsumed: 3 })
  assert.equal(succeeded?.status, "succeeded")
  const repeatedTerminal = await store.completeAttempt({ attemptId: first.id, status: "failed", errorCode: "late", creditsConsumed: 99 })
  assert.equal(repeatedTerminal?.status, "succeeded")
  assert.equal(repeatedTerminal?.creditsConsumed, 3)
  const retry = await store.startAttempt({ nodeExecutionId: node.id, iterationId: iteration.id, scopeKey: "asset-a", idempotencyKey: "submit-2" })
  assert.equal(retry.attemptNumber, 2)
})

test("run cancellation is idempotent and separates queued from running work", async () => {
  const { store, created } = await createRun()
  const [node] = created.nodeExecutions
  const [queued] = await store.createIterationsForResolvedInput({ runId: created.run.id, scopeNodeKey: "foreach", items: [{ iterationKey: "a", iterationIndex: 0 }, { iterationKey: "b", iterationIndex: 1 }] })
  const attempt = await store.startAttempt({ nodeExecutionId: node.id, iterationId: queued.id, scopeKey: "a", idempotencyKey: "cancel-1" })
  await store.markAttemptSubmitted({ attemptId: attempt.id, providerTaskId: "provider-task" })
  const cancellation = await store.requestRunCancellation(created.run.id)
  assert.equal(cancellation?.cancelledIterationCount, 1)
  assert.equal(cancellation?.cancelRequestedAttemptCount, 1)
  const repeated = await store.requestRunCancellation(created.run.id)
  assert.equal(repeated?.alreadyRequested, true)
})

test("cancellation wins the terminal race and active scopes reject a second attempt", async () => {
  const { store, created } = await createRun()
  const [node] = created.nodeExecutions
  const [iteration] = await store.createIterationsForResolvedInput({
    runId: created.run.id,
    scopeNodeKey: "foreach",
    items: [{ iterationKey: "asset-a", iterationIndex: 0 }],
  })
  const first = await store.startAttempt({
    nodeExecutionId: node.id,
    iterationId: iteration.id,
    scopeKey: "asset-a",
    idempotencyKey: "race-1",
  })
  await store.markAttemptSubmitted({ attemptId: first.id, providerTaskId: "provider-task" })
  await assert.rejects(
    store.startAttempt({
      nodeExecutionId: node.id,
      iterationId: iteration.id,
      scopeKey: "asset-a",
      idempotencyKey: "race-2",
    }),
    /workflow_attempt_in_progress/,
  )
  await store.requestRunCancellation(created.run.id)
  const lateSuccess = await store.completeAttempt({ attemptId: first.id, status: "succeeded", outputPayload: { late: true } })
  assert.equal(lateSuccess?.status, "cancel_requested")
  assert.equal(lateSuccess?.outputPayload, null)
})
