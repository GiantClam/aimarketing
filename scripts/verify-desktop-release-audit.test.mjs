import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

test("desktop release audit is fail-closed for required release evidence", async () => {
  const script = await readFile(join(dirname(fileURLToPath(import.meta.url)), "verify-desktop-release-audit.ps1"), "utf8");
  assert.match(script, /RequireAuthenticode/u);
  assert.match(script, /RequireSignedManifest/u);
  assert.match(script, /RequireDependencyAudit/u);
  assert.match(script, /desktop_release_audit_license_evidence_missing/u);
  assert.match(script, /desktop_release_audit_manifest_signature_required/u);
  assert.match(script, /desktop_release_audit_dependency_audit_required/u);
  assert.match(script, /Get-AuthenticodeSignature/u);
  assert.match(script, /status = if \(\$authenticode\.status -eq "pass"/u);
});
