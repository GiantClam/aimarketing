import { access, readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const FORBIDDEN_BUNDLE_MARKERS = [
  { label: "SaaS API route", pattern: /\/api\/(?:billing|enterprise|lead-hunter|marketplace)(?:\/|["'`]|$)/iu },
  { label: "excluded desktop capability", pattern: /\b(?:lead[\s_-]*hunter|publish[\s_-]*as[\s_-]*agent|marketplace|enterprise[\s_-]+preset)\b/iu },
  { label: "cloud-only integration", pattern: /\b(?:railway|cloudflare|ragflow|dify)\b/iu },
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function collectDesktopBundleFiles(root = repoRoot) {
  const assetDirectory = join(root, "apps", "desktop", "dist", "assets");
  const assetEntries = await readdir(assetDirectory, { withFileTypes: true }).catch(() => []);
  const assetFiles = assetEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => join(assetDirectory, entry.name));
  const hostBundle = join(root, "apps", "desktop", "dist-runtime", "host.mjs");
  const knowledgeBundle = join(root, "apps", "desktop", "dist-runtime", "knowledge.mjs");
  return [...assetFiles, ...(await exists(hostBundle) ? [hostBundle] : []), ...(await exists(knowledgeBundle) ? [knowledgeBundle] : [])];
}

export function scanDesktopBundle(files) {
  return files.flatMap(({ filePath, source }) => FORBIDDEN_BUNDLE_MARKERS.flatMap(({ label, pattern }) => pattern.test(source) ? [{ filePath, label }] : []));
}

export async function verifyDesktopBundle(root = repoRoot) {
  const filePaths = await collectDesktopBundleFiles(root);
  if (!filePaths.length) throw new Error("desktop_bundle_missing_build_first");
  const files = await Promise.all(filePaths.map(async (filePath) => ({ filePath, source: await readFile(filePath, "utf8") })));
  const violations = scanDesktopBundle(files);
  return {
    files: filePaths.map((filePath) => relative(root, filePath).replaceAll("\\", "/")),
    checkedBytes: files.reduce((total, file) => total + Buffer.byteLength(file.source, "utf8"), 0),
    violations,
  };
}

async function main() {
  const result = await verifyDesktopBundle();
  console.log(JSON.stringify(result, null, 2));
  if (result.violations.length) process.exitCode = 1;
}

if (pathToFileURL(resolve(process.argv[1] ?? "")).href === import.meta.url) await main();
