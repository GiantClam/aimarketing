import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import {
  WRITER_CONTENT_TYPE_CONFIG,
  WRITER_PLATFORM_CONFIG,
  type WriterContentType,
  type WriterPlatform,
} from "@/lib/writer/config"

type WriterContentSkillMeta = {
  id: WriterContentType
  dirName: string
  label: string
  defaultTargetPlatform: string
  defaultOutputForm: string
  defaultLengthTarget: string
}

type WriterPlatformSkillMeta = {
  id: string
  dirName?: string
  label: string
  targetPlatform: string
  renderPlatform: WriterPlatform
  supportsThread: boolean
  listed: boolean
  aliases: string[]
  queryPatterns?: string[]
}

type WriterStyleSkillMeta = {
  id: string
  dirName: string
  label: string
  aliases: string[]
}

type WriterSkillCatalog = {
  briefingSkillDirs: string[]
  contentSkills: WriterContentSkillMeta[]
  platformSkills: WriterPlatformSkillMeta[]
  styleSkills: WriterStyleSkillMeta[]
}

const CATALOG_PATH = path.join(process.cwd(), "content", "skills", "writer-catalog.json")

let cachedCatalog: WriterSkillCatalog | null = null

function normalizeArray(values: unknown) {
  return Array.isArray(values)
    ? values.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean)
    : []
}

function createDefaultCatalog(): WriterSkillCatalog {
  return {
    briefingSkillDirs: ["writer-briefing", "content-briefing"],
    contentSkills: (Object.entries(WRITER_CONTENT_TYPE_CONFIG) as Array<[WriterContentType, (typeof WRITER_CONTENT_TYPE_CONFIG)[WriterContentType]]>).map(
      ([id, value]) => ({
        id,
        dirName:
          id === "website_copy"
            ? "website-copy"
            : id === "case_study"
              ? "case-study-writing"
              : id === "social_cn"
                ? "social-writing-cn"
                : id === "social_global"
                  ? "social-writing-global"
                  : `${id.replace(/_/g, "-")}-writing`,
        label: value.label,
        defaultTargetPlatform: value.defaultTargetPlatform,
        defaultOutputForm: value.defaultOutputForm,
        defaultLengthTarget: value.defaultLengthTarget,
      }),
    ),
    platformSkills: (Object.entries(WRITER_PLATFORM_CONFIG) as Array<[WriterPlatform, (typeof WRITER_PLATFORM_CONFIG)[WriterPlatform]]>)
      .filter(([id]) => id !== "generic")
      .map(([id, value]) => ({
        id,
        dirName:
          id === "wechat" || id === "xiaohongshu" || id === "x" || id === "facebook"
            ? `writer-${id}`
            : undefined,
        label: value.shortLabel,
        targetPlatform: value.shortLabel === "X" ? "X" : value.label.replace(/写作|图文写作|脚本写作|文案写作/gu, "").trim() || value.shortLabel,
        renderPlatform: id,
        supportsThread: value.supportsThread,
        listed: true,
        aliases: [],
      })),
    styleSkills: [],
  }
}

