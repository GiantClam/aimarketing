import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(process.argv[2] ?? join(repoRoot, "content/skills"));
const outputPath = resolve(process.argv[3] ?? join(repoRoot, ".artifacts/shared-skill-catalog.json"));

async function collectSkillFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...await collectSkillFiles(entryPath));
    else if (entry.name === "SKILL.md") results.push(entryPath);
  }
  return results;
}

const files = (await collectSkillFiles(sourceRoot)).sort((left, right) => left.localeCompare(right));
const skills = [];
for (const filePath of files) {
  const content = await readFile(filePath);
  const relativePath = relative(sourceRoot, filePath).replaceAll("\\", "/");
  const id = relativePath.split("/")[0];
  skills.push({ id, digest: createHash("sha256").update(content).digest("hex"), relativePath: `${id}/SKILL.md` });
}
const catalog = { schemaVersion: 1, sourceRoot: "content/skills", generatedAt: new Date().toISOString(), skills };
await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Generated ${skills.length} skill descriptors at ${outputPath}`);
