import { readdir, readFile, stat } from "node:fs/promises"
import { relative, join } from "node:path"

import { isValidRuntimeProjectSnapshot, type RuntimeProjectSnapshot } from "../../../../lib/ai-runtime/contracts.js"

const MAX_FALLBACK_SNAPSHOT_BYTES = 120 * 1024
const MAX_FALLBACK_FILE_BYTES = 24 * 1024
const MAX_FALLBACK_FILES = 64
const FALLBACK_TEXT_EXTENSIONS = new Set([".csv", ".json", ".md", ".markdown", ".txt", ".yaml", ".yml"])

type SnapshotFile = { path: string; content: string }

async function collectTextFiles(root: string, current = root, output: SnapshotFile[] = []): Promise<SnapshotFile[]> {
  if (output.length >= MAX_FALLBACK_FILES) return output
  const entries = (await readdir(current, { withFileTypes: true }).catch(() => [])).sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    if (output.length >= MAX_FALLBACK_FILES || entry.name.startsWith(".")) continue
    const fullPath = join(current, entry.name)
    if (entry.isDirectory()) {
      await collectTextFiles(root, fullPath, output)
      continue
    }
    const extension = entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase()
    if (!FALLBACK_TEXT_EXTENSIONS.has(extension)) continue
    const bytes = await stat(fullPath).then((value) => value.size).catch(() => 0)
    if (bytes <= 0 || bytes > MAX_FALLBACK_FILE_BYTES) continue
    const content = await readFile(fullPath, "utf8").catch(() => null)
    if (content === null) continue
    output.push({ path: relative(root, fullPath).replaceAll("\\", "/"), content })
  }
  return output
}

async function findProjectRoots(workspaceDir: string): Promise<string[]> {
  const candidates: Array<{ path: string; modifiedAt: number }> = []
  const roots = [join(workspaceDir, "projects"), join(workspaceDir, "ppt-master")]
  for (const root of roots) {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue
      const projectPath = join(root, entry.name)
      const files: string[] = await readdir(projectPath).catch(() => [] as string[])
      if (!files.includes("design_spec.md") && !files.includes("spec_lock.md") && !files.includes("project-state.json") && !files.includes("exports") && !files.includes("svg_output")) continue
      const modifiedAt = await stat(projectPath).then((value) => value.mtimeMs).catch(() => 0)
      candidates.push({ path: projectPath, modifiedAt })
    }
  }
  return candidates.sort((left, right) => right.modifiedAt - left.modifiedAt).map((item) => item.path)
}

export function parseRuntimeProjectSnapshot(raw: string): RuntimeProjectSnapshot | null {
  try {
    const value = JSON.parse(raw)
    return isValidRuntimeProjectSnapshot(value) ? value : null
  } catch {
    return null
  }
}

export async function buildFallbackRuntimeProjectSnapshot(runDir: string): Promise<RuntimeProjectSnapshot | null> {
  // Transient sessions use the run directory itself as OpenCode's working
  // directory, while persistent sessions keep projects under workspace/.
  // Search both layouts so a skill-written project can be restored even when
  // its model-owned project-state.json is not in the platform schema.
  for (const workspaceDir of [join(runDir, "workspace"), runDir]) {
    const projectRoot = (await findProjectRoots(workspaceDir))[0]
    if (!projectRoot) continue
    const files = await collectTextFiles(workspaceDir, projectRoot)
    if (!files.length) continue
    const state = {
      source: "runtime-workspace",
      projectPath: relative(workspaceDir, projectRoot).replaceAll("\\", "/"),
      files,
    }
    const snapshot = { schemaVersion: 1 as const, projectKind: "ppt-master" as const, state }
    try {
      if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength <= MAX_FALLBACK_SNAPSHOT_BYTES && isValidRuntimeProjectSnapshot(snapshot)) return snapshot
    } catch {
      // Try the next supported workspace layout.
    }
  }
  return null
}

export async function readRuntimeProjectSnapshot(runDir: string): Promise<RuntimeProjectSnapshot | null> {
  const paths = [
    join(runDir, "project-state.json"),
    join(runDir, "workspace", "project-state.json"),
    join(runDir, "workspace", "ppt-master", "project-state.json"),
  ]
  for (const workspaceDir of [join(runDir, "workspace"), runDir]) {
    const workspaceProjectRoots = await findProjectRoots(workspaceDir)
    paths.push(...workspaceProjectRoots.map((root) => join(root, "project-state.json")))
  }
  for (const path of [...new Set(paths)]) {
    const raw = await readFile(path, "utf8").catch(() => null)
    if (raw === null) continue
    const snapshot = parseRuntimeProjectSnapshot(raw)
    if (snapshot) return snapshot
  }
  return buildFallbackRuntimeProjectSnapshot(runDir)
}
