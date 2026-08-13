import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectCanonicalSkillCatalog, validateSkillCatalogContents } from "./shared-skill-catalog.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [sourceArg, catalogArg, ...flags] = process.argv.slice(2);
const sourceRoot = resolve(sourceArg ?? join(repoRoot, "content/skills"));
const catalogPath = resolve(catalogArg ?? join(repoRoot, ".artifacts/shared-skill-catalog.json"));
const allowedExtraIds = flags.filter((flag) => flag.startsWith("--allow-extra=")).map((flag) => flag.slice("--allow-extra=".length)).filter(Boolean);
const canonical = await collectCanonicalSkillCatalog(sourceRoot);
const actual = JSON.parse(await readFile(catalogPath, "utf8"));
const failure = validateSkillCatalogContents(actual, canonical, allowedExtraIds);
if (failure) {
  console.error(`Shared skill catalog validation failed: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Shared skill catalog validation passed (${canonical.skills.length} canonical skills).`);
}