function loadCatalog(): WriterSkillCatalog {
  if (cachedCatalog) {
    return cachedCatalog
  }

  const fallback = createDefaultCatalog()
  if (!existsSync(CATALOG_PATH)) {
    cachedCatalog = fallback
    return cachedCatalog
  }

  try {
    const parsed = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as Record<string, unknown>
    cachedCatalog = {
      briefingSkillDirs: normalizeArray(parsed.briefingSkillDirs).length
        ? normalizeArray(parsed.briefingSkillDirs)
        : fallback.briefingSkillDirs,
      contentSkills: Array.isArray(parsed.contentSkills)
        ? (parsed.contentSkills
            .map((item) => {
              if (!item || typeof item !== "object") return null
              const candidate = item as Record<string, unknown>
              const id = typeof candidate.id === "string" ? candidate.id.trim() : ""
              if (!(id in WRITER_CONTENT_TYPE_CONFIG)) return null
              const fallbackItem = fallback.contentSkills.find((entry) => entry.id === id)
              return {
                id: id as WriterContentType,
                dirName: typeof candidate.dirName === "string" ? candidate.dirName.trim() : fallbackItem?.dirName || "",
                label: typeof candidate.label === "string" ? candidate.label.trim() : fallbackItem?.label || id,
                defaultTargetPlatform:
                  typeof candidate.defaultTargetPlatform === "string"
                    ? candidate.defaultTargetPlatform.trim()
                    : fallbackItem?.defaultTargetPlatform || "",
                defaultOutputForm:
                  typeof candidate.defaultOutputForm === "string"
                    ? candidate.defaultOutputForm.trim()
                    : fallbackItem?.defaultOutputForm || "",
                defaultLengthTarget:
                  typeof candidate.defaultLengthTarget === "string"
                    ? candidate.defaultLengthTarget.trim()
                    : fallbackItem?.defaultLengthTarget || "",
              } satisfies WriterContentSkillMeta
            })
            .filter(Boolean) as WriterContentSkillMeta[])
        : fallback.contentSkills,
      platformSkills: Array.isArray(parsed.platformSkills)
        ? (parsed.platformSkills
            .map((item) => {
              if (!item || typeof item !== "object") return null
              const candidate = item as Record<string, unknown>
              const renderPlatform =
                typeof candidate.renderPlatform === "string" && candidate.renderPlatform in WRITER_PLATFORM_CONFIG
                  ? (candidate.renderPlatform as WriterPlatform)
                  : null
              if (!renderPlatform) return null
              const id = typeof candidate.id === "string" ? candidate.id.trim() : ""
              const fallbackItem = fallback.platformSkills.find((entry) => entry.id === id)
              return {
                id: id || fallbackItem?.id || renderPlatform,
                dirName: typeof candidate.dirName === "string" ? candidate.dirName.trim() : fallbackItem?.dirName,
                label:
                  typeof candidate.label === "string" && candidate.label.trim()
                    ? candidate.label.trim()
                    : fallbackItem?.label || id || renderPlatform,
                targetPlatform:
                  typeof candidate.targetPlatform === "string" && candidate.targetPlatform.trim()
                    ? candidate.targetPlatform.trim()
                    : fallbackItem?.targetPlatform || id || renderPlatform,
                renderPlatform,
                supportsThread:
                  typeof candidate.supportsThread === "boolean"
                    ? candidate.supportsThread
                    : fallbackItem?.supportsThread || false,
                listed: typeof candidate.listed === "boolean" ? candidate.listed : fallbackItem?.listed ?? true,
                aliases: normalizeArray(candidate.aliases),
                queryPatterns: normalizeArray(candidate.queryPatterns),
              } satisfies WriterPlatformSkillMeta
            })
            .filter(Boolean) as WriterPlatformSkillMeta[])
        : fallback.platformSkills,
      styleSkills: Array.isArray(parsed.styleSkills)
        ? (parsed.styleSkills
            .map((item) => {
              if (!item || typeof item !== "object") return null
              const candidate = item as Record<string, unknown>
              const id = typeof candidate.id === "string" ? candidate.id.trim() : ""
              const dirName = typeof candidate.dirName === "string" ? candidate.dirName.trim() : ""
              if (!id || !dirName) return null
              return {
                id,
                dirName,
                label: typeof candidate.label === "string" && candidate.label.trim() ? candidate.label.trim() : id,
                aliases: normalizeArray(candidate.aliases),
              } satisfies WriterStyleSkillMeta
            })
            .filter(Boolean) as WriterStyleSkillMeta[])
        : fallback.styleSkills,
    }
    return cachedCatalog
  } catch {
    cachedCatalog = fallback
    return cachedCatalog
  }
}

function matchesCatalogEntry(text: string, entry: { aliases?: string[]; queryPatterns?: string[] }) {
  const normalized = text.trim().toLowerCase()
  if (!normalized) return false

  if (entry.queryPatterns?.some((pattern) => {
    try {
      return new RegExp(pattern, "iu").test(normalized)
    } catch {
      return false
    }
  })) {
    return true
  }

  return (entry.aliases || []).some((alias) => normalized.includes(alias.toLowerCase()))
}

export function getWriterSkillCatalog() {
  return loadCatalog()
}

export function getWriterBriefingSkillDirs() {
  return [...loadCatalog().briefingSkillDirs]
}

export function getWriterContentSkillMeta(contentType: WriterContentType) {
  return loadCatalog().contentSkills.find((entry) => entry.id === contentType) || null
}

export function listWriterPlatformSkills() {
  return loadCatalog().platformSkills.filter((entry) => entry.listed)
}

export function matchWriterPlatformSkill(text: string) {
  return loadCatalog().platformSkills.find((entry) => matchesCatalogEntry(text, entry)) || null
}

export function getWriterPlatformSkillByTargetPlatform(targetPlatform: string) {
  const normalized = targetPlatform.trim().toLowerCase()
  if (!normalized) return null
  return (
    loadCatalog().platformSkills.find(
      (entry) =>
        entry.targetPlatform.toLowerCase() === normalized ||
        entry.label.toLowerCase() === normalized ||
        entry.id.toLowerCase() === normalized ||
        entry.aliases.some((alias) => alias.toLowerCase() === normalized),
    ) || null
  )
}

export function matchWriterStyleSkill(text: string) {
  return loadCatalog().styleSkills.find((entry) => matchesCatalogEntry(text, entry)) || null
}

export function getWriterStyleSkillMeta(styleId: string) {
  return loadCatalog().styleSkills.find((entry) => entry.id === styleId) || null
}
