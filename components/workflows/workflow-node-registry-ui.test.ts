import assert from "node:assert/strict"
import test from "node:test"

import { workflowNodeRegistry } from "@/lib/workflows/node-definitions/registry"
import {
  buildWorkflowNodePalette,
  buildWorkflowNodeViewModel,
} from "@/components/workflows/workflow-node-registry-ui"

test("registry UI palette preserves the canonical node order and metadata", () => {
  const palette = buildWorkflowNodePalette(workflowNodeRegistry, "en")
  assert.equal(palette.length, 19)
  assert.deepEqual(
    palette.map((item) => item.type),
    workflowNodeRegistry.list().map((definition) => definition.type),
  )
  assert.equal(palette.find((item) => item.type === "image_generate")?.title, "Image Generate")
  assert.ok(palette.find((item) => item.type === "image_generate")?.visual.icon)
  assert.equal(palette.find((item) => item.type === "image_generate")?.readOnly, false)
  assert.ok(palette.find((item) => item.type === "foreach"))
  assert.ok(palette.find((item) => item.type === "collect"))
  assert.ok(palette.find((item) => item.type === "output"))
})

test("registry UI view model exposes semantic ports and preserves unknown configs", () => {
  const known = buildWorkflowNodeViewModel(
    {
      nodeKey: "image-1",
      type: "image_generate",
      title: "",
      positionX: 0,
      positionY: 0,
      config: { prompt: "keep me", customField: true },
    },
    workflowNodeRegistry,
    "zh",
  )
  assert.equal(known.title, "图片生成")
  assert.deepEqual(known.inputKinds, ["text", "image"])
  assert.deepEqual(known.outputKinds, ["image"])
  assert.deepEqual(known.config, { prompt: "keep me", customField: true })
  assert.equal(known.readOnly, false)

  const unknown = buildWorkflowNodeViewModel(
    {
      nodeKey: "future-1",
      type: "future_node" as never,
      title: "Future node",
      positionX: 0,
      positionY: 0,
      config: { preserve: "this" },
    },
    workflowNodeRegistry,
    "en",
  )
  assert.equal(unknown.readOnly, true)
  assert.equal(unknown.title, "Future node")
  assert.deepEqual(unknown.config, { preserve: "this" })
  assert.deepEqual(unknown.inputPorts, [])
  assert.deepEqual(unknown.outputPorts, [])
})
