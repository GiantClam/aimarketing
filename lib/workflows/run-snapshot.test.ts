import assert from "node:assert/strict"
import test from "node:test"

import { workflowDefinitionFromRunSnapshot, type WorkflowDefinition } from "@/lib/workflows/store"

const currentWorkflow: WorkflowDefinition = {
  id: 1,
  enterpriseId: 7,
  ownerUserId: 3,
  title: "Current draft",
  slug: "demo",
  status: "draft",
  triggerType: "manual",
  description: "draft",
  metadata: { draft: true },
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-17T00:00:00.000Z"),
  schemaVersion: 2,
  revision: 9,
  definitionHash: "9".repeat(64),
  nodes: [{
    nodeKey: "current",
    type: "text_input",
    title: "Current",
    positionX: 0,
    positionY: 0,
    config: {},
  }],
  edges: [],
}

test("run detail uses the immutable revision envelope instead of the current draft", () => {
  const snapshot = {
    taskRunId: 22,
    workflowId: 1,
    revisionId: 4,
    schemaVersion: 2,
    definitionHash: "4".repeat(64),
    definition: {
      workflowId: 1,
      title: "Published revision",
      description: "immutable",
      status: "live",
      triggerType: "manual",
      metadata: { revision: 4 },
      definition: {
        schemaVersion: 2,
        revision: 4,
        definitionHash: "4".repeat(64),
        nodes: [{
          nodeKey: "published",
          type: "text_input",
          nodeVersion: 1,
          title: "Published",
          positionX: 20,
          positionY: 30,
          config: { value: "from-revision" },
        }],
        edges: [],
      },
    },
    requestId: "00000000-0000-4000-8000-000000000022",
    cancelRequestedAt: null,
    createdAt: new Date("2026-07-17T00:00:00.000Z"),
  } as never

  const runWorkflow = workflowDefinitionFromRunSnapshot(currentWorkflow, snapshot)
  assert.equal(runWorkflow?.title, "Published revision")
  assert.equal(runWorkflow?.revision, 4)
  assert.equal(runWorkflow?.definitionHash, "4".repeat(64))
  assert.deepEqual(runWorkflow?.nodes.map((node) => node.nodeKey), ["published"])
  assert.equal(runWorkflow?.nodes[0]?.config.value, "from-revision")
  assert.equal(currentWorkflow.title, "Current draft")
  assert.deepEqual(currentWorkflow.nodes.map((node) => node.nodeKey), ["current"])
})

test("malformed immutable snapshot fails closed instead of falling back to draft", () => {
  const malformed = {
    taskRunId: 22,
    workflowId: 1,
    revisionId: 4,
    definitionHash: "4".repeat(64),
    definition: { definition: { nodes: [{ nodeKey: "missing-type" }] } },
  } as never
  assert.equal(workflowDefinitionFromRunSnapshot(currentWorkflow, malformed), null)
})
