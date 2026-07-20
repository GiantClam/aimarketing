import assert from "node:assert/strict"
import test from "node:test"

import {
  canonicalizeWorkflowDefinition,
  hashWorkflowDefinition,
  parseWorkflowDefinitionEnvelope,
  validateWorkflowPortDefinition,
  WorkflowDefinitionValidationError,
} from "@/lib/workflows/workflow-definition-v2"
import {
  migrateWorkflowDefinitionToCurrent,
  type LegacyWorkflowDefinition,
} from "@/lib/workflows/workflow-definition-migrations"

function fixture(): LegacyWorkflowDefinition {
  return {
    schemaVersion: 1,
    revision: 1,
    nodes: [
      {
        nodeKey: "image",
        type: "image_generate",
        title: "Image",
        positionX: 320,
        positionY: 0,
        config: { prompt: "{{text}}", unknownFutureField: { keep: true } },
      },
      { nodeKey: "prompt", type: "text_input", title: "Prompt", positionX: 0, positionY: 0, config: { text: "a cat" } },
    ],
    // Deliberately reverse database ids: the id, rather than payload order,
    // determines the migration ordinal.
    edges: [
      { id: 11, sourceNodeKey: "prompt", targetNodeKey: "image", inputName: "text" },
    ],
  }
}

test("v1 migration creates stable semantic ports and preserves unknown config", () => {
  const migrated = migrateWorkflowDefinitionToCurrent(fixture())
  assert.equal(migrated.schemaVersion, 2)
  assert.equal(migrated.edges[0].edgeKey, "legacy:prompt:image:text:0")
  assert.equal(migrated.edges[0].sourcePortId, "text")
  assert.equal(migrated.edges[0].targetPortId, "text")
  assert.deepEqual(migrated.nodes.find((node) => node.nodeKey === "image")?.config, {
    prompt: "{{text}}",
    unknownFutureField: { keep: true },
  })
  assert.equal(migrated.definitionHash, hashWorkflowDefinition(migrated))
})

test("migration is idempotent at the byte level", () => {
  const first = migrateWorkflowDefinitionToCurrent(fixture())
  const second = migrateWorkflowDefinitionToCurrent(first)
  assert.deepEqual(second, first)
  assert.equal(JSON.stringify(second), JSON.stringify(first))
})

test("canonical hash ignores node and edge input order", () => {
  const first = migrateWorkflowDefinitionToCurrent(fixture())
  const reordered = {
    ...first,
    nodes: [...first.nodes].reverse(),
    edges: [...first.edges].reverse(),
    definitionHash: "client-supplied-value",
  }
  assert.equal(hashWorkflowDefinition(first), hashWorkflowDefinition(reordered))
  assert.deepEqual(canonicalizeWorkflowDefinition(first).nodes.map((node) => node.nodeKey), ["image", "prompt"])
  assert.equal(hashWorkflowDefinition(first), hashWorkflowDefinition({ ...first, revision: first.revision + 1 }))
})

test("v1 migration without database ids sorts semantic tuples before duplicate ordinals", () => {
  const input: LegacyWorkflowDefinition = {
    schemaVersion: 1,
    nodes: [
      { nodeKey: "out", type: "text_input" },
      { nodeKey: "writer", type: "llm_generate" },
    ],
    edges: [
      { sourceNodeKey: "out", targetNodeKey: "writer", inputName: "text" },
      { sourceNodeKey: "out", targetNodeKey: "writer", inputName: "text" },
    ],
  }
  const reversed = { ...input, edges: [...input.edges].reverse() }
  assert.deepEqual(
    migrateWorkflowDefinitionToCurrent(input).edges,
    migrateWorkflowDefinitionToCurrent(reversed).edges,
  )
})

test("parse rejects a stale definition hash and node version zero", () => {
  const definition = migrateWorkflowDefinitionToCurrent(fixture())
  const invalid = {
    ...definition,
    definitionHash: "0".repeat(64),
    nodes: definition.nodes.map((node) => node.nodeKey === "image" ? { ...node, nodeVersion: 0 } : node),
  }
  assert.throws(() => parseWorkflowDefinitionEnvelope(invalid), (error: unknown) => {
    assert.ok(error instanceof WorkflowDefinitionValidationError)
    const codes = error.issues.map((issue) => issue.code)
    assert.ok(codes.includes("unsupported_node_version"))
    assert.ok(codes.includes("invalid_workflow_definition"))
    return true
  })
})

test("parse rejects incompatible semantic ports", () => {
  const definition = migrateWorkflowDefinitionToCurrent(fixture())
  const invalid = {
    ...definition,
    edges: definition.edges.map((edge) => ({ ...edge, targetPortId: "images" })),
  }
  invalid.definitionHash = hashWorkflowDefinition(invalid)
  assert.throws(() => parseWorkflowDefinitionEnvelope(invalid), (error: unknown) => {
    assert.ok(error instanceof WorkflowDefinitionValidationError)
    assert.ok(error.issues.some((issue) => issue.code === "invalid_port_connection"))
    return true
  })
})

test("invalid port role/cardinality return stable issue codes", () => {
  assert.deepEqual(validateWorkflowPortDefinition({ id: "bad", valueKind: "image", role: "unknown", cardinality: "many" }), [
    { code: "invalid_workflow_port_role", message: "port.role is invalid", nodeKey: "", field: "port" },
  ])
  assert.deepEqual(validateWorkflowPortDefinition({ id: "bad", valueKind: "image", cardinality: "sometimes" }), [
    { code: "invalid_workflow_port_cardinality", message: "port.cardinality is invalid", nodeKey: "", field: "port" },
  ])
})

test("parse rejects dangling and duplicate graph references with stable issue codes", () => {
  const definition = migrateWorkflowDefinitionToCurrent(fixture())
  const invalid = {
    ...definition,
    edges: [
      ...definition.edges,
      { ...definition.edges[0], edgeKey: definition.edges[0].edgeKey, targetNodeKey: "missing" },
    ],
  }
  assert.throws(
    () => parseWorkflowDefinitionEnvelope(invalid),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowDefinitionValidationError)
      const codes = error.issues.map((issue) => issue.code)
      assert.ok(codes.includes("duplicate_workflow_edge_key"))
      assert.ok(codes.includes("dangling_workflow_edge"))
      return true
    },
  )
})
