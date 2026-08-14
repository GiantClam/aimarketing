import test from "node:test";
import assert from "node:assert/strict";
import { assertRealProviderConfig, buildRealProviderSmokeScope, defaultVideoPollBudget, hasExpectedSmokeResponse, REAL_PROVIDER_SMOKE_SCOPE, resolveNonSeedanceVideoProfile, validateRealProviderConfig } from "./real-provider-config.mjs";

const audioCredentialFixture = "fixture-key";
const valid = {
  llm: { provider: "gateway", baseUrl: "https://example.test/v1", apiKey: "secret", model: "chat-model" },
  image: { provider: "gateway", baseUrl: "https://example.test/v1", apiKey: "secret", model: "image-model" },
  providers: { audio: { id: "audio", provider: "minimax", baseUrl: "https://example.test/v1", apiKey: audioCredentialFixture, model: "speech-2.8-turbo" } },
  defaults: { audio: "audio" },
};

test("real provider smoke config validates required LLM and image entries without exposing credentials", () => {
  assert.deepEqual(validateRealProviderConfig(valid), []);
  assert.equal(assertRealProviderConfig(valid), valid);
  const errors = validateRealProviderConfig({ llm: { provider: "gateway", apiKey: "secret" }, image: {} });
  assert.deepEqual(errors, ["llm_baseUrl_missing", "llm_model_missing", "image_provider_missing", "image_baseUrl_missing", "image_apiKey_missing", "image_model_missing"]);
  assert.throws(() => assertRealProviderConfig({ llm: {}, image: {} }), /real_provider_config_invalid/);
});

test("real provider profiles and capability defaults remain independently addressable", () => {
  const configured = {
    ...valid,
    providers: {
      "audio-primary": { id: "audio-primary", provider: "minimax", baseUrl: "https://example.test/v1", apiKey: audioCredentialFixture, model: "speech-primary" },
      "audio-fallback": { id: "audio-fallback", provider: "minimax", baseUrl: "https://example.test/v1", apiKey: audioCredentialFixture, model: "speech-fallback" },
    },
    defaults: { audio: "audio-primary" },
  };
  assert.deepEqual(validateRealProviderConfig(configured), []);
  assert.deepEqual(validateRealProviderConfig({ ...configured, defaults: { audio: "missing" } }), ["default_audio_unknown_provider"]);
  assert.deepEqual(validateRealProviderConfig({ ...configured, providers: { broken: { id: "other", provider: "minimax", baseUrl: "https://example.test/v1", apiKey: audioCredentialFixture, model: "speech" } }, defaults: { audio: "broken" } }), ["provider_broken_id_mismatch"]);
});

test("real provider smoke response checks are capability-specific and exclude video", () => {
  assert.equal(hasExpectedSmokeResponse("llm", { model: "chat-model", choices: [{ message: { content: "ok" } }], usage: {} }), true);
  assert.equal(hasExpectedSmokeResponse("llm", { model: "chat-model", choices: [] }), false);
  assert.equal(hasExpectedSmokeResponse("image", { data: [{ url: "https://example.test/image.png" }] }), true);
  assert.equal(hasExpectedSmokeResponse("audio", { task_id: 42, status: "Success", base_resp: { status_code: 0 } }), true);
  assert.equal(hasExpectedSmokeResponse("audio", { task_id: 42, status: "Processing", base_resp: { status_code: 0 } }), false);
  assert.equal(hasExpectedSmokeResponse("music", { data: { audio: "https://example.test/music.mp3" } }), true);
  assert.equal(hasExpectedSmokeResponse("music", { data: { status: "Success" } }), false);
  assert.equal(hasExpectedSmokeResponse("video", { status: "SUCCESS", results: [{ url: "https://example.test/video.mp4" }] }), true);
  assert.equal(hasExpectedSmokeResponse("video", { output: { task_status: "SUCCEEDED", video_url: "https://example.test/video.mp4" } }), true);
  assert.equal(hasExpectedSmokeResponse("video", { status: "RUNNING", results: [] }), false);
  assert.deepEqual(REAL_PROVIDER_SMOKE_SCOPE, { executed: ["llm", "image", "audio"], excluded: ["video", "seedance"] });
  assert.deepEqual(buildRealProviderSmokeScope(), { executed: ["llm", "image", "audio"], excluded: ["video", "seedance"] });
  assert.deepEqual(buildRealProviderSmokeScope({ includeVideo: true }), { executed: ["llm", "image", "audio", "video"], excluded: ["seedance"] });
  assert.deepEqual(buildRealProviderSmokeScope({ videoOnly: true }), { executed: ["video"], excluded: ["seedance"] });
  assert.deepEqual(buildRealProviderSmokeScope({ audioOnly: true }), { executed: ["audio"], excluded: ["video", "seedance"] });
  assert.deepEqual(buildRealProviderSmokeScope({ musicOnly: true }), { executed: ["music"], excluded: ["video", "seedance"] });
  assert.deepEqual(buildRealProviderSmokeScope({ imageOnly: true }), { executed: ["image"], excluded: ["video", "seedance"] });
});

test("non-Seedance video profile resolution skips the excluded model", () => {
  const config = {
    providers: {
      seedance: { id: "seedance", source: "runninghub", model: "seedance", baseUrl: "https://video.example", apiKey: "secret", endpoint: "/seedance" },
      h3: { id: "h3", source: "runninghub", model: "MiniMax-Hailuo-H3", baseUrl: "https://video.example", apiKey: "secret", endpoint: "/h3" },
    },
    defaults: { video: "seedance" },
  };
  assert.equal(resolveNonSeedanceVideoProfile(config)?.id, "h3");
  assert.equal(resolveNonSeedanceVideoProfile({ providers: { audio: { id: "audio", source: "minimax", model: "speech-2.8-turbo", baseUrl: "https://audio.example", apiKey: "secret" } }, defaults: { video: "audio" } }), undefined);
  assert.equal(resolveNonSeedanceVideoProfile({ ...config, providers: { seedance: config.providers.seedance }, defaults: { video: "seedance" } }), undefined);
});

test("slow RunningHub H3 smoke receives a bounded long-poll budget", () => {
  assert.equal(defaultVideoPollBudget({ model: "MiniMax-Hailuo-H3", endpoint: "/h3" }, "runninghub"), 240);
  assert.equal(defaultVideoPollBudget({ model: "generic-video", endpoint: "/video" }, "runninghub"), 12);
  assert.equal(defaultVideoPollBudget({ model: "MiniMax-Hailuo-H3" }, "minimax"), 12);
});
