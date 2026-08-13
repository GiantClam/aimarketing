import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

export interface VaultChunk { readonly id: string; readonly documentPath: string; readonly heading?: string; readonly text: string; readonly hash: string; readonly lineStart?: number; readonly lineEnd?: number; readonly tags?: readonly string[]; readonly links?: readonly string[]; }
export interface VaultDocument { readonly documentPath: string; readonly hash: string; }
export interface VaultManifest { readonly schemaVersion: 1; readonly vaultPath: string; readonly generation: number; readonly documents: readonly VaultDocument[]; readonly chunks: readonly VaultChunk[]; readonly updatedAt: string; }
export interface VaultIndexState { readonly schemaVersion: 1; readonly generation: number; readonly status: "lexical_ready" | "semantic_ready"; readonly embeddingModel: string; readonly embeddingDimension: number; readonly updatedAt: string; }

export class ObsidianVaultWatcher {
  private watcher?: FSWatcher;
  private timer?: ReturnType<typeof setTimeout>;
  private ignoredPatterns: readonly string[] = [];
  constructor(private readonly vaultPath: string, private readonly onChange: (relativePath?: string) => void) {}
  start() {
    this.stop();
    this.ignoredPatterns = readIgnorePatterns(this.vaultPath);
    try {
      this.watcher = watch(resolve(this.vaultPath), { recursive: true }, (_event, filename) => {
        if (!filename || shouldIgnoreVaultPath(filename.toString(), this.ignoredPatterns)) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.onChange(filename?.toString().replaceAll("\\", "/")), 250);
      });
    } catch { this.watcher = undefined; }
    return this;
  }
  stop() { this.watcher?.close(); this.watcher = undefined; if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
}

export async function indexObsidianVault(vaultPath: string, indexPath: string, previousGeneration = 0, targetPath = indexPath): Promise<VaultManifest> {
  const root = resolve(vaultPath);
  let generation = previousGeneration;
  if (generation <= 0) {
    try {
      const previous = JSON.parse(await readFile(join(resolveActiveIndexPath(indexPath), "manifest.json"), "utf8")) as Partial<VaultManifest>;
      generation = typeof previous.generation === "number" && Number.isFinite(previous.generation) ? previous.generation : 0;
    } catch { /* first index or damaged manifest starts a new generation */ }
  }
  const files = await collectMarkdown(root);
  const chunks: VaultChunk[] = [];
  const documents: VaultDocument[] = [];
  for (const file of files) {
    const relativePath = relative(root, file).replaceAll("\\", "/");
    const content = await readFile(file, "utf8");
    documents.push({ documentPath: relativePath, hash: createHash("sha256").update(content).digest("hex") });
    chunks.push(...chunkMarkdown(relativePath, content));
  }
  const manifest: VaultManifest = { schemaVersion: 1, vaultPath: root, generation: generation + 1, documents, chunks, updatedAt: new Date().toISOString() };
  await mkdir(targetPath, { recursive: true });
  const temp = join(targetPath, "manifest.json.tmp");
  await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temp, join(targetPath, "manifest.json"));
  const state: VaultIndexState = { schemaVersion: 1, generation: manifest.generation, status: "lexical_ready", embeddingModel: "local-not-configured", embeddingDimension: 0, updatedAt: manifest.updatedAt };
  const stateTemp = join(targetPath, "index-state.json.tmp");
  await writeFile(stateTemp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(stateTemp, join(targetPath, "index-state.json"));
  return manifest;
}

/** Builds a private generation directory; callers activate it only after all files are valid. */
export function createIndexGenerationPath(indexPath: string): string {
  return join(indexPath, "generations", `generation-${Date.now()}-${randomUUID()}`);
}

