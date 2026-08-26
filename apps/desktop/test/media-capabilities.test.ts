import assert from "node:assert/strict";
import test from "node:test";
import { assertVideoMediaCapability, resolveVideoMediaCapabilities, supportsVideoMediaRole } from "../runtime/media-capabilities";

test("keeps the legacy first-frame contract while gating unsupported video roles", () => {
  const profile = resolveVideoMediaCapabilities("openai-compatible", "video-model");
  assert.equal(supportsVideoMediaRole(profile, "image.first_frame"), true);
  assert.equal(supportsVideoMediaRole(profile, "image.last_frame"), false);
  assert.doesNotThrow(() => assertVideoMediaCapability(profile, { firstFrameUrl: "https://example.test/first.png" }));
  assert.throws(() => assertVideoMediaCapability(profile, { lastFrameUrl: "https://example.test/last.png" }), /provider_media_role_unsupported:image.last_frame/);
  assert.throws(() => assertVideoMediaCapability(profile, { mode: "video-edit", sourceVideoUrl: "https://example.test/source.mp4" }), /provider_media_role_unsupported:video.source/);
});

test("does not enable media roles for providers without an adapter contract", () => {
  const profile = resolveVideoMediaCapabilities("runninghub", "video-model");
  assert.equal(supportsVideoMediaRole(profile, "image.first_frame"), false);
  assert.throws(() => assertVideoMediaCapability(profile, { firstFrameUrl: "https://example.test/first.png" }), /provider_media_role_unsupported:image.first_frame/);
});
