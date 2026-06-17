import {
  getPptPreviewTemplateCapability,
  type PptPreviewDeck,
  type PptPreviewVariant,
} from "@/lib/lead-tools/ppt-preview-data-fixed"

type PptExportDeckLike = Pick<PptPreviewDeck, "title" | "pageCount" | "resolvedPageCount">
type PptExportVariantLike = Pick<PptPreviewVariant, "key" | "styleKey" | "templateId" | "narrativeAngle"> & {
  slides: ArrayLike<unknown>
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-+|-+$)/g, "")
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
  const title = slugify(deck.title || "deck") || "deck"
  const requestedPageCount = deck.resolvedPageCount ?? deck.pageCount ?? variant.slides.length
  const resolvedPageCount = Math.max(4, Math.min(20, requestedPageCount || 9))
  const template = resolveTemplateSegment(variant)
  const narrative = resolveNarrativeSegment(variant)

  return [title, `${resolvedPageCount}p`, template, narrative].filter(Boolean).join("-")
}

export function buildPptExportFileName(
  deck: PptExportDeckLike,
  variant: PptExportVariantLike,
  extension: "html" | "pptx",
) {
  return `${buildPptExportBaseName(deck, variant)}.${extension}`
}
