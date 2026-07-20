import "server-only"

import { tool, type ToolSet } from "ai"
import { z } from "zod"

import type { AuthUser } from "@/lib/auth/session"
import { buildPptExportFileName } from "@/lib/lead-tools/ppt-export-file-name"
import {
  buildPptBriefConfirmationMessage,
  createPptBriefState,
  preparePptPreviewInput,
  type PptBriefState,
} from "@/lib/ai-entry/ppt-brief"
import { buildPptTemplateRecommendationMessage } from "@/lib/ai-entry/ppt-tool-result-message"
import { getLeadToolPptExecutionTransport } from "@/lib/lead-tools/config"
import type {
  PptPreviewDeck,
  PptPreviewResearchBrief,
  PptPreviewRuntimeValue,
  PptPreviewVariant,
} from "@/lib/lead-tools/ppt-preview-data-fixed"
import {
  buildPptRecommendedTemplateSummaries,
  isKnownPptFrontendTemplateId,
} from "@/lib/lead-tools/ppt-preview-data-fixed"
import {
  getPptMasterTemplateCatalog,
  getPptWorkerSupportedTemplateIds,
  isPptMasterLibraryTemplateSupported,
  isPptWorkerTemplateSupported,
} from "@/lib/lead-tools/ppt-worker-capabilities"
import type {
  LeadToolPptDownloadResponse,
  LeadToolPptPreviewResponse,
} from "@/lib/lead-tools/ppt-engines/types"
import { getPptPreviewSessionDeck } from "@/lib/lead-tools/ppt-preview-session-store"
import { buildLeadToolDownload, buildLeadToolPreview } from "@/lib/lead-tools/runtime"

const PPTX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
const HTML_MIME_TYPE_PREFIX = "text/html"

const pptScenarioSchema = z.enum([
  "marketing-campaign",
  "product-launch",
  "sales-deck",
  "training",
])

const pptLanguageSchema = z.enum(["zh-CN", "en-US"])

const pptTemplateModeSchema = z.enum(["auto-4", "single-template"])

const DEFAULT_SINGLE_TEMPLATE_NARRATIVE_ANGLE = "executive-brief" as const

const editablePptTemplateIdSchema = z
  .string()
  .trim()
  .refine(isPptMasterLibraryTemplateSupported, "Unknown editable PPT template")

const presentationPptTemplateIdSchema = z
  .string()
  .trim()
  .refine(isKnownPptFrontendTemplateId, "Unknown presentation PPT template")

const genericPptTemplateIdSchema = z
  .string()
  .trim()
  .refine(isPptWorkerTemplateSupported, "Unknown PPT template")

const updatePptBriefInputSchema = z.object({
  topic: z.string().trim().min(1).optional().describe("Complete presentation topic after applying the user's change."),
  audience: z.string().trim().min(1).optional().describe("Complete target audience after applying the user's change."),
  goal: z.string().trim().min(1).optional().describe("Complete presentation goal after applying the user's change."),
  scenario: pptScenarioSchema.optional(),
  language: pptLanguageSchema.optional(),
  pageCount: z.number().int().min(4).max(20).nullable().optional(),
  tone: z.string().trim().min(1).nullable().optional(),
  mustInclude: z.array(z.string().trim().min(1)).max(12).optional(),
})

const recommendPptTemplatesInputSchema = z.object({
  templateIds: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(1)
    .describe("Exactly one exact template id from the complete ppt-master catalog in the system prompt."),
})

const editablePreviewPptDeckInputSchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(1)
      .describe("The complete deck brief, including topic, audience, goal, tone, and any must-include points."),
    sourcePrompt: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Internal canonical user request used for research-gate checks when the tool prompt has been expanded by orchestration."),
    audience: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Target audience for the deck. Required before preview when the user asks for a generated PPT."),
    goal: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Presentation goal such as executive review, client proposal, fundraising pitch, or training."),
    researchBrief: z
      .union([
        z.string().trim().min(1),
        z.object({
          topic: z.string().trim().min(1),
          keyFacts: z.array(z.string().trim().min(1)).min(1),
          numericEvidence: z.array(z.string().trim().min(1)).optional(),
          risks: z.array(z.string().trim().min(1)).optional(),
          implications: z.array(z.string().trim().min(1)).optional(),
          sourceNotes: z.array(z.string().trim().min(1)).optional(),
          rawSummary: z.string().trim().min(1).optional(),
        }),
      ])
      .optional()
      .describe("Optional research grounding synthesized from web_search results. Use a structured object when available for fact-based, current-event, market, company, or policy decks."),
    scenario: pptScenarioSchema
      .optional()
      .describe("Best-fit business scenario for the deck."),
    language: pptLanguageSchema
      .optional()
      .describe("Deck language. Use zh-CN for Chinese or en-US for English."),
    templateId: editablePptTemplateIdSchema
      .optional()
      .describe("Exact editable PPT template id from the ppt-master library selected by the model from the catalog. Omit until a recommendation has been confirmed."),
    pageCount: z
      .number()
      .int()
      .min(4)
      .max(20)
      .optional()
      .describe("Optional requested slide count."),
    model: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Optional content-planning model override. Defaults to the user's selected chat model when available."),
    preferredProviderId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Optional provider hint for content planning and ppt-master session materialization."),
    runtimeSlideModel: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Optional ppt-master rendering model override. This controls the slide SVG rendering layer, not the content-planning layer."),
    runtimeSlideProvider: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Optional ppt-master rendering provider override. This controls the slide SVG rendering layer, with environment variables used only as fallback."),
    tone: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Tone or style direction for the deck."),
    mustInclude: z
      .array(z.string().trim().min(1))
      .max(12)
      .optional()
      .describe("Must-include sections, facts, or messages that need to appear in the deck."),
  })

const presentationPreviewPptDeckInputSchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(1)
      .describe("The complete presentation brief, including topic, audience, speaking goal, pacing, and stage direction."),
    sourcePrompt: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Internal canonical user request used for research-gate checks when the tool prompt has been expanded by orchestration."),
    audience: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Target audience for the live presentation."),
    goal: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Speaking goal such as launch keynote, proposal pitch, or training talk."),
    researchBrief: z
      .union([
        z.string().trim().min(1),
        z.object({
          topic: z.string().trim().min(1),
          keyFacts: z.array(z.string().trim().min(1)).min(1),
          numericEvidence: z.array(z.string().trim().min(1)).optional(),
          risks: z.array(z.string().trim().min(1)).optional(),
          implications: z.array(z.string().trim().min(1)).optional(),
          sourceNotes: z.array(z.string().trim().min(1)).optional(),
          rawSummary: z.string().trim().min(1).optional(),
        }),
      ])
      .optional()
      .describe("Optional research grounding synthesized from web_search results."),
    scenario: pptScenarioSchema
      .optional()
      .describe("Best-fit presentation scenario."),
    language: pptLanguageSchema
      .optional()
      .describe("Deck language. Use zh-CN for Chinese or en-US for English."),
    templateMode: pptTemplateModeSchema
      .optional()
      .describe("Use auto-4 to compare multiple presentation directions, or single-template to lock one frontend-slides template."),
    templateId: presentationPptTemplateIdSchema
      .optional()
      .describe("Optional frontend-slides template id for a single presentation direction."),
    pageCount: z
      .number()
      .int()
      .min(4)
      .max(20)
      .optional()
      .describe("Optional requested slide count."),
    tone: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Presentation tone or stage style direction."),
    mustInclude: z
      .array(z.string().trim().min(1))
      .max(12)
      .optional()
      .describe("Must-include story beats, sections, or messages."),
  })
  .superRefine((value, context) => {
    if (value.templateMode === "single-template" && !value.templateId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "templateId is required when templateMode is single-template",
        path: ["templateId"],
      })
    }
  })

const genericPreviewPptDeckInputSchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(1)
      .describe("The complete deck brief, including topic, audience, goal, tone, and any must-include points."),
    sourcePrompt: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Internal canonical user request used for research-gate checks when the tool prompt has been expanded by orchestration."),
    audience: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Target audience for the deck. Required before preview when the user asks for a generated PPT."),
    goal: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Presentation goal such as executive review, client proposal, fundraising pitch, or training."),
    researchBrief: z
      .union([
        z.string().trim().min(1),
        z.object({
          topic: z.string().trim().min(1),
          keyFacts: z.array(z.string().trim().min(1)).min(1),
          numericEvidence: z.array(z.string().trim().min(1)).optional(),
          risks: z.array(z.string().trim().min(1)).optional(),
          implications: z.array(z.string().trim().min(1)).optional(),
          sourceNotes: z.array(z.string().trim().min(1)).optional(),
          rawSummary: z.string().trim().min(1).optional(),
        }),
      ])
      .optional()
      .describe("Optional research grounding synthesized from web_search results."),
    scenario: pptScenarioSchema
      .optional()
      .describe("Best-fit business scenario for the deck."),
    language: pptLanguageSchema
      .optional()
      .describe("Deck language. Use zh-CN for Chinese or en-US for English."),
    templateMode: pptTemplateModeSchema
      .optional()
      .describe("Use auto-4 to compare multiple directions, or single-template when the user wants one template family."),
    templateId: genericPptTemplateIdSchema
      .optional()
      .describe("Required only when templateMode is single-template."),
    pageCount: z
      .number()
      .int()
      .min(4)
      .max(20)
      .optional()
      .describe("Optional requested slide count."),
    tone: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Tone or style direction for the deck."),
    mustInclude: z
      .array(z.string().trim().min(1))
      .max(12)
      .optional()
      .describe("Must-include sections, facts, or messages that need to appear in the deck."),
  })
  .superRefine((value, context) => {
    if (value.templateMode === "single-template" && !value.templateId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "templateId is required when templateMode is single-template",
        path: ["templateId"],
      })
    }
  })

const exportPptDeckInputSchema = z.object({
  previewSessionId: z
    .string()
    .trim()
    .min(1)
    .describe("Preview session returned by preview_ppt_deck."),
  selectedVariantKey: z
    .string()
    .trim()
    .optional()
    .describe("Variant key chosen from preview_ppt_deck. If omitted, the latest recommended variant is exported when available."),
})

