import "server-only"

import { readFile } from "node:fs/promises"
import path from "node:path"

import type { WriterContentType, WriterPlatform } from "@/lib/writer/config"

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

export type WriterContentSkillDocument = {
  runtimeLabel: string
  guidance: string
}

const WRITER_SKILL_FILE_BY_PLATFORM: Partial<Record<WriterPlatform, string>> = {
  wechat: "writer-wechat",
  xiaohongshu: "writer-xiaohongshu",
  x: "writer-x",
  facebook: "writer-facebook",
}
const WRITER_CONTENT_SKILL_DIR_BY_TYPE: Record<WriterContentType, string> = {
  social_cn: "social-writing-cn",
  social_global: "social-writing-global",
  longform: "longform-writing",
  email: "email-writing",
  newsletter: "newsletter-writing",
  website_copy: "website-copy",
  ads: "ads-writing",
  case_study: "case-study-writing",
  product: "product-writing",
  speech: "speech-writing",
}
const WRITER_BRIEFING_SKILL_DIR_CANDIDATES = ["writer-briefing", "content-briefing"] as const

const writerSkillCache = new Map<string, Promise<string>>()

function getSkillDocumentPath(dirName: string) {
  return path.join(process.cwd(), "content", "skills", dirName, "SKILL.md")
}

async function readSkillDocument(dirName: string) {
  const existing = writerSkillCache.get(dirName)
  if (existing) {
    return existing
  }

  const nextPromise = readFile(getSkillDocumentPath(dirName), "utf8")
  writerSkillCache.set(dirName, nextPromise)
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
  const dirName = WRITER_SKILL_FILE_BY_PLATFORM[platform]
  if (!dirName) {
    return fallback
  }

  try {
    const markdown = await readSkillDocument(dirName)
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
      path: getSkillDocumentPath(dirName),
      message: error instanceof Error ? error.message : String(error),
    })
    return fallback
  }
}

export async function getWriterBriefingSkillDocument(
  fallback: WriterBriefingSkillDocument,
): Promise<WriterBriefingSkillDocument> {
  for (const dirName of WRITER_BRIEFING_SKILL_DIR_CANDIDATES) {
    try {
      const markdown = await readSkillDocument(dirName)
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
        path: getSkillDocumentPath(dirName),
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return fallback
}

export async function getWriterContentSkillDocument(
  contentType: WriterContentType,
  fallback: WriterContentSkillDocument,
): Promise<WriterContentSkillDocument> {
  const dirName = WRITER_CONTENT_SKILL_DIR_BY_TYPE[contentType]

  try {
    const markdown = await readSkillDocument(dirName)
    return {
      runtimeLabel: collapseWhitespace(extractSection(markdown, "Runtime Label")) || fallback.runtimeLabel,
      guidance: stripFrontmatter(markdown) || fallback.guidance,
    }
  } catch (error) {
    console.warn("writer.content-skill.read-failed", {
      contentType,
      path: getSkillDocumentPath(dirName),
      message: error instanceof Error ? error.message : String(error),
    })
    return fallback
  }
}

export function getWriterRepoHostedSkillPath(platform: WriterPlatform) {
  const dirName = WRITER_SKILL_FILE_BY_PLATFORM[platform]
  return dirName ? getSkillDocumentPath(dirName) : ""
}

export function getWriterBriefingSkillPath() {
  return getSkillDocumentPath(WRITER_BRIEFING_SKILL_DIR_CANDIDATES[0])
}
