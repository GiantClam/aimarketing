import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("desktop release preflight composes every fail-closed release gate", async () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const source = await readFile(join(root, "verify-desktop-release-preflight.ps1"), "utf8");
  assert.match(source, /verify-desktop-packages\.ps1/u);
  assert.match(source, /verify-desktop-size-budget\.ps1/u);
  assert.match(source, /verify-desktop-portable-copy\.ps1/u);
  assert.match(source, /verify-desktop-release-audit\.ps1/u);
  assert.match(source, /sign-windows-release\.ps1/u);
  assert.match(source, /-RequireAuthenticode/u);
  assert.match(source, /-RequireSignedManifest/u);
  assert.match(source, /-RequireDependencyAudit/u);
  assert.match(source, /desktop_release_preflight_dependency_report_required/u);
  assert.match(source, /desktop_release_preflight_portable_copy_incomplete/u);
  assert.match(source, /verify-desktop-bundle-boundaries\.mjs/u);
  assert.match(source, /verify-desktop-network-boundary\.mjs/u);
  assert.match(source, /desktop_release_preflight_.*_incomplete/u);
});
