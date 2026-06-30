import assert from "node:assert/strict"
import test from "node:test"

import { summarizeWorkflowKnowledgeUsage } from "@/lib/workflows/knowledge-governance"
import type { WorkflowDefinitionNode } from "@/lib/workflows/schema"

function createNode(input: Partial<WorkflowDefinitionNode> & Pick<WorkflowDefinitionNode, "nodeKey" | "type">) {
  return {
    title: input.nodeKey,
    positionX: 0,
    positionY: 0,
    config: {},
    ...input,
  } satisfies WorkflowDefinitionNode
}

test("summarizeWorkflowKnowledgeUsage collects read, write, and queue nodes", () => {
  const summary = summarizeWorkflowKnowledgeUsage([
    {
      id: 8,
      title: "Campaign Launch",
      status: "live",
      nodes: [
        createNode({
          nodeKey: "retrieve-1",
          type: "knowledge_retrieve",
          title: "Brand Context",
          config: { selectedDatasetIds: [3, 5, 5], topK: 6 },
        }),
        createNode({
          nodeKey: "write-1",
          type: "knowledge_write",
          title: "Store FAQ",
          config: { datasetId: 11, knowledgeCategory: "campaign" },
        }),
        createNode({
          nodeKey: "store-1",
          type: "product_store",
          title: "Persist Outputs",
          config: { persistToKnowledgeBase: true, knowledgeTargetType: "knowledge_base" },
        }),
      ],
    },
  ])

  assert.equal(summary.length, 1)
  assert.deepEqual(summary[0], {
    workflowId: 8,
    title: "Campaign Launch",
    status: "live",
    readNodes: [{ nodeKey: "retrieve-1", title: "Brand Context", selectedDatasetIds: [3, 5], selectedPersonalDatasetIds: [], topK: 6 }],
    writeNodes: [{ nodeKey: "write-1", title: "Store FAQ", datasetId: 11, datasetScope: "enterprise", knowledgeCategory: "campaign" }],
    queueNodes: [{ nodeKey: "store-1", title: "Persist Outputs", knowledgeTargetType: "knowledge_base" }],
  })
})

test("summarizeWorkflowKnowledgeUsage skips workflows without knowledge usage", () => {
  const summary = summarizeWorkflowKnowledgeUsage([
    {
      id: 1,
      title: "Generic",
      status: "draft",
      nodes: [createNode({ nodeKey: "text-1", type: "text_input", title: "Input" })],
    },
  ])

  assert.deepEqual(summary, [])
})

test("summarizeWorkflowKnowledgeUsage falls back for missing knowledge config", () => {
  const summary = summarizeWorkflowKnowledgeUsage([
    {
      id: 2,
      title: "Repurpose",
      status: "draft",
      nodes: [
        createNode({
          nodeKey: "retrieve-2",
          type: "knowledge_retrieve",
          config: { selectedDatasetIds: ["bad", 9], topK: "bad" },
        }),
        createNode({
          nodeKey: "write-2",
          type: "knowledge_write",
          config: {},
        }),
        createNode({
          nodeKey: "store-2",
          type: "product_store",
          config: { persistToKnowledgeBase: true },
        }),
      ],
    },
  ])

  assert.deepEqual(summary[0]?.readNodes[0], {
    nodeKey: "retrieve-2",
    title: "retrieve-2",
    selectedDatasetIds: [9],
    selectedPersonalDatasetIds: [],
    topK: 4,
  })
  assert.deepEqual(summary[0]?.writeNodes[0], {
    nodeKey: "write-2",
    title: "write-2",
    datasetId: null,
    datasetScope: "enterprise",
    knowledgeCategory: "general",
  })
  assert.deepEqual(summary[0]?.queueNodes[0], {
    nodeKey: "store-2",
    title: "store-2",
    knowledgeTargetType: "knowledge_base",
  })
})
