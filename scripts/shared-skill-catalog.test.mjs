import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { collectCanonicalSkillCatalog, validateSkillCatalogContents } from "./shared-skill-catalog.mjs";

test("canonical skill catalogs are deterministic and detect digest drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "coworkany-skill-catalog-"));
  await mkdir(join(root, "writer"), { recursive: true });
  await mkdir(join(root, "agents", "research"), { recursive: true });
  await writeFile(join(root, "writer", "SKILL.md"), "# Writer\n", "utf8");
  await writeFile(join(root, "agents", "research", "SKILL.md"), "# Research\n", "utf8");
  const first = await collectCanonicalSkillCatalog(root);
  const second = await collectCanonicalSkillCatalog(root);
  assert.deepEqual(first, second);
  assert.deepEqual(first.skills.map((skill) => skill.id), ["agents/research", "writer"]);
  assert.equal(validateSkillCatalogContents(first, first, []), null);
  assert.equal(validateSkillCatalogContents({ ...first, sourceDigest: "0".repeat(64) }, first, []), "catalog_source_digest_mismatch");
  assert.equal(validateSkillCatalogContents({ ...first, skills: first.skills.slice(1) }, first, []), "catalog_canonical_skill_missing:agents/research");
});
