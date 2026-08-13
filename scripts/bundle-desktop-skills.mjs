import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(repoRoot, "content", "skills");
const target = join(repoRoot, "apps", "desktop", "dist-runtime", "skills");
const execFileAsync = promisify(execFile);
const pptMasterCommit = "4e6ecbcb0dc079efebd3c79b775c0f02581509fe";
await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true, force: true });
const catalogPath = join(repoRoot, ".artifacts", "shared-skill-catalog.json");
try { await writeFile(join(repoRoot, "apps", "desktop", "dist-runtime", "skill-catalog.json"), await readFile(catalogPath, "utf8"), "utf8"); }
catch { throw new Error("Run the shared skill catalog generator before bundling desktop skills."); }

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

async function acquirePptMaster() {
  const cachedCandidates = [
    join(repoRoot, "content", "skills", "ppt-master"),
    join(repoRoot, "scripts", "desktop-spikes", "ppt-master", ".runtime", `ppt-master-${pptMasterCommit}`, "skills", "ppt-master"),
  ];
  const cached = (await Promise.all(cachedCandidates.map(async (candidate) => (await exists(join(candidate, "SKILL.md"))) ? candidate : null))).find(Boolean);
  if (cached) return cached;

  const staging = join(repoRoot, ".artifacts", "ppt-master-acquire");
  await rm(staging, { recursive: true, force: true });
  await mkdir(dirname(staging), { recursive: true });
  try {
    await execFileAsync("git", ["clone", "--depth", "1", `https://github.com/hugohe3/ppt-master.git`, staging], { windowsHide: true, timeout: 180000, maxBuffer: 64 * 1024 });
    await execFileAsync("git", ["-C", staging, "checkout", pptMasterCommit], { windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024 });
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw new Error(`Unable to acquire ppt-master ${pptMasterCommit}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const acquired = join(staging, "skills", "ppt-master");
  if (!(await exists(join(acquired, "SKILL.md")))) throw new Error("Acquired ppt-master repository has no skills/ppt-master/SKILL.md");
  return acquired;
}

const pptSource = await acquirePptMaster();
const pptTarget = join(target, "ppt-master");
await rm(pptTarget, { recursive: true, force: true });
await cp(pptSource, pptTarget, { recursive: true, force: true });
const catalogOutput = join(repoRoot, "apps", "desktop", "dist-runtime", "skill-catalog.json");
const catalog = JSON.parse(await readFile(catalogOutput, "utf8"));
const digest = createHash("sha256").update(await readFile(join(pptSource, "SKILL.md"))).digest("hex");
catalog.skills = [...(Array.isArray(catalog.skills) ? catalog.skills : []).filter((skill) => skill?.id !== "ppt-master"), { id: "ppt-master", digest, relativePath: "ppt-master/SKILL.md", source: "hugohe3/ppt-master", commit: pptMasterCommit }];
await writeFile(catalogOutput, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
await writeFile(join(target, "ppt-master.manifest.json"), `${JSON.stringify({ schemaVersion: 1, source: "hugohe3/ppt-master", commit: pptMasterCommit, skillPath: "ppt-master/SKILL.md", digest }, null, 2)}\n`, "utf8");
console.log(`Bundled canonical skills and ppt-master ${pptMasterCommit} into ${target}`);
