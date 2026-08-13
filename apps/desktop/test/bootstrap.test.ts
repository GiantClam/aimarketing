import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isRuntimeReady, type BootstrapManifest } from "../runtime/bootstrap";

test("runtime readiness requires every mandatory component", () => {
  const base: BootstrapManifest = { schemaVersion: 1, source: "system", checkedAt: new Date(0).toISOString(), probes: [
    { component: "node", ok: true }, { component: "opencode", ok: true }, { component: "python", ok: true },
    { component: "fonts", ok: true }, { component: "skills", ok: true }, { component: "embedding", ok: true }, { component: "migrations", ok: true },
  ] };
  assert.equal(isRuntimeReady(base), true);
  assert.equal(isRuntimeReady({ ...base, probes: base.probes.map((probe) => probe.component === "embedding" ? { ...probe, ok: false } : probe) }), false);
  assert.equal(isRuntimeReady({ ...base, probes: base.probes.map((probe) => probe.component === "python" ? { ...probe, ok: false } : probe) }), false);
});

test("runtime repair uses the same real PPTX capability shape as the native gate", () => {
  const source = readFileSync(resolve(process.cwd(), "../../scripts/install-desktop-runtime.ps1"), "utf8");
  assert.match(source, /AIMarketing 中文 PPT probe/);
  assert.match(source, /ppt\/slides\/slide1\.xml/);
  assert.match(source, /Microsoft YaHei/);
});
