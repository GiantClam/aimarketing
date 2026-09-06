import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, generateKeyPairSync } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "install-desktop-runtime.ps1");

test("NuGet extraction stages a generic python3 command with standard script imports", {
  skip: process.platform !== "win32" || !process.env.COWORKANY_TEST_PYTHON_NUPKG,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "runtime-python3-"));
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  try {
    const pythonRoot = join(root, "runtime/python");
    await mkdir(pythonRoot, { recursive: true });
    await copyFile(process.env.COWORKANY_TEST_PYTHON_NUPKG, join(pythonRoot, "python.3.13.6.nupkg"));
    await writeFile(join(root, "sibling.py"), "VALUE = 42\n", "utf8");
    await writeFile(join(root, "probe.py"), "import sibling, sys, pip, venv\nassert sibling.VALUE == 42\nassert not sys.flags.isolated and not sys.flags.safe_path\nprint('python3-ok')\n", "utf8");
    await writeFile(join(root, "installed-requirements.txt"), "pip>=0\n", "utf8");
    await writeFile(join(root, "missing-requirements.txt"), "coworkany-missing-runtime-fixture>=1\n", "utf8");
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `
$ErrorActionPreference='Stop'
$tokens=$null; $errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile(${quote(scriptPath)},[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw $errors[0] }
$ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] },$false) | ForEach-Object { . ([scriptblock]::Create($_.Extent.Text)) }
$stageRoot=${quote(root)}
$manifest=@{assets=@(@{id='python-nuget-amd64'; kind='archive'; relativePath='runtime/python/python.3.13.6.nupkg'; extractPath='runtime/python'; bytes=14170995; sha256='cc1d4850a31f18a5c5d52007c248a99f1c360c96886f6fd2e324a55dc1d1967b'})}
Expand-ArchiveAssets
$env:PATH=${quote(pythonRoot)} + ';' + $env:PATH
if ((Get-Command python3).Source -ne ${quote(join(pythonRoot, "python3.exe"))}) { throw 'python3_resolved_outside_runtime' }
python3 ${quote(join(root, "probe.py"))}
if ($LASTEXITCODE -ne 0) { throw 'python3_command_failed' }
$python=Join-Path $stageRoot 'runtime/python/python.exe'
foreach ($iteration in @(1,2)) {
  if (-not (Test-PythonRequirements $python ${quote(join(root, "installed-requirements.txt"))})) { throw 'requirements_not_idempotent' }
  if (Test-PythonRequirements $python ${quote(join(root, "missing-requirements.txt"))}) { throw 'accepted_missing_requirement' }
}
`], { windowsHide: true, cwd: tmpdir(), timeout: 60000, maxBuffer: 16384 });
    assert.match(stdout, /python3-ok/);
    assert.deepEqual(await readFile(join(pythonRoot, "python3.exe")), await readFile(join(pythonRoot, "python.exe")));
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 3 }); }
});

