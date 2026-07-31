import "server-only"

import { readFile } from "node:fs/promises"
import path from "node:path"

import { getPublicSeoToolIds } from "./public-runtime-policy"

const SKILL_ROOT = path.join(process.cwd(), "content", "skills")
const ALLOWED_PUBLIC_SKILLS = new Set(["headline-generator"])
const cache = new Map<string, Promise<string>>()

export async function loadPublicSeoSkillInstruction(skillId: "headline-generator") {
  if (!ALLOWED_PUBLIC_SKILLS.has(skillId)) {
    throw new Error("public_seo_skill_forbidden")
  }

  if (process.env.NODE_ENV === "development") {
    return (await readFile(path.join(SKILL_ROOT, skillId, "SKILL.md"), "utf8"))
      .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, "")
      .trim()
  }

  const existing = cache.get(skillId)
  if (existing) return existing
  const next = readFile(path.join(SKILL_ROOT, skillId, "SKILL.md"), "utf8")
    .then((content) => content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, "").trim())
  cache.set(skillId, next)
  return next
}

export { getPublicSeoToolIds }