type EditablePreviewPptDeckInput = z.infer<typeof editablePreviewPptDeckInputSchema>
type PresentationPreviewPptDeckInput = z.infer<typeof presentationPreviewPptDeckInputSchema>
type GenericPreviewPptDeckInput = z.infer<typeof genericPreviewPptDeckInputSchema>
type ExportPptDeckInput = z.infer<typeof exportPptDeckInputSchema>

function resolveDefaultPreviewRuntime(agentId: string | null | undefined): PptPreviewRuntimeValue | undefined {
  if (agentId === "executive-ppt") return "ppt-master-agent"
  if (agentId === "executive-presentation-ppt") return "frontend-slides-agent"
  return undefined
}

type PptToolFlow = "editable" | "presentation" | "generic"

function resolvePptToolFlow(agentId: string | null | undefined): PptToolFlow {
  if (agentId === "executive-ppt") return "editable"
  if (agentId === "executive-presentation-ppt") return "presentation"
  return "generic"
}

function buildArtifactDownloadUrl(artifactId: number, download = false) {
  return `/api/platform/artifacts/${artifactId}/download${download ? "?download=1" : ""}`
}

function summarizeVariant(variant: PptPreviewVariant) {
  return {
    key: variant.key,
    name: variant.name,
    summary: variant.summary,
    styleKey: variant.styleKey,
    templateId: variant.templateId ?? null,
    narrativeAngle: variant.narrativeAngle ?? null,
    slideCount: variant.slides.length,
    coverTitle: variant.slides[0]?.title ?? null,
  }
}

function summarizeDeck(deck: PptPreviewDeck) {
  return {
    title: deck.title,
    scenario: deck.scenario,
    language: deck.language,
    pageCount: deck.pageCount ?? null,
    resolvedPageCount: deck.resolvedPageCount ?? null,
    variants: deck.variants.map(summarizeVariant),
  }
}

function buildValidationResult(
  checks: Array<{
    code: string
    ok: boolean
    message: string
  }>,
) {
  return {
    ok: checks.every((check) => check.ok),
    checks,
  }
}

function normalizePptToolError(error: unknown) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : typeof error === "string" && error.trim()
        ? error.trim()
        : "ppt_tool_failed"

  const withRawMessage = <T extends { code: string; message: string }>(value: T) =>
    value.message === message
      ? value
      : {
          ...value,
          rawMessage: message,
        }

  if (
    /ppt_master_repo_missing|ppt_master_script_failed|ppt_master_python_missing|ppt_master_runtime_unavailable/iu.test(
      message,
    )
  ) {
    return withRawMessage({
      code: "ppt_master_runtime_unavailable",
      message: "PPT runtime is currently unavailable. Please try again later.",
    })
  }

  if (
    /ppt_master_quality_check_failed|ppt_master_runtime_slide_quality_check_failed|ppt_master_runtime_slide_validation_failed|xml\.etree\.elementtree\.parseerror|invalid xml:/iu.test(
      message,
    )
  ) {
    return withRawMessage({
      code: "ppt_master_quality_check_failed",
      message:
        "Generated editable PPT slides did not pass ppt-master integrity checks. The deck must be regenerated before preview or export can continue.",
    })
  }

  if (/ppt_variant_not_found|selected variant not found/iu.test(message)) {
    const variantKey = message.includes(":") ? message.split(":").slice(1).join(":") : null
    return withRawMessage({
      code: "ppt_variant_not_found",
      message: variantKey
        ? `Selected variant "${variantKey}" was not found. Use a variant key returned by preview_ppt_deck.`
        : "Selected variant was not found. Use a variant key returned by preview_ppt_deck.",
    })
  }

  if (/missing_preview_session/iu.test(message)) {
    const sessionId = message.includes(":") ? message.split(":").slice(1).join(":") : null
    return withRawMessage({
      code: "missing_preview_session",
      message: sessionId
        ? `Preview session "${sessionId}" is no longer available. Generate the PPT preview again before export.`
        : "Preview session is no longer available. Generate the PPT preview again before export.",
    })
  }

  if (/ppt_template_selection_required/iu.test(message)) {
    return withRawMessage({
      code: "ppt_template_selection_required",
      message: "Select an exact templateId from the latest editable ppt-master template recommendation before preview.",
    })
  }

  if (/ppt_research_brief_required/iu.test(message)) {
    return withRawMessage({
      code: "ppt_research_brief_required",
      message:
        "This PPT request needs fresh factual grounding before preview. Call web_search first, then provide the researchBrief to preview_ppt_deck.",
    })
  }

  const unsupportedTemplateMatch = message.match(/ppt_worker_template_unsupported:([^\s]+)/iu)
  if (unsupportedTemplateMatch?.[1]) {
    const templateId = unsupportedTemplateMatch[1].trim()
    return {
      code: "ppt_worker_template_unsupported",
      message: `The current editable PPT worker does not support template "${templateId}". Choose one of: ${getPptWorkerSupportedTemplateIds().join(", ")}.`,
    }
  }

  const unsupportedEditableTemplateMatch = message.match(/ppt_editable_template_unsupported:([^\s]+)/iu)
  if (unsupportedEditableTemplateMatch?.[1]) {
    const templateId = unsupportedEditableTemplateMatch[1].trim()
    return {
      code: "ppt_editable_template_unsupported",
      message: `The editable PPT assistant only supports ppt-master templates. Template "${templateId}" is not in the editable template library.`,
    }
  }

  const unsupportedPresentationTemplateMatch = message.match(/ppt_presentation_template_unsupported:([^\s]+)/iu)
  if (unsupportedPresentationTemplateMatch?.[1]) {
    const templateId = unsupportedPresentationTemplateMatch[1].trim()
    return {
      code: "ppt_presentation_template_unsupported",
      message: `The presentation PPT assistant only supports frontend-slides templates. Template "${templateId}" is not in the presentation template library.`,
    }
  }

  const exportRuntimeMismatchMatch = message.match(/ppt_export_runtime_mismatch:(pptx|html):([^:\s]+)/iu)
  if (exportRuntimeMismatchMatch?.[1] && exportRuntimeMismatchMatch?.[2]) {
    const expectedKind = exportRuntimeMismatchMatch[1].toLowerCase()
    const actualEngine = exportRuntimeMismatchMatch[2].trim()
    return {
      code: "ppt_export_runtime_mismatch",
      message:
        expectedKind === "pptx"
          ? `This assistant only exports editable PPTX decks, but the current preview session belongs to "${actualEngine}". Regenerate the deck with the editable PPT assistant first.`
          : `This assistant only exports presentation HTML decks, but the current preview session belongs to "${actualEngine}". Regenerate the deck with the presentation PPT assistant first.`,
    }
  }

  if (
    /your account quota is insufficient|insufficient_quota|provider_quota_exceeded|quota exceeded|please recharge/iu.test(
      message,
    )
  ) {
    return withRawMessage({
      code: "upstream_provider_quota_exceeded",
      message:
        "The upstream PPT model or remote worker account is out of quota. This is separate from workspace credits. Check the provider or PPT worker account before retrying.",
    })
  }

  const unknownModelMatch = message.match(/unknown model ['"]?([^'"]+)['"]?/iu)
  if (unknownModelMatch?.[1]) {
    return withRawMessage({
      code: "ppt_runtime_model_unsupported",
      message: `The current PPT runtime does not support model "${unknownModelMatch[1].trim()}". Switch to MiniMax-M3, MiniMax-M2.7-highspeed, or step-3.7-flash.`,
    })
  }

  return {
    code: "ppt_tool_failed",
    message,
  }
}

