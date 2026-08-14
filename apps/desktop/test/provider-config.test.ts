import test from "node:test";
import assert from "node:assert/strict";
import { configuredModelOptions, modelOptionsForProvider, preferredConfiguredModel, providerForCapability, providerForId, type DesktopProviderConfig } from "../src/provider-config";

const text: DesktopProviderConfig = { id: "text", model: "text/model", baseUrl: "https://text.test/v1" };
const image: DesktopProviderConfig = { id: "image", model: "image/model", baseUrl: "https://image.test/v1" };
const video: DesktopProviderConfig = { id: "video", model: "video/model", baseUrl: "https://video.test/v1" };

test("capability defaults select independent provider profiles", () => {
  const config = {
    provider: text,
    providers: { text, image, video },
    defaults: { text: "text", image: "image", video: "video" },
  };
  assert.deepEqual(providerForCapability(config, "text"), text);
  assert.deepEqual(providerForCapability(config, "image"), image);
  assert.deepEqual(providerForCapability(config, "video"), video);
  assert.deepEqual(providerForCapability(config, "audio"), text);
});

test("unknown profile ids fall back safely to the legacy provider", () => {
  const config = { provider: text, providers: { image }, defaults: { image: "missing" } };
  assert.deepEqual(providerForCapability(config, "image"), text);
  assert.deepEqual(providerForId(config, "image"), image);
  assert.deepEqual(providerForId(config, "missing"), text);
});

test("profile model catalogs do not leak the legacy provider models", () => {
  const config = {
    provider: { ...text, models: ["text/model-a", "text/model-b"] },
    providers: { image: { ...image } },
    defaults: { image: "image" },
  };
  const imageProvider = providerForCapability(config, "image");
  assert.equal(modelOptionsForProvider(config, imageProvider), undefined);
  assert.deepEqual(modelOptionsForProvider(config, config.provider), ["text/model-a", "text/model-b"]);
});

test("configured model lists are canonical and prefer the first configured model", () => {
  const provider = { ...text, model: "missing", models: ["", " text/model-a ", "text/model-a", "text/model-b"] };
  assert.deepEqual(configuredModelOptions(provider), ["text/model-a", "text/model-b"]);
  assert.equal(preferredConfiguredModel(provider), "text/model-a");
  assert.deepEqual(modelOptionsForProvider({ provider }, provider), ["text/model-a", "text/model-b"]);
});

test("same-capability provider profiles keep independent model catalogs and defaults", () => {
  const imageFast: DesktopProviderConfig = { id: "image-fast", source: "openai-compatible", model: "retired", models: ["image/fast", "image/quality"], baseUrl: "https://fast.test/v1" };
  const imageQuality: DesktopProviderConfig = { id: "image-quality", source: "bailian", model: "image/hd", models: ["image/hd", "image/4k"], baseUrl: "https://quality.test/v1" };
  const config = { provider: text, providers: { "image-fast": imageFast, "image-quality": imageQuality }, defaults: { image: "image-quality" as const } };
  const selected = providerForCapability(config, "image");
  assert.equal(selected.id, "image-quality");
  assert.equal(selected.model, "image/hd");
  assert.deepEqual(modelOptionsForProvider(config, selected), ["image/hd", "image/4k"]);
  assert.equal(providerForId(config, "image-fast").model, "image/fast");
  assert.deepEqual(modelOptionsForProvider(config, providerForId(config, "image-fast")), ["image/fast", "image/quality"]);
});
