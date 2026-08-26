import test from "node:test";
import assert from "node:assert/strict";
import { createPlatformProviderProfile, platformIdForProvider, PROVIDER_PLATFORM_OPTIONS } from "../src/provider-platforms";

test("image and video directly expose the cloud governance provider catalog", () => {
  assert.deepEqual(PROVIDER_PLATFORM_OPTIONS.image.map((platform) => platform.id), [
    "bailian_official", "google_official", "openai_official", "openai_compatible", "runninghub",
  ]);
  assert.deepEqual(PROVIDER_PLATFORM_OPTIONS.video.map((platform) => platform.id), [
    "bailian_official", "minimax_official", "gemini_official", "openai_compatible", "runninghub",
  ]);
});

test("text directly exposes the cloud governance provider catalog", () => {
  assert.deepEqual(PROVIDER_PLATFORM_OPTIONS.text.map((platform) => platform.id), [
    "siliconflow", "openrouter", "openai_compatible", "qwen_official", "minimax_official", "glm_official", "volcengine_official",
  ]);
  assert.deepEqual(PROVIDER_PLATFORM_OPTIONS.text.find((platform) => platform.id === "openrouter")?.models, ["x-ai/grok-4.5"]);
  assert.deepEqual(PROVIDER_PLATFORM_OPTIONS.text.find((platform) => platform.id === "openai_compatible")?.models, []);
});

test("audio directly exposes the cloud governance provider catalog", () => {
  assert.deepEqual(PROVIDER_PLATFORM_OPTIONS.audio.map((platform) => platform.id), ["minimax_official"]);
  assert.deepEqual(PROVIDER_PLATFORM_OPTIONS.audio[0]?.models, [
    "speech-2.8-hd", "speech-2.8-turbo", "speech-2.6-hd", "speech-2.6-turbo", "speech-02-hd", "speech-02-turbo",
    "music-2.6", "music-2.6-free", "music-cover", "music-cover-free",
  ]);
});

test("platform selection creates a capability-scoped profile ready for a model id", () => {
  const profile = createPlatformProviderProfile("video", "runninghub");
  assert.deepEqual(profile, {
    id: "video-runninghub",
    source: "runninghub",
    baseUrl: "https://www.runninghub.cn",
    capabilities: ["video"],
    model: "",
    models: [],
  });
  assert.equal(platformIdForProvider({ source: "bailian" }, "image"), "bailian_official");
  assert.equal(platformIdForProvider({ source: "openai-compatible" }, "text"), "openai_compatible");
  assert.equal(platformIdForProvider({ source: "pptoken" }, "text"), "openai_compatible");
  assert.equal(platformIdForProvider({ source: "openai-compatible" }, "video"), "openai_compatible");
  assert.deepEqual(createPlatformProviderProfile("video", "openai_compatible"), {
    id: "video-openai_compatible",
    source: "openai-compatible",
    baseUrl: "",
    capabilities: ["video"],
    model: "",
    models: [],
  });
  assert.deepEqual(PROVIDER_PLATFORM_OPTIONS.video.find((platform) => platform.id === "bailian_official")?.models, ["happyhorse-1.1-t2v", "happyhorse-1.1-i2v", "happyhorse-1.1-r2v", "happyhorse-1.0-video-edit"]);
});
