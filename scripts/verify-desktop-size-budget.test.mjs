import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

test("desktop size budget verifier reports all release components and fails over budget", async () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const script = await readFile(join(root, "verify-desktop-size-budget.ps1"), "utf8");
  const budget = JSON.parse(await readFile(join(root, "desktop-size-budget.json"), "utf8"));
  assert.match(script, /Measure-Archive/u);
  assert.match(script, /compressedBytes/u);
  assert.match(script, /uncompressedBytes/u);
  for (const component of ["application", "node", "opencode", "python", "fonts", "embedding", "skills"]) {
    assert.match(script, new RegExp(`[\"']${component}[\"']`, "u"));
    assert.equal(typeof budget.components[component], "number");
  }
  assert.match(script, /desktop_size_budget_exceeded/u);
  assert.match(script, /runtimeZipBytes/u);
  assert.match(script, /extractedProgramBytes/u);
  assert.match(script, /desktop-release\/AI-Marketing-Windows-x64-normal\.zip/u);
  assert.match(script, /desktop-runtime-release-retry\/AIMarketing-Runtime-x64\.zip/u);
});
