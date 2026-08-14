import { readFile, writeFile } from "node:fs/promises";
import { sign, verify, createPrivateKey, createPublicKey } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RUNTIME_MANIFEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAHgKs3hyNJCHJsLN9sle73MWSPew6fOweDLoO1E935JA=\n-----END PUBLIC KEY-----\n`;

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, sorted(entry)]));
}

export function canonicalManifest(manifest) {
  const copy = structuredClone(manifest);
  if (!copy.integrity || typeof copy.integrity !== "object") throw new Error("runtime_manifest_integrity_missing");
  copy.integrity = { ...copy.integrity, signature: null };
  return Buffer.from(JSON.stringify(sorted(copy)), "utf8");
}

export function signManifest(manifest, privateKeyPem) {
  return sign(null, canonicalManifest(manifest), createPrivateKey(privateKeyPem)).toString("base64");
}

export function verifyManifest(manifest, signature, publicKeyPem = RUNTIME_MANIFEST_PUBLIC_KEY) {
  if (typeof signature !== "string" || !signature.trim()) return false;
  return verify(null, canonicalManifest(manifest), createPublicKey(publicKeyPem), Buffer.from(signature, "base64"));
}

function parseManifestJson(value) {
  return JSON.parse(String(value).replace(/^\uFEFF/u, ""));
}

async function main() {
  const [command, manifestPath, keyPath, outputPath] = process.argv.slice(2);
  if (!command || !manifestPath) throw new Error("usage: runtime-manifest-crypto.mjs <sign|verify> <manifest> [key] [output]");
  const manifest = parseManifestJson(await readFile(manifestPath, "utf8"));
  if (command === "sign") {
    if (!keyPath || !outputPath) throw new Error("runtime_manifest_signing_key_required");
    const signature = signManifest(manifest, await readFile(keyPath, "utf8"));
    const signed = { ...manifest, integrity: { ...manifest.integrity, signature, required: true } };
    await writeFile(outputPath, `${JSON.stringify(signed, null, 2)}\n`, "utf8");
    return;
  }
  if (command === "verify") {
    const publicKey = keyPath ? await readFile(keyPath, "utf8") : RUNTIME_MANIFEST_PUBLIC_KEY;
    if (!verifyManifest(manifest, manifest.integrity?.signature, publicKey)) process.exitCode = 1;
    return;
  }
  throw new Error(`unknown_manifest_crypto_command:${command}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