function isNonEmptyBuffer(value: unknown) {
  return value instanceof Uint8Array ? value.byteLength > 0 : false
}

function selectDeckVariant(deck: PptPreviewDeck, selectedVariantKey?: string | null) {
  const normalized = typeof selectedVariantKey === "string" ? selectedVariantKey.trim() : ""
  if (normalized) {
    const matched = deck.variants.find((variant) => variant.key === normalized)
    if (!matched) {
      throw new Error(`ppt_variant_not_found:${normalized}`)
    }
    return matched
  }

  const fallback = deck.variants[0]
  if (!fallback) {
    throw new Error("ppt_variant_not_found:first")
  }
  return fallback
}

function shouldLimitTemplatesToRemotePptWorker(defaultPreviewRuntime: PptPreviewRuntimeValue | undefined) {
  return defaultPreviewRuntime === "ppt-master-agent" && getLeadToolPptExecutionTransport() === "remote-worker"
}

function resolveEditableTemplateSelection(input: {
  templateId?: string | null
  limitTemplatesToRemoteWorker: boolean
}) {
  const explicitTemplateId = typeof input.templateId === "string" && input.templateId.trim() ? input.templateId.trim() : null
  if (!explicitTemplateId) {
    throw new Error("ppt_template_selection_required")
  }
  if (explicitTemplateId && !isPptMasterLibraryTemplateSupported(explicitTemplateId)) {
    throw new Error(`ppt_editable_template_unsupported:${explicitTemplateId}`)
  }
  if (input.limitTemplatesToRemoteWorker && !isPptWorkerTemplateSupported(explicitTemplateId)) {
    throw new Error(`ppt_worker_template_unsupported:${explicitTemplateId}`)
  }

  const template = getPptMasterTemplateCatalog().find((item) => item.id === explicitTemplateId)
  const recommendedTemplates = template
    ? [{
        rank: 1,
        templateId: template.id,
        templateLabel: template.label,
        styleName: template.tone || template.themeMode || null,
      }]
    : []

  // Editable decks are always materialized from one vendor ppt-master template.
  return {
    recommendedTemplates,
    selectedTemplateId: explicitTemplateId,
    templateMode: "single-template" as const,
  }
}