test("bootstrap rejects legacy embedded Python manifests before accepting an offline runtime", { skip: process.platform !== "win32" }, async () => {
  const root = await mkdtemp(join(tmpdir(), "runtime-legacy-python-"));
  try {
    const manifestPath = join(root, "manifest.json");
    await writeFile(manifestPath, JSON.stringify({
      schemaVersion: 1, platform: "windows", architecture: "x64",
      compatibility: { architecture: "x64" },
      integrity: { hashAlgorithm: "sha256", signatureAlgorithm: "ed25519" },
      assets: [{ id: "python-embed-amd64", kind: "archive", relativePath: "runtime/python/python-3.13.6-embed-amd64.zip", extractPath: "runtime/python", sha256: "a".repeat(64), urls: {} }],
    }), "utf8");
    await assert.rejects(execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-ManifestPath", manifestPath, "-InstallRoot", join(root, "install"), "-ValidateOnly"], { windowsHide: true, timeout: 30000 }), /runtime_python_distribution_unsupported/);
    await assert.rejects(readFile(join(root, "install", "runtime", "python", "python.exe")), /ENOENT/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("runtime installer keeps the approved mirror order", async () => {
  const source = await readFile(scriptPath, "utf8");
  const mirrorOrder = ["$mirrors = @(\"aliyun\", \"tencent\", \"tsinghua\", \"official\")"];
  assert.ok(source.includes(mirrorOrder[0]));
  assert.match(source, /assert not sys.flags.isolated and not sys.flags.safe_path/u);
  assert.match(source, /--no-index --no-deps --dry-run/u);
  assert.doesNotMatch(source, /import pptx|import.*pathops/u);
  assert.doesNotMatch(source, /Presentation\(\)|run.font.name/u);
  assert.match(source, /Install-OpenCodePackage\s+-Offline:\(\[bool\]\$OfflineZip\)/u);
  assert.match(source, /offline_opencode_missing/u);
});

test("installer falls back through every mirror after bounded HTTP failures", async (t) => {
  if (process.platform !== "win32") { t.skip("PowerShell mirror fallback is Windows-only"); return; }
  const labels = ["aliyun", "tencent", "tsinghua", "official"];
  const payload = Buffer.from("mirror-fallback-fixture\n", "utf8");
  const sha256 = createHash("sha256").update(payload).digest("hex");
  const source = await readFile(scriptPath, "utf8");
  const functionStart = source.indexOf("function Invoke-ResumableDownload");
  const installStart = source.indexOf("function Install-VerifiedAsset");
  const downloadEnd = source.indexOf("\n}\n", functionStart) + 3;
  const installEnd = source.indexOf("\n}\n", installStart) + 3;
  assert.ok(functionStart >= 0 && installStart > functionStart && downloadEnd > functionStart && installEnd > installStart);
  const functionSource = `${source.slice(functionStart, downloadEnd)}\n${source.slice(installStart, installEnd)}`.replace(
    "$hash = (Get-FileHash -LiteralPath $tmp -Algorithm SHA256).Hash.ToLowerInvariant()",
    "$hash = ([BitConverter]::ToString(([Security.Cryptography.SHA256]::Create()).ComputeHash([IO.File]::ReadAllBytes($tmp))).Replace('-', '')).ToLowerInvariant()",
  );
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const requests = [];
  let activeSuccessIndex = 0;
  const server = createServer((request, response) => {
    const label = String(request.url ?? "").replace(/^\//u, "");
    const index = labels.indexOf(label);
    requests.push(label);
    if (index === activeSuccessIndex) { response.writeHead(200, { "content-length": payload.length }); response.end(payload); return; }
    response.writeHead(503); response.end("unavailable");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    for (let successIndex = 0; successIndex < labels.length; successIndex += 1) {
      activeSuccessIndex = successIndex;
      requests.length = 0;
      const root = await mkdtemp(join(tmpdir(), `coworkany-mirror-fallback-${successIndex}-`));
      const stageRoot = join(root, "stage");
      const target = join(stageRoot, "runtime", "fixture.bin");
      const urls = Object.fromEntries(labels.map((label) => [label, `http://localhost:${address.port}/${label}`]));
      const assetJson = JSON.stringify({ id: "fixture", relativePath: "runtime/fixture.bin", sha256, urls });
      const command = [
        "$ErrorActionPreference='Stop'",
        "$mirrors=@('aliyun','tencent','tsinghua','official')",
        "$Proxy=''",
        `$stageRoot=${quote(stageRoot)}`,
        `$asset=ConvertFrom-Json ${quote(assetJson)}`,
        "function Write-RuntimeProgress { param([string]$message) }",
        functionSource,
        "New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null",
        "Install-VerifiedAsset $asset",
      ].join("\n");
      try {
        try {
          await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], { windowsHide: true });
        } catch (error) {
          throw new Error(`${error instanceof Error ? error.message : String(error)}; requests=${requests.join(",")}; successIndex=${successIndex}`);
        }
        assert.deepEqual(requests, labels.slice(0, successIndex + 1));
        assert.deepEqual(await readFile(target), payload);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("OpenCode npm fallback includes the Qinghua registry before official npm", async () => {
  const source = await readFile(scriptPath, "utf8");
  const npmStart = source.indexOf("$registries = @(");
  const npmBlock = source.slice(npmStart, source.indexOf(")", npmStart) + 1);
  assert.ok(npmBlock.indexOf("registry.npmmirror.com") < npmBlock.indexOf("mirrors.cloud.tencent.com/npm"));
  assert.ok(npmBlock.indexOf("mirrors.cloud.tencent.com/npm") < npmBlock.indexOf("mirrors.tuna.tsinghua.edu.cn/npm"));
  assert.ok(npmBlock.indexOf("mirrors.tuna.tsinghua.edu.cn/npm") < npmBlock.indexOf("registry.npmjs.org"));
});

test("installer seeds bundled runtime and skills before downloading missing components", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /Seed-BundledRuntime/);
  assert.match(source, /localPath|bundledRuntime/);
  assert.match(source, /alreadyExtracted/u);
  assert.match(source, /runtime archive missing/u);
  assert.match(source, /Invoke-ResumableDownload\s+\$url\s+\$tmp\s+90/u);
  assert.match(source, /HttpWebRequest/u);
  assert.match(source, /pip --isolated install[^\n]+--timeout 30/u);
  assert.match(source, /if \(-not \$OfflineZip\) \{ Seed-BundledRuntime \}/u);
});

test("installer normalizes Windows extended paths before PowerShell path operations", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /function Convert-ToPowerShellCompatiblePath/);
  assert.match(source, /\$ManifestPath = Convert-ToPowerShellCompatiblePath \$ManifestPath/);
  assert.match(source, /\$InstallRoot = Convert-ToPowerShellCompatiblePath \$InstallRoot/);
  assert.match(source, /\$OfflineZip = Convert-ToPowerShellCompatiblePath \$OfflineZip/);
  assert.match(source, /Substring\(4\)/);
  assert.match(source, /Substring\(8\)/);
});

test("installer emits bounded progress markers for the desktop bootstrap UI", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /function Write-RuntimeProgress/);
  assert.match(source, /RUNTIME_PROGRESS:/);
  assert.match(source, /downloading:\$\(\$asset\.id\)/);
  assert.match(source, /python_dependencies_check/);
  assert.match(source, /activating_runtime/);
  assert.match(source, /completed/);
});

test("nested Node runtime cleanup is idempotent after Move-Item", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /try \{ Remove-Item -LiteralPath \$nestedNode\.FullName -Recurse -Force -ErrorAction Stop \} catch \{ \}/u);
  assert.match(source, /try \{ Remove-Item -LiteralPath \$stageRoot -Recurse -Force -ErrorAction Stop \} catch \{ \}/u);
});

test("installer keeps source fallback, resume, proxy and disk gates fail-closed", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /\$mirrors = @\("aliyun", "tencent", "tsinghua", "official"\)/u);
  assert.match(source, /AddRange\(\[int64\]\$existingBytes\)/u);
  assert.match(source, /\$partial = "\$destination\.part"/u);
  assert.match(source, /\[Net\.WebProxy\]::new\(\$Proxy\)/u);
  assert.match(source, /\[IO\.DriveInfo\]::new\(\$root\)\.AvailableFreeSpace/u);
  assert.match(source, /runtime_install_disk_space_insufficient/u);
  assert.match(source, /runtime_install_temp_disk_space_insufficient/u);
  assert.match(source, /Assert-SufficientDiskSpace\s*$/mu);
  assert.match(source, /--proxy/u);
  assert.match(source, /Assert-OfflineArchiveManifest/u);
  assert.match(source, /runtime_offline_manifest_mismatch/u);
  assert.match(source, /function Expand-SafeZip\(\[string\]\$archivePath, \[string\]\$destination\)/u);
  assert.match(source, /runtime_archive_entry_unsafe/u);
  assert.match(source, /ZipFile\]::ExtractToDirectory/u);
});

