import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(repoRoot, "content", "skills");
const target = join(repoRoot, "apps", "desktop", "dist-runtime", "skills");
const agentsSource = join(source, "agency-agents");
const agentsTarget = join(repoRoot, "apps", "desktop", "dist-runtime", "agents");
const execFileAsync = promisify(execFile);
const pptMasterVersion = "6.2.0";
const pptMasterCommit = "7e54ea9691ed6cb8ee1f19ca6c12eeccd7dc1576";
const dashiPptVersion = "0.4.11";
const dashiPptCommit = "7cb23347f91cda1a5519eafc8c040704e389535a";
await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true, force: true });
// Agency Agents are OpenCode agents, not SKILL.md packages. Keep their
// runtime definitions in dist-runtime/agents so the skill scanner never
// attempts to resolve an agency-* ID as a Skill.
await rm(join(target, "agency-agents"), { recursive: true, force: true });

function runtimeAgentId(category, sourcePath) {
  const fileSlug = sourcePath.replace(/\.md$/iu, "").replaceAll("/", "-");
  return fileSlug.startsWith(`${category}-`) ? `agency-${fileSlug}` : `agency-${category}-${fileSlug}`;
}

async function listAgentFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listAgentFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(path);
  }
  return files.sort();
}

await rm(agentsTarget, { recursive: true, force: true });
await mkdir(agentsTarget, { recursive: true });
const agencyAgents = [];
for (const categoryEntry of (await readdir(agentsSource, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
  const category = categoryEntry.name;
  const categoryRoot = join(agentsSource, category);
  for (const file of await listAgentFiles(categoryRoot)) {
    const sourcePath = relative(categoryRoot, file).replaceAll("\\", "/");
    const id = runtimeAgentId(category, sourcePath);
    await cp(file, join(agentsTarget, `${id}.md`), { force: true });
    agencyAgents.push({ id, category, sourcePath, relativePath: `${id}.md`, sourceUrl: `https://github.com/msitarzewski/agency-agents/blob/main/${category}/${sourcePath}` });
  }
}
await writeFile(join(repoRoot, "apps", "desktop", "dist-runtime", "agency-agent-manifest.json"), `${JSON.stringify({ schemaVersion: 1, repository: "https://github.com/msitarzewski/agency-agents", agents: agencyAgents }, null, 2)}\n`, "utf8");
const catalogPath = join(repoRoot, ".artifacts", "shared-skill-catalog.json");
try { await writeFile(join(repoRoot, "apps", "desktop", "dist-runtime", "skill-catalog.json"), await readFile(catalogPath, "utf8"), "utf8"); }
catch { throw new Error("Run the shared skill catalog generator before bundling desktop skills."); }

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

async function acquireGitSkill({ repo, commit, branch, skillPath, stagingName }) {
  const staging = join(repoRoot, ".artifacts", `${stagingName}-${commit}`);
  const acquired = join(staging, skillPath);
  if (await exists(join(acquired, "SKILL.md"))) return acquired;
  await rm(staging, { recursive: true, force: true });
  await mkdir(dirname(staging), { recursive: true });
  try {
    await execFileAsync("git", ["clone", "--depth", "1", "--branch", branch, `https://github.com/${repo}.git`, staging], { windowsHide: true, timeout: 180000, maxBuffer: 64 * 1024 });
    await execFileAsync("git", ["-C", staging, "checkout", "--detach", commit], { windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024 });
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw new Error(`Unable to acquire ${repo} ${commit}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!(await exists(join(acquired, "SKILL.md")))) throw new Error(`Acquired ${repo} repository has no ${skillPath}/SKILL.md`);
  return acquired;
}

const pptSource = await acquireGitSkill({ repo: "hugohe3/ppt-master", commit: pptMasterCommit, branch: `v${pptMasterVersion}`, skillPath: "skills/ppt-master", stagingName: "ppt-master-acquire" });
const pptTarget = join(target, "ppt-master");
// Tauri scans bundled resource directories while `beforeDevCommand` is still
// running. Keep the target directory present and overlay the pinned skill so
// the resource scanner never observes a path that was listed and then removed.
await cp(pptSource, pptTarget, { recursive: true, force: true });
const dashiSource = await acquireGitSkill({ repo: "chuspeeism/dashi-ppt-skill", commit: dashiPptCommit, branch: "main", skillPath: "skills/dashi-ppt", stagingName: "dashi-ppt-acquire" });
const dashiTarget = join(target, "dashi-ppt");
await cp(dashiSource, dashiTarget, { recursive: true, force: true });
const catalogOutput = join(repoRoot, "apps", "desktop", "dist-runtime", "skill-catalog.json");
const catalog = JSON.parse(await readFile(catalogOutput, "utf8"));
const pptDigest = createHash("sha256").update(await readFile(join(pptSource, "SKILL.md"))).digest("hex");
const dashiDigest = createHash("sha256").update(await readFile(join(dashiSource, "SKILL.md"))).digest("hex");
catalog.skills = [
  ...(Array.isArray(catalog.skills) ? catalog.skills : []).filter((skill) => !["ppt-master", "dashi-ppt"].includes(skill?.id)),
  { id: "ppt-master", digest: pptDigest, relativePath: "ppt-master/SKILL.md", source: "hugohe3/ppt-master", version: pptMasterVersion, commit: pptMasterCommit },
  { id: "dashi-ppt", digest: dashiDigest, relativePath: "dashi-ppt/SKILL.md", source: "chuspeeism/dashi-ppt-skill", version: dashiPptVersion, commit: dashiPptCommit },
];
await writeFile(catalogOutput, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
await writeFile(join(target, "ppt-master.manifest.json"), `${JSON.stringify({ schemaVersion: 1, source: "hugohe3/ppt-master", version: pptMasterVersion, commit: pptMasterCommit, skillPath: "ppt-master/SKILL.md", digest: pptDigest }, null, 2)}\n`, "utf8");
await writeFile(join(target, "dashi-ppt.manifest.json"), `${JSON.stringify({ schemaVersion: 1, source: "chuspeeism/dashi-ppt-skill", version: dashiPptVersion, commit: dashiPptCommit, skillPath: "dashi-ppt/SKILL.md", digest: dashiDigest }, null, 2)}\n`, "utf8");
console.log(`Bundled canonical skills, ppt-master ${pptMasterCommit}, and dashi-ppt ${dashiPptCommit} into ${target}`);
