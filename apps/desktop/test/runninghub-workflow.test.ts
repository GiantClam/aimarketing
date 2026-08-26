import assert from "node:assert/strict";
import test from "node:test";
import { createRunningHubWorkflowRegistration, migrateLegacyRunningHubWorkflows, parseRunningHubWorkflowJson, resolveRunningHubWorkflowInput, runningHubWorkflowIdFromUrl } from "../src/runninghub-workflow";

test("RunningHub workflow IDs can be read from URLs or direct IDs", () => {
  assert.equal(runningHubWorkflowIdFromUrl("https://www.runninghub.ai/lite/workflow/abc_123"), "abc_123");
  assert.equal(runningHubWorkflowIdFromUrl("workflow-42"), "workflow-42");
  assert.equal(runningHubWorkflowIdFromUrl("not valid"), undefined);
});

test("ComfyUI API JSON becomes role-aware input bindings", () => {
  const parsed = parseRunningHubWorkflowJson({
    "1": { class_type: "LoadImage", inputs: { image: "input.png" } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: "a product shot" } },
    "3": { class_type: "VideoCombine", inputs: { filename_prefix: "output" } },
  }, { remoteWorkflowId: "wf-1" });
  assert.equal(parsed.remoteWorkflowId, "wf-1");
  assert.ok(parsed.inputSchema.some((field) => field.id === "prompt"));
  assert.ok(parsed.inputSchema.some((field) => field.type === "image"));
  assert.ok(parsed.nodeBindings.some((binding) => binding.nodeId === "1" && binding.valueType === "file"));
  assert.ok(parsed.definitionHash.length > 10);
});

test("registered workflow preserves ordered file list values", () => {
  const registration = createRunningHubWorkflowRegistration({
    id: "video-wf",
    remoteWorkflowId: "wf-1",
    name: "Video",
    sourceKind: "manual",
    inputSchema: [{ id: "referenceImages", label: "Reference images", type: "image_list", multiple: true }],
    nodeBindings: [{ inputId: "referenceImages", nodeId: "10", fieldName: "images", valueType: "file_list" }],
    outputSchema: [{ id: "output", type: "video" }],
    definitionHash: "hash",
    warnings: [],
  });
  assert.deepEqual(resolveRunningHubWorkflowInput(registration, { referenceImages: [{ fileName: "one.png" }, { url: "https://files.invalid/two.png" }] }), [
    { nodeId: "10", fieldName: "images", fieldValue: "one.png" },
    { nodeId: "10", fieldName: "images", fieldValue: "https://files.invalid/two.png" },
  ]);
});

test("legacy digital human and video enhancement IDs migrate to editable registrations", () => {
  const workflows = migrateLegacyRunningHubWorkflows(undefined, { digitalHumanWorkflowId: "human-1", videoEnhanceWorkflowId: "enhance-1" });
  assert.equal(workflows?.length, 2);
  assert.equal(workflows?.find((workflow) => workflow.capability === "digital_human")?.nodeBindings.some((binding) => binding.nodeId === "343"), true);
  assert.equal(workflows?.find((workflow) => workflow.capability === "video_enhance")?.nodeBindings.some((binding) => binding.nodeId === "33"), true);
});
