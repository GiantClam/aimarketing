import assert from "node:assert/strict"
import test from "node:test"

import {
  WORKFLOW_BUILTIN_NODE_DEFINITIONS as sharedDefinitions,
  canWorkflowNodeConnectValueKind as sharedCanConnectValueKind,
  getWorkflowNodeDefinition as sharedGetDefinition,
  workflowNodeRegistry as sharedRegistry,
} from "@coworkany/workflow-core"
import { workflowNodeRegistry } from "@/lib/workflows/node-definitions/registry"
import { WORKFLOW_BUILTIN_NODE_DEFINITIONS } from "@/lib/workflows/node-definitions/builtins"
import { canWorkflowNodeConnectValueKind, getWorkflowNodeDefinition } from "@/lib/workflows/schema"

test("legacy registry exports are the shared workflow-core instances", () => {
  assert.equal(workflowNodeRegistry, sharedRegistry)
  assert.equal(WORKFLOW_BUILTIN_NODE_DEFINITIONS, sharedDefinitions)
  assert.equal(getWorkflowNodeDefinition, sharedGetDefinition)
  assert.equal(canWorkflowNodeConnectValueKind, sharedCanConnectValueKind)
})

test("legacy schema keeps asset-to-media compatibility from the shared core", () => {
  assert.equal(canWorkflowNodeConnectValueKind("image_generate", "asset"), true)
  assert.equal(canWorkflowNodeConnectValueKind("writer", "asset"), false)
})

test("workflow registry contains every canonical built-in node definition", () => {
  const definitions = workflowNodeRegistry.list()
  // Keep the count tied to the canonical type tuple so documentation drift
  // cannot silently create a second node catalog.
  assert.equal(definitions.length, 19)
  assert.equal(new Set(definitions.map((definition) => definition.type)).size, definitions.length)
  assert.equal(new Set(definitions.map((definition) => definition.executorId)).size, definitions.length)
  assert.deepEqual(workflowNodeRegistry.validate(), [])
  for (const definition of definitions) {
    assert.ok(definition.version >= 1)
    assert.ok(definition.executorId)
    assert.deepEqual(definition.migrate(definition.defaultConfig, definition.version), definition.defaultConfig)
    for (const [key, value] of Object.entries(definition.defaultConfig)) {
      const field = definition.configSchema.find((candidate) => candidate.id === key)
      assert.ok(field, `${definition.type}.${key} must be declared in configSchema`)
      if (field?.valueType === "string[]") assert.equal(Array.isArray(value), true)
    }
  }
})

test("registry explicitly rejects unknown node types", () => {
  assert.equal(workflowNodeRegistry.get("unknown"), null)
  assert.throws(() => workflowNodeRegistry.require("unknown"), /unsupported_node_type/)
})
