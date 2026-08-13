import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { embeddingDescriptorPath, fontsAssetPath, isRuntimeReady, type BootstrapManifest } from "../runtime/bootstrap";

test("runtime readiness requires every mandatory component", () => {
  const base: BootstrapManifest = { schemaVersion: 1, source: "system", checkedAt: new Date(0).toISOString(), probes: [
    { component: "node", ok: true }, { component: "opencode", ok: true }, { component: "python", ok: true }, { component: "host", ok: true },
    { component: "knowledge", ok: true }, { component: "fonts", ok: true }, { component: "skills", ok: true }, { component: "lancedb", ok: true }, { component: "embedding", ok: true }, { component: "migrations", ok: true },
  ] };
  assert.equal(isRuntimeReady(base), true);
  assert.equal(isRuntimeReady({ ...base, probes: base.probes.map((probe) => probe.component === "embedding" ? { ...probe, ok: false } : probe) }), false);
  assert.equal(isRuntimeReady({ ...base, probes: base.probes.map((probe) => probe.component === "python" ? { ...probe, ok: false } : probe) }), false);
  assert.equal(isRuntimeReady({ ...base, probes: base.probes.map((probe) => probe.component === "host" ? { ...probe, ok: false } : probe) }), false);
  assert.equal(isRuntimeReady({ ...base, probes: base.probes.map((probe) => probe.component === "lancedb" ? { ...probe, ok: false } : probe) }), false);
});

test("runtime repair uses the same real PPTX capability shape as the native gate", () => {
  const source = readFileSync(resolve(process.cwd(), "../../scripts/install-desktop-runtime.ps1"), "utf8");
  assert.match(source, /AIMarketing 中文 PPT probe/);
  assert.match(source, /ppt\/slides\/slide1\.xml/);
  assert.match(source, /Microsoft YaHei/);
});

test("runtime probes resolve the concrete font and embedding assets", () => {
  assert.equal(fontsAssetPath("C:/AIMarketing/runtime/fonts"), join("C:/AIMarketing/runtime/fonts", "msyh.ttc"));
  assert.equal(fontsAssetPath("C:/AIMarketing/runtime/fonts/msyh.ttc"), "C:/AIMarketing/runtime/fonts/msyh.ttc");
  assert.equal(embeddingDescriptorPath("C:/AIMarketing/runtime/embedding"), join("C:/AIMarketing/runtime/embedding", "local-hash-384-v1.json"));
  assert.equal(embeddingDescriptorPath("C:/AIMarketing/runtime/embedding/custom.json"), "C:/AIMarketing/runtime/embedding/custom.json");
});
