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

const previewPptDeckInputSchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(1)
      .describe("The complete deck brief, including topic, audience, goal, tone, and any must-include points."),
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
    preview_ppt_deck: tool({
      description:
        "Generate a PPT preview deck from a conversation brief. Use this when the user wants a slide deck, PPT, pitch deck, training deck, or presentation draft.",
      inputSchema: previewPptDeckInputSchema,
      execute: async ({
        prompt,
        scenario = "marketing-campaign",
        language = "zh-CN",
        templateMode = "auto-4",
        templateId,
        pageCount,
      }) => {
        const result = (await buildLeadToolPreview(
          "ai-ppt-preview",
          {
            prompt,
            scenario,
            language,
            templateMode,
            templateId,
            pageCount,
          },
          currentUser,
        )) as LeadToolPptPreviewResponse & {
          meta?: {
            platformRunId?: number
            platformArtifactId?: number
          }
        }

        return {
          previewSessionId: result.previewSessionId,
          generatedAt: result.generatedAt,
          ...summarizeDeck(result.deck),
          platform: {
            previewRunId:
              typeof result.meta?.platformRunId === "number"
                ? result.meta.platformRunId
                : null,
            previewArtifactId:
              typeof result.meta?.platformArtifactId === "number"
                ? result.meta.platformArtifactId
                : null,
          },
          nextStep:
            "Choose the best variant key, then call export_ppt_deck to save the downloadable deck artifact to the work library.",
        }
      },
    }),
    export_ppt_deck: tool({
      description:
        "Export the downloadable deck artifact from a previously generated preview session and selected variant. Use this after preview_ppt_deck when the user wants the actual deliverable file.",
      inputSchema: exportPptDeckInputSchema,
      execute: async ({ previewSessionId, selectedVariantKey }) => {
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
        const fileName =
          result.artifact?.fileName ||
          buildPptExportFileName(
            result.deck,
            result.variant,
            result.deck.previewEngine === "frontend-slides-html" ? "html" : "pptx",
          )

        return {
          previewSessionId,
          title: result.deck.title,
          selectedVariantKey: result.variant.key,
          selectedVariantName: result.variant.name,
          slideCount:
            result.deck.resolvedPageCount ??
            result.deck.pageCount ??
            result.variant.slides.length,
          fileName,
          artifactId,
          workItemId,
          workLibraryHref: "/dashboard/works",
          previewUrl: artifactId ? buildArtifactDownloadUrl(artifactId) : null,
          downloadUrl: artifactId
            ? buildArtifactDownloadUrl(artifactId, true)
            : null,
          message: artifactId
            ? "Deck artifact generated and saved to the work library."
            : "Deck artifact generated.",
        }
      },
    }),
  } as ToolSet
}
