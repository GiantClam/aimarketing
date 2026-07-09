import type {
  PptLanguage,
  PptPreviewResearchBrief,
  PptPreviewRuntimeValue,
  PptPreviewTemplateMode,
  PptScenario,
} from "@/lib/lead-tools/ppt-preview-data-fixed"
import { buildPptRecommendedTemplateSummaries } from "@/lib/lead-tools/ppt-preview-data-fixed"
import { buildPptMasterRecommendedTemplateSummaries } from "@/lib/lead-tools/ppt-worker-capabilities"

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
  const request = {
    prompt: input.prompt,
    researchBrief: input.researchBrief,
    scenario: input.scenario,
    language: input.language,
    pageCount: input.pageCount,
  }
  const selectorOptions = input.allowedTemplateIds?.length
    ? {
        allowedTemplateIds: input.allowedTemplateIds,
      }
    : undefined
  const recommendedTemplates =
    input.previewRuntime === "ppt-master-agent"
      ? buildPptMasterRecommendedTemplateSummaries(request, selectorOptions)
      : buildPptRecommendedTemplateSummaries(request, selectorOptions)

  const explicitTemplateId = normalizeOptionalString(input.templateId)
  const shouldDefaultToSingleTemplate = input.preferSingleTemplate
  const selectedTemplateId =
    explicitTemplateId ||
    (shouldDefaultToSingleTemplate ? normalizeOptionalString(recommendedTemplates[0]?.templateId) : null)

  return {
    recommendedTemplates,
    selectedTemplateId,
    templateMode: selectedTemplateId ? ("single-template" as const) : (input.templateMode ?? "auto-4"),
  }
}
