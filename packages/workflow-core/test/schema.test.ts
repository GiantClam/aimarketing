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

test("local file nodes expose type-specific output ports for media workflows", () => {
  const upload = workflowNodeRegistry.require("upload");
  assert.deepEqual(upload.outputs.map((port) => port.id), ["asset", "image", "video", "audio"]);
  assert.equal(areWorkflowPortsCompatible(upload.outputs.find((port) => port.id === "image")!, workflowNodeRegistry.require("video_generate").inputs.find((port) => port.id === "images")!), true);
  assert.equal(areWorkflowPortsCompatible(upload.outputs.find((port) => port.id === "audio")!, workflowNodeRegistry.require("voice_clone").inputs.find((port) => port.id === "audios")!), true);
});

test("preserves SaaS control-node defaults in the shared definition catalog", () => {
  const collect = workflowNodeRegistry.require("collect");
  const output = workflowNodeRegistry.require("output");
  assert.equal(collect.defaultConfig.includeFailures, false);
  assert.equal(output.defaultConfig.allowEmpty, false);
  assert.equal(output.defaultConfig.requireAllSucceeded, true);
});

test("shares the online editor parameter contract for desktop workflow nodes", () => {
  const writer = workflowNodeRegistry.require("writer");
  const image = workflowNodeRegistry.require("image_generate");
  const video = workflowNodeRegistry.require("video_generate");
  const ppt = workflowNodeRegistry.require("ppt_generate");
  const fieldIds = (definition: typeof writer) => new Set(definition.configSchema.map((field) => field.id));

  for (const id of ["selectedProviderId", "selectedModelId", "platform", "mode", "language"]) assert.equal(fieldIds(writer).has(id), true, id);
  for (const id of ["imageSize", "imageQuality", "imageBackground", "imageOutputFormat", "imageModeration"]) assert.equal(fieldIds(image).has(id), true, id);
  for (const id of ["model", "mode", "duration", "ratio", "sound"]) assert.equal(fieldIds(video).has(id), true, id);
  for (const id of ["previewRuntime", "model", "pageCount", "templateId", "language", "scenario"]) assert.equal(fieldIds(ppt).has(id), true, id);
});

test("accepts generic assets for media inputs but not text-only nodes", () => {
  assert.equal(canWorkflowNodeConnectValueKind("image_generate", "asset"), true);
  assert.equal(canWorkflowNodeConnectValueKind("writer", "asset"), false);
});

test("asset library node accepts generated text and every local media output", () => {
  const store = workflowNodeRegistry.require("product_store");
  assert.deepEqual(store.inputs.map((port) => port.id), ["text", "assets", "images", "videos", "audios", "presentations"]);
  assert.deepEqual(resolveWorkflowPortConnection("writer", "product_store"), { sourcePortId: "text", targetPortId: "text" });
  assert.deepEqual(resolveWorkflowPortConnection("image_generate", "product_store"), { sourcePortId: "image", targetPortId: "images" });
  assert.deepEqual(resolveWorkflowPortConnection("audio_generate", "product_store"), { sourcePortId: "audio", targetPortId: "audios" });
  assert.equal(store.configSchema.some((field) => field.id === "fileName"), true);
});
