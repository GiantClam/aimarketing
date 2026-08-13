import assert from "node:assert/strict"
import test from "node:test"

import { runSaasWorkflowWithSharedCore } from "@/lib/workflows/shared-execution-adapter"

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
