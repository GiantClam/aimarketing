import assert from "node:assert/strict";
import test from "node:test";

import { scanDesktopNetworkBoundary } from "./verify-desktop-network-boundary.mjs";
import { DESKTOP_BUNDLE_TEXT_EXTENSIONS } from "./verify-desktop-bundle-boundaries.mjs";

test("desktop network boundary accepts local runtime and user-provider indirection", () => {
  assert.deepEqual(scanDesktopNetworkBoundary([
    { filePath: "fixture.js", source: "fetch(provider.baseUrl + '/v1/chat'); http://127.0.0.1:11434/v1; https://localhost:1420" },
  ]), []);
});

test("desktop network boundary rejects hardcoded external endpoints", () => {
  const violations = scanDesktopNetworkBoundary([
    { filePath: "fixture.js", source: "fetch('https://api.vendor.example/v1/chat')" },
  ]);
  assert.deepEqual(violations.map((item) => item.label), ["hardcoded external URL"]);
});

test("desktop network boundary allows the approved provider catalog default", () => {
  assert.deepEqual(scanDesktopNetworkBoundary([
    { filePath: "provider-catalog.js", source: "const defaultBaseUrl = 'https://api.siliconflow.cn/'" },
  ]), []);
});

test("desktop network boundary ignores library documentation and XML namespace URLs", () => {
  assert.deepEqual(scanDesktopNetworkBoundary([
    { filePath: "fixture.js", source: "https://react.dev/errors/1 https://github.com/org/repo http://www.w3.org/2000/svg" },
  ]), []);
});

test("desktop bundle collection includes shipped text resources beyond JavaScript assets", () => {
  for (const extension of [".css", ".html", ".json", ".js", ".mjs", ".svg"]) {
    assert.equal(DESKTOP_BUNDLE_TEXT_EXTENSIONS.has(extension), true);
  }
  assert.equal(DESKTOP_BUNDLE_TEXT_EXTENSIONS.has(".exe"), false);
});