export async function activateIndexGeneration(indexPath: string, generationPath: string, generation: number): Promise<void> {
  const root = resolve(indexPath);
  const candidate = resolve(generationPath);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) throw new Error("index_generation_path_escape");
  await mkdir(root, { recursive: true });
  const pointer = join(root, "current-generation.json");
  const temporary = `${pointer}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ schemaVersion: 1, generation, path: relative(root, candidate).replaceAll("\\", "/"), updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  await rename(temporary, pointer);
}

export function resolveActiveIndexPath(indexPath: string): string {
  const root = resolve(indexPath);
  try {
    const pointer = JSON.parse(readFileSync(join(root, "current-generation.json"), "utf8")) as { path?: unknown };
    if (typeof pointer.path === "string") {
      const candidate = resolve(root, pointer.path);
      if (candidate.startsWith(`${root}${sep}`) && existsSync(join(candidate, "manifest.json"))) return candidate;
    }
  } catch { /* use legacy root layout while no active generation exists */ }
  return root;
}

export interface ObsidianWriteRequest { readonly vaultPath: string; readonly targetPath?: string; readonly content: string; readonly baseHash?: string; }
export type ObsidianWriteResult = { readonly path: string; readonly hash: string; readonly created: boolean };

/** Writes only inside Vault/AI Marketing by default and refuses stale overwrites. */
export async function writeObsidianNote(request: ObsidianWriteRequest): Promise<ObsidianWriteResult> {
  const root = resolve(request.vaultPath);
  const requested = request.targetPath?.trim() || "AI Marketing/generated-note.md";
  const target = resolve(root, requested);
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error("obsidian_path_escape");
  const existing = await readFileIfPresent(target);
  const existingHash = existing === undefined ? undefined : createHash("sha256").update(existing).digest("hex");
  if (request.baseHash !== undefined && request.baseHash !== existingHash) throw new Error("obsidian_write_conflict");
  await mkdir(resolve(target, ".."), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, request.content, "utf8");
  await rename(temporary, target);
  return { path: relative(root, target).replaceAll("\\", "/"), hash: createHash("sha256").update(request.content).digest("hex"), created: existing === undefined };
}

export async function reconcileObsidianVault(manifest: VaultManifest): Promise<{ readonly changed: readonly string[]; readonly removed: readonly string[] }> {
  const root = resolve(manifest.vaultPath);
  const current = new Map<string, string>();
  for (const file of await collectMarkdown(root)) {
    const documentPath = relative(root, file).replaceAll("\\", "/");
    current.set(documentPath, createHash("sha256").update(await readFile(file, "utf8")).digest("hex"));
  }
  const previous = new Map(manifest.documents.map((document) => [document.documentPath, document.hash]));
  return {
    changed: [...current.entries()].filter(([path, hash]) => previous.get(path) !== hash).map(([path]) => path).sort(),
    removed: [...previous.keys()].filter((path) => !current.has(path)).sort(),
  };
}

export function searchVault(manifest: VaultManifest, query: string, limit = 8) {
  const terms = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  return manifest.chunks.map((chunk) => ({ chunk, score: terms.reduce((score, term) => score + (chunk.text.toLocaleLowerCase().includes(term) ? 1 : 0), 0) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id)).slice(0, limit);
}

async function collectMarkdown(directory: string, visited = new Set<string>(), root = resolve(directory), ignoredPatterns: readonly string[] = readIgnorePatterns(directory)): Promise<string[]> {
  const canonical = resolve(directory).toLowerCase();
  if (visited.has(canonical)) return [];
  visited.add(canonical);
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const relativePath = relative(root, path).replaceAll("\\", "/");
    if (shouldIgnoreVaultPath(relativePath, ignoredPatterns) || entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) files.push(...await collectMarkdown(path, visited, root, ignoredPatterns));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(path);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function readIgnorePatterns(root: string): string[] {
  return [".gitignore", ".aimarketingignore"].flatMap((filename) => {
    try {
      return readFileSync(join(resolve(root), filename), "utf8")
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && !line.startsWith("!"));
    } catch { return []; }
  });
}

function shouldIgnoreVaultPath(relativePath: string, patterns: readonly string[]): boolean {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\.\//u, "");
  const segments = normalized.split("/").filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === ".obsidian" || segment === ".trash" || segment.startsWith("."))) return true;
  return patterns.some((pattern) => matchesIgnorePattern(normalized, pattern));
}

function matchesIgnorePattern(relativePath: string, rawPattern: string): boolean {
  let pattern = rawPattern.trim().replaceAll("\\", "/");
  if (!pattern || pattern.startsWith("!")) return false;
  const directoryOnly = pattern.endsWith("/");
  pattern = pattern.replace(/^\/+|\/+$/gu, "");
  if (!pattern) return false;
  const escaped = pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/gu, "\\$&")).join(".*");
  const expression = pattern.includes("/") ? `^${escaped}(?:$|/)` : `(?:^|/)${escaped}(?:$|/)`;
  return new RegExp(expression, "u").test(relativePath) && (!directoryOnly || relativePath === pattern || relativePath.startsWith(`${pattern}/`));
}

async function readFileIfPresent(path: string) {
  try { return await readFile(path, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

function chunkMarkdown(documentPath: string, content: string): VaultChunk[] {
  const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---\s*/u)?.[1] ?? "";
  const frontmatterTags = parseFrontmatterTags(frontmatter);
  const normalized = content.replace(/^---[\s\S]*?---\s*/u, "").trim();
  const sections = normalized.split(/(?=^#{1,6}\s+)/mu).map((section) => section.trim()).filter(Boolean);
  const source = sections.length > 0 ? sections : [normalized];
  let searchOffset = 0;
  return source.map((text, index) => {
    const heading = text.match(/^#{1,6}\s+(.+)$/mu)?.[1]?.trim();
    const hash = createHash("sha256").update(`${documentPath}\n${text}`).digest("hex");
    const localOffset = Math.max(0, normalized.indexOf(text, searchOffset));
    searchOffset = localOffset + text.length;
    const absoluteOffset = Math.max(0, content.indexOf(normalized) + localOffset);
    const lineStart = absoluteOffset >= 0 ? content.slice(0, absoluteOffset).split(/\r?\n/u).length : undefined;
    const lineEnd = lineStart === undefined ? undefined : lineStart + text.split(/\r?\n/u).length - 1;
    const inlineTags = [...text.matchAll(/(^|\s)#([\p{L}\p{N}_/-]+)/gu)].map((match) => `#${match[2]}`);
    const tags = [...frontmatterTags, ...inlineTags];
    const links = [...text.matchAll(/!?\[([^\]]+)\]\(([^)]+)\)|\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/gu)].map((match) => match[2] ?? match[3] ?? match[1]).filter(Boolean);
    return { id: `${hash.slice(0, 16)}-${index}`, documentPath, ...(heading ? { heading } : {}), text, hash, ...(lineStart === undefined ? {} : { lineStart, lineEnd }), ...(tags.length ? { tags: [...new Set(tags)] } : {}), ...(links.length ? { links: [...new Set(links)] } : {}) };
  });
}

function parseFrontmatterTags(frontmatter: string): string[] {
  const value = frontmatter.match(/^tags\s*:\s*(.+)$/mu)?.[1]?.trim();
  if (!value) return [];
  const values = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1).split(",") : value.split(/\s+/u);
  return values.map((item) => item.trim().replace(/^['"]|['"]$/gu, "")).filter(Boolean).map((item) => item.startsWith("#") ? item : `#${item}`);
}
