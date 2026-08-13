import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, relative as relativePath, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = resolve(process.argv[2] ?? process.cwd());
const destination = resolve(process.argv[3] ?? join(repoRoot, "apps/desktop/dist-runtime/runtime/lancedb"));
const source = resolve(repoRoot, "apps/desktop/node_modules/@lancedb/lancedb");

async function packageJson(packagePath) {
  return JSON.parse(await readFile(join(packagePath, "package.json"), "utf8"));
}

function resolvePackage(name, fromDirectory) {
  let entry;
  try {
    entry = require.resolve(name, { paths: [fromDirectory] });
  } catch {
    try {
      entry = require.resolve(`${name}/package.json`, { paths: [fromDirectory] });
    } catch {
      const pnpmName = name.startsWith("@") ? name.replace("/", "+") : name;
      const storeRoot = join(repoRoot, "node_modules", ".pnpm");
      const candidates = require("node:fs").readdirSync(storeRoot).filter((candidate) => candidate.startsWith(`${pnpmName}@`));
      if (!candidates.length) throw new Error(`package_not_found:${name}`);
      entry = join(storeRoot, candidates.sort().at(-1), "node_modules", ...name.split("/"), "package.json");
    }
  }
  let current = entry.endsWith("package.json") ? dirname(entry) : entry;
  while (current !== dirname(current)) {
    if (require("node:fs").existsSync(join(current, "package.json"))) return current;
    current = dirname(current);
  }
  throw new Error(`package_root_not_found:${name}`);
}

function destinationFor(name) {
  return join(destination, "node_modules", ...name.split("/"));
}

await rm(destination, { recursive: true, force: true });
await mkdir(join(destination, "node_modules"), { recursive: true });

const queue = [
  { name: "@lancedb/lancedb", path: source },
  { name: "@lancedb/lancedb-win32-x64-msvc", path: resolvePackage("@lancedb/lancedb-win32-x64-msvc", source) },
  { name: "apache-arrow", path: resolvePackage("apache-arrow", source) },
  { name: "@opentelemetry/api", path: resolvePackage("@opentelemetry/api", source) },
  { name: "reflect-metadata", path: resolvePackage("reflect-metadata", source) },
];
const seen = new Set();

while (queue.length) {
  const item = queue.shift();
  if (!item || seen.has(item.name)) continue;
  seen.add(item.name);
  const manifest = await packageJson(item.path);
  await cp(item.path, destinationFor(item.name), { recursive: true, dereference: true, filter: (path) => {
    const relative = relativePath(item.path, path).replaceAll("\\", "/");
    return relative !== "node_modules" && !relative.startsWith("node_modules/");
  } });
  const dependencies = { ...(manifest.dependencies ?? {}) };
  if (item.name === "@lancedb/lancedb") dependencies["apache-arrow"] = manifest.peerDependencies?.["apache-arrow"] ?? "*";
  for (const dependency of Object.keys(dependencies)) {
    if (seen.has(dependency)) continue;
    queue.push({ name: dependency, path: resolvePackage(dependency, item.path) });
  }
}

console.log(JSON.stringify({ packageCount: seen.size, destination, packages: [...seen].sort() }));
