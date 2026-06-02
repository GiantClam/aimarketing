import { z } from "zod"

import type { AuthUser } from "@/lib/auth/session"
import { getLeadToolBySlug } from "@/lib/lead-tools/catalog"
import { type PptPreviewDeck } from "@/lib/lead-tools/ppt-preview-data-fixed"
import { getLeadToolPptEngines } from "@/lib/lead-tools/ppt-engines"
import { buildMockSeoMetaPreview } from "@/lib/lead-tools/seo-meta-data"
import { allowLeadToolMockFallback } from "@/lib/lead-tools/config"
import {
  generateLeadToolSeoPreviewWithFallback,
  getLeadToolResolvedModels,
} from "@/lib/lead-tools/generation"

const pptScenarioSchema = z.enum(["marketing-campaign", "product-launch", "sales-deck", "training"])
const pptLanguageSchema = z.enum(["zh-CN", "en-US"])
const pptPreviewModelSchema = z.enum(["MiniMax-M2.7-highspeed", "MiniMax-M3", "gpt-5.4", "step-3.7-flash"])

const pptPreviewSlideSchema = z.object({
  id: z.string(),
  layout: z.enum(["cover", "agenda", "insight", "comparison", "evidence", "stats", "chart", "process", "timeline"]),
  intent: z.enum(["cover", "contents", "statement", "spotlight", "comparison", "stats", "chart", "process", "closing"]).optional(),
  nativePageType: z.string().optional(),
  structuredFields: z
    .array(z.enum(["bullets", "contentsItems", "comparisonItems", "spotlightItems", "metricItems", "chartItems", "processItems", "closingItems"]))
    .optional(),
  kicker: z.string(),
  title: z.string(),
  body: z.string(),
  bullets: z.array(z.string()),
  contentsItems: z
    .array(
      z.object({
        index: z.string(),
        title: z.string(),
        detail: z.string(),
      }),
    )
    .optional(),
  comparisonItems: z
    .array(
      z.object({
        label: z.string(),
        title: z.string(),
        detail: z.string(),
      }),
    )
    .optional(),
  spotlightItems: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string(),
      }),
    )
    .optional(),
  metricItems: z
    .array(
      z.object({
        value: z.string(),
        label: z.string(),
        note: z.string().optional(),
      }),
    )
    .optional(),
  chartItems: z
    .array(
      z.object({
        label: z.string(),
        value: z.number(),
        detail: z.string(),
      }),
    )
    .optional(),
  processItems: z
    .array(
      z.object({
        step: z.string(),
        title: z.string(),
        detail: z.string(),
      }),
    )
    .optional(),
  closingItems: z
    .array(
      z.object({
        label: z.string(),
        detail: z.string(),
      }),
    )
    .optional(),
  accent: z.string(),
})

const pptPreviewAssetSchema = z.object({
  mimeType: z.enum(["image/svg+xml", "image/png"]),
  width: z.number(),
  height: z.number(),
  dataUrl: z.string(),
})

const pptPreviewVariantSchema = z.object({
  key: z.enum([
    "ppt169_brutalist_ai_newspaper_2026",
    "ppt169_sugar_rush_memphis",
    "ppt169_pritzker_2026",
    "ppt169_swiss_grid_systems",
  ]),
  name: z.string(),
  summary: z.string(),
  stylePrompt: z.string(),
  outline: z.array(z.string()).optional(),
  palette: z.object({
    background: z.string(),
    foreground: z.string(),
    accent: z.string(),
    panel: z.string(),
    border: z.string(),
  }),
  strengths: z.array(z.string()),
  slides: z.array(pptPreviewSlideSchema),
  preview: z
    .object({
      format: z.literal("svg"),
      themeId: z.string(),
      cover: pptPreviewAssetSchema,
      slides: z.array(pptPreviewAssetSchema),
      htmlDocument: z
        .object({
          fileName: z.string(),
          html: z.string(),
        })
        .optional(),
    })
    .optional(),
})

const pptPreviewDeckSchema: z.ZodType<PptPreviewDeck> = z.object({
  title: z.string(),
  scenario: pptScenarioSchema,
  language: pptLanguageSchema,
  generatedAt: z.string(),
  outline: z.array(z.string()),
  variants: z.array(pptPreviewVariantSchema),
  previewEngine: z.enum(["ppt-master-svg", "ppt-master-project", "frontend-slides-html"]).optional(),
  previewSessionId: z.string().optional(),
  provider: z.string().optional(),
  previewModel: z.string().optional(),
  source: z.enum(["live", "mock"]).optional(),
})

const pptPreviewRequestSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required"),
  scenario: pptScenarioSchema.default("marketing-campaign"),
  language: pptLanguageSchema.default("zh-CN"),
  model: pptPreviewModelSchema.optional(),
})

const protectedPptActionSchema = z.object({
  deck: pptPreviewDeckSchema,
  selectedVariantKey: z.string().min(1, "Selected variant is required"),
  previewSessionId: z.string().optional(),
})

const seoPageTypeSchema = z.enum(["landing-page", "blog-post", "product-page", "feature-page"])
const seoLanguageSchema = z.enum(["zh-CN", "en-US"])