function resolvePresentationTemplateSelection(input: {
  prompt: string
  researchBrief?: string | PptPreviewResearchBrief
  scenario: "marketing-campaign" | "product-launch" | "sales-deck" | "training"
  language: "zh-CN" | "en-US"
  pageCount?: number
  templateMode?: "auto-4" | "single-template"
  templateId?: string | null
}) {
  const recommendedTemplates = buildPptRecommendedTemplateSummaries({
    prompt: input.prompt,
    researchBrief: input.researchBrief,
    scenario: input.scenario,
    language: input.language,
    pageCount: input.pageCount,
  })
  const explicitTemplateId = typeof input.templateId === "string" && input.templateId.trim() ? input.templateId.trim() : null
  if (explicitTemplateId && !isKnownPptFrontendTemplateId(explicitTemplateId)) {
    throw new Error(`ppt_presentation_template_unsupported:${explicitTemplateId}`)
  }
  const selectedTemplateId = explicitTemplateId || undefined
  const templateMode = selectedTemplateId ? ("single-template" as const) : (input.templateMode ?? "auto-4")
  return {
    recommendedTemplates,
    selectedTemplateId,
    templateMode,
  }
}

export async function exportAiEntryPptDeckArtifact(input: {
  currentUser: AuthUser
  previewSessionId: string
  selectedVariantKey?: string | null
  expectedArtifactKind?: "pptx" | "html" | null
}): Promise<Record<string, unknown>> {
  const { currentUser, previewSessionId, selectedVariantKey, expectedArtifactKind = null } = input
  try {
    const deck = await getPptPreviewSessionDeck(previewSessionId)
    const actualArtifactKind = deck.previewEngine === "frontend-slides-html" ? "html" : "pptx"
    if (expectedArtifactKind && actualArtifactKind !== expectedArtifactKind) {
      throw new Error(`ppt_export_runtime_mismatch:${expectedArtifactKind}:${deck.previewEngine}`)
    }
    const selectedVariant = selectDeckVariant(deck, selectedVariantKey)
    const result = (await buildLeadToolDownload(
      "ai-ppt-preview",
      {
        deck,
        selectedVariantKey: selectedVariant.key,
        previewSessionId,
      },
      currentUser,
    )) as LeadToolPptDownloadResponse & {
      meta?: {
        platformRunId?: number
        platformArtifactId?: number
        platformWorkItemId?: number
      }
    }

    const artifactId =
      typeof result.meta?.platformArtifactId === "number"
        ? result.meta.platformArtifactId
        : null
    const workItemId =
      typeof result.meta?.platformWorkItemId === "number"
        ? result.meta.platformWorkItemId
        : null
    const toolRunId =
      typeof result.meta?.platformRunId === "number"
        ? result.meta.platformRunId
        : null
    const fileName =
      result.artifact?.fileName ||
      buildPptExportFileName(
        result.deck,
        result.variant,
        result.deck.previewEngine === "frontend-slides-html" ? "html" : "pptx",
      )
    const contentType = result.artifact?.contentType || null
    const expectsHtmlArtifact = result.deck.previewEngine === "frontend-slides-html"
    const artifactKind = expectsHtmlArtifact ? "html" : "pptx"
    const resolvedContentType = expectsHtmlArtifact
      ? contentType || "text/html; charset=utf-8"
      : contentType || PPTX_MIME_TYPE
    const validation = buildValidationResult([
      {
        code: "buffer_non_empty",
        ok: isNonEmptyBuffer(result.artifact?.buffer),
        message:
          isNonEmptyBuffer(result.artifact?.buffer)
            ? "Exported artifact buffer is non-empty."
            : "Exported artifact buffer is empty.",
      },
      {
        code: expectsHtmlArtifact ? "file_name_html" : "file_name_pptx",
        ok: expectsHtmlArtifact
          ? fileName.trim().toLowerCase().endsWith(".html")
          : fileName.trim().toLowerCase().endsWith(".pptx"),
        message:
          expectsHtmlArtifact
            ? fileName.trim().toLowerCase().endsWith(".html")
              ? "Exported artifact file name ends with .html."
              : "Exported artifact file name must end with .html."
            : fileName.trim().toLowerCase().endsWith(".pptx")
              ? "Exported artifact file name ends with .pptx."
              : "Exported artifact file name must end with .pptx.",
      },
      {
        code: expectsHtmlArtifact ? "mime_is_html" : "mime_is_pptx",
        ok: expectsHtmlArtifact
          ? typeof contentType === "string" && contentType.toLowerCase().startsWith(HTML_MIME_TYPE_PREFIX)
          : contentType === PPTX_MIME_TYPE,
        message:
          expectsHtmlArtifact
            ? typeof contentType === "string" && contentType.toLowerCase().startsWith(HTML_MIME_TYPE_PREFIX)
              ? "Exported artifact MIME type is HTML."
              : "Exported artifact MIME type must be HTML."
            : contentType === PPTX_MIME_TYPE
              ? "Exported artifact MIME type is PPTX."
              : "Exported artifact MIME type must be PPTX.",
      },
    ])

    if (!validation.ok) {
      return {
        ok: false,
        error: {
          code: "ppt_export_validation_failed",
          message: "Exported PPTX artifact did not pass validation checks.",
        },
        validation,
      }
    }

    return {
      ok: true,
      previewSessionId,
      title: result.deck.title,
      selectedVariantKey: result.variant.key,
      selectedVariantName: result.variant.name,
      selectedVariant: {
        key: result.variant.key,
        name: result.variant.name,
      },
      slideCount:
        result.deck.resolvedPageCount ??
        result.deck.pageCount ??
        result.variant.slides.length,
      fileName,
      contentType: resolvedContentType,
      artifactId,
      workItemId,
      toolRunId,
      workLibraryHref: "/dashboard/works",
      previewUrl: artifactId ? buildArtifactDownloadUrl(artifactId) : null,
      downloadUrl: artifactId
        ? buildArtifactDownloadUrl(artifactId, true)
        : null,
      artifact: {
        kind: artifactKind,
        title: result.deck.title,
        fileName,
        mimeType: resolvedContentType,
        artifactId,
        previewUrl: artifactId ? buildArtifactDownloadUrl(artifactId) : null,
        downloadUrl: artifactId
          ? buildArtifactDownloadUrl(artifactId, true)
          : null,
        workItemId,
        toolRunId,
      },
      validation,
      message: artifactId
        ? "Deck artifact generated and saved to the work library."
        : "Deck artifact generated.",
    }
  } catch (error) {
    const normalizedError = normalizePptToolError(error)
    const deck = await getPptPreviewSessionDeck(previewSessionId).catch(() => null)
    return {
      ok: false,
      error: normalizedError,
      ...(normalizedError.code === "missing_preview_session" ? { previewSessionId } : {}),
      availableVariants: deck ? deck.variants.map(summarizeVariant) : [],
    }
  }
}

