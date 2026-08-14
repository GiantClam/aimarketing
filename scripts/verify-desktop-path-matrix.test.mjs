import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("Windows path matrix verifier covers non-ASCII, spaces, long and OneDrive-shaped paths", async () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const source = await readFile(join(root, "verify-desktop-path-matrix.ps1"), "utf8");
  for (const marker of ["0x4E2D", "0x6587", "0x7528", "0x6237", "AI Marketing space path", "OneDrive - AI Marketing", "Start-Process", "tar.exe", "New-Item -ItemType Junction", "portable-copy verifier", "cleanVm = $false"]) {
    assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  assert.match(source, /Stop-ProcessTree/u);
  assert.match(source, /portable\.flag/u);
});
