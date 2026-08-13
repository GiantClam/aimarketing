import { test } from "node:test";
import assert from "node:assert/strict";
import { compileWorkflowPlan, migrateLegacyWorkflowDefinition, parseWorkflowDefinitionEnvelope, validateWorkflowDefinition } from "../src";

test("migrates legacy nodes and creates a stable definition hash", () => {
  const current = migrateLegacyWorkflowDefinition({ nodes: [{ nodeKey: "a", type: "text_input", config: { text: "hello" } }, { nodeKey: "b", type: "writer" }], edges: [{ sourceNodeKey: "a", targetNodeKey: "b", inputName: "text" }] });
  assert.equal(current.schemaVersion, 2);
  assert.equal(current.definitionHash.length, 64);
  assert.deepEqual(current.edges[0], { edgeKey: "legacy:0:a:b", sourceNodeKey: "a", sourcePortId: "text", targetNodeKey: "b", targetPortId: "text", inputName: "text" });
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