const seoMetaRequestSchema = z.object({
  topic: z.string().trim().min(1, "Topic is required"),
  pageType: seoPageTypeSchema.default("landing-page"),
  audience: z.string().trim().min(1, "Audience is required"),
  language: seoLanguageSchema.default("zh-CN"),
})

type LeadToolRuntimeErrorCode =
  | "not_found"
  | "not_live"
  | "not_supported"
  | "bad_request"
  | "authentication_required"
  | "service_unavailable"

export class LeadToolRuntimeError extends Error {
  code: LeadToolRuntimeErrorCode
  status: number

  constructor(code: LeadToolRuntimeErrorCode, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

function assertLiveTool(slug: string) {
  const tool = getLeadToolBySlug(slug)

  if (!tool) {
    throw new LeadToolRuntimeError("not_found", "Tool not found", 404)
  }

  if (tool.status !== "live") {
    throw new LeadToolRuntimeError("not_live", "Tool is not live yet", 404)
  }

  return tool
}

function getSelectedVariant(deck: PptPreviewDeck, selectedVariantKey: string) {
  const selectedVariant = deck.variants.find((variant) => variant.key === selectedVariantKey)

  if (!selectedVariant) {
    throw new LeadToolRuntimeError("bad_request", "Selected variant not found", 400)
  }

  return selectedVariant
}

export async function buildLeadToolPreview(slug: string, input: unknown) {
  const tool = assertLiveTool(slug)
  const models = getLeadToolResolvedModels(slug)

  if (slug === "ai-ppt-preview") {
    const payload = pptPreviewRequestSchema.parse(input)
    const engines = getLeadToolPptEngines()

    try {
      const result = await engines.preview.buildPreview(payload, {
        allowMockFallback: false,
        resolvedModels: models,
      })

      return {
        ...result,
        meta: {
          ...result.meta,
          tool: tool.slug,
        },
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("lead_tool_provider_missing:")) {
        const fallbackResult = await engines.preview.buildPreview(payload, {
          allowMockFallback: true,
          resolvedModels: models,
        })

        return {
          ...fallbackResult,
          meta: {
            ...fallbackResult.meta,
            tool: tool.slug,
            providerFallback: error.message,
          },
        }
      }

      throw new LeadToolRuntimeError(
        "service_unavailable",
        error instanceof Error ? error.message : "PPT preview provider unavailable",
        503,
      )
    }
  }

  if (slug === "ai-seo-meta-generator") {
    const payload = seoMetaRequestSchema.parse(input)
    let preview: ReturnType<typeof buildMockSeoMetaPreview>

    try {
      preview = await generateLeadToolSeoPreviewWithFallback(payload, allowLeadToolMockFallback())
    } catch (error) {
      throw new LeadToolRuntimeError(
        "service_unavailable",
        error instanceof Error ? error.message : "SEO preview provider unavailable",
        503,
      )
    }

    return {
      previewSessionId: crypto.randomUUID(),
      generatedAt: preview.generatedAt,
      preview,
      meta: {
        previewModel: models.previewModel,
        mode: "seo-meta-preview",
        tool: tool.slug,
        mockFallback: preview.summary.includes("已为") || preview.summary.includes("Generated 3 SEO meta directions"),
      },
    }
  }

  throw new LeadToolRuntimeError("not_supported", "Preview not implemented for this tool", 501)
}

export async function buildLeadToolFinalize(slug: string, input: unknown, user: AuthUser | null) {
  const tool = assertLiveTool(slug)
  const models = getLeadToolResolvedModels(slug)

  if (tool.finalizeRequiresLogin && !user) {
    throw new LeadToolRuntimeError("authentication_required", "Authentication required", 401)
  }

  if (slug !== "ai-ppt-preview") {
    throw new LeadToolRuntimeError("not_supported", "Finalize not implemented for this tool", 501)
  }

  const payload = protectedPptActionSchema.parse(input)
  const selectedVariant = getSelectedVariant(payload.deck, payload.selectedVariantKey)
  const engines = getLeadToolPptEngines()

  return engines.export.buildFinalize(
    {
      deck: payload.deck,
      selectedVariant,
      previewSessionId: payload.previewSessionId,
    },
    {
      user,
      resolvedModels: models,
    },
  )
}

export async function buildLeadToolDownload(slug: string, input: unknown, user: AuthUser | null) {
  const tool = assertLiveTool(slug)

  if (tool.downloadRequiresLogin && !user) {
    throw new LeadToolRuntimeError("authentication_required", "Authentication required", 401)
  }

  if (slug !== "ai-ppt-preview") {
    throw new LeadToolRuntimeError("not_supported", "Download not implemented for this tool", 501)
  }

  const payload = protectedPptActionSchema.parse(input)
  const selectedVariant = getSelectedVariant(payload.deck, payload.selectedVariantKey)
  const engines = getLeadToolPptEngines()

  return engines.export.buildDownload(
    {
      deck: payload.deck,
      selectedVariant,
      previewSessionId: payload.previewSessionId,
    },
    {
      user,
    },
  )
}
