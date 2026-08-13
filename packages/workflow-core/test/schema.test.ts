import { test } from "node:test";
import assert from "node:assert/strict";
import { WORKFLOW_NODE_TYPES, areWorkflowPortsCompatible, getDefaultWorkflowNodeTitle, resolveWorkflowPortConnection, workflowNodeRegistry } from "../src";

test("registers the complete v1 node set without invalid definitions", () => {
  assert.equal(workflowNodeRegistry.validate().length, 0);
  assert.equal(workflowNodeRegistry.list().length, WORKFLOW_NODE_TYPES.length);
});

test("resolves compatible text connections and rejects incompatible media ports", () => {
  assert.deepEqual(resolveWorkflowPortConnection("text_input", "writer"), { sourcePortId: "text", targetPortId: "text" });
  assert.equal(resolveWorkflowPortConnection("image_generate", "audio_generate"), null);
  assert.equal(areWorkflowPortsCompatible({ id: "asset", valueKind: "asset", required: false, cardinality: "many" }, { id: "image", valueKind: "image", required: false, cardinality: "many" }), true);
});

test("preserves localized default titles", () => {
  assert.equal(getDefaultWorkflowNodeTitle("ppt_generate", "zh"), "PPT 生成");
  assert.equal(getDefaultWorkflowNodeTitle("ppt_generate", "en"), "PPT Generate");
});

test("preserves SaaS control-node defaults in the shared definition catalog", () => {
  const collect = workflowNodeRegistry.require("collect");
  const output = workflowNodeRegistry.require("output");
  assert.equal(collect.defaultConfig.includeFailures, false);
  assert.equal(output.defaultConfig.allowEmpty, false);
  assert.equal(output.defaultConfig.requireAllSucceeded, true);
});
