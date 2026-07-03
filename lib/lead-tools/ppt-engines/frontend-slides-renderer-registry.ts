import type {
  PptPreviewDeck,
  PptPreviewStyleArchetype,
  PptPreviewStyleKey,
  PptPreviewVariant,
} from "@/lib/lead-tools/ppt-preview-data-fixed"
import { resolvePptPreviewStyleArchetype } from "@/lib/lead-tools/ppt-preview-data-fixed"

export type FrontendSlidesRenderer = (deck: PptPreviewDeck, variant: PptPreviewVariant) => string

type RenderFrontendSlidesVariantParams = {
  deck: PptPreviewDeck
  variant: PptPreviewVariant
  customRenderers: Partial<Record<PptPreviewStyleKey, FrontendSlidesRenderer>>
  archetypeRenderers: Record<PptPreviewStyleArchetype, FrontendSlidesRenderer>
}

export function getFrontendSlidesRendererKeys(
  registry: Partial<Record<PptPreviewStyleKey, FrontendSlidesRenderer>>,
): PptPreviewStyleKey[] {
  return Object.keys(registry) as PptPreviewStyleKey[]
}

export function renderFrontendSlidesVariant({
  deck,
  variant,
  customRenderers,
  archetypeRenderers,
}: RenderFrontendSlidesVariantParams) {
  const renderer = customRenderers[variant.styleKey]
  if (renderer) {
    return renderer(deck, variant)
  }

  const archetype = resolvePptPreviewStyleArchetype(variant.styleKey)
  return archetypeRenderers[archetype](deck, variant)
}
