import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { signManifest, verifyManifest } from "./runtime-manifest-crypto.mjs";

const execFileAsync = promisify(execFile);
const helper = join(dirname(fileURLToPath(import.meta.url)), "runtime-manifest-crypto.mjs");

function fixtureManifest() {
  return {
    schemaVersion: 1,
    manifestId: "fixture",
    platform: "windows",
    architecture: "x64",
    compatibility: { architecture: "x64", windows: ["10-22H2", "11"] },
    integrity: { hashAlgorithm: "sha256", signatureAlgorithm: "ed25519", required: true, signature: null },
    assets: [{ id: "node", kind: "file", relativePath: "runtime/node.exe", sha256: "a".repeat(64), bytes: 1, urls: { official: "https://example.invalid/node" } }],
  };
}

test("runtime manifest signatures cover canonical content and reject tampering", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const manifest = fixtureManifest();
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const signature = signManifest(manifest, privatePem);
  assert.equal(verifyManifest({ ...manifest, integrity: { ...manifest.integrity, signature } }, signature, publicPem), true);
  assert.equal(verifyManifest({ ...manifest, assets: [{ ...manifest.assets[0], bytes: 2 }] }, signature, publicPem), false);
});

test("runtime manifest signing CLI writes a required signature and verifies it", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const root = await mkdtemp(join(tmpdir(), "aimarketing-manifest-crypto-"));
  const manifestPath = join(root, "manifest.json");
  const keyPath = join(root, "private.pem");
  const signedPath = join(root, "signed.json");
  const publicPath = join(root, "public.pem");
  try {
    await writeFile(manifestPath, `${JSON.stringify(fixtureManifest())}\n`, "utf8");
    await writeFile(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }), "utf8");
    await writeFile(publicPath, publicKey.export({ type: "spki", format: "pem" }), "utf8");
    await execFileAsync(process.execPath, [helper, "sign", manifestPath, keyPath, signedPath], { windowsHide: true });
    const signed = JSON.parse(await readFile(signedPath, "utf8"));
    assert.equal(signed.integrity.required, true);
    await execFileAsync(process.execPath, [helper, "verify", signedPath, publicPath], { windowsHide: true });
    signed.assets[0].bytes = 3;
    await writeFile(signedPath, `${JSON.stringify(signed)}\n`, "utf8");
    await assert.rejects(execFileAsync(process.execPath, [helper, "verify", signedPath, publicPath], { windowsHide: true }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
