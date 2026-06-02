import type { PptPreviewDeck } from "@/lib/lead-tools/ppt-preview-data-fixed"

export type LeadToolPptPreviewRuntimeId = "ppt-master-agent" | "frontend-slides-agent"
export type LeadToolPptExportRuntimeId = "ppt-master-agent"
export type LeadToolPptPreviewRenderKind = "svg" | "html"

export interface LeadToolPptPreviewRuntime {
  id: LeadToolPptPreviewRuntimeId
  renderKind: LeadToolPptPreviewRenderKind
  materializeStoryDeck(deck: PptPreviewDeck): Promise<PptPreviewDeck>
}
