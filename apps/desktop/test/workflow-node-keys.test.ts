import assert from "node:assert/strict";
import test from "node:test";
import { createUniqueWorkflowNodeKey, repairWorkflowNodeKeys } from "../src/workflow-node-keys";

const node = (nodeKey: string) => ({ nodeKey, type: "writer", nodeVersion: 1, title: nodeKey, positionX: 0, positionY: 0, config: {} });

test("new workflow node keys stay unique for repeated node types", () => {
  const first = createUniqueWorkflowNodeKey("writer", [node("writer-existing")]);
  const second = createUniqueWorkflowNodeKey("writer", [node("writer-existing"), node(first)]);
  assert.match(first, /^writer-/u);
  assert.notEqual(first, second);
});

test("legacy duplicate node keys are repaired without changing existing edge targets", () => {
  const definition = {
    schemaVersion: 2 as const,
    revision: 1,
    definitionHash: "",
    nodes: [node("input"), node("writer"), node("writer"), node("writer-recovered-2")],
    edges: [{ edgeKey: "input-writer", sourceNodeKey: "input", sourcePortId: "text", targetNodeKey: "writer", targetPortId: "text" }],
  };
  const repaired = repairWorkflowNodeKeys(definition);
  assert.deepEqual(repaired.nodes.map((item) => item.nodeKey), ["input", "writer", "writer-recovered-3", "writer-recovered-2"]);
  assert.equal(repaired.edges[0]?.targetNodeKey, "writer");
  assert.equal(new Set(repaired.nodes.map((item) => item.nodeKey)).size, repaired.nodes.length);
});
