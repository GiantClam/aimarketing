import assert from "node:assert/strict"
import test from "node:test"

import { collectWorkflowPersistedSourceNodeKeys } from "@/lib/workflows/run-persistence"
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
