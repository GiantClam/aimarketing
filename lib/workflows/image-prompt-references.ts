import type { WorkflowLocale } from "@/lib/workflows/schema"
import type { WorkflowMediaRef } from "@/lib/workflows/node-executors"

export type WorkflowImagePromptReference = {
  sourceNodeKey: string
  alias: string
}

export type WorkflowImagePromptReferenceSource = {
  sourceNodeKey: string
  sourceTitle: string
}

export type WorkflowImagePromptReferenceEntry = WorkflowImagePromptReferenceSource & {
  alias: string
  defaultAlias: string
}

export type WorkflowImagePromptAliasReplacement = {
  previousAlias: string
  nextAlias: string
}

export function isEmbeddableWorkflowImagePromptUrl(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : ""
  if (!trimmed) return false
  return !/^data:/iu.test(trimmed)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function getWorkflowImagePromptDefaultOrdinal(sourceNodeKey: string, index: number) {
  const suffixMatch = sourceNodeKey.match(/(\d+)$/u)
  if (!suffixMatch) return index + 1

  const parsed = Number(suffixMatch[1])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : index + 1
}

export function getDefaultWorkflowImagePromptAlias(sourceNodeKey: string, index: number, locale: WorkflowLocale) {
  const ordinal = getWorkflowImagePromptDefaultOrdinal(sourceNodeKey, index)
  return locale === "zh" ? `图${ordinal}` : `Image${ordinal}`
}

export function buildWorkflowImagePromptReferenceTokens(reference: WorkflowImagePromptReference) {
  const tokens = [`{{${reference.alias.trim()}}}`, `{{${reference.sourceNodeKey.trim()}}}`].filter(Boolean)
  return [...new Set(tokens)]
}

export function normalizeWorkflowImagePromptAlias(value: string | null | undefined, fallback: string) {
  const trimmed = typeof value === "string" ? value.trim() : ""
  return trimmed || fallback
}

function isGeneratedWorkflowImagePromptAlias(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return false

  return /^图\d+$/u.test(trimmed) || /^Image\d+$/u.test(trimmed)
}

export function parseWorkflowImagePromptReferences(value: unknown): WorkflowImagePromptReference[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      sourceNodeKey: typeof item.sourceNodeKey === "string" ? item.sourceNodeKey.trim() : "",
      alias: typeof item.alias === "string" ? item.alias.trim() : "",
    }))
    .filter((item) => item.sourceNodeKey)
}

export function reconcileWorkflowImagePromptReferences(input: {
  current: unknown
  sources: WorkflowImagePromptReferenceSource[]
  locale: WorkflowLocale
}) {
  const currentReferences = parseWorkflowImagePromptReferences(input.current)
  const currentBySourceNodeKey = new Map(currentReferences.map((item, index) => [item.sourceNodeKey, { alias: item.alias, index }] as const))

  return input.sources.map((source, index) => {
    const defaultAlias = getDefaultWorkflowImagePromptAlias(source.sourceNodeKey, index, input.locale)
    const currentReference = currentBySourceNodeKey.get(source.sourceNodeKey)
    const currentAlias = currentReference?.alias ?? ""

    if (!currentAlias.trim()) {
      return {
        sourceNodeKey: source.sourceNodeKey,
        alias: defaultAlias,
      }
    }

    // Preserve only user-customized aliases. Auto-generated aliases should
    // stay contiguous with the current source order after nodes are removed
    // or re-ordered, otherwise gaps like 图1 / 图3 can survive indefinitely.
    if (currentReference && isGeneratedWorkflowImagePromptAlias(currentAlias)) {
      return {
        sourceNodeKey: source.sourceNodeKey,
        alias: defaultAlias,
      }
    }

    return {
      sourceNodeKey: source.sourceNodeKey,
      alias: normalizeWorkflowImagePromptAlias(currentAlias, defaultAlias),
    }
  })
}

export function buildWorkflowImagePromptReferenceEntries(input: {
  sources: WorkflowImagePromptReferenceSource[]
  current: unknown
  locale: WorkflowLocale
}): WorkflowImagePromptReferenceEntry[] {
  const reconciled = reconcileWorkflowImagePromptReferences(input)
  const aliasBySourceNodeKey = new Map(reconciled.map((item) => [item.sourceNodeKey, item.alias] as const))

  return input.sources.map((source, index) => ({
    ...source,
    defaultAlias: getDefaultWorkflowImagePromptAlias(source.sourceNodeKey, index, input.locale),
    alias: aliasBySourceNodeKey.get(source.sourceNodeKey) || getDefaultWorkflowImagePromptAlias(source.sourceNodeKey, index, input.locale),
  }))
}

export function findDuplicateWorkflowImagePromptAliases(references: WorkflowImagePromptReference[]) {
  const counts = new Map<string, number>()
  for (const reference of references) {
    const normalized = reference.alias.trim().toLowerCase()
    if (!normalized) continue
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }

  return new Set(
    references
      .map((reference) => reference.alias.trim())
      .filter((alias) => alias && (counts.get(alias.toLowerCase()) ?? 0) > 1),
  )
}

export function collectWorkflowImagePromptAliasReplacements(input: {
  previous: unknown
  next: unknown
}) {
  const previousBySourceNodeKey = new Map(
    parseWorkflowImagePromptReferences(input.previous).map((reference) => [reference.sourceNodeKey, reference.alias.trim()] as const),
  )

  return parseWorkflowImagePromptReferences(input.next)
    .map((reference) => {
      const previousAlias = previousBySourceNodeKey.get(reference.sourceNodeKey)?.trim() || ""
      const nextAlias = reference.alias.trim()
      if (!previousAlias || !nextAlias || previousAlias === nextAlias) return null
      return {
        previousAlias,
        nextAlias,
      } satisfies WorkflowImagePromptAliasReplacement
    })
    .filter((value): value is WorkflowImagePromptAliasReplacement => Boolean(value))
}