test("runtime activation restores last-known-good when staged activation fails", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /function Activate-StagedRuntime\(\)/u);
  assert.match(source, /Preserve user-owned/u);
  assert.match(source, /Copy-Item -LiteralPath \$existing\.FullName/u);
  assert.match(source, /\$movedExisting = \$false/u);
  assert.match(source, /\$activated = \$false/u);
  assert.match(source, /Move-Item -LiteralPath \$backupRoot -Destination \$installRootResolved/u);
  assert.match(source, /Activate-StagedRuntime\s*$/mu);
  if (process.platform !== "win32") return;
  const functionStart = source.indexOf("function Activate-StagedRuntime() ");
  const functionEnd = source.indexOf("\ntry {", functionStart);
  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  const root = await mkdtemp(join(tmpdir(), "coworkany-runtime-rollback-"));
  const installRoot = join(root, "install");
  const stageRoot = join(root, "stage");
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  await mkdir(join(installRoot, "runtime"), { recursive: true });
  await mkdir(join(stageRoot, "runtime"), { recursive: true });
  await writeFile(join(installRoot, "runtime", "sentinel.txt"), "known-good", "utf8");
  await writeFile(join(stageRoot, "runtime", "sentinel.txt"), "candidate", "utf8");
  const functionSource = source.slice(functionStart, functionEnd);
  const command = [
    "$ErrorActionPreference='Stop'",
    `$installRootResolved=${quote(installRoot)}`,
    `$stageRoot=${quote(stageRoot)}`,
    "function Move-Item { param([string]$LiteralPath,[string]$Destination,[switch]$Force,[switch]$Recurse); if ($Destination -eq $installRootResolved) { throw 'activation_fixture_failure' }; Microsoft.PowerShell.Management\\Move-Item -LiteralPath $LiteralPath -Destination $Destination -Force -Recurse }",
    functionSource,
    "try { Activate-StagedRuntime } catch { Write-Output 'activation-failed' }",
  ].join("\n");
  try {
    const result = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], { windowsHide: true });
    assert.match(result.stdout, /activation-failed/u);
    assert.equal(await readFile(join(installRoot, "runtime", "sentinel.txt"), "utf8"), "known-good");
    assert.equal(await readFile(join(stageRoot, "runtime", "sentinel.txt"), "utf8"), "candidate");
    await assert.rejects(readFile(join(root, "install.last-known-good", "runtime", "sentinel.txt")), /ENOENT/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("installer validates the signed-manifest shape before touching the install root", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /Assert-RuntimeManifestSchema/u);
  assert.match(source, /runtime_manifest_target_unsupported/u);
  assert.match(source, /runtime_manifest_compatibility_missing/u);
  assert.match(source, /runtime_manifest_\$\{label\}_unsafe/u);
  assert.match(source, /runtime_manifest_asset_hash_invalid/u);
  assert.match(source, /signatureAlgorithm -ne 'ed25519'/u);
  assert.match(source, /Assert-SafeRelativePath/u);
  assert.match(source, /trustedPublicKey/u);
  assert.doesNotMatch(source, /\$manifest\.integrity\.publicKey/u);
});