export function buildAiEntryPptTools(input: {
  currentUser: AuthUser
  agentId?: string | null
  selectedPreviewModel?: string | null
  selectedPreviewProviderId?: string | null
  briefState?: PptBriefState | null
}): ToolSet {
  const { currentUser } = input
  const toolFlow = resolvePptToolFlow(input.agentId)
  const defaultPreviewRuntime = resolveDefaultPreviewRuntime(input.agentId)
  const previewInputSchema =
    toolFlow === "editable"
      ? editablePreviewPptDeckInputSchema
      : toolFlow === "presentation"
        ? presentationPreviewPptDeckInputSchema
        : genericPreviewPptDeckInputSchema
  const previewDescription =
    toolFlow === "editable"
      ? "Generate an editable PPT preview through ppt-master. Use this when the user wants a downloadable, editable PPTX deck. When a template recommendation context is present, resolve the user's natural-language choice using that context and pass the exact candidate templateId with templateMode=single-template; never use auto-4."
      : toolFlow === "presentation"
        ? "Generate a presentation-first HTML deck through frontend-slides. Use this for live delivery, speaking flow, and stage-ready narrative decks."
        : "Generate a PPT preview deck from a conversation brief. Use this when the user wants a slide deck, PPT, pitch deck, training deck, or presentation draft."
  const recommendTemplatesDescription =
    "Recommend exactly one exact editable ppt-master template id from the complete catalog in the system prompt. Use the complete brief and conversation context to make the semantic recommendation; do not infer by keyword in code. Call this before preview when the user has confirmed the brief but has not selected a template. The editable PPT assistant renders one template and one variant per conversation turn; never return alternatives."
  const exportDescription =
    toolFlow === "editable"
      ? "Export a downloadable editable PPTX artifact from a ppt-master preview session."
      : toolFlow === "presentation"
        ? "Export a downloadable HTML presentation artifact from a frontend-slides preview session."
      : "Export the downloadable deck artifact from a previously generated preview session and selected variant. Use this after preview_ppt_deck when the user wants the actual deliverable file."

  const updateBriefTool = tool<unknown, Record<string, unknown>>({
    description:
      "Update the editable PPT brief after the user changes requirements. Compare the latest user request with the current PPT brief, merge the change into the complete brief, and do not generate a preview on this turn.",
    inputSchema: updatePptBriefInputSchema as any,
    execute: async (rawInput: unknown): Promise<Record<string, unknown>> => {
      if (toolFlow !== "editable") {
        return {
          ok: false,
          error: {
            code: "ppt_brief_update_not_supported",
            message: "Brief updates are only available in the editable PPT assistant.",
          },
        }
      }

      const update = rawInput as z.infer<typeof updatePptBriefInputSchema>
      const current = input.briefState
      const topic = update.topic?.trim() || current?.topic || ""
      const audience = update.audience?.trim() || current?.audience || ""
      const goal = update.goal?.trim() || current?.goal || ""
      const scenario = update.scenario || current?.scenario
      const language = update.language || current?.language

      if (!topic || !audience || !goal || !scenario || !language) {
        return {
          ok: false,
          error: {
            code: "ppt_brief_update_incomplete",
            message: "The merged PPT brief is still incomplete. Keep the existing values and provide the changed fields.",
          },
        }
      }

      const nextBrief = createPptBriefState({
        topic,
        audience,
        goal,
        scenario,
        language,
        pageCount: update.pageCount === undefined ? current?.pageCount : update.pageCount,
        tone: update.tone === undefined ? current?.tone : update.tone,
        mustInclude: update.mustInclude === undefined ? current?.mustInclude : update.mustInclude,
      })

      return {
        ok: true,
        brief: nextBrief,
        message: buildPptBriefConfirmationMessage(nextBrief, nextBrief.language === "zh-CN"),
      }
    },
  })

  return {
    ...(toolFlow === "editable"
      ? {
          update_ppt_brief: updateBriefTool,
          recommend_ppt_templates: tool<unknown, Record<string, unknown>>({
            description: recommendTemplatesDescription,
            inputSchema: recommendPptTemplatesInputSchema as any,
            execute: async (rawInput: unknown): Promise<Record<string, unknown>> => {
              if (toolFlow !== "editable") {
                return {
                  ok: false,
                  error: {
                    code: "ppt_template_recommendation_not_supported",
                    message: "Template recommendations are only available in the editable PPT assistant.",
                  },
                }
              }

              const requestedIds = (rawInput as { templateIds?: unknown }).templateIds
              const catalog = getPptMasterTemplateCatalog()
              const catalogById = new Map(catalog.map((template) => [template.id, template]))
              const templateIds = Array.isArray(requestedIds)
                ? [...new Set(requestedIds.filter((value): value is string => typeof value === "string"))]
                : []
              if (templateIds.length !== 1) {
                return {
                  ok: false,
                  error: {
                    code: "ppt_template_recommendation_requires_single_template",
                    message: "The editable PPT assistant requires exactly one recommended template per turn.",
                  },
                  catalog,
                }
              }
              const selectedTemplates = templateIds
                .map((templateId) => catalogById.get(templateId.trim()))
                .filter((template): template is (typeof catalog)[number] => Boolean(template))

              if (selectedTemplates.length === 0 || selectedTemplates.length !== templateIds.length) {
                return {
                  ok: false,
                  error: {
                    code: "ppt_template_recommendation_invalid",
                    message: "Every recommended template id must come from the complete ppt-master catalog.",
                  },
                  catalog,
                }
              }

              const recommendedTemplates = selectedTemplates.map((template, index) => ({
                rank: index + 1,
                templateId: template.id,
                templateLabel: template.label,
                styleName: template.tone || template.themeMode || null,
              }))
              return {
                ok: true,
                recommendedTemplates,
                message: buildPptTemplateRecommendationMessage({
                  recommendedTemplates,
                  selectedTemplateId: null,
                  isZh: true,
                }),
              }
            },
          }),
        }
      : {}),
    preview_ppt_deck: tool<unknown, Record<string, unknown>>({
      description: previewDescription,
      inputSchema: previewInputSchema as any,
      execute: async (rawInput: unknown): Promise<Record<string, unknown>> => {
        const {
          prompt,
          sourcePrompt,
          audience,
          goal,
          researchBrief,
          scenario = "marketing-campaign",
          language = "zh-CN",
          templateMode,
          templateId,
          pageCount,
          model,
          preferredProviderId,
          runtimeSlideModel,
          runtimeSlideProvider,
          tone,
          mustInclude,
          requestId,
        } = rawInput as EditablePreviewPptDeckInput &
          PresentationPreviewPptDeckInput &
          GenericPreviewPptDeckInput & { requestId?: unknown }
        try {
          const prepared = preparePptPreviewInput({
            rawInput: {
              prompt,
              audience,
              goal,
              researchBrief,
              scenario,
              language,
              templateMode,
              templateId,
              pageCount,
              tone,
              mustInclude,
            },
            briefState: null,
          })
          if (!prepared.ok) {
            return {
              ok: false,
              error: prepared.error,
              missingFields: prepared.missingFields,
              suggestedBrief: prepared.suggestedBrief,
            }
          }

          const explicitTemplateId = prepared.input.templateId ?? templateId
          const requestedTemplateMode = prepared.input.templateMode ?? templateMode
          const limitTemplatesToRemoteWorker = shouldLimitTemplatesToRemotePptWorker(defaultPreviewRuntime)
          let recommendedTemplates: unknown[] = []
          let effectiveTemplateId: string | undefined
          let effectiveTemplateMode: "auto-4" | "single-template" = requestedTemplateMode ?? "auto-4"

          if (toolFlow === "editable") {
            const selection = resolveEditableTemplateSelection({
              templateId: explicitTemplateId,
              limitTemplatesToRemoteWorker,
            })
            recommendedTemplates = selection.recommendedTemplates
            effectiveTemplateId = selection.selectedTemplateId
            effectiveTemplateMode = selection.templateMode
            if (
              limitTemplatesToRemoteWorker &&
              effectiveTemplateMode === "single-template" &&
              effectiveTemplateId &&
              !isPptWorkerTemplateSupported(effectiveTemplateId)
            ) {
              throw new Error(`ppt_worker_template_unsupported:${effectiveTemplateId}`)
            }
          } else if (toolFlow === "presentation") {
            const selection = resolvePresentationTemplateSelection({
              prompt: sourcePrompt ?? prompt,
              researchBrief: prepared.input.researchBrief as string | PptPreviewResearchBrief | undefined,
              scenario: prepared.input.scenario,
              language: prepared.input.language,
              pageCount: prepared.input.pageCount ?? undefined,
              templateMode: requestedTemplateMode,
              templateId: explicitTemplateId,
            })
            recommendedTemplates = selection.recommendedTemplates
            effectiveTemplateId = selection.selectedTemplateId
            effectiveTemplateMode = selection.templateMode
          } else {
            recommendedTemplates = buildPptRecommendedTemplateSummaries({
              prompt: sourcePrompt ?? prompt,
              researchBrief: prepared.input.researchBrief as string | PptPreviewResearchBrief | undefined,
              scenario: prepared.input.scenario,
              language: prepared.input.language,
              pageCount: prepared.input.pageCount ?? undefined,
            })
            effectiveTemplateId = explicitTemplateId ?? undefined
            effectiveTemplateMode = effectiveTemplateId ? "single-template" : (requestedTemplateMode ?? "auto-4")
          }

          const effectiveNarrativeAngle =
            effectiveTemplateMode === "single-template" && effectiveTemplateId
              ? DEFAULT_SINGLE_TEMPLATE_NARRATIVE_ANGLE
              : undefined
          // The selected chat model is part of the user-facing PPT contract for
          // every PPT flow. Presentation decks used to silently drop it and
          // fall back to the enterprise default provider.
          const effectiveModel = model?.trim() || input.selectedPreviewModel?.trim() || undefined
          const effectivePreferredProviderId =
            preferredProviderId?.trim() || input.selectedPreviewProviderId?.trim() || undefined
          const effectiveRuntimeSlideModel = toolFlow === "editable" ? runtimeSlideModel?.trim() || undefined : undefined
          const effectiveRuntimeSlideProvider =
            toolFlow === "editable" ? runtimeSlideProvider?.trim() || undefined : undefined
          if (
            toolFlow === "editable" &&
            (effectiveTemplateMode !== "single-template" || !effectiveTemplateId)
          ) {
            throw new Error("ppt_master_editable_request_not_materialized")
          }
          const previewRequest = {
            ...(typeof requestId === "string" && requestId.trim() ? { requestId: requestId.trim() } : {}),
            prompt: prepared.input.prompt,
            researchBrief: prepared.input.researchBrief,
            scenario: prepared.input.scenario,
            language: prepared.input.language,
            ...(effectiveModel ? { model: effectiveModel } : {}),
            ...(effectivePreferredProviderId ? { preferredProviderId: effectivePreferredProviderId } : {}),
            ...(effectiveRuntimeSlideModel ? { runtimeSlideModel: effectiveRuntimeSlideModel } : {}),
            ...(effectiveRuntimeSlideProvider ? { runtimeSlideProvider: effectiveRuntimeSlideProvider } : {}),
            previewRuntime: toolFlow === "editable" ? "ppt-master-agent" : defaultPreviewRuntime,
            templateMode: effectiveTemplateMode,
            templateId: effectiveTemplateId,
            narrativeAngle: effectiveNarrativeAngle,
            pageCount: prepared.input.pageCount,
          }

          const result = (await buildLeadToolPreview(
            "ai-ppt-preview",
            previewRequest,
            currentUser,
          )) as LeadToolPptPreviewResponse & {
            meta?: {
              platformRunId?: number
              platformArtifactId?: number
            }
          }

          const validation = buildValidationResult([
            {
              code: "variants_present",
              ok: Array.isArray(result.deck.variants) && result.deck.variants.length > 0,
              message:
                Array.isArray(result.deck.variants) && result.deck.variants.length > 0
                  ? "Preview deck returned at least one variant."
                  : "Preview deck returned no variants.",
            },
          ])

          if (!validation.ok) {
            return {
              ok: false,
              error: {
                code: "ppt_preview_invalid",
                message: "PPT preview returned no variants. Please retry the preview generation.",
              },
              validation,
            }
          }

          return {
            ok: true,
            previewSessionId: result.previewSessionId,
            generatedAt: result.generatedAt,
            recommendedVariantKey: result.deck.variants[0]?.key ?? null,
            recommendedVariantName: result.deck.variants[0]?.name ?? null,
            recommendedTemplates,
            selectedTemplateId: effectiveTemplateId ?? null,
            ...summarizeDeck(result.deck),
            validation,
            platform: {
              previewRunId:
                typeof result.meta?.platformRunId === "number"
                  ? result.meta.platformRunId
                  : null,
              previewArtifactId:
                typeof result.meta?.platformArtifactId === "number"
                  ? result.meta.platformArtifactId
                  : null,
              toolRunId:
                typeof result.meta?.platformRunId === "number"
                  ? result.meta.platformRunId
                  : null,
            },
            nextStep:
              toolFlow === "presentation"
                ? "Review the recommended presentation variant first, then call export_ppt_deck to save the downloadable HTML deck artifact to the work library."
                : "Review the recommended variant first, then call export_ppt_deck to save the downloadable deck artifact to the work library.",
          }
        } catch (error) {
          const normalizedError = normalizePptToolError(error)
          return {
            ok: false,
            error: normalizedError,
          }
        }
      },
    }),
    export_ppt_deck: tool<unknown, Record<string, unknown>>({
      description: exportDescription,
      inputSchema: exportPptDeckInputSchema as any,
      execute: async (rawInput: unknown): Promise<Record<string, unknown>> => {
        const { previewSessionId, selectedVariantKey } = rawInput as ExportPptDeckInput
        return exportAiEntryPptDeckArtifact({
          currentUser,
          previewSessionId,
          selectedVariantKey,
          expectedArtifactKind:
            toolFlow === "editable" ? "pptx" : toolFlow === "presentation" ? "html" : null,
        })
      },
    }),
  } as ToolSet
}
