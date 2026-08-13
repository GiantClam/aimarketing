import assert from "node:assert/strict"
import test from "node:test"

import { executeWorkflow, migrateWorkflowDefinitionToCurrent } from "@aimarketing/workflow-core"
import { runSaasWorkflowWithSharedCore } from "@/lib/workflows/shared-execution-adapter"

test("shared core and SaaS adapter produce equivalent ordinary-DAG outputs", async () => {
  const nodes = [
    { nodeKey: "input", type: "text_input", title: "Input", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "writer", type: "writer", title: "Writer", positionX: 1, positionY: 0, config: {} },
  ] as const
  const edges = [{ sourceNodeKey: "input", targetNodeKey: "writer", inputName: "text" }] as const
  const definition = migrateWorkflowDefinitionToCurrent({ nodes: [...nodes], edges: [...edges] })
  const core = await executeWorkflow(definition, {
    runId: "shared-fixture",
    ports: {
      capability: {
        execute: async ({ nodeKey, inputs }) => nodeKey === "input"
          ? { text: ["Launch brief"] }
          : { text: [`Draft: ${(inputs.text as string[]).join(" ")}`] },
      },
    },
  })
  const saas = await runSaasWorkflowWithSharedCore({
    enterpriseId: 1,
    ownerUserId: 2,
    nodes: [...nodes],
    edges: [...edges],
    seedInput: { text: ["Launch brief"] },
    executorContext: {
      capabilityInvoker: async ({ input }) => ({ output: { text: [`Draft: ${input.text.join(" ")}`] } }),
    },
  })

  assert.equal(core.status, "succeeded")
  assert.equal(saas.status, "succeeded")
  assert.deepEqual(saas.nodeStates.writer?.output, core.outputs.writer)
})

test("SaaS adapter runs an ordinary workflow through shared scheduling while retaining host capability execution", async () => {
  const updates: string[] = []
  const invoked: string[] = []
  const result = await runSaasWorkflowWithSharedCore({
    enterpriseId: 1,
    ownerUserId: 2,
    nodes: [
      { nodeKey: "input", type: "text_input", title: "Input", positionX: 0, positionY: 0, config: {} },
      { nodeKey: "writer", type: "writer", title: "Writer", positionX: 1, positionY: 0, config: {} },
    ],
    edges: [{ sourceNodeKey: "input", targetNodeKey: "writer", inputName: "text" }],
    seedInput: { text: ["Launch brief"] },
    executorContext: {
      capabilityInvoker: async ({ node, input }) => {
        invoked.push(`${node.nodeKey}:${input.text.join(" ")}`)
        return { output: { text: [`Draft: ${input.text.join(" ")}`] }, providerId: "host-provider", creditsConsumed: 3 }
      },
    },
    onNodeStateChange: (state) => { updates.push(`${state.nodeKey}:${state.status}`) },
  })

  assert.equal(result.status, "succeeded")
  assert.deepEqual(invoked, ["writer:Launch brief"])
  assert.deepEqual(result.nodeStates.input?.output.text, ["Launch brief"])
  assert.deepEqual(result.nodeStates.writer?.output.text, ["Draft: Launch brief"])
  assert.equal(result.nodeStates.writer?.providerId, "host-provider")
  assert.equal(result.nodeStates.writer?.creditsConsumed, 3)
  assert.deepEqual(updates, ["input:running", "input:succeeded", "writer:running", "writer:succeeded"])
})

test("SaaS adapter reports host capability failures through the existing node-state persistence seam", async () => {
  const updates: string[] = []
  const result = await runSaasWorkflowWithSharedCore({
    enterpriseId: 1,
    ownerUserId: 2,
    nodes: [
      { nodeKey: "input", type: "text_input", title: "Input", positionX: 0, positionY: 0, config: { text: "Brief" } },
      { nodeKey: "writer", type: "writer", title: "Writer", positionX: 1, positionY: 0, config: {} },
    ],
    edges: [{ sourceNodeKey: "input", targetNodeKey: "writer", inputName: "text" }],
    executorContext: { capabilityInvoker: async () => { throw new Error("provider_unavailable") } },
    onNodeStateChange: (state) => { updates.push(`${state.nodeKey}:${state.status}`) },
  })

  assert.equal(result.status, "failed")
  assert.equal(result.nodeStates.writer?.errorMessage, "provider_unavailable")
  assert.deepEqual(updates, ["input:running", "input:succeeded", "writer:running", "writer:failed"])
})

test("SaaS adapter persists unstarted descendants as cancelled after a shared-core failure", async () => {
  const result = await runSaasWorkflowWithSharedCore({
    enterpriseId: 1,
    ownerUserId: 2,
    nodes: [
      { nodeKey: "input", type: "text_input", title: "Input", positionX: 0, positionY: 0, config: { text: "Brief" } },
      { nodeKey: "writer", type: "writer", title: "Writer", positionX: 1, positionY: 0, config: {} },
      { nodeKey: "file", type: "file_create", title: "File", positionX: 2, positionY: 0, config: {} },
    ],
    edges: [
      { sourceNodeKey: "input", targetNodeKey: "writer", inputName: "text" },
      { sourceNodeKey: "writer", targetNodeKey: "file", inputName: "text" },
    ],
    executorContext: { capabilityInvoker: async () => { throw new Error("provider_unavailable") } },
  })

  assert.equal(result.status, "failed")
  assert.equal(result.nodeStates.file?.status, "cancelled")
  assert.equal(result.nodeStates.file?.errorMessage, "workflow_upstream_failed")
})

test("SaaS adapter resumes completed outputs and increments only retried node attempts", async () => {
  const invoked: string[] = []
  const previousTime = new Date(0)
  const result = await runSaasWorkflowWithSharedCore({
    enterpriseId: 1,
    ownerUserId: 2,
    nodes: [
      { nodeKey: "input", type: "text_input", title: "Input", positionX: 0, positionY: 0, config: { text: "Ignored" } },
      { nodeKey: "writer", type: "writer", title: "Writer", positionX: 1, positionY: 0, config: {} },
    ],
    edges: [{ sourceNodeKey: "input", targetNodeKey: "writer", inputName: "text" }],
    initialNodeStates: {
      input: { nodeKey: "input", status: "succeeded", attemptCount: 1, output: { text: ["Persisted brief"] }, startedAt: previousTime, finishedAt: previousTime, creditsConsumed: 0 },
      writer: { nodeKey: "writer", status: "failed", attemptCount: 1, output: {}, startedAt: previousTime, finishedAt: previousTime, creditsConsumed: 0, errorMessage: "provider_timeout" },
    },
    rerunNodeKeys: ["writer"],
    executorContext: {
      capabilityInvoker: async ({ node, input }) => {
        invoked.push(`${node.nodeKey}:${input.text.join(" ")}`)
        return { output: { text: ["Recovered"] } }
      },
    },
  })

  assert.equal(result.status, "succeeded")
  assert.deepEqual(invoked, ["writer:Persisted brief"])
  assert.equal(result.nodeStates.input?.attemptCount, 1)
  assert.equal(result.nodeStates.writer?.attemptCount, 2)
  assert.deepEqual(result.nodeStates.writer?.output.text, ["Recovered"])
})
