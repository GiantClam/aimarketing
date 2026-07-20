import assert from "node:assert/strict"
import test from "node:test"

import { workflowNodeRegistry } from "@/lib/workflows/node-definitions/registry"

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
