import assert from "node:assert/strict"
import test from "node:test"

import {
  appendWorkflowStoredTitleOrdinal,
  collectWorkflowPersistenceTargets,
  collectWorkflowPersistedSourceNodeKeys,
  ensureUniqueWorkflowStoredTitle,
} from "@/lib/workflows/run-persistence"
import type { WorkflowDefinitionEdge, WorkflowDefinitionNode } from "@/lib/workflows/schema"

test("collectWorkflowPersistedSourceNodeKeys only persists nodes explicitly connected to product_store", () => {
  const nodes: WorkflowDefinitionNode[] = [
    { nodeKey: "text-1", type: "text_input", title: "Prompt", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "img-1", type: "image_generate", title: "Image", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "video-1", type: "video_generate", title: "Video", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "store-1", type: "product_store", title: "Work Library", positionX: 0, positionY: 0, config: {} },
  ]
  const edges: WorkflowDefinitionEdge[] = [
    { sourceNodeKey: "text-1", targetNodeKey: "img-1", inputName: "text" },
    { sourceNodeKey: "img-1", targetNodeKey: "video-1", inputName: "image" },
    { sourceNodeKey: "video-1", targetNodeKey: "store-1", inputName: "video" },
  ]

  assert.deepEqual(collectWorkflowPersistedSourceNodeKeys({ nodes, edges }), ["video-1"])
})

test("collectWorkflowPersistedSourceNodeKeys dedupes multiple edges into one storage node", () => {
  const nodes: WorkflowDefinitionNode[] = [
    { nodeKey: "llm-1", type: "llm_generate", title: "LLM", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "img-1", type: "image_generate", title: "Image", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "store-1", type: "product_store", title: "Work Library", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "store-2", type: "product_store", title: "Work Library 2", positionX: 0, positionY: 0, config: {} },
  ]
  const edges: WorkflowDefinitionEdge[] = [
    { sourceNodeKey: "img-1", targetNodeKey: "store-1", inputName: "image" },
    { sourceNodeKey: "img-1", targetNodeKey: "store-2", inputName: "image" },
  ]

  assert.deepEqual(collectWorkflowPersistedSourceNodeKeys({ nodes, edges }), ["img-1"])
})

test("collectWorkflowPersistenceTargets keeps one target per product store node", () => {
  const nodes: WorkflowDefinitionNode[] = [
    { nodeKey: "img-1", type: "image_generate", title: "Image", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "store-1", type: "product_store", title: "Work Library", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "store-2", type: "product_store", title: "Work Library 2", positionX: 0, positionY: 0, config: {} },
  ]
  const edges: WorkflowDefinitionEdge[] = [
    { sourceNodeKey: "img-1", targetNodeKey: "store-1", inputName: "image" },
    { sourceNodeKey: "img-1", targetNodeKey: "store-2", inputName: "image" },
    { sourceNodeKey: "img-1", targetNodeKey: "store-2", inputName: "assets" },
  ]

  assert.deepEqual(collectWorkflowPersistenceTargets({ nodes, edges }), [
    { sourceNodeKey: "img-1", targetNodeKey: "store-1" },
    { sourceNodeKey: "img-1", targetNodeKey: "store-2" },
  ])
})

test("appendWorkflowStoredTitleOrdinal preserves file extensions", () => {
  assert.equal(appendWorkflowStoredTitleOrdinal("campaign.png", 1), "campaign.png")
  assert.equal(appendWorkflowStoredTitleOrdinal("campaign.png", 2), "campaign 2.png")
  assert.equal(appendWorkflowStoredTitleOrdinal("campaign", 3), "campaign 3")
})

test("ensureUniqueWorkflowStoredTitle increments on existing names", () => {
  const reserved = new Set(["campaign.png", "campaign 2.png"].map((value) => value.toLowerCase()))
  assert.equal(ensureUniqueWorkflowStoredTitle("campaign.png", reserved), "campaign 3.png")
  assert.equal(ensureUniqueWorkflowStoredTitle("fresh-name", reserved), "fresh-name")
})
