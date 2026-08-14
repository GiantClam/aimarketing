import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const registryPath = join(repoRoot, "content", "skills", "writer-catalog.json");
const skillRoot = join(repoRoot, "content", "skills");
const runtimeCatalogPath = join(repoRoot, "apps", "desktop", "dist-runtime", "skill-catalog.json");
const migrationPath = join(repoRoot, "scripts", "add-writer-revisions-schema.sql");
const writerRuntimePath = join(repoRoot, "lib", "writer", "skills.ts");

const REQUIRED_MIGRATION_COLUMNS = [
  "active_revision",
  "active_draft_message_id",
  "turn_outcome",
  "asset_status",
  "active_platform_skill_id",
  "context_hash",
  "skill_release",
  "skill_digest",
  "revision",
  "expected_base_revision",
  "is_active_draft",
];

function parseArgs(argv) {
  const result = { output: null, requireProduction: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--write") {
      result.output = argv[index + 1] || null;
      index += 1;
    } else if (value === "--require-production") {
      result.requireProduction = true;
    } else if (value === "--help") {
      console.log("usage: node scripts/verify-writer-cutover.mjs [--write <path>] [--require-production]");
      process.exit(0);
    } else {
      throw new Error(`writer_cutover_unknown_arg:${value}`);
    }
  }
  return result;
}

function digest(content) {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

function hostOf(value) {
  try { return new URL(value).host; } catch { return null; }
}

async function readJson(path, label) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch (error) {
    throw new Error(`writer_cutover_${label}_invalid:${error instanceof Error ? error.message : String(error)}`);
  }
}

async function validateRegistry(registry, runtimeCatalog) {
  if (registry.schemaVersion !== 2 || !Array.isArray(registry.platformBindings)) {
    throw new Error("writer_cutover_registry_schema_invalid");
  }
  if (!runtimeCatalog || !Array.isArray(runtimeCatalog.skills)) {
    throw new Error("writer_cutover_runtime_catalog_invalid");
  }
  const seen = new Set();
  const platformDigests = [];
  const runtimeSkills = new Map(runtimeCatalog.skills.map((skill) => [skill.id, skill]));
  for (const binding of registry.platformBindings) {
    const platform = binding?.platformId;
    const primary = binding?.primary;
    if (!platform || seen.has(platform) || !primary?.skillId || !primary?.dirName || !/^sha256:[0-9a-f]{64}$/u.test(primary.digest || "")) {
      throw new Error(`writer_cutover_primary_binding_invalid:${platform || "unknown"}`);
    }
    seen.add(platform);
    const sourcePath = join(skillRoot, primary.dirName, "SKILL.md");
    let source;
    try { source = await readFile(sourcePath, "utf8"); } catch { throw new Error(`writer_cutover_skill_missing:${primary.skillId}`); }
    const actualDigest = digest(source);
    if (actualDigest !== primary.digest) throw new Error(`writer_cutover_registry_digest_mismatch:${primary.skillId}`);
    const runtimeSkill = runtimeSkills.get(primary.skillId);
    if (!runtimeSkill || runtimeSkill.relativePath !== `${primary.dirName}/SKILL.md` || runtimeSkill.digest !== actualDigest.slice("sha256:".length)) {
      throw new Error(`writer_cutover_runtime_catalog_drift:${primary.skillId}`);
    }
    platformDigests.push({ platform, skillId: primary.skillId, release: primary.release, digest: actualDigest });
  }
  if (seen.size !== 10) throw new Error(`writer_cutover_platform_count_invalid:${seen.size}`);
  return platformDigests;
}

async function validateMigration() {
  const source = await readFile(migrationPath, "utf8");
  const missing = REQUIRED_MIGRATION_COLUMNS.filter((column) => !new RegExp(`\\b${column}\\b`, "u").test(source));
  if (missing.length) throw new Error(`writer_cutover_migration_columns_missing:${missing.join(",")}`);
  return { path: migrationPath, requiredColumns: REQUIRED_MIGRATION_COLUMNS };
}

async function validateWriterRuntimePath() {
  const source = await readFile(writerRuntimePath, "utf8");
  const requiredMarkers = ["runWriterSkillFirstTurn", "runWriterOpenCodeText", "WRITER_E2E_FIXTURES"];
  const missing = requiredMarkers.filter((marker) => !source.includes(marker));
  if (missing.length) throw new Error(`writer_cutover_runtime_markers_missing:${missing.join(",")}`);
  const forbiddenMarkers = ["runWriterSkillsTurn", "WRITER_LEGACY_PATH", "briefExtractionModel"];
  const found = forbiddenMarkers.filter((marker) => source.includes(marker));
  if (found.length) throw new Error(`writer_cutover_legacy_path_present:${found.join(",")}`);
  return { path: writerRuntimePath, primaryPath: "single_opencode_skill_first", legacyMarkers: found };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const registry = await readJson(registryPath, "registry");
  const runtimeCatalog = await readJson(runtimeCatalogPath, "runtime_catalog");
  const platformDigests = await validateRegistry(registry, runtimeCatalog);
  const migration = await validateMigration();
  const runtime = await validateWriterRuntimePath();
  const railwayUrl = process.env.RAILWAY_OPENCODE_RUNTIME_URL?.trim() || "";
  const railwayTokenConfigured = Boolean(process.env.RAILWAY_OPENCODE_RUNTIME_TOKEN?.trim());
  const productionRuntime = { configured: Boolean(railwayUrl && railwayTokenConfigured), host: hostOf(railwayUrl), tokenConfigured: railwayTokenConfigured };
  if (args.requireProduction && !productionRuntime.configured) throw new Error("writer_cutover_production_runtime_not_configured");
  const manifest = {
    schemaVersion: 1,
    status: "pass",
    generatedAt: "deterministic",
    registry: { path: registryPath, schemaVersion: registry.schemaVersion, platformCount: platformDigests.length, platformDigests },
    runtimeCatalog: { path: runtimeCatalogPath, sourceDigest: runtimeCatalog.sourceDigest, skillCount: runtimeCatalog.skills.length },
    migration,
    runtime,
    productionRuntime,
    productionRequired: args.requireProduction,
  };
  if (args.output) {
    const outputPath = isAbsolute(args.output) ? args.output : join(repoRoot, args.output);
    await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    manifest.output = outputPath;
  }
  console.log(JSON.stringify(manifest, null, 2));
}

if (pathToFileURL(resolve(process.argv[1] || "")).href === import.meta.url) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { validateMigration, validateRegistry, validateWriterRuntimePath };