test("staged runtime manifest declares the Windows x64 compatibility and integrity contract", async () => {
  const source = await readFile(join(dirname(fileURLToPath(import.meta.url)), "stage-desktop-runtime.ps1"), "utf8");
  assert.match(source, /manifestId\s*=\s*"coworkany-runtime-windows-x64-v1"/u);
  assert.match(source, /platform\s*=\s*"windows"/u);
  assert.match(source, /architecture\s*=\s*"x64"/u);
  assert.match(source, /hashAlgorithm\s*=\s*"sha256"/u);
  assert.match(source, /signatureAlgorithm\s*=\s*"ed25519"/u);
  assert.match(source, /COWORKANY_RUNTIME_SIGNING_KEY/u);
  assert.match(source, /runtime-manifest-crypto\.mjs/u);
});

test("installer validates a manifest without creating or replacing runtime data", async (t) => {
  if (process.platform !== "win32") { t.skip("PowerShell runtime validation is Windows-only"); return; }
  const root = await mkdtemp(join(tmpdir(), "coworkany-manifest-validation-"));
  const manifestPath = join(root, "manifest.json");
  const installRoot = join(root, "install");
  const valid = {
    schemaVersion: 1,
    manifestId: "fixture",
    platform: "windows",
    architecture: "x64",
    compatibility: { architecture: "x64", windows: ["10-22H2", "11"] },
    integrity: { hashAlgorithm: "sha256", signatureAlgorithm: "ed25519", signature: null },
    assets: [{ id: "fixture", kind: "file", relativePath: "runtime/fixture.bin", sha256: "a".repeat(64), bytes: 1, urls: { official: "https://example.invalid/fixture.bin" } }],
  };
  try {
    await writeFile(manifestPath, `${JSON.stringify(valid)}\n`, "utf8");
    const result = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-ManifestPath", manifestPath, "-InstallRoot", installRoot, "-ValidateOnly"], { windowsHide: true });
    assert.match(result.stdout, /"status":"valid"/u);
    assert.equal(await readFile(manifestPath, "utf8"), `${JSON.stringify(valid)}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("installer rejects a tampered required signature before touching the install root", async (t) => {
  if (process.platform !== "win32") { t.skip("PowerShell runtime validation is Windows-only"); return; }
  const root = await mkdtemp(join(tmpdir(), "coworkany-signed-manifest-"));
  const manifestPath = join(root, "manifest.json");
  const signedPath = join(root, "signed.json");
  const keyPath = join(root, "private.pem");
  const testScript = join(root, "install-desktop-runtime.ps1");
  const testVerifier = join(root, "runtime-manifest-crypto.mjs");
  const installRoot = join(root, "install");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const manifest = {
    schemaVersion: 1,
    manifestId: "fixture-signed",
    platform: "windows",
    architecture: "x64",
    compatibility: { architecture: "x64", windows: ["10-22H2", "11"] },
    integrity: {
      hashAlgorithm: "sha256",
      signatureAlgorithm: "ed25519",
      required: true,
      signature: null,
      publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
    },
    assets: [{ id: "fixture", kind: "file", relativePath: "runtime/fixture.bin", sha256: "a".repeat(64), bytes: 1, urls: { official: "https://example.invalid/fixture.bin" } }],
  };
  try {
    const installerSource = await readFile(scriptPath, "utf8");
    const publicBase64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    await writeFile(testScript, installerSource.replace("MCowBQYDK2VwAyEAHgKs3hyNJCHJsLN9sle73MWSPew6fOweDLoO1E935JA=", publicBase64), "utf8");
    await copyFile(join(dirname(fileURLToPath(import.meta.url)), "runtime-manifest-crypto.mjs"), testVerifier);
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
    await writeFile(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }), "utf8");
    await execFileAsync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "runtime-manifest-crypto.mjs"), "sign", manifestPath, keyPath, signedPath], { windowsHide: true });
    await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", testScript, "-ManifestPath", signedPath, "-InstallRoot", installRoot, "-ValidateOnly"], { windowsHide: true });
    const signed = JSON.parse(await readFile(signedPath, "utf8"));
    signed.assets[0].bytes = 2;
    await writeFile(signedPath, `${JSON.stringify(signed)}\n`, "utf8");
    await assert.rejects(execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", testScript, "-ManifestPath", signedPath, "-InstallRoot", installRoot, "-ValidateOnly"], { windowsHide: true }));
    assert.equal(await readFile(signedPath, "utf8").then((value) => value.includes('"bytes":2')), true);
    await assert.rejects(readFile(join(installRoot, "runtime", "fixture.bin")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("offline validation rejects an archive whose embedded manifest diverges", async (t) => {
  if (process.platform !== "win32") { t.skip("PowerShell offline validation is Windows-only"); return; }
  const root = await mkdtemp(join(tmpdir(), "coworkany-offline-manifest-"));
  const archiveRoot = join(root, "archive");
  const manifestPath = join(root, "manifest.json");
  const archiveManifestPath = join(archiveRoot, "runtime-manifest.json");
  const zipPath = join(root, "runtime.zip");
  const installRoot = join(root, "install");
  const manifest = {
    schemaVersion: 1,
    manifestId: "offline-fixture",
    platform: "windows",
    architecture: "x64",
    compatibility: { architecture: "x64", windows: ["10-22H2", "11"] },
    integrity: { hashAlgorithm: "sha256", signatureAlgorithm: "ed25519", required: false, signature: null },
    assets: [{ id: "fixture", kind: "file", relativePath: "runtime/fixture.bin", sha256: "a".repeat(64), bytes: 1, urls: { official: "https://example.invalid/fixture.bin" } }],
  };
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  try {
    await mkdir(archiveRoot, { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
    await writeFile(archiveManifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
    await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `Compress-Archive -Path ${quote(`${archiveRoot}\\*`)} -DestinationPath ${quote(zipPath)} -Force`], { windowsHide: true });
    await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-ManifestPath", manifestPath, "-InstallRoot", installRoot, "-OfflineZip", zipPath, "-ValidateOnly"], { windowsHide: true });
    const tampered = { ...manifest, manifestId: "tampered" };
    await writeFile(archiveManifestPath, `${JSON.stringify(tampered)}\n`, "utf8");
    await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `Compress-Archive -Path ${quote(`${archiveRoot}\\*`)} -DestinationPath ${quote(zipPath)} -Force`], { windowsHide: true });
    await assert.rejects(execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-ManifestPath", manifestPath, "-InstallRoot", installRoot, "-OfflineZip", zipPath, "-ValidateOnly"], { windowsHide: true }));
    await assert.rejects(readFile(join(installRoot, "runtime", "fixture.bin")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("offline extraction rejects zip-slip entries before creating the destination", async (t) => {
  if (process.platform !== "win32") { t.skip("PowerShell runtime extraction is Windows-only"); return; }
  const root = await mkdtemp(join(tmpdir(), "coworkany-offline-zip-slip-"));
  const zipPath = join(root, "runtime.zip");
  const target = join(root, "target");
  const source = await readFile(scriptPath, "utf8");
  const functionStart = source.indexOf("function Expand-SafeZip");
  const functionEnd = source.indexOf("\n}\n\nAssert-RuntimeManifestSchema", functionStart) + 3;
  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  const functionSource = source.slice(functionStart, functionEnd);
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const createZip = [
    "$ErrorActionPreference='Stop'",
    "Add-Type -AssemblyName System.IO.Compression",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    `$archive=[IO.Compression.ZipFile]::Open(${quote(zipPath)},[IO.Compression.ZipArchiveMode]::Create)`,
    "$entry=$archive.CreateEntry('../escape.txt')",
    "$writer=[IO.StreamWriter]::new($entry.Open())",
    "$writer.Write('escape')",
    "$writer.Dispose()",
    "$archive.Dispose()",
  ].join("\n");
  const runExtraction = [
    "$ErrorActionPreference='Stop'",
    functionSource,
    `Expand-SafeZip ${quote(zipPath)} ${quote(target)}`,
  ].join("\n");
  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", createZip], { windowsHide: true });
    await assert.rejects(execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", runExtraction], { windowsHide: true }), /runtime_archive_entry_unsafe/u);
    await assert.rejects(readFile(join(root, "escape.txt")), /ENOENT/u);
    await assert.rejects(readFile(join(target, "escape.txt")), /ENOENT/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
