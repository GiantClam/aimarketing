import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHARED_ROOT = resolve(fileURLToPath(new URL("../packages", import.meta.url)));

export const FORBIDDEN_IMPORT_PATTERNS = Object.freeze([
  /["'](?:@\/)?next(?:\/|["'])/,
  /["'](?:@\/)?app\/api(?:\/|["'])/,
  /["'](?:@\/)?(?:lib\/)?(?:db|billing|enterprise|r2|railway|cloudflare)(?:\/|["'])/i,
  /["'](?:@\/)?next\/(?:navigation|link)(?:["'])/,
]);

function sourceFiles(rootDir) {
  if (!existsSync(rootDir)) return [];
  const files = [];
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(entryPath));
    } else if (/\.(?:ts|tsx|mts|cts)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      files.push(entryPath);
    }
  }
  return files;
}

export function scanSourceText(source, filePath = "<source>") {
  const violations = [];
  const lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!/\b(?:import|export|require)\b/.test(line)) return;
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({ filePath, line: index + 1, text: line.trim() });
        break;
      }
    }
  });
  return violations;
}

export function scanSharedPackages(rootDir = SHARED_ROOT) {
  return sourceFiles(rootDir).flatMap((filePath) =>
    scanSourceText(readFileSync(filePath, "utf8"), relative(process.cwd(), filePath)),
  );
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const violations = scanSharedPackages();
  if (violations.length > 0) {
    console.error("Shared package boundary violations detected:");
    for (const violation of violations) {
      console.error(`- ${violation.filePath}:${violation.line} ${violation.text}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Shared package boundary check passed.");
  }
}
