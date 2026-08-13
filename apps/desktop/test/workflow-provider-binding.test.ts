import assert from "node:assert/strict";
import test from "node:test";
import type { WorkflowDefinitionEnvelope } from "@aimarketing/workflow-core";
import { bindWorkflowProviderDefaults } from "../src/workflow-provider-binding";
import { sanitizeWorkflowDefinitionForStorage } from "../src/workflow-storage";

const definition: WorkflowDefinitionEnvelope = {
  schemaVersion: 2,
  revision: 1,
  definitionHash: "hash",
  nodes: [
    { nodeKey: "text", type: "text_input", nodeVersion: 1, title: "Text", positionX: 0, positionY: 0, config: { text: "hello" } },
    { nodeKey: "image", type: "image_generate", nodeVersion: 1, title: "Image", positionX: 1, positionY: 0, config: { provider: "stale", model: "stale/image" } },
    { nodeKey: "video", type: "video_generate", nodeVersion: 1, title: "Video", positionX: 2, positionY: 0, config: {} },
    { nodeKey: "audio", type: "music_generate", nodeVersion: 1, title: "Audio", positionX: 3, positionY: 0, config: {} },
  ],
  edges: [],
};

test("mixed media workflows bind each node to its configured capability provider and model", () => {
  const bound = bindWorkflowProviderDefaults(definition, {
    provider: { id: "text-main", source: "openai-compatible", model: "text/default", models: ["text/default"], baseUrl: "https://text.example.test" },
    providers: {
      "image-main": { id: "image-main", source: "openai-compatible", model: "image/fast", models: ["image/fast", "image/quality"], baseUrl: "https://image.example.test" },
      "video-main": { id: "video-main", source: "runninghub", model: "video/standard", models: ["video/standard"], baseUrl: "https://video.example.test" },
      "audio-main": { id: "audio-main", source: "minimax", model: "audio/music", models: ["audio/music"], baseUrl: "https://audio.example.test" },
    },
    defaults: { image: "image-main", video: "video-main", audio: "audio-main" },
  });

  assert.deepEqual(bound.nodes.find((node) => node.nodeKey === "image")?.config, { provider: "image-main", model: "image/fast", baseUrl: "https://image.example.test" });
  assert.deepEqual(bound.nodes.find((node) => node.nodeKey === "video")?.config, { provider: "video-main", model: "video/standard", baseUrl: "https://video.example.test" });
  assert.deepEqual(bound.nodes.find((node) => node.nodeKey === "audio")?.config, { provider: "audio-main", model: "audio/music", baseUrl: "https://audio.example.test" });
});

test("provider binding leaves text/input nodes unchanged and does not introduce credentials", () => {
  const bound = bindWorkflowProviderDefaults(definition, {
    provider: { id: "text-main", model: "text/default", baseUrl: "https://text.example.test" },
    providers: { image: { id: "image", model: "image/default", baseUrl: "https://image.example.test" } },
    defaults: { image: "image" },
  });
  assert.deepEqual(bound.nodes.find((node) => node.nodeKey === "text")?.config, { text: "hello" });
  assert.equal("apiKey" in (bound.nodes.find((node) => node.nodeKey === "image")?.config ?? {}), false);
  const portable = sanitizeWorkflowDefinitionForStorage(bound);
  assert.equal("provider" in (portable.nodes.find((node) => node.nodeKey === "image")?.config ?? {}), false);
  assert.equal("model" in (portable.nodes.find((node) => node.nodeKey === "image")?.config ?? {}), false);
});
