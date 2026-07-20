import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import type { SharedSkillSetSelection } from "@/lib/ai-runtime/contracts"

const MAX_BUNDLE_BYTES = 512 * 1024
const MAX_FILE_BYTES = 256 * 1024
const SKILL_ROOT = path.join(process.cwd(), "content", "skills")

export type SharedSkillSetBundle = {
  schemaVersion: 1
  agent: { id: string; instructions: string }
  skills: Array<{
    id: string
    position: number
    files: Array<{ path: "SKILL.md" | `references/${string}`; content: string }>
  }>
  checksum: string
}

const SKILL_SOURCE_DIRECTORIES: Record<string, string> = {
  "executive-consulting": "executive-consulting-suite",
  "longform-writing": "longform-writing",
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function normalizeInstructions(value: string) {
  return value.replace(/^---[\s\S]*?---\s*/u, "").trim()
}

function assertTextFile(relativePath: string, content: Buffer) {
  if (content.byteLength > MAX_FILE_BYTES) throw new Error("shared_skill_file_too_large")
  if (content.includes(0)) throw new Error("shared_skill_binary_file_forbidden")
  const normalized = relativePath.replace(/\\/g, "/")
  if (normalized !== "SKILL.md" && !/^references\/[a-zA-Z0-9._/-]+\.(?:md|markdown|json|ya?ml)$/u.test(normalized)) {
    throw new Error("shared_skill_path_forbidden")
  }
  if (normalized.includes("../") || normalized.startsWith("/")) throw new Error("shared_skill_path_forbidden")
  const text = content.toString("utf8")
  if (text.includes("\uFFFD")) throw new Error("shared_skill_text_invalid")
  return { path: normalized as "SKILL.md" | `references/${string}`, content: text }
}

async function collectFiles(root: string, relative = "") : Promise<Array<{ path: "SKILL.md" | `references/${string}`; content: string }>> {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true })
  const files: Array<{ path: "SKILL.md" | `references/${string}`; content: string }> = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const nextRelative = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (relative === "" && entry.name !== "references") continue
      files.push(...await collectFiles(root, nextRelative))
      continue
    }
    if (!entry.isFile()) continue
    files.push(assertTextFile(nextRelative, await readFile(path.join(root, nextRelative))))
  }
  return files
}

export async function buildSharedSkillSetBundle(input: {
  selection: SharedSkillSetSelection
  agentInstructions: string
}) : Promise<SharedSkillSetBundle> {
  const seen = new Set<string>()
  const skills = [] as SharedSkillSetBundle["skills"]
  for (const selectionSkill of input.selection.skills) {
    if (seen.has(selectionSkill.id)) throw new Error("shared_skill_duplicate_id")
    seen.add(selectionSkill.id)
    const directory = SKILL_SOURCE_DIRECTORIES[selectionSkill.id]
    if (!directory) throw new Error("shared_skill_source_unknown")
    const files = await collectFiles(path.join(SKILL_ROOT, directory))
    if (!files.some((file) => file.path === "SKILL.md")) throw new Error("shared_skill_entry_missing")
    skills.push({ id: selectionSkill.id, position: selectionSkill.position, files })
  }
  const source = {
    schemaVersion: 1 as const,
    agent: { id: input.selection.agentId, instructions: normalizeInstructions(input.agentInstructions) },
    skills,
  }
  const canonical = JSON.stringify(source)
  if (Buffer.byteLength(canonical, "utf8") > MAX_BUNDLE_BYTES) throw new Error("shared_skill_bundle_too_large")
  return { ...source, checksum: digest(canonical) }
}

export function validateSharedSkillSetBundle(value: unknown): value is SharedSkillSetBundle {
  if (!value || typeof value !== "object") return false
  const bundle = value as Partial<SharedSkillSetBundle>
  if (bundle.schemaVersion !== 1 || !bundle.agent || typeof bundle.agent.id !== "string" || typeof bundle.agent.instructions !== "string" || !Array.isArray(bundle.skills) || typeof bundle.checksum !== "string") return false
  const source = { schemaVersion: bundle.schemaVersion, agent: bundle.agent, skills: bundle.skills }
  if (digest(JSON.stringify(source)) !== bundle.checksum) return false
  return bundle.skills.every((skill) => Boolean(skill && typeof skill.id === "string" && Number.isInteger(skill.position) && Array.isArray(skill.files) && skill.files.every((file) => typeof file.path === "string" && typeof file.content === "string")))
}
