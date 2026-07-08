import {
  getPptPreviewTemplateCapability,
  type PptPreviewDeck,
  type PptPreviewVariant,
} from "@/lib/lead-tools/ppt-preview-data-fixed"

type PptExportDeckLike = Pick<PptPreviewDeck, "title" | "pageCount" | "resolvedPageCount">
type PptExportVariantLike = Pick<PptPreviewVariant, "key" | "styleKey" | "templateId" | "narrativeAngle"> & {
  slides: ArrayLike<unknown>
}

const MAX_BASE_NAME_LENGTH = 64
const MAX_TITLE_SEGMENT_LENGTH = 36
const MAX_TEMPLATE_SEGMENT_LENGTH = 18
const MAX_NARRATIVE_SEGMENT_LENGTH = 18

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-+|-+$)/g, "")
}

function truncateSegment(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  return value.slice(0, maxLength).replace(/-+$/g, "") || value.slice(0, maxLength)
}

function joinSegments(segments: Array<string | null | undefined>) {
  return segments.filter((segment): segment is string => Boolean(segment)).join("-")
}

function resolveTemplateSegment(variant: Pick<PptExportVariantLike, "templateId" | "styleKey" | "key">) {
  if (variant.templateId) {
    return slugify(variant.templateId)
  }

  try {
    return slugify(getPptPreviewTemplateCapability(variant.styleKey).templateId)
  } catch {
    return slugify(variant.key || "template")
  }
}

function resolveNarrativeSegment(variant: Pick<PptExportVariantLike, "narrativeAngle">) {
  if (!variant.narrativeAngle) return null
  return slugify(variant.narrativeAngle)
}

export function buildPptExportBaseName(deck: PptExportDeckLike, variant: PptExportVariantLike) {
  const title = truncateSegment(slugify(deck.title || "deck") || "deck", MAX_TITLE_SEGMENT_LENGTH)
  const requestedPageCount = deck.resolvedPageCount ?? deck.pageCount ?? variant.slides.length
  const resolvedPageCount = Math.max(4, Math.min(20, requestedPageCount || 9))
  const template = truncateSegment(resolveTemplateSegment(variant), MAX_TEMPLATE_SEGMENT_LENGTH)
  const narrative = truncateSegment(resolveNarrativeSegment(variant) || "", MAX_NARRATIVE_SEGMENT_LENGTH) || null

  let baseName = joinSegments([title, `${resolvedPageCount}p`, template, narrative])
  if (baseName.length <= MAX_BASE_NAME_LENGTH) {
    return baseName
  }

  baseName = joinSegments([title, `${resolvedPageCount}p`, template])
  if (baseName.length <= MAX_BASE_NAME_LENGTH) {
    return baseName
  }

  const fixedSuffix = joinSegments([`${resolvedPageCount}p`, template])
  const remainingTitleLength = Math.max(12, MAX_BASE_NAME_LENGTH - fixedSuffix.length - 1)
  baseName = joinSegments([truncateSegment(title, remainingTitleLength), fixedSuffix])

  return truncateSegment(baseName, MAX_BASE_NAME_LENGTH) || "deck"
}

export function buildPptExportFileName(
  deck: PptExportDeckLike,
  variant: PptExportVariantLike,
  extension: "html" | "pptx",
) {
  return `${buildPptExportBaseName(deck, variant)}.${extension}`
}
