import test from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { generateKeyPairSync } from "node:crypto";

const execFileAsync = promisify(execFile);

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "install-desktop-runtime.ps1");

test("runtime installer keeps the approved mirror order", async () => {
  const source = await readFile(scriptPath, "utf8");
  const mirrorOrder = ["$mirrors = @(\"aliyun\", \"tencent\", \"tsinghua\", \"official\")"];
  assert.ok(source.includes(mirrorOrder[0]));
  assert.match(source, /Install-OpenCodePackage\s+-Offline:\(\[bool\]\$OfflineZip\)/u);
  assert.match(source, /offline_opencode_missing/u);
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
