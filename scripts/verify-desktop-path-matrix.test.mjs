import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("Windows path matrix verifier covers non-ASCII, spaces, long and OneDrive-shaped paths", async () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const source = await readFile(join(root, "verify-desktop-path-matrix.ps1"), "utf8");
  for (const marker of ["中文 用户", "AI Marketing space path", "OneDrive - AI Marketing", "Start-Process", "cleanVm = $false"]) {
    assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  assert.match(source, /Stop-ProcessTree/u);
  assert.match(source, /portable\.flag/u);
});
