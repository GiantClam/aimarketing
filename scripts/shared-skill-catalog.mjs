import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { relative } from "node:path";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function collectSkillFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await collectSkillFiles(entryPath));
    else if (entry.name === "SKILL.md") files.push(entryPath);
  }
  return files;
}

/** Create a stable manifest from the canonical skill tree without host state. */
export async function collectCanonicalSkillCatalog(sourceRoot) {
  const files = (await collectSkillFiles(sourceRoot)).sort((left, right) => left.localeCompare(right));
  const skills = [];
  for (const filePath of files) {
    const content = await readFile(filePath);
    const relativePath = relative(sourceRoot, filePath).replaceAll("\\", "/");
    const id = relativePath.slice(0, -"/SKILL.md".length);
    skills.push({ id, digest: digest(content), relativePath });
  }
  const sourceDigest = digest(JSON.stringify(skills));
  return { schemaVersion: 1, sourceRoot: "content/skills", generatedAt: "deterministic", sourceDigest, skills };
}

/** Return a stable validation code, or null when every canonical entry matches. */
export function validateSkillCatalogContents(actual, canonical, allowedExtraIds = []) {
  if (actual?.schemaVersion !== 1 || canonical?.schemaVersion !== 1) return "catalog_schema_version_invalid";
  if (actual.sourceDigest !== canonical.sourceDigest) return "catalog_source_digest_mismatch";
  const actualById = new Map((Array.isArray(actual.skills) ? actual.skills : []).map((skill) => [skill?.id, skill]));
  for (const expected of canonical.skills) {
    const received = actualById.get(expected.id);
    if (!received) return `catalog_canonical_skill_missing:${expected.id}`;
    if (received.digest !== expected.digest || received.relativePath !== expected.relativePath) return `catalog_canonical_skill_drift:${expected.id}`;
  }
  const canonicalIds = new Set(canonical.skills.map((skill) => skill.id));
  const extras = new Set(allowedExtraIds);
  for (const skill of Array.isArray(actual.skills) ? actual.skills : []) {
    if (!canonicalIds.has(skill?.id) && !extras.has(skill?.id)) return `catalog_unexpected_skill:${String(skill?.id)}`;
  }
  return null;
}
