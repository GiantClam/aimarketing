import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { WRITER_PLATFORM_ORDER, type WriterPlatform } from "@/lib/writer/config"

export const WRITER_PLATFORM_REGISTRY_SCHEMA_VERSION = 2 as const
export const WRITER_REGISTRY_PLATFORMS = WRITER_PLATFORM_ORDER.filter((platform) => platform !== "generic") as WriterPlatform[]

export type WriterPrimarySkillBinding = {
  skillId: string
  dirName: string
  interfaceVersion: string
  release: string
  digest: string
}

export type WriterPlatformBinding = {
  platformId: WriterPlatform
  aliases: string[]
  primary: WriterPrimarySkillBinding
  compatibleStyleSkillIds: string[]
  operations: string[]
  modes: string[]
  research: { enabled: boolean }
  assets: {
    cover: boolean
    inline: boolean
    maxCount: number
    aspectRatios: string[]
  }
  output: {
    titleRequired: boolean
    preserveAuthoredTitle: boolean
    maxChars: number
  }
}

export type WriterPlatformRegistry = {
  schemaVersion: 2
  platformBindings: WriterPlatformBinding[]
}

export type WriterRegistryValidationOptions = {
  skillExists?: (skillId: string, dirName: string) => boolean
  digestFor?: (binding: WriterPrimarySkillBinding) => string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function string(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(string).filter(Boolean) : []
}

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null
}

function requirePrimary(value: unknown, platformId: WriterPlatform): WriterPrimarySkillBinding {
  if (!isRecord(value)) throw new Error(`writer_registry_primary_missing:${platformId}`)
  const primary = {
    skillId: string(value.skillId),
    dirName: string(value.dirName),
    interfaceVersion: string(value.interfaceVersion),
    release: string(value.release),
    digest: string(value.digest),
  }
  if (!primary.skillId || !primary.dirName || !primary.interfaceVersion || !primary.release || !/^sha256:[0-9a-f]{64}$/u.test(primary.digest)) {
    throw new Error(`writer_registry_primary_invalid:${platformId}`)
  }
  return primary
}

function parseBinding(value: unknown): WriterPlatformBinding {
  if (!isRecord(value)) throw new Error("writer_registry_platform_invalid")
  const platformId = string(value.platformId) as WriterPlatform
  if (!WRITER_REGISTRY_PLATFORMS.includes(platformId)) throw new Error(`writer_registry_platform_unknown:${platformId || "missing"}`)
  const assets = isRecord(value.assets) ? value.assets : {}
  const output = isRecord(value.output) ? value.output : {}
  const maxCount = nonNegativeInteger(assets.maxCount)
  const maxChars = nonNegativeInteger(output.maxChars)
  if (maxCount === null || maxCount < 1 || maxChars === null || maxChars < 1) throw new Error(`writer_registry_limits_invalid:${platformId}`)
  return {
    platformId,
    aliases: stringArray(value.aliases),
    primary: requirePrimary(value.primary, platformId),
    compatibleStyleSkillIds: stringArray(value.compatibleStyleSkillIds),
    operations: stringArray(value.operations),
    modes: stringArray(value.modes),
    research: { enabled: isRecord(value.research) && value.research.enabled === true },
    assets: {
      cover: isRecord(assets) && assets.cover === true,
      inline: isRecord(assets) && assets.inline === true,
      maxCount,
      aspectRatios: stringArray(assets.aspectRatios),
    },
    output: {
      titleRequired: isRecord(output) && output.titleRequired === true,
      preserveAuthoredTitle: isRecord(output) && output.preserveAuthoredTitle === true,
      maxChars,
    },
  }
}

export function validateWriterPlatformRegistry(value: unknown, options: WriterRegistryValidationOptions = {}): WriterPlatformRegistry {
  if (!isRecord(value) || value.schemaVersion !== WRITER_PLATFORM_REGISTRY_SCHEMA_VERSION || !Array.isArray(value.platformBindings)) {
    throw new Error("writer_registry_schema_invalid")
  }
  const bindings = value.platformBindings.map(parseBinding)
  const seen = new Set<WriterPlatform>()
  for (const binding of bindings) {
    if (seen.has(binding.platformId)) throw new Error(`writer_registry_duplicate_platform:${binding.platformId}`)
    seen.add(binding.platformId)
    if (options.skillExists && !options.skillExists(binding.primary.skillId, binding.primary.dirName)) {
      throw new Error(`writer_registry_skill_missing:${binding.primary.skillId}`)
    }
    if (options.digestFor) {
      const actual = options.digestFor(binding.primary)
      if (actual !== binding.primary.digest) throw new Error(`writer_registry_digest_mismatch:${binding.primary.skillId}`)
    }
  }
  for (const platform of WRITER_REGISTRY_PLATFORMS) {
    if (!seen.has(platform)) throw new Error(`writer_registry_primary_missing:${platform}`)
  }
  return { schemaVersion: 2, platformBindings: bindings }
}

function defaultDigestFor(dirName: string) {
  const skillPath = path.join(process.cwd(), "content", "skills", dirName, "SKILL.md")
  if (!existsSync(skillPath)) return null
  return `sha256:${createHash("sha256").update(readFileSync(skillPath).toString("utf8")).digest("hex")}`
}

export function loadWriterPlatformRegistry(): WriterPlatformRegistry {
  const file = path.join(process.cwd(), "content", "skills", "writer-catalog.json")
  const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown
  return validateWriterPlatformRegistry(parsed, {
    skillExists: (skillId, dirName) => skillId === dirName && existsSync(path.join(process.cwd(), "content", "skills", dirName, "SKILL.md")),
    digestFor: (binding) => defaultDigestFor(binding.dirName),
  })
}

export function getWriterPlatformBinding(platform: WriterPlatform) {
  return loadWriterPlatformRegistry().platformBindings.find((binding) => binding.platformId === platform) || null
}

export function resolveWriterPlatformBinding(platform: WriterPlatform) {
  const binding = getWriterPlatformBinding(platform)
  if (!binding) throw new Error(`writer_platform_binding_missing:${platform}`)
  return binding
}