export function replaceWorkflowImagePromptAliasTokens(input: {
  prompt: string | null | undefined
  previousAlias: string
  nextAlias: string
}) {
  const prompt = typeof input.prompt === "string" ? input.prompt : ""
  const previousAlias = input.previousAlias.trim()
  const nextAlias = input.nextAlias.trim()
  if (!prompt || !previousAlias || !nextAlias || previousAlias === nextAlias) {
    return prompt
  }

  const tokenPattern = new RegExp(`\\{\\{\\s*${escapeRegExp(previousAlias)}\\s*\\}\\}`, "g")
  return prompt.replace(tokenPattern, `{{${nextAlias}}}`)
}

export function replaceWorkflowImagePromptAliasTokensBatch(input: {
  prompt: string | null | undefined
  replacements: WorkflowImagePromptAliasReplacement[]
}) {
  return input.replacements.reduce(
    (nextPrompt, replacement) =>
      replaceWorkflowImagePromptAliasTokens({
        prompt: nextPrompt,
        previousAlias: replacement.previousAlias,
        nextAlias: replacement.nextAlias,
      }),
    typeof input.prompt === "string" ? input.prompt : "",
  )
}

export function buildWorkflowImagePromptReferenceSection(input: {
  references: unknown
  inputImages: WorkflowMediaRef[]
  locale: WorkflowLocale
}) {
  const references = parseWorkflowImagePromptReferences(input.references)
  const imagesBySourceNodeKey = new Map(
    input.inputImages
      .filter((image) => typeof image.sourceNodeKey === "string" && image.sourceNodeKey.trim())
      .map((image) => [image.sourceNodeKey!.trim(), image] as const),
  )
  const lines = references
    .map((reference, index) => {
      const image = imagesBySourceNodeKey.get(reference.sourceNodeKey.trim()) ?? input.inputImages[index]
      const url = image?.url?.trim()
      if (!url) return null
      const label = isEmbeddableWorkflowImagePromptUrl(url)
        ? url
        : input.locale === "zh"
          ? "对应输入参考图"
          : "corresponding input reference image"
      return buildWorkflowImagePromptReferenceTokens(reference).map((token) => `- ${token}: ${label}`)
    })
    .flat()
    .filter((value): value is string => Boolean(value))

  if (lines.length === 0) return ""

  return input.locale === "zh"
    ? `图片引用:\n当提示词里出现以下 token 时，请将其视为对应的输入图片。\n${lines.join("\n")}`
    : `Image references:\nWhen the prompt uses the tokens below, treat them as the corresponding input images.\n${lines.join("\n")}`
}

const CHINESE_INPUT_IMAGE_POSITION_LABELS = [
  "第一张输入图",
  "第二张输入图",
  "第三张输入图",
  "第四张输入图",
  "第五张输入图",
  "第六张输入图",
  "第七张输入图",
  "第八张输入图",
  "第九张输入图",
  "第十张输入图",
] as const

const ENGLISH_INPUT_IMAGE_POSITION_LABELS = [
  "the first input image",
  "the second input image",
  "the third input image",
  "the fourth input image",
  "the fifth input image",
  "the sixth input image",
  "the seventh input image",
  "the eighth input image",
  "the ninth input image",
  "the tenth input image",
] as const

function getWorkflowInputImagePositionLabel(index: number, locale: WorkflowLocale) {
  if (locale === "zh") {
    return CHINESE_INPUT_IMAGE_POSITION_LABELS[index] || `第${index + 1}张输入图`
  }

  return ENGLISH_INPUT_IMAGE_POSITION_LABELS[index] || `input image ${index + 1}`
}

export function resolveWorkflowImagePromptRuntimeReferences(input: {
  prompt: string | null | undefined
  references: unknown
  inputImages: WorkflowMediaRef[]
  locale?: WorkflowLocale
}) {
  const prompt = typeof input.prompt === "string" ? input.prompt : ""
  if (!prompt) {
    return {
      prompt: "",
      referenceUrls: [] as string[],
    }
  }

  let nextPrompt = prompt
  const matchedUrls: string[] = []
  const references = parseWorkflowImagePromptReferences(input.references)
  const locale = input.locale === "zh" ? "zh" : "en"
  const imagesBySourceNodeKey = new Map(
    input.inputImages
      .filter((image) => typeof image.sourceNodeKey === "string" && image.sourceNodeKey.trim())
      .map((image, index) => [image.sourceNodeKey!.trim(), { image, index }] as const),
  )

  for (const [index, reference] of references.entries()) {
    const matchedImage = imagesBySourceNodeKey.get(reference.sourceNodeKey.trim())
    const image = matchedImage?.image ?? input.inputImages[index]
    if (!image) continue
    const url = image.url?.trim() || ""
    const promptLabel = getWorkflowInputImagePositionLabel(matchedImage?.index ?? index, locale)

    const aliases = [reference.alias.trim(), reference.sourceNodeKey.trim()].filter(Boolean)
    let matched = false

    for (const alias of aliases) {
      const tokenPattern = new RegExp(`\\{\\{\\s*${escapeRegExp(alias)}\\s*\\}\\}`, "g")
      if (!tokenPattern.test(nextPrompt)) continue
      matched = true
      nextPrompt = nextPrompt.replace(tokenPattern, promptLabel)
    }

    if (matched && isEmbeddableWorkflowImagePromptUrl(url)) {
      matchedUrls.push(url)
    }
  }

  return {
    prompt: nextPrompt,
    referenceUrls: [...new Set(matchedUrls)],
  }
}
