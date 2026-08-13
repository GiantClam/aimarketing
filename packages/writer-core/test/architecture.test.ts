import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

test("writer-core stays pure and host-neutral", () => {
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const root = join(packageRoot, "src");
  const forbidden = /(?:next\/|@\/lib\/(?:db|auth|billing|enterprise|r2|railway|cloudflare)|firebase|supabase|fetch\s*\(|process\.env)/iu;
  const violations = sourceFiles(root).flatMap((file) => forbidden.test(readFileSync(file, "utf8")) ? [file] : []);
  assert.deepEqual(violations, []);
});
