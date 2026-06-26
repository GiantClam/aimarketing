import "server-only"

import { tool, type ToolSet } from "ai"
import { z } from "zod"

import type { AuthUser } from "@/lib/auth/session"
import { buildPptExportFileName } from "@/lib/lead-tools/ppt-export-file-name"
import type {
  PptPreviewDeck,
  PptPreviewVariant,
} from "@/lib/lead-tools/ppt-preview-data-fixed"
import type {
  LeadToolPptDownloadResponse,
  LeadToolPptPreviewResponse,
} from "@/lib/lead-tools/ppt-engines/types"
import { getPptPreviewSessionDeck } from "@/lib/lead-tools/ppt-preview-session-store"
import { buildLeadToolDownload, buildLeadToolPreview } from "@/lib/lead-tools/runtime"

const PPTX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
const FACTUAL_PPT_RESEARCH_REQUIRED_PATTERN =
  /(?:现状|最新|趋势|市场|行业|竞品|政策|法规|关税|融资|财报|业绩|地缘|战争|制裁|供应链|进出口|油价|运价|汇率|\bcompany\b|\bmarket\b|\bindustry\b|\bcompetitor\b|\bpolicy\b|\bregulation\b|\btariff\b|\bearnings\b|\bgeopolitical\b|\bsupply chain\b|\blatest\b|\bcurrent state\b)/iu

const pptScenarioSchema = z.enum([
  "marketing-campaign",
  "product-launch",
  "sales-deck",
  "training",
])

const pptLanguageSchema = z.enum(["zh-CN", "en-US"])

const pptTemplateModeSchema = z.enum(["auto-4", "single-template"])

const pptTemplateIdSchema = z.enum([
  "long-table",
  "playful",
  "broadside",
  "neo-grid-bold",
])
const DEFAULT_SINGLE_TEMPLATE_NARRATIVE_ANGLE = "executive-brief" as const

const previewPptDeckInputSchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(1)
      .describe("The complete deck brief, including topic, audience, goal, tone, and any must-include points."),
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
    templateMode: pptTemplateModeSchema
      .optional()
      .describe("Use auto-4 to compare multiple directions, or single-template when the user wants one template family."),
    templateId: pptTemplateIdSchema
      .optional()
      .describe("Required only when templateMode is single-template."),
    pageCount: z
      .number()
      .int()
      .min(4)
      .max(20)
      .optional()
      .describe("Optional requested slide count."),
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
    .describe("Variant key chosen from preview_ppt_deck. If omitted, the first variant is exported."),
})

type PreviewPptDeckInput = z.infer<typeof previewPptDeckInputSchema>
type ExportPptDeckInput = z.infer<typeof exportPptDeckInputSchema>

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

  if (
    /ppt_master_repo_missing|ppt_master_script_failed|ppt_master_python_missing|ppt_master_runtime_unavailable/iu.test(
      message,
    )
  ) {
    return {
      code: "ppt_master_runtime_unavailable",
      message: "PPT runtime is currently unavailable. Please try again later.",
    }
  }

  if (/ppt_variant_not_found|selected variant not found/iu.test(message)) {
    const variantKey = message.includes(":") ? message.split(":").slice(1).join(":") : null
    return {
      code: "ppt_variant_not_found",
      message: variantKey
        ? `Selected variant "${variantKey}" was not found. Use a variant key returned by preview_ppt_deck.`
        : "Selected variant was not found. Use a variant key returned by preview_ppt_deck.",
    }
  }

  if (/ppt_research_brief_required/iu.test(message)) {
    return {
      code: "ppt_research_brief_required",
      message:
        "This PPT request needs fresh factual grounding before preview. Call web_search first, then provide the researchBrief to preview_ppt_deck.",
    }
  }

  return {
    code: "ppt_tool_failed",
    message,
  }
}

function requiresResearchBrief(prompt: string) {
  return FACTUAL_PPT_RESEARCH_REQUIRED_PATTERN.test(prompt)
}

