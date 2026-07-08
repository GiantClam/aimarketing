import type {
  PptLanguage,
  PptPreviewResearchBrief,
  PptPreviewRuntimeValue,
  PptPreviewTemplateMode,
  PptScenario,
} from "@/lib/lead-tools/ppt-preview-data-fixed"
import { buildPptRecommendedTemplateSummaries } from "@/lib/lead-tools/ppt-preview-data-fixed"

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
  const recommendedTemplates = buildPptRecommendedTemplateSummaries(
    {
      prompt: input.prompt,
      researchBrief: input.researchBrief,
      scenario: input.scenario,
      language: input.language,
      pageCount: input.pageCount,
    },
    input.allowedTemplateIds?.length
      ? {
          allowedTemplateIds: input.allowedTemplateIds,
        }
      : undefined,
  )

  const explicitTemplateId = normalizeOptionalString(input.templateId)
  const shouldDefaultToSingleTemplate =
    input.preferSingleTemplate || input.previewRuntime === "ppt-master-agent"
  const selectedTemplateId =
    explicitTemplateId ||
    (shouldDefaultToSingleTemplate ? normalizeOptionalString(recommendedTemplates[0]?.templateId) : null)

  return {
    recommendedTemplates,
    selectedTemplateId,
    templateMode: selectedTemplateId ? ("single-template" as const) : (input.templateMode ?? "auto-4"),
  }
}
