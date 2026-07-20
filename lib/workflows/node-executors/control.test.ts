import assert from "node:assert/strict"
import test from "node:test"

import {
  collectWorkflowIterationResults,
  isWorkflowIterationFailure,
  shouldStopWorkflowIterationScope,
} from "@/lib/workflows/node-executors/control"
import { createWorkflowNodeInputBundle, resolveWorkflowNodeExecutor } from "@/lib/workflows/node-executors"

function node(type: "foreach" | "collect" | "output", config: Record<string, unknown> = {}) {
  return {
    nodeKey: `${type}-1`,
    type,
    title: type,
    positionX: 0,
    positionY: 0,
    config,
  } as const
}

function context(type: "foreach" | "collect" | "output", config: Record<string, unknown> = {}, input = createWorkflowNodeInputBundle()) {
  return {
    enterpriseId: 1,
    ownerUserId: 1,
    node: node(type, config),
    input,
  }
}

test("iteration collection is stable by input index, not completion order", () => {
  const items = collectWorkflowIterationResults([
    { iterationKey: "image-2", index: 2, status: "succeeded", output: { image: [{ url: "two" }] } },
    { iterationKey: "image-0", index: 0, status: "succeeded", output: { image: [{ url: "zero" }] } },
    { iterationKey: "image-1", index: 1, status: "failed", error: "provider failed" },
  ], { includeFailures: true })

  assert.deepEqual(items.map((item) => item.iterationKey), ["image-0", "image-1", "image-2"])
  assert.equal(items[1]?.error, "provider failed")
  assert.deepEqual(items[0]?.artifacts, { image: [{ url: "zero" }] })
})

test("collect executor returns successful artifacts and records failures", async () => {
  const executor = resolveWorkflowNodeExecutor("collect")
  const result = await executor.execute(context("collect", {
    includeFailures: true,
    iterationResults: [
      { iterationKey: "b", index: 1, status: "failed", error: "timeout" },
      { iterationKey: "a", index: 0, status: "succeeded", output: { image: [{ url: "first" }] } },
    ],
  }))

  assert.deepEqual(result.output.image, [{ url: "first" }])
  assert.equal(result.metadata?.controlNode, "collect")
  assert.equal(result.metadata?.warningCount, 1)
  assert.deepEqual((result.metadata?.items as Array<{ iterationKey: string }>).map((item) => item.iterationKey), ["a", "b"])
})

test("output allows partial results when requireAllSucceeded is false", async () => {
  const executor = resolveWorkflowNodeExecutor("output")
  const result = await executor.execute(context("output", {
    requireAllSucceeded: false,
    iterationResults: [
      { iterationKey: "failed", index: 1, status: "failed", error: "provider failed" },
      { iterationKey: "ok", index: 0, status: "succeeded", output: { image: [{ url: "ok" }] } },
    ],
  }))

  assert.deepEqual(result.output.image, [{ url: "ok" }])
  assert.equal(result.metadata?.warningCount, 1)
})

test("output rejects failed or empty results according to policy", async () => {
  const executor = resolveWorkflowNodeExecutor("output")
  await assert.rejects(
    executor.execute(context("output", {
      requireAllSucceeded: true,
      iterationResults: [{ iterationKey: "failed", index: 0, status: "failed", error: "bad input" }],
    })),
    /workflow_iteration_failed/,
  )
  await assert.rejects(executor.execute(context("output")), /empty_output/)
  const empty = await executor.execute(context("output", { allowEmpty: true }))
  assert.deepEqual(empty.output, { text: [], asset: [], image: [], video: [], audio: [], ppt: [] })
})

test("foreach only emits scope metadata and clamps scheduling limits", async () => {
  const executor = resolveWorkflowNodeExecutor("foreach")
  const input = { ...createWorkflowNodeInputBundle(), image: [{ url: "source" }] }
  const result = await executor.execute(context("foreach", {
    failurePolicy: "fail_fast",
    concurrency: 99,
    maxIterations: 999,
    collectNodeKey: "collect-1",
  }, input))

  assert.deepEqual(result.output.image, input.image)
  assert.equal(result.metadata?.scopeOnly, true)
  assert.equal(result.metadata?.failurePolicy, "fail_fast")
  assert.equal(result.metadata?.concurrency, 6)
  assert.equal(result.metadata?.maxIterations, 100)
})

test("failure policy helper only stops fail_fast scopes", () => {
  assert.equal(isWorkflowIterationFailure("cancelled"), true)
  assert.equal(isWorkflowIterationFailure("succeeded"), false)
  assert.equal(shouldStopWorkflowIterationScope({ failurePolicy: "fail_fast", status: "failed" }), true)
  assert.equal(shouldStopWorkflowIterationScope({ failurePolicy: "continue", status: "failed" }), false)
})

