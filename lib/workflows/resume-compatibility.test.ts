import assert from "node:assert/strict"
import test from "node:test"

import { isWorkflowResumeCompatible } from "@/lib/workflows/resume-compatibility"

test("isWorkflowResumeCompatible ignores non-runtime presentation changes", () => {
  const currentWorkflow = {
    nodes: [
      {
        nodeKey: "text-input-1",
        type: "text_input",
        title: "Text input copy",
        positionX: 240,
        positionY: 160,
        config: { text: "hello world" },
      },
      {
        nodeKey: "image-1",
        type: "image_generate",
        title: "Image node copy",
        positionX: 680,
        positionY: 160,
        config: { model: "gpt-image-2", quality: "high" },
      },
    ],
    edges: [
      {
        sourceNodeKey: "text-input-1",
        targetNodeKey: "image-1",
        inputName: "text",
      },
    ],
  }

  const latestRunWorkflow = {
    nodes: [
      {
        nodeKey: "image-1",
        type: "image_generate",
        title: "Old title",
        positionX: 0,
        positionY: 0,
        config: { model: "gpt-image-2", quality: "high" },
      },
      {
        nodeKey: "text-input-1",
        type: "text_input",
        title: "Old text title",
        positionX: 0,
        positionY: 0,
        config: { text: "hello world" },
      },
    ],
    edges: [
      {
        sourceNodeKey: "text-input-1",
        targetNodeKey: "image-1",
        inputName: "text",
      },
    ],
  }

  assert.equal(isWorkflowResumeCompatible(currentWorkflow, latestRunWorkflow), true)
})

test("isWorkflowResumeCompatible returns false when runtime node config changes", () => {
  const currentWorkflow = {
    nodes: [
      {
        nodeKey: "image-1",
        type: "image_generate",
        config: { model: "gpt-image-2", quality: "high" },
      },
    ],
    edges: [],
  }

  const latestRunWorkflow = {
    nodes: [
      {
        nodeKey: "image-1",
        type: "image_generate",
        config: { model: "gpt-image-2", quality: "low" },
      },
    ],
    edges: [],
  }

  assert.equal(isWorkflowResumeCompatible(currentWorkflow, latestRunWorkflow), false)
})

test("isWorkflowResumeCompatible returns false when runtime graph changes", () => {
  const currentWorkflow = {
    nodes: [
      { nodeKey: "text-input-1", type: "text_input", config: { text: "prompt" } },
      { nodeKey: "image-1", type: "image_generate", config: { model: "gpt-image-2" } },
      { nodeKey: "store-1", type: "product_store", config: { fileName: "cover" } },
    ],
    edges: [
      { sourceNodeKey: "text-input-1", targetNodeKey: "image-1", inputName: "text" },
      { sourceNodeKey: "image-1", targetNodeKey: "store-1", inputName: "images" },
    ],
  }

  const latestRunWorkflow = {
    nodes: [
      { nodeKey: "text-input-1", type: "text_input", config: { text: "prompt" } },
      { nodeKey: "image-1", type: "image_generate", config: { model: "gpt-image-2" } },
    ],
    edges: [{ sourceNodeKey: "text-input-1", targetNodeKey: "image-1", inputName: "text" }],
  }

  assert.equal(isWorkflowResumeCompatible(currentWorkflow, latestRunWorkflow), false)
})
