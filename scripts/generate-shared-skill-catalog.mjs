import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectCanonicalSkillCatalog } from "./shared-skill-catalog.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(process.argv[2] ?? join(repoRoot, "content/skills"));
const outputPath = resolve(process.argv[3] ?? join(repoRoot, ".artifacts/shared-skill-catalog.json"));
const catalog = await collectCanonicalSkillCatalog(sourceRoot);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Generated ${catalog.skills.length} canonical skill descriptors at ${outputPath}`);
