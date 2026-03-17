import "server-only"

import { readFile } from "node:fs/promises"
import path from "node:path"

import type { ImageAssistantSkillId } from "@/lib/image-assistant/types"

const skillDocumentCache = new Map<ImageAssistantSkillId, Promise<string>>()
const skillAgentCache = new Map<ImageAssistantSkillId, Promise<string>>()

export type ImageAssistantAgentMetadata = {
  display_name: string
  description: string
  short_description: string
  default_prompt: string
  stage: string
  when_to_use: string
}

function getSkillDocumentPath(skillId: ImageAssistantSkillId) {
  return path.join(process.cwd(), "content", "skills", skillId, "SKILL.md")
}

function getSkillAgentPath(skillId: ImageAssistantSkillId) {
  return path.join(process.cwd(), "content", "skills", skillId, "agent.yaml")
}

async function readSkillDocument(skillId: ImageAssistantSkillId) {
  const existing = skillDocumentCache.get(skillId)
  if (existing) {
    return existing
  }

  const nextPromise = readFile(getSkillDocumentPath(skillId), "utf8")
  skillDocumentCache.set(skillId, nextPromise)
  return nextPromise
}

async function readSkillAgent(skillId: ImageAssistantSkillId) {
  const existing = skillAgentCache.get(skillId)
  if (existing) {
    return existing
  }

  const nextPromise = readFile(getSkillAgentPath(skillId), "utf8")
  skillAgentCache.set(skillId, nextPromise)
  return nextPromise
}

function stripFrontmatter(markdown: string) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, "").trim()
}

function extractHeadingSection(markdown: string, heading: string) {
  const body = stripFrontmatter(markdown)
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const headingMatch = new RegExp(`^##\\s+${escapedHeading}\\r?\\n`, "mu").exec(body)
  if (!headingMatch || headingMatch.index == null) {
    return ""
  }

  const sectionStart = headingMatch.index + headingMatch[0].length
  const remaining = body.slice(sectionStart)
  const nextHeadingMatch = /^##\s+/mu.exec(remaining)
  const section = nextHeadingMatch ? remaining.slice(0, nextHeadingMatch.index) : remaining
  return section.trim()
}

function collapseWhitespace(value: string) {
  return value
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\s*-\s*/u, "").trim())
    .filter(Boolean)
    .join(" ")
    .trim()
}

function stripYamlQuotes(value: string) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseSimpleYamlSections(source: string) {
  const sections: Record<string, Record<string, string>> = {}
  let currentSection: string | null = null

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.replace(/\t/g, "  ")
    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue
    }

    const sectionMatch = line.match(/^([A-Za-z0-9_-]+):\s*$/u)
    if (sectionMatch) {
      currentSection = sectionMatch[1]
      sections[currentSection] = sections[currentSection] || {}
      continue
    }

    const valueMatch = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*(.+?)\s*$/u)
    if (valueMatch && currentSection) {
      sections[currentSection][valueMatch[1]] = stripYamlQuotes(valueMatch[2])
    }
  }

  return sections
}

export function getImageAssistantRepoSkillPath(skillId: ImageAssistantSkillId) {
  return getSkillDocumentPath(skillId)
}

export function getImageAssistantRepoSkillAgentPath(skillId: ImageAssistantSkillId) {
  return getSkillAgentPath(skillId)
}

export async function getImageAssistantRuntimeSystemPrompt(skillId: ImageAssistantSkillId, fallback: string) {
  try {
    const markdown = await readSkillDocument(skillId)
    const section = collapseWhitespace(extractHeadingSection(markdown, "Runtime System Prompt"))
    return section || fallback
  } catch (error) {
    console.warn("image-assistant.skill-doc.read-failed", {
      skillId,
      path: getSkillDocumentPath(skillId),
      message: error instanceof Error ? error.message : String(error),
    })
    return fallback
  }
}

export async function getImageAssistantPromptCompositionRules(skillId: ImageAssistantSkillId) {
  try {
    const markdown = await readSkillDocument(skillId)
    const section = extractHeadingSection(markdown, "Prompt Composition Rules")
    return section
      .split(/\r?\n/u)
      .map((line) => line.replace(/^\s*-\s*/u, "").trim())
      .filter(Boolean)
  } catch (error) {
    console.warn("image-assistant.skill-doc.rules-read-failed", {
      skillId,
      path: getSkillDocumentPath(skillId),
      message: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

export async function getImageAssistantFailureChecks(skillId: ImageAssistantSkillId) {
  try {
    const markdown = await readSkillDocument(skillId)
    const section = extractHeadingSection(markdown, "Failure Checks")
    return section
      .split(/\r?\n/u)
      .map((line) => line.replace(/^\s*-\s*/u, "").trim())
      .filter(Boolean)
  } catch (error) {
    console.warn("image-assistant.skill-doc.failure-checks-read-failed", {
      skillId,
      path: getSkillDocumentPath(skillId),
      message: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

export async function getImageAssistantAgentMetadata(
  skillId: ImageAssistantSkillId,
  fallback: ImageAssistantAgentMetadata,
) {
  try {
    const yaml = await readSkillAgent(skillId)
    const sections = parseSimpleYamlSections(yaml)
    const interfaceSection = sections.interface || {}
    const routingSection = sections.routing || {}

    return {
      display_name: interfaceSection.display_name || fallback.display_name,
      description: interfaceSection.description || fallback.description,
      short_description: interfaceSection.short_description || fallback.short_description,
      default_prompt: interfaceSection.default_prompt || fallback.default_prompt,
      stage: routingSection.stage || fallback.stage,
      when_to_use: routingSection.when_to_use || fallback.when_to_use,
    }
  } catch (error) {
    console.warn("image-assistant.skill-doc.agent-read-failed", {
      skillId,
      path: getSkillAgentPath(skillId),
      message: error instanceof Error ? error.message : String(error),
    })
    return fallback
  }
}
