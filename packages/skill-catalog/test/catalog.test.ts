import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSkillId, sortSkillDescriptors, validateSkillCatalog } from "../src";

test("normalizes skill ids and sorts catalog entries deterministically", () => {
  assert.equal(normalizeSkillId(" Ads Writing "), "ads-writing");
  assert.deepEqual(sortSkillDescriptors([{ id: "z", digest: "a".repeat(64), relativePath: "z/SKILL.md" }, { id: "a", digest: "b".repeat(64), relativePath: "a/SKILL.md" }]).map((skill) => skill.id), ["a", "z"]);
});

test("rejects duplicate or malformed catalog entries", () => {
  assert.equal(validateSkillCatalog({ schemaVersion: 1, sourceRoot: "content/skills", sourceDigest: "a".repeat(64), generatedAt: "deterministic", skills: [{ id: "writer", digest: "bad", relativePath: "writer/SKILL.md" }] }), false);
  assert.equal(validateSkillCatalog({ schemaVersion: 1, sourceRoot: "content/skills", sourceDigest: "bad", generatedAt: "deterministic", skills: [{ id: "writer", digest: "a".repeat(64), relativePath: "writer/SKILL.md" }] }), false);
  assert.equal(validateSkillCatalog({ schemaVersion: 1, sourceRoot: "content/skills", sourceDigest: "b".repeat(64), generatedAt: "deterministic", skills: [{ id: "writer", digest: "a".repeat(64), relativePath: "writer/SKILL.md" }] }), true);
});
