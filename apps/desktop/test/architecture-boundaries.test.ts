import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { readdirSync } from "node:fs";

const desktopRoot = join(process.cwd());
const sourceRoots = [join(desktopRoot, "src"), join(desktopRoot, "runtime")];
const forbiddenPatterns: readonly [RegExp, string][] = [
  [/from\s+["']next\//u, "Next route/API import"],
  [/["']@\/lib\/(?:auth|billing|enterprise|r2|railway|cloudflare|dify|ragflow)/iu, "SaaS infrastructure import"],
  [/ai-sdk-native/iu, "ai-sdk-native text runtime"],
  [/chat\/completions/iu, "direct chat completions endpoint"],
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|mjs)$/u.test(entry.name) ? [path] : [];
  });
}

test("desktop workbench source stays host-mediated and SaaS-free", () => {
  const violations: string[] = [];
  for (const root of sourceRoots) {
    for (const file of sourceFiles(root)) {
      const source = readFileSync(file, "utf8");
      for (const [pattern, label] of forbiddenPatterns) {
        if (pattern.test(source)) violations.push(`${label}: ${relative(desktopRoot, file)}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test("ordinary chat remains on the OpenCode session path", () => {
  const app = readFileSync(join(desktopRoot, "src", "App.tsx"), "utf8");
  const host = readFileSync(join(desktopRoot, "runtime", "host.ts"), "utf8");
  assert.match(app, /type:\s*["']session\.create["']/u);
  assert.match(app, /type:\s*["']session\.prompt["']/u);
  assert.match(host, /command\.type === ["']session\.prompt["']/u);
  assert.match(host, /runOpenCode\(command, session\)/u);
});
