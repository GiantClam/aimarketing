import {
  getPptPreviewTemplateLabel,
  type PptLanguage,
  type PptPreviewDeck,
  type PptPreviewVariant,
} from "@/lib/lead-tools/ppt-preview-data-fixed"

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function stripStructuredBrief(value: string) {
  const structuredBriefIndex = value.indexOf("Structured brief:")
  if (structuredBriefIndex >= 0) {
    return value.slice(0, structuredBriefIndex).trim()
  }
  return value
}

function stripChineseIntroPreamble(value: string) {
  const match = value.match(/主题是[“"]([^”"]+)[”"]/u)
  if (match?.[1]?.trim()) {
    return match[1].trim()
  }
  return value
}

export function resolvePptPreviewDisplayTitle(title: string | null | undefined, language: PptLanguage) {
  const normalized = normalizeWhitespace(title || "")
  if (!normalized) {
    return language === "zh-CN" ? "PPT 预览" : "PPT preview"
  }

  const withoutBrief = normalizeWhitespace(stripStructuredBrief(normalized))
  const withoutPreamble =
    language === "zh-CN" ? normalizeWhitespace(stripChineseIntroPreamble(withoutBrief)) : withoutBrief

  if (withoutPreamble.length <= 72) {
    return withoutPreamble
  }

  return `${withoutPreamble.slice(0, 69).trimEnd()}...`
}

export function resolvePptPreviewVariantDisplayLabel(
  deck: Pick<PptPreviewDeck, "language"> | null | undefined,
  variant: Pick<PptPreviewVariant, "templateId" | "name" | "key"> | null | undefined,
) {
  if (!variant) return null

  const language = deck?.language || "zh-CN"
  const templateLabel = variant.templateId
    ? getPptPreviewTemplateLabel(variant.templateId, language)
    : null
  const styleLabel = typeof variant.name === "string" ? variant.name.trim() : ""

  if (templateLabel && styleLabel && templateLabel !== styleLabel) {
    return `${templateLabel} / ${styleLabel}`
  }

  if (templateLabel) return templateLabel
  if (styleLabel) return styleLabel
  return variant.key || null
}
