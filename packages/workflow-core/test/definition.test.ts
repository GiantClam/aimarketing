import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalizeWorkflowDefinition, canonicalizeWorkflowDefinitionJson, compileWorkflowPlan, hashWorkflowDefinition, migrateLegacyWorkflowDefinition, parseWorkflowDefinitionEnvelope, validateWorkflowDefinition, validateWorkflowPortDefinition, WorkflowDefinitionValidationError } from "../src";

test("migrates legacy nodes and creates a stable definition hash", () => {
  const current = migrateLegacyWorkflowDefinition({ nodes: [{ nodeKey: "a", type: "text_input", config: { text: "hello" } }, { nodeKey: "b", type: "writer" }], edges: [{ sourceNodeKey: "a", targetNodeKey: "b", inputName: "text" }] });
  assert.equal(current.schemaVersion, 2);
  assert.equal(current.definitionHash.length, 64);
  assert.deepEqual(current.edges[0], { edgeKey: "legacy:a:b:text:0", sourceNodeKey: "a", sourcePortId: "text", targetNodeKey: "b", targetPortId: "text", inputName: "text" });
});

test("legacy edge migration is independent of payload ordering", () => {
  const input = { nodes: [{ nodeKey: "out", type: "text_input" }, { nodeKey: "writer", type: "writer" }], edges: [{ sourceNodeKey: "out", targetNodeKey: "writer", inputName: "text" }, { sourceNodeKey: "out", targetNodeKey: "writer", inputName: "text" }] };
  assert.deepEqual(migrateLegacyWorkflowDefinition(input).edges, migrateLegacyWorkflowDefinition({ ...input, edges: [...input.edges].reverse() }).edges);
});

test("migration prefers an adapter-supplied persisted revision", () => {
  const input = { revision: 2, nodes: [{ nodeKey: "a", type: "text_input" }], edges: [] };
  assert.equal(migrateLegacyWorkflowDefinition(input, { revision: 7 }).revision, 7);
});

test("rejects cycles before workflow execution", () => {
  const definition = migrateLegacyWorkflowDefinition({ nodes: [{ nodeKey: "a", type: "text_input" }, { nodeKey: "b", type: "writer" }], edges: [{ sourceNodeKey: "a", targetNodeKey: "b", inputName: "text" }, { sourceNodeKey: "b", targetNodeKey: "a", inputName: "text" }] });
  assert.ok(validateWorkflowDefinition(definition).some((issue) => issue.code === "workflow_cycle_detected"));
  assert.throws(() => parseWorkflowDefinitionEnvelope(definition));
});

test("compiles a deterministic dependency order", () => {
  const definition = migrateLegacyWorkflowDefinition({ nodes: [{ nodeKey: "b", type: "writer" }, { nodeKey: "a", type: "text_input" }, { nodeKey: "c", type: "output" }], edges: [{ sourceNodeKey: "a", targetNodeKey: "b", inputName: "text" }, { sourceNodeKey: "b", targetNodeKey: "c", inputName: "text" }] });
  assert.deepEqual(compileWorkflowPlan(definition).steps.map((step) => step.nodeKey), ["a", "b", "c"]);
});

test("canonical hash ignores revision and nested config key ordering", () => {
  const first = migrateLegacyWorkflowDefinition({ nodes: [{ nodeKey: "input", type: "text_input", config: { nested: { beta: 2, alpha: 1 } } }], edges: [] });
  const reordered = { ...first, revision: first.revision + 1, nodes: [{ ...first.nodes[0], config: { nested: { alpha: 1, beta: 2 } } }] };
  assert.equal(hashWorkflowDefinition(first), hashWorkflowDefinition(reordered));
  assert.equal(hashWorkflowDefinition(first), createHash("sha256").update(canonicalizeWorkflowDefinitionJson(first)).digest("hex"));
  assert.deepEqual(canonicalizeWorkflowDefinition(reordered).nodes[0].config, { nested: { alpha: 1, beta: 2 } });
});

test("definition parsing rejects stale hashes and reports stable port issue codes", () => {
  const definition = migrateLegacyWorkflowDefinition({ nodes: [{ nodeKey: "input", type: "text_input" }, { nodeKey: "image", type: "image_generate" }], edges: [{ sourceNodeKey: "input", targetNodeKey: "image", inputName: "text" }] });
  assert.throws(() => parseWorkflowDefinitionEnvelope({ ...definition, definitionHash: "0".repeat(64) }), (error: unknown) => {
    assert.ok(error instanceof WorkflowDefinitionValidationError);
    assert.ok(error.issues.some((item) => item.code === "invalid_workflow_definition" && item.field === "definitionHash"));
    return true;
  });
  assert.deepEqual(validateWorkflowPortDefinition({ id: "bad", valueKind: "image", role: "unknown", cardinality: "many" }), [
    { code: "invalid_workflow_port_role", message: "port.role is invalid", nodeKey: "", field: "port" },
  ]);
});
