import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "package-desktop-runtime.ps1");

test("offline runtime packager uses the manifest as its source of truth", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /runtime\/runtime-manifest\.json/u);
  assert.match(source, /runtime_package_manifest_target_invalid/u);
  assert.match(source, /foreach \(\$asset in @\(\$manifest\.assets\)\)/u);
  assert.match(source, /Verify-Asset \$asset \$stage/u);
});

test("offline runtime packager preserves the installer import contract", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /CoworkAny-Runtime-x64\.zip/u);
  assert.match(source, /install-desktop-runtime\.ps1/u);
  assert.match(source, /Compress-Archive/u);
  assert.match(source, /SkipDownloads/u);
  assert.match(source, /runtime_package_archive_missing/u);
  assert.match(source, /runtime-manifest-crypto\.mjs/u);
  assert.match(source, /RequireSignature/u);
  assert.match(source, /runtime_package_manifest_signature_required/u);
  assert.match(source, /signatureAlgorithm -ne "ed25519"/u);
});

test("offline runtime packager preflights embedded Python PPT dependencies", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /Prepare-OfflinePython \$stage/u);
  assert.match(source, /Test-EmbeddedPythonPptProbe/u);
  assert.match(source, /runtime_package_python_dependencies_failed/u);
  assert.match(source, /python-ppt offline probe|CoworkAny PPT offline probe/u);
  assert.match(source, /SkipPythonDependencies/u);
});
