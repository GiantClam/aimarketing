import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DESKTOP_ROOT = join(REPOSITORY_ROOT, "apps", "desktop");

export const COMPATIBILITY_SURFACES = Object.freeze([
  ["lib/ai-runtime/opencode-protocol.ts", "@aimarketing/runtime-contracts/opencode"],
  ["lib/workflows/schema.ts", "@aimarketing/workflow-core"],
  ["lib/workflows/connect.ts", "@aimarketing/workflow-core"],
  ["lib/workflows/plan-compiler.ts", "@aimarketing/workflow-core"],
  ["lib/workflows/workflow-definition-migrations.ts", "@aimarketing/workflow-core"],
  ["lib/workflows/workflow-definition-v2.ts", "@aimarketing/workflow-core"],
  ["lib/workflows/node-definitions/builtins.ts", "@aimarketing/workflow-core"],
  ["lib/workflows/node-definitions/registry.ts", "@aimarketing/workflow-core"],
  ["lib/workflows/node-definitions/types.ts", "@aimarketing/workflow-core"],
  ["lib/writer/message-reconciliation.ts", "@aimarketing/writer-core"],
]);

const DESKTOP_LEGACY_IMPORT = /["'](?:@\/)?lib\/(?:workflows\/(?:schema|connect|plan-compiler|workflow-definition-v2|workflow-definition-migrations|node-definitions(?:\/[^"']+)?)|ai-runtime\/opencode-protocol|writer\/(?:message-reconciliation|revision-guard|writer-result))["']/;

export function compatibilitySurfaceHasSharedOwner(source, sharedPackage) {
  return source.includes(sharedPackage);
}

export function scanDesktopSourceText(source, filePath = "<source>") {
  return DESKTOP_LEGACY_IMPORT.test(source)
    ? [{ filePath, reason: "desktop_imports_legacy_shared_surface" }]
    : [];
}

function sourceFiles(rootDir) {
  if (!existsSync(rootDir)) return [];
  const files = [];
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = join(rootDir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(entryPath));
    else if (/\.(?:ts|tsx|mts|cts)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) files.push(entryPath);
  }
  return files;
}

export function scanSharedImplementationProvenance(rootDir = REPOSITORY_ROOT) {
  const violations = [];
  for (const [relativePath, sharedPackage] of COMPATIBILITY_SURFACES) {
    const filePath = join(rootDir, relativePath);
    if (!existsSync(filePath)) {
      violations.push({ filePath: relativePath, reason: "compatibility_surface_missing" });
      continue;
    }
    if (!compatibilitySurfaceHasSharedOwner(readFileSync(filePath, "utf8"), sharedPackage)) {
      violations.push({ filePath: relativePath, reason: `missing_shared_owner:${sharedPackage}` });
    }
  }

  const executionSurface = join(rootDir, "lib", "workflows", "execution.ts");
  if (!existsSync(executionSurface) || !readFileSync(executionSurface, "utf8").includes("runSaasWorkflowWithSharedCore")) {
    violations.push({ filePath: "lib/workflows/execution.ts", reason: "legacy_scheduler_not_delegated_to_shared_adapter" });
  }

  for (const filePath of sourceFiles(join(rootDir, "apps", "desktop"))) {
    violations.push(...scanDesktopSourceText(readFileSync(filePath, "utf8"), relative(rootDir, filePath)));
  }
  return violations;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const violations = scanSharedImplementationProvenance();
  if (violations.length > 0) {
    console.error("Shared implementation provenance violations detected:");
    for (const violation of violations) console.error(`- ${violation.filePath}: ${violation.reason}`);
    process.exitCode = 1;
  } else {
    console.log("Shared implementation provenance check passed.");
  }
}
