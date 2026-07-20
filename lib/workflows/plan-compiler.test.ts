import assert from "node:assert/strict"
import test from "node:test"

import {
  assertWorkflowIterationCount,
  compileWorkflowPlan,
  createWorkflowIterationKeys,
  sortWorkflowIterationsForCollect,
  WorkflowPlanCompilationError,
} from "@/lib/workflows/plan-compiler"

function node(nodeKey: string, type: string, config: Record<string, unknown> = {}) {
  return { nodeKey, type, title: nodeKey, positionX: 0, positionY: 0, config }
}

function edge(sourceNodeKey: string, targetNodeKey: string, edgeKey = `${sourceNodeKey}->${targetNodeKey}`) {
  return { edgeKey, sourceNodeKey, targetNodeKey, sourcePortId: "output", targetPortId: "input" }
}

function batchDefinition(config: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2 as const,
    revision: 1,
    definitionHash: "",
    nodes: [
      node("assets", "upload"),
      node("foreach", "foreach", { inputPortId: "image.reference", ...config }),
      node("prompt", "llm_generate"),
      node("generate", "image_generate"),
      node("collect", "collect"),
      node("output", "output"),
    ],
    edges: [
      edge("assets", "foreach"),
      edge("foreach", "prompt"),
      edge("prompt", "generate"),
      edge("generate", "collect"),
      edge("collect", "output"),
    ],
  }
}

test("compileWorkflowPlan emits deterministic DAG steps and foreach scope", () => {
  const plan = compileWorkflowPlan(batchDefinition())
  assert.equal(plan.schemaVersion, 1)
  assert.match(plan.definitionHash, /^[a-f0-9]{64}$/)
  assert.deepEqual(plan.steps, [
    { kind: "node", nodeKey: "assets", dependsOn: [] },
    {
      kind: "foreach",
      nodeKey: "foreach",
      collectNodeKey: "collect",
      bodyNodeKeys: ["prompt", "generate"],
      inputPortId: "image.reference",
      concurrency: 3,
      maxIterations: 20,
      failurePolicy: "continue",
      dependsOn: ["assets"],
    },
    { kind: "node", nodeKey: "output", dependsOn: ["foreach"] },
  ])
  assert.deepEqual(compileWorkflowPlan(batchDefinition()).steps, plan.steps)
})

test("compileWorkflowPlan accepts 0, 1, 20 and 100 static inputs, but rejects 101", () => {
  for (const count of [0, 1, 20, 100]) {
    assert.doesNotThrow(() => compileWorkflowPlan(batchDefinition({ items: Array.from({ length: count }, () => ({ value: count })) })))
  }
  assert.throws(() => compileWorkflowPlan(batchDefinition({ items: Array.from({ length: 101 }, () => ({ value: "too many" })) })), (error: unknown) =>
    error instanceof WorkflowPlanCompilationError && error.issues.some((item) => item.code === "workflow_iteration_limit_exceeded"))
  assert.doesNotThrow(() => assertWorkflowIterationCount(0))
  assert.doesNotThrow(() => assertWorkflowIterationCount(100))
  assert.throws(() => assertWorkflowIterationCount(101), (error: unknown) =>
    error instanceof WorkflowPlanCompilationError && error.issues[0]?.code === "workflow_iteration_limit_exceeded")
})

test("compiler rejects scope edges that enter from outside, bypass collect, nest foreach, or pair multiple collects", () => {
  const externalEntry = batchDefinition()
  externalEntry.nodes.push(node("other", "llm_generate"))
  externalEntry.edges.push(edge("other", "generate", "external-entry"))
  assert.throws(() => compileWorkflowPlan(externalEntry), (error: unknown) =>
    error instanceof WorkflowPlanCompilationError && error.issues.some((item) => item.code === "foreach_scope_external_entry"))

  const bypass = batchDefinition()
  bypass.edges.push(edge("generate", "output", "bypass"))
  assert.throws(() => compileWorkflowPlan(bypass), (error: unknown) =>
    error instanceof WorkflowPlanCompilationError && error.issues.some((item) => item.code === "foreach_scope_bypass_collect"))

  const nested = batchDefinition()
  nested.nodes.push(node("nested", "foreach"))
  nested.edges.push(edge("prompt", "nested", "nested-entry"), edge("nested", "generate", "nested-exit"))
  assert.throws(() => compileWorkflowPlan(nested), (error: unknown) =>
    error instanceof WorkflowPlanCompilationError && error.issues.some((item) => item.code === "foreach_nested_not_supported"))

  const multipleCollects = batchDefinition()
  multipleCollects.nodes.push(node("collect-2", "collect"))
  multipleCollects.edges.push(edge("prompt", "collect-2", "collect-2-entry"), edge("collect-2", "output", "collect-2-output"))
  assert.throws(() => compileWorkflowPlan(multipleCollects), (error: unknown) =>
    error instanceof WorkflowPlanCompilationError && error.issues.some((item) => item.code === "foreach_collect_pair_invalid"))
})

test("iteration keys use logical IDs, canonical hashes, and deterministic duplicate suffixes", () => {
  const inputs = [{ logicalId: "asset-a" }, { logicalId: "asset-a" }, { value: 1 }, { value: 1 }]
  const first = createWorkflowIterationKeys(inputs)
  const second = createWorkflowIterationKeys(inputs.map((input) => ({ ...input })))
  assert.deepEqual(first, second)
  assert.deepEqual(first.slice(0, 2), ["asset-a", "asset-a:1"])
  assert.match(first[2], /^[a-f0-9]{32}$/)
  assert.match(first[3], /^[a-f0-9]{32}:1$/)
})

test("collect ordering follows input index, not provider completion order", () => {
  const completionOrder = [
    { iterationKey: "a:1", index: 1, status: "succeeded" as const },
    { iterationKey: "a", index: 0, status: "succeeded" as const },
    { iterationKey: "a:2", index: 2, status: "failed" as const },
  ]
  assert.deepEqual(sortWorkflowIterationsForCollect(completionOrder).map((item) => item.iterationKey), ["a", "a:1", "a:2"])
})
