import assert from "node:assert/strict"
import test from "node:test"

import {
  isWorkflowRunStale,
  parseWorkflowRetryRequest,
  shouldEvictActiveWorkflowRunTracker,
  stripWorkflowRetryRequest,
  type RecoverableWorkflowRun,
} from "@/lib/workflows/task-runner-helpers"

test("parseWorkflowRetryRequest reads valid queued retry metadata", () => {
  assert.deepEqual(
    parseWorkflowRetryRequest({
      pendingRetry: {
        mode: "branch",
        nodeKey: "image-4",
      },
    }),
    {
      mode: "branch",
      nodeKey: "image-4",
    },
  )
})

test("stripWorkflowRetryRequest removes pending retry metadata but preserves workflow result fields", () => {
  assert.deepEqual(
    stripWorkflowRetryRequest({
      workflowId: 2,
      workflowStatus: "failed",
      pendingRetry: {
        mode: "node",
        nodeKey: "llm-1",
      },
    }),
    {
      workflowId: 2,
      workflowStatus: "failed",
    },
  )
})

test("isWorkflowRunStale marks old running workflow runs as stale", () => {
  const staleRun: RecoverableWorkflowRun = {
    id: 72,
    userId: 7,
    enterpriseId: 11,
    status: "running",
    createdAt: new Date(Date.now() - 120_000),
    updatedAt: new Date(Date.now() - 90_000),
    normalizedResult: null,
  }

  assert.equal(isWorkflowRunStale(staleRun, 45_000), true)
})

test("shouldEvictActiveWorkflowRunTracker evicts queued retries even if an old tracker remains", () => {
  const queuedRun: RecoverableWorkflowRun = {
    id: 88,
    userId: 96,
    enterpriseId: 151,
    status: "queued",
    createdAt: new Date(Date.now() - 120_000),
    updatedAt: new Date(),
    normalizedResult: {
      pendingRetry: {
        mode: "branch",
        nodeKey: "image-3",
      },
    },
  }

  assert.equal(
    shouldEvictActiveWorkflowRunTracker({
      run: queuedRun,
      hasActiveTracker: true,
      staleAfterMs: 45_000,
    }),
    true,
  )
})

test("shouldEvictActiveWorkflowRunTracker evicts stale running trackers", () => {
  const staleRun: RecoverableWorkflowRun = {
    id: 91,
    userId: 96,
    enterpriseId: 151,
    status: "running",
    createdAt: new Date(Date.now() - 120_000),
    updatedAt: new Date(Date.now() - 90_000),
    normalizedResult: null,
  }

  assert.equal(
    shouldEvictActiveWorkflowRunTracker({
      run: staleRun,
      hasActiveTracker: true,
      staleAfterMs: 45_000,
    }),
    true,
  )
})
