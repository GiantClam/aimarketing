import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

test("portable copy verifier checks adjacent data and copied runtime fingerprints", async () => {
  const script = await readFile(join(dirname(fileURLToPath(import.meta.url)), "verify-desktop-portable-copy.ps1"), "utf8");
  assert.match(script, /portable\.flag/u);
  assert.match(script, /dataRoot/u);
  assert.match(script, /File-Fingerprint/u);
  assert.match(script, /Security\.Cryptography\.SHA256\]::Create\(\)/u);
  assert.match(script, /desktop_portable_copy_runtime_changed/u);
  assert.match(script, /localAppDataCreated/u);
  assert.match(script, /tar\.exe/u);
  assert.match(script, /robocopy/u);
  assert.match(script, /desktop-release\/CoworkAny-Windows-x64-portable\.zip/u);
  assert.match(script, /install-desktop-runtime\.ps1/u);
  assert.match(script, /runtime-manifest-crypto\.mjs/u);
});