function hasUsableResearchBrief(value: unknown) {
  if (typeof value === "string") {
    return Boolean(value.trim())
  }

  if (value && typeof value === "object") {
    const record = value as {
      topic?: unknown
      keyFacts?: unknown
      rawSummary?: unknown
    }
    const keyFacts = Array.isArray(record.keyFacts)
      ? record.keyFacts.filter((item) => typeof item === "string" && item.trim())
      : []
    const topic = typeof record.topic === "string" && record.topic.trim()
    const rawSummary = typeof record.rawSummary === "string" && record.rawSummary.trim()
    return Boolean(topic && (keyFacts.length > 0 || rawSummary))
  }

  return false
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

export function buildAiEntryPptTools(input: {
  currentUser: AuthUser
}): ToolSet {
  const { currentUser } = input

  return {
    preview_ppt_deck: tool<unknown, Record<string, unknown>>({
      description:
        "Generate a PPT preview deck from a conversation brief. Use this when the user wants a slide deck, PPT, pitch deck, training deck, or presentation draft.",
      inputSchema: previewPptDeckInputSchema as any,
      execute: async (rawInput: unknown): Promise<Record<string, unknown>> => {
        const {
          prompt,
          researchBrief,
          scenario = "marketing-campaign",
          language = "zh-CN",
          templateMode = "auto-4",
          templateId,
          pageCount,
        } = rawInput as PreviewPptDeckInput
        try {
          if (requiresResearchBrief(prompt) && !hasUsableResearchBrief(researchBrief)) {
            throw new Error("ppt_research_brief_required")
          }

          const result = (await buildLeadToolPreview(
            "ai-ppt-preview",
            {
              prompt,
              researchBrief,
              scenario,
              language,
              templateMode,
              templateId,
              narrativeAngle:
                templateMode === "single-template" && templateId
                  ? DEFAULT_SINGLE_TEMPLATE_NARRATIVE_ANGLE
                  : undefined,
              pageCount,
            },
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
              "Choose the best variant key, then call export_ppt_deck to save the downloadable PPTX artifact to the work library.",
          }
        } catch (error) {
          return {
            ok: false,
            error: normalizePptToolError(error),
          }
        }
      },
    }),
    export_ppt_deck: tool<unknown, Record<string, unknown>>({
      description:
        "Export the downloadable deck artifact from a previously generated preview session and selected variant. Use this after preview_ppt_deck when the user wants the actual deliverable file.",
      inputSchema: exportPptDeckInputSchema as any,
      execute: async (rawInput: unknown): Promise<Record<string, unknown>> => {
        const { previewSessionId, selectedVariantKey } = rawInput as ExportPptDeckInput
        try {
          const deck = await getPptPreviewSessionDeck(previewSessionId)
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
              code: "file_name_pptx",
              ok: fileName.trim().toLowerCase().endsWith(".pptx"),
              message:
                fileName.trim().toLowerCase().endsWith(".pptx")
                  ? "Exported artifact file name ends with .pptx."
                  : "Exported artifact file name must end with .pptx.",
            },
            {
              code: "mime_is_pptx",
              ok: contentType === PPTX_MIME_TYPE,
              message:
                contentType === PPTX_MIME_TYPE
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
            contentType: PPTX_MIME_TYPE,
            artifactId,
            workItemId,
            toolRunId,
            workLibraryHref: "/dashboard/works",
            previewUrl: artifactId ? buildArtifactDownloadUrl(artifactId) : null,
            downloadUrl: artifactId
              ? buildArtifactDownloadUrl(artifactId, true)
              : null,
            artifact: {
              kind: "pptx",
              title: result.deck.title,
              fileName,
              mimeType: PPTX_MIME_TYPE,
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
            availableVariants: deck ? deck.variants.map(summarizeVariant) : [],
          }
        }
      },
    }),
  } as ToolSet
}
