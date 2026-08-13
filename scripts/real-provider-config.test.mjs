import test from "node:test";
import assert from "node:assert/strict";
import { assertRealProviderConfig, hasExpectedSmokeResponse, REAL_PROVIDER_SMOKE_SCOPE, validateRealProviderConfig } from "./real-provider-config.mjs";

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
  assert.equal(hasExpectedSmokeResponse("video", { data: [{ url: "https://example.test/video.mp4" }] }), false);
  assert.deepEqual(REAL_PROVIDER_SMOKE_SCOPE, { executed: ["llm", "image", "audio"], excluded: ["video", "seedance"] });
});
