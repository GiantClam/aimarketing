import { test } from "node:test";
import assert from "node:assert/strict";
import { WORKFLOW_NODE_TYPES, areWorkflowPortsCompatible, canWorkflowNodeConnectValueKind, getDefaultWorkflowNodeTitle, resolveWorkflowPortConnection, workflowNodeRegistry } from "../src";

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

test("v1 registry exposes voice cloning as a distinct media capability", () => {
  const definition = workflowNodeRegistry.require("voice_clone");
  assert.equal(definition.executorId, "voice_clone");
  assert.equal(definition.outputs[0]?.valueKind, "audio");
  assert.equal(definition.inputs.some((port) => port.valueKind === "audio"), true);
});

test("v1 registry matches the approved capability boundary", () => {
  const types = new Set(workflowNodeRegistry.list().map((definition) => definition.type));
  for (const required of ["upload", "text_input", "file_create", "writer", "llm_generate", "agent_execute", "image_generate", "video_generate", "digital_human", "music_generate", "voice_synthesis", "voice_clone", "audio_generate", "ppt_generate", "knowledge_retrieve", "knowledge_write", "product_store", "foreach", "collect", "output"]) assert.equal(types.has(required as never), true, required);
  for (const excluded of ["lead_hunter", "publish_as_agent", "workflow_marketplace", "enterprise_preset"]) assert.equal(types.has(excluded as never), false, excluded);
});

test("preserves SaaS control-node defaults in the shared definition catalog", () => {
  const collect = workflowNodeRegistry.require("collect");
  const output = workflowNodeRegistry.require("output");
  assert.equal(collect.defaultConfig.includeFailures, false);
  assert.equal(output.defaultConfig.allowEmpty, false);
  assert.equal(output.defaultConfig.requireAllSucceeded, true);
});

test("accepts generic assets for media inputs but not text-only nodes", () => {
  assert.equal(canWorkflowNodeConnectValueKind("image_generate", "asset"), true);
  assert.equal(canWorkflowNodeConnectValueKind("writer", "asset"), false);
});
