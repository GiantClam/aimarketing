import "server-only"

import { readFile } from "node:fs/promises"
import path from "node:path"

import type { WriterPlatform } from "@/lib/writer/config"

export type WriterRuntimeSkillDocument = {
  runtimeLabel: string
  tone: string
  contentFormat: string
  lengthTarget: string
  imageGuidance: string
  promptRules: string[]
  articleStructureGuidance: string
  threadStructureGuidance: string
}

export type WriterBriefingSkillDocument = {
  runtimeLabel: string
  requiredBriefFields: string[]
  collectionRules: string[]
  followUpStyle: string
  defaultAssumptions: string[]
}

const WRITER_SKILL_FILE_BY_PLATFORM: Record<WriterPlatform, string> = {
  wechat: "writer-wechat",
  xiaohongshu: "writer-xiaohongshu",
  x: "writer-x",
  facebook: "writer-facebook",
}
const WRITER_BRIEFING_SKILL_DIR = "writer-briefing"

const writerSkillCache = new Map<WriterPlatform, Promise<string>>()
let writerBriefingSkillCache: Promise<string> | null = null

function getWriterSkillDocumentPath(platform: WriterPlatform) {
  return path.join(process.cwd(), "content", "skills", WRITER_SKILL_FILE_BY_PLATFORM[platform], "SKILL.md")
}

function getWriterBriefingSkillDocumentPath() {
  return path.join(process.cwd(), "content", "skills", WRITER_BRIEFING_SKILL_DIR, "SKILL.md")
}

async function readWriterSkillDocument(platform: WriterPlatform) {
  const existing = writerSkillCache.get(platform)
  if (existing) {
    return existing
  }

  const nextPromise = readFile(getWriterSkillDocumentPath(platform), "utf8")
  writerSkillCache.set(platform, nextPromise)
  return nextPromise
}

async function readWriterBriefingSkillDocument() {
  if (writerBriefingSkillCache) {
    return writerBriefingSkillCache
  }

  const nextPromise = readFile(getWriterBriefingSkillDocumentPath(), "utf8")
  writerBriefingSkillCache = nextPromise
  return nextPromise
}

function stripFrontmatter(markdown: string) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, "").trim()
}

function extractSection(markdown: string, heading: string) {
  const body = stripFrontmatter(markdown)
  const lines = body.split(/\r?\n/u)
  const normalizedHeading = heading.trim().toLowerCase()
  const startIndex = lines.findIndex((line) => {
    const match = /^##\s+(.+?)\s*$/u.exec(line.trim())
    return match?.[1]?.trim().toLowerCase() === normalizedHeading
  })

  if (startIndex < 0) {
    return ""
  }

  const collected: string[] = []
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/u.test(lines[index].trim())) {
      break
    }
    collected.push(lines[index])
  }

  return collected.join("\n").trim()
}

function collapseWhitespace(value: string) {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim()
}

function parseListSection(value: string) {
  return value
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\s*-\s*/u, "").trim())
    .filter(Boolean)
}

export async function getWriterRepoHostedSkillDocument(
  platform: WriterPlatform,
  fallback: WriterRuntimeSkillDocument,
): Promise<WriterRuntimeSkillDocument> {
  try {
    const markdown = await readWriterSkillDocument(platform)
    return {
      runtimeLabel: collapseWhitespace(extractSection(markdown, "Runtime Label")) || fallback.runtimeLabel,
      tone: collapseWhitespace(extractSection(markdown, "Tone")) || fallback.tone,
      contentFormat: collapseWhitespace(extractSection(markdown, "Content Format")) || fallback.contentFormat,
      lengthTarget: collapseWhitespace(extractSection(markdown, "Length Target")) || fallback.lengthTarget,
      imageGuidance: collapseWhitespace(extractSection(markdown, "Image Guidance")) || fallback.imageGuidance,
      promptRules: parseListSection(extractSection(markdown, "Prompt Rules")).length
        ? parseListSection(extractSection(markdown, "Prompt Rules"))
        : fallback.promptRules,
      articleStructureGuidance:
        collapseWhitespace(extractSection(markdown, "Article Structure Guidance")) || fallback.articleStructureGuidance,
      threadStructureGuidance:
        collapseWhitespace(extractSection(markdown, "Thread Structure Guidance")) || fallback.threadStructureGuidance,
    }
  } catch (error) {
    console.warn("writer.skill-doc.read-failed", {
      platform,
      path: getWriterSkillDocumentPath(platform),
      message: error instanceof Error ? error.message : String(error),
    })
    return fallback
  }
}

export async function getWriterBriefingSkillDocument(
  fallback: WriterBriefingSkillDocument,
): Promise<WriterBriefingSkillDocument> {
  try {
    const markdown = await readWriterBriefingSkillDocument()
    return {
      runtimeLabel: collapseWhitespace(extractSection(markdown, "Runtime Label")) || fallback.runtimeLabel,
      requiredBriefFields: parseListSection(extractSection(markdown, "Required Brief Fields")).length
        ? parseListSection(extractSection(markdown, "Required Brief Fields"))
        : fallback.requiredBriefFields,
      collectionRules: parseListSection(extractSection(markdown, "Collection Rules")).length
        ? parseListSection(extractSection(markdown, "Collection Rules"))
        : fallback.collectionRules,
      followUpStyle: collapseWhitespace(extractSection(markdown, "Follow-up Style")) || fallback.followUpStyle,
      defaultAssumptions: parseListSection(extractSection(markdown, "Default Assumptions")).length
        ? parseListSection(extractSection(markdown, "Default Assumptions"))
        : fallback.defaultAssumptions,
    }
  } catch (error) {
    console.warn("writer.briefing-skill.read-failed", {
      path: getWriterBriefingSkillDocumentPath(),
      message: error instanceof Error ? error.message : String(error),
    })
    return fallback
  }
}

export function getWriterRepoHostedSkillPath(platform: WriterPlatform) {
  return getWriterSkillDocumentPath(platform)
}

export function getWriterBriefingSkillPath() {
  return getWriterBriefingSkillDocumentPath()
}
