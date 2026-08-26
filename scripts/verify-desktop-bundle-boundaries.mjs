import { access, readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const FORBIDDEN_BUNDLE_MARKERS = [
  { label: "SaaS API route", pattern: /\/api\/(?:billing|enterprise|lead-hunter|marketplace)(?:\/|["'`]|$)/iu },
  { label: "excluded desktop capability", pattern: /\b(?:lead[\s_-]*hunter|publish[\s_-]*as[\s_-]*agent|marketplace(?!\s+submission\s+pipeline)|enterprise[\s_-]+preset)\b/iu },
  { label: "cloud-only integration", pattern: /\b(?:railway|cloudflare|ragflow|dify)\b/iu },
];

export const DESKTOP_BUNDLE_TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".mjs", ".svg"]);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function collectTextFiles(directory, { recursive = true } = {}) {
  if (!(await exists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory() && recursive) {
      files.push(...await collectTextFiles(filePath));
      continue;
    }
    const extension = entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase();
    if (DESKTOP_BUNDLE_TEXT_EXTENSIONS.has(extension)) files.push(filePath);
  }
  return files;
}

export async function collectDesktopBundleFiles(root = repoRoot) {
  const uiFiles = await collectTextFiles(join(root, "apps", "desktop", "dist"));
  // Runtime skills include thousands of SVG/template assets; only scan the
  // executable bundles and manifests at the runtime root to keep the audit
  // bounded and avoid exhausting Windows file handles.
  const runtimeFiles = await collectTextFiles(join(root, "apps", "desktop", "dist-runtime"), { recursive: false });
  return [...uiFiles, ...runtimeFiles];
}

export function scanDesktopBundle(files) {
  return files.flatMap(({ filePath, source }) => FORBIDDEN_BUNDLE_MARKERS.flatMap(({ label, pattern }) => pattern.test(source) ? [{ filePath, label }] : []));
}

export async function verifyDesktopBundle(root = repoRoot) {
  const filePaths = await collectDesktopBundleFiles(root);
  if (!filePaths.length) throw new Error("desktop_bundle_missing_build_first");
  const files = [];
  for (const filePath of filePaths) files.push({ filePath, source: await readFile(filePath, "utf8") });
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
