import type {
  PptLanguage,
  PptPreviewResearchBrief,
  PptPreviewRuntimeValue,
  PptPreviewTemplateMode,
  PptScenario,
} from "@/lib/lead-tools/ppt-preview-data-fixed"

type ResolvePptTemplateSelectionInput = {
  prompt: string
  researchBrief?: string | PptPreviewResearchBrief
  scenario: PptScenario
  language: PptLanguage
  pageCount?: number
  templateMode?: PptPreviewTemplateMode
  templateId?: string | null
  previewRuntime?: PptPreviewRuntimeValue | null
  preferSingleTemplate?: boolean
  allowedTemplateIds?: readonly string[]
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function resolvePptTemplateSelection(input: ResolvePptTemplateSelectionInput) {
  const explicitTemplateId = normalizeOptionalString(input.templateId)
  const selectedTemplateId = explicitTemplateId

  return {
    recommendedTemplates: [],
    selectedTemplateId,
    templateMode: selectedTemplateId ? ("single-template" as const) : (input.templateMode ?? "auto-4"),
  }
}
