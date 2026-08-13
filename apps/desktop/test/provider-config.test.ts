import test from "node:test";
import assert from "node:assert/strict";
import { providerForCapability, providerForId, type DesktopProviderConfig } from "../src/provider-config";

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
