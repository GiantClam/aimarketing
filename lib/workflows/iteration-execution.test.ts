import assert from "node:assert/strict"
import test from "node:test"

import { createInMemoryWorkflowAttemptStore } from "@/lib/workflows/workflow-attempts"
import { runPersistedWorkflowIterationDefinition } from "@/lib/workflows/iteration-execution"

const media = (id: string) => ({ url: `https://example.test/${id}.png`, assetId: id, logicalId: id, mimeType: "image/png" })

function definition() {
  return {
    nodes: [
      { nodeKey: "foreach", type: "foreach" as const, title: "Foreach", positionX: 0, positionY: 0, config: { inputPortId: "image.reference", collectNodeKey: "collect", concurrency: 2, maxIterations: 10, failurePolicy: "continue" } },
      { nodeKey: "llm", type: "llm_generate" as const, title: "LLM", positionX: 1, positionY: 0, config: {} },
      { nodeKey: "image", type: "image_generate" as const, title: "Image", positionX: 2, positionY: 0, config: {} },
      { nodeKey: "collect", type: "collect" as const, title: "Collect", positionX: 3, positionY: 0, config: { includeFailures: true } },
      { nodeKey: "output", type: "output" as const, title: "Output", positionX: 4, positionY: 0, config: { requireAllSucceeded: false } },
    ],
    edges: [
      { edgeKey: "foreach-llm", sourceNodeKey: "foreach", targetNodeKey: "llm", inputName: "image" },
      { edgeKey: "llm-image", sourceNodeKey: "llm", targetNodeKey: "image", inputName: "text" },
      { edgeKey: "image-collect", sourceNodeKey: "image", targetNodeKey: "collect", inputName: "image" },
      { edgeKey: "collect-output", sourceNodeKey: "collect", targetNodeKey: "output", inputName: "image" },
    ],
  }
}

function createRun(store: ReturnType<typeof createInMemoryWorkflowAttemptStore>) {
  return store.createWorkflowRunFromRevision({
    enterpriseId: 1,
    userId: 2,
    workflowId: 3,
    revisionId: 4,
    definitionHash: "a".repeat(64),
    definition: { schemaVersion: 2, revision: 1, nodes: [], edges: [] },
    requestId: "123e4567-e89b-12d3-a456-426614174000",
    nodes: definition().nodes.map((node) => ({ nodeKey: node.nodeKey, nodeType: node.type })),
  })
}

function invoker(input: { failAsset?: string }) {
  return async ({ nodeType, input: nodeInput }: any) => {
    if (nodeType === "llm_generate") return { output: { text: [`prompt:${nodeInput.image[0]?.assetId ?? "unknown"}`] } }
    if (nodeType === "image_generate") {
      // The body edge from LLM -> image is a text port.  Keep the source
      // asset identity in the generated prompt so the fixture exercises the
      // typed body-port projection instead of depending on an invalid image
      // input at the image node.
      const prompt = nodeInput.text[0] as string | undefined
      const assetId = prompt?.replace(/^prompt:/, "") ?? "unknown"
      if (assetId === input.failAsset) throw new Error("provider_submit_failed")
      return { output: { image: [{ ...media(`generated-${assetId}`), sourceNodeKey: "image" }] } }
    }
    throw new Error(`unexpected_node:${nodeType}`)
  }
}

test("M3 dispatches foreach body, persists attempts, and collects in input order", async () => {
  const store = createInMemoryWorkflowAttemptStore()
  const created = await createRun(store)
  const graph = definition()
  const result = await runPersistedWorkflowIterationDefinition({
    runId: created.run.id,
    enterpriseId: 1,
    ownerUserId: 2,
    nodes: graph.nodes,
    edges: graph.edges,
    seedInput: { image: [media("a"), media("b")] },
    nodeExecutionIds: new Map(created.nodeExecutions.map((execution) => [execution.nodeKey, execution.id])),
    persistence: store,
    executorContext: { capabilityInvoker: invoker({}) },
  })

  assert.equal(result.status, "succeeded")
  assert.deepEqual(result.outcomes.map((item) => item.iterationKey), ["a", "b"])
  assert.deepEqual(result.outcomes.map((item) => item.status), ["succeeded", "succeeded"])
  assert.deepEqual(store.listAttempts().map((attempt) => attempt.idempotencyKey), [
    `${created.run.id}:foreach:a:1`,
    `${created.run.id}:foreach:b:1`,
  ])
  assert.equal(result.nodeStates.output.status, "succeeded")
  assert.equal((result.nodeStates.output.output.image ?? []).length, 2)
})

test("iteration-only retry consumes the failed item and allocates a non-:1 attempt key", async () => {
  const store = createInMemoryWorkflowAttemptStore()
  const created = await createRun(store)
  const graph = definition()
  const base = {
    runId: created.run.id,
    enterpriseId: 1,
    ownerUserId: 2,
    nodes: graph.nodes,
    edges: graph.edges,
    seedInput: { image: [media("a"), media("b")] },
    nodeExecutionIds: new Map(created.nodeExecutions.map((execution) => [execution.nodeKey, execution.id])),
    persistence: store,
    executorContext: { capabilityInvoker: invoker({ failAsset: "b" }) },
  }
  const first = await runPersistedWorkflowIterationDefinition(base)
  assert.equal(first.outcomes.find((item) => item.iterationKey === "b")?.status, "failed")

  const retry = await runPersistedWorkflowIterationDefinition({
    ...base,
    executorContext: { capabilityInvoker: invoker({}) },
    retry: { iterationKey: "b" },
  })
  assert.equal(retry.status, "succeeded")
  assert.equal(retry.outcomes.find((item) => item.iterationKey === "b")?.status, "succeeded")
  assert.ok(store.listAttempts().some((attempt) => attempt.idempotencyKey.endsWith(":b:2")))
})

test("cancel_requested signal terminalizes the iteration run without dispatching post nodes", async () => {
  const store = createInMemoryWorkflowAttemptStore()
  const created = await createRun(store)
  const graph = definition()
  const controller = new AbortController()
  controller.abort("user_cancelled")
  const result = await runPersistedWorkflowIterationDefinition({
    runId: created.run.id,
    enterpriseId: 1,
    ownerUserId: 2,
    nodes: graph.nodes,
    edges: graph.edges,
    seedInput: { image: [media("a")] },
    nodeExecutionIds: new Map(created.nodeExecutions.map((execution) => [execution.nodeKey, execution.id])),
    persistence: store,
    executorContext: {
      capabilityInvoker: async () => {
        throw new Error("post_scope_dispatch_should_not_happen")
      },
    },
    signal: controller.signal,
  })
  assert.equal(result.status, "cancelled")
  assert.deepEqual(result.outcomes.map((item) => item.status), ["cancelled"])
  assert.equal(result.nodeStates.collect.status, "cancelled")
  assert.equal(result.nodeStates.output.status, "cancelled")
  assert.equal(store.listAttempts().length, 0)
})
