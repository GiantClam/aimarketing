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

test("runtime installer keeps the approved mirror order", async () => {
  const source = await readFile(scriptPath, "utf8");
  const mirrorOrder = ["$mirrors = @(\"aliyun\", \"tencent\", \"tsinghua\", \"official\")"];
  assert.ok(source.includes(mirrorOrder[0]));
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
      const root = await mkdtemp(join(tmpdir(), `aimarketing-mirror-fallback-${successIndex}-`));
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
  assert.match(source, /pip install[^\n]+--timeout 30/u);
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
});

test("runtime activation restores last-known-good when staged activation fails", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /function Activate-StagedRuntime\(\)/u);
  assert.match(source, /\$movedExisting = \$false/u);
  assert.match(source, /\$activated = \$false/u);
  assert.match(source, /Move-Item -LiteralPath \$backupRoot -Destination \$installRootResolved/u);
  assert.match(source, /Activate-StagedRuntime\s*$/mu);
  if (process.platform !== "win32") return;
  const functionStart = source.indexOf("function Activate-StagedRuntime() ");
  const functionEnd = source.indexOf("\ntry {", functionStart);
  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  const root = await mkdtemp(join(tmpdir(), "aimarketing-runtime-rollback-"));
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
  assert.match(source, /manifestId\s*=\s*"aimarketing-runtime-windows-x64-v1"/u);
  assert.match(source, /platform\s*=\s*"windows"/u);
  assert.match(source, /architecture\s*=\s*"x64"/u);
  assert.match(source, /hashAlgorithm\s*=\s*"sha256"/u);
  assert.match(source, /signatureAlgorithm\s*=\s*"ed25519"/u);
  assert.match(source, /AIMARKETING_RUNTIME_SIGNING_KEY/u);
  assert.match(source, /runtime-manifest-crypto\.mjs/u);
});

test("installer validates a manifest without creating or replacing runtime data", async (t) => {
  if (process.platform !== "win32") { t.skip("PowerShell runtime validation is Windows-only"); return; }
  const root = await mkdtemp(join(tmpdir(), "aimarketing-manifest-validation-"));
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
  const root = await mkdtemp(join(tmpdir(), "aimarketing-signed-manifest-"));
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
  const root = await mkdtemp(join(tmpdir(), "aimarketing-offline-manifest-"));
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
