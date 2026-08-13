import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

test("desktop package verifier checks normal and portable archive contracts", async () => {
  const script = await readFile(join(dirname(fileURLToPath(import.meta.url)), "verify-desktop-packages.ps1"), "utf8");
  assert.match(script, /AI-Marketing-Windows-x64-\$Mode/u);
  assert.match(script, /portable\.flag/u);
  assert.match(script, /runtime\/runtime-manifest\.json/u);
  assert.match(script, /desktop_package_embeds_full_runtime/u);
  assert.match(script, /runtime\/python\//u);
  assert.match(script, /AIMarketing-Runtime-x64\.zip/u);
  assert.match(script, /desktop_package_stale_entry/u);
  assert.match(script, /PackageDir = "\.artifacts"/u);
  assert.match(script, /desktop-release/u);
  assert.match(script, /desktop-release-\$Mode/u);
  assert.match(script, /Verify-Package -Mode "normal"/u);
  assert.match(script, /Verify-Package -Mode "portable"/u);
});
