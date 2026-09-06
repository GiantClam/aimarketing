import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const quote = (value) => `'${value.replaceAll("'", "''")}'`;

test("staged manifest pins the official CPython NuGet distribution and its downloaded digest", { skip: process.platform !== "win32" }, async () => {
  // Evaluate the emitted manifest without copying host executables or staging skills.
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-Command", `
$tokens=$null; $errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile(${quote(join(scripts, "stage-desktop-runtime.ps1"))},[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw $errors[0] }
$destination=$env:TEMP
$table=$ast.FindAll({ param($n) $n -is [Management.Automation.Language.HashtableAst] -and $n.Extent.Text -match 'manifestId = "coworkany-runtime' },$true) | Select-Object -First 1
& ([scriptblock]::Create($table.Extent.Text)) | ConvertTo-Json -Depth 8 -Compress
`], { windowsHide: true, timeout: 30000, maxBuffer: 16384 });
  const manifest = JSON.parse(stdout);
  assert.equal(manifest.python.distribution, "cpython-nuget");
  assert.equal(manifest.python.version, "3.13.6");
  const asset = manifest.assets.find(({ id }) => id === "python-nuget-amd64");
  assert.equal(asset.relativePath, "runtime/python/python.3.13.6.nupkg");
  assert.equal(asset.bytes, 14170995);
  assert.equal(asset.sha256, "cc1d4850a31f18a5c5d52007c248a99f1c360c96886f6fd2e324a55dc1d1967b");
  assert.equal(asset.urls.official, "https://api.nuget.org/v3-flatcontainer/python/3.13.6/python.3.13.6.nupkg");
  assert.ok(!manifest.assets.some(({ id }) => ["python-embed-amd64", "python-get-pip"].includes(id)));
});
