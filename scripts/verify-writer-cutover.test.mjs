import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { validateMigration, validateRegistry, validateWriterRuntimePath } from "./verify-writer-cutover.mjs";

const root = process.cwd();

test("Writer cutover contract validates ten registry digests against the generated desktop catalog", async () => {
  const registry = JSON.parse(await readFile(join(root, "content/skills/writer-catalog.json"), "utf8"));
  const runtimeCatalog = JSON.parse(await readFile(join(root, "apps/desktop/dist-runtime/skill-catalog.json"), "utf8"));
  const platformDigests = await validateRegistry(registry, runtimeCatalog);
  assert.equal(platformDigests.length, 10);
  assert.equal(new Set(platformDigests.map((item) => item.skillId)).size, 10);
});
test("Writer cutover contract keeps migration and Skill-first runtime boundaries present", async () => {
  const migration = await validateMigration();
  const runtime = await validateWriterRuntimePath();
  assert.ok(migration.requiredColumns.includes("skill_digest"));
  assert.equal(runtime.primaryPath, "single_opencode_skill_first");
  assert.deepEqual(runtime.legacyMarkers, []);
});
