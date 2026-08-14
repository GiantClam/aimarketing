import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { embeddingDescriptorPath, fontsAssetPath, isRuntimeReady, MANDATORY_RUNTIME_COMPONENTS, type BootstrapManifest } from "../runtime/bootstrap";

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
  assert.equal(isRuntimeReady({ ...base, probes: base.probes.filter((probe) => probe.component !== "migrations") }), false);
});

test("each damaged runtime fixture blocks the repair gate until the repeated probe is healthy", () => {
  const base: BootstrapManifest = { schemaVersion: 1, source: "private", checkedAt: new Date(0).toISOString(), probes: MANDATORY_RUNTIME_COMPONENTS.map((component) => ({ component, ok: true })) };
  for (const component of MANDATORY_RUNTIME_COMPONENTS) {
    const damaged = { ...base, probes: base.probes.map((probe) => probe.component === component ? { ...probe, ok: false, detail: `fixture damaged: ${component}` } : probe) };
    assert.equal(isRuntimeReady(damaged), false, `${component} fixture must trigger repair`);
    assert.equal(isRuntimeReady(base), true, `${component} fixture must pass after the repaired probe`);
  }
});

test("runtime repair uses the same real PPTX capability shape as the native gate", () => {
  const source = readFileSync(resolve(process.cwd(), "../../scripts/install-desktop-runtime.ps1"), "utf8");
  // Keep the PowerShell source ASCII-safe so legacy Windows PowerShell cannot
  // reinterpret the probe text before Python receives it.
  assert.match(source, /AIMarketing \\u4e2d\\u6587 PPT probe/u);
  assert.doesNotMatch(source, /AIMarketing 中文 PPT probe/u);
  assert.match(source, /ppt\/slides\/slide1\.xml/);
  assert.match(source, /Microsoft YaHei/);
});

test("runtime probes resolve the concrete font and embedding assets", () => {
  assert.equal(fontsAssetPath("C:/AIMarketing/runtime/fonts"), join("C:/AIMarketing/runtime/fonts", "msyh.ttc"));
  assert.equal(fontsAssetPath("C:/AIMarketing/runtime/fonts/msyh.ttc"), "C:/AIMarketing/runtime/fonts/msyh.ttc");
  assert.equal(embeddingDescriptorPath("C:/AIMarketing/runtime/embedding"), join("C:/AIMarketing/runtime/embedding", "local-hash-384-v1.json"));
  assert.equal(embeddingDescriptorPath("C:/AIMarketing/runtime/embedding/custom.json"), "C:/AIMarketing/runtime/embedding/custom.json");
});
