import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("Windows release signing is fail-closed and verifies the exact shipped binaries", async () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const source = await readFile(join(root, "sign-windows-release.ps1"), "utf8");
  assert.match(source, /AIMARKETING_SIGNTOOL_PATH/u);
  assert.match(source, /AIMARKETING_AUTHENTICODE_THUMBPRINT/u);
  assert.match(source, /IsPathRooted/u);
  assert.match(source, /windows_release_signtool_unavailable/u);
  assert.match(source, /windows_release_authenticode_certificate_required/u);
  assert.match(source, /windows_release_authenticode_sign_failed/u);
  assert.match(source, /Get-AuthenticodeSignature/u);
  assert.match(source, /runtime-manifest-crypto\.mjs/u);
  assert.match(source, /windows_release_manifest_signature_invalid/u);
  assert.match(source, /windows_release_manifest_json_invalid/u);
  assert.match(source, /windows_release_manifest_signature_required/u);
  assert.match(source, /ai-marketing\.exe/u);
  assert.match(source, /_up_\\dist-runtime\\runtime\\node\\node\.exe/u);
  assert.match(source, /_up_\\dist-runtime\\runtime\\opencode\\opencode\.exe/u);
  assert.match(source, /\$fileStatus = "pass"/u);
  assert.match(source, /status = if \(\$fileStatus -eq "pass"/u);
});
