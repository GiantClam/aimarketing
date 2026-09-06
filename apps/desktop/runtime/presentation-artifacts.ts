import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

export type LocalPresentationArtifact = { readonly relativePath: string; readonly bytes: number; readonly sha256: string; readonly kind: "pptx" | "svg" | "preview" };

export async function detectPresentationArtifacts(workspacePath: string, startedAt = 0): Promise<readonly LocalPresentationArtifact[]> {
  const root = resolve(workspacePath);
  const candidates: string[] = [];
  async function walk(directory: string, depth: number) {
    if (depth > 6) return;
    let entries: Awaited<ReturnType<typeof readdir>>;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name === ".opencode" || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path, depth + 1);
      else if (entry.isFile() && /\.(html?|pptx|svg|png|jpe?g|webp)$/iu.test(entry.name)) candidates.push(path);
    }
  }
  await walk(root, 0);
  const artifacts: LocalPresentationArtifact[] = [];
  for (const path of candidates) {
    try {
      const metadata = await stat(path);
      if (!metadata.isFile() || metadata.size <= 0 || metadata.size > 2 * 1024 * 1024 * 1024 || metadata.mtimeMs < startedAt - 5_000) continue;
      const bytes = await readFile(path);
      const extension = path.toLowerCase().split(".").pop() ?? "";
      const kind = extension === "pptx" ? "pptx" : extension === "svg" ? "svg" : "preview";
      artifacts.push({ relativePath: relative(root, path).replaceAll("\\", "/"), bytes: metadata.size, sha256: createHash("sha256").update(bytes as unknown as Uint8Array).digest("hex"), kind });
    } catch { /* files can disappear while a skill is rendering */ }
  }
  return artifacts.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
