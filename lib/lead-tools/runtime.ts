import { z } from "zod"

import type { AuthUser } from "@/lib/auth/session"
import { getLeadToolBySlug } from "@/lib/lead-tools/catalog"
import {
  createLeadToolPlatformRun,
  promoteLeadToolArtifactToWork,
  saveLeadToolPreviewArtifact,
  saveLeadToolSelectedArtifact,
} from "@/lib/lead-tools/platform-persistence"
import {
  MAX_PPT_PREVIEW_PAGE_COUNT,
  MIN_PPT_PREVIEW_PAGE_COUNT,
  isKnownPptPreviewStyleKey,
  resolvePptPreviewDeckPageCount,
  type PptPreviewDeck,
} from "@/lib/lead-tools/ppt-preview-data-fixed"
import { isPptWorkerTemplateSupported } from "@/lib/lead-tools/ppt-worker-capabilities"
import { getLeadToolPptEngines } from "@/lib/lead-tools/ppt-engines"
import type { LeadToolPptDownloadResponse, LeadToolPptFinalizeResponse } from "@/lib/lead-tools/ppt-engines/types"
import { buildMockSeoMetaPreview } from "@/lib/lead-tools/seo-meta-data"
import { allowLeadToolMockFallback } from "@/lib/lead-tools/config"
import {
  generateLeadToolSeoPreviewWithFallback,
  getLeadToolResolvedModels,
} from "@/lib/lead-tools/generation"

const pptScenarioSchema = z.enum(["marketing-campaign", "product-launch", "sales-deck", "training"])
const pptLanguageSchema = z.enum(["zh-CN", "en-US"])
const pptPreviewModelSchema = z.enum(["MiniMax-M2.7-highspeed", "MiniMax-M3", "gpt-5.4", "step-3.7-flash"])
const pptPreviewRuntimeSchema = z.enum(["ppt-master-agent", "frontend-slides-agent"])
const pptPreviewTemplateModeSchema = z.enum(["auto-4", "single-template"])
const pptFrontendTemplateIdSchema = z.string().trim().refine(isPptWorkerTemplateSupported, "Unknown PPT template")
const pptPreviewPageCountSchema = z
  .number()
  .int("Page count must be an integer")
  .min(MIN_PPT_PREVIEW_PAGE_COUNT, `Page count must be at least ${MIN_PPT_PREVIEW_PAGE_COUNT}`)
  .max(MAX_PPT_PREVIEW_PAGE_COUNT, `Page count must be at most ${MAX_PPT_PREVIEW_PAGE_COUNT}`)
const pptPreviewInputImageSchema = z.object({
  url: z.string().trim().url("Image URL must be a valid URL"),
  title: z.string().trim().nullable().optional(),
  mimeType: z.string().trim().nullable().optional(),
  sourceNodeKey: z.string().trim().nullable().optional(),
  role: z.enum(["cover", "content", "logo", "reference"]).optional(),
})

const pptPreviewResearchBriefSchema = z.object({
  topic: z.string().trim().min(1, "Research brief topic is required"),
  keyFacts: z.array(z.string().trim().min(1)).min(1, "At least one key fact is required"),
  numericEvidence: z.array(z.string().trim().min(1)).optional(),
  risks: z.array(z.string().trim().min(1)).optional(),
  implications: z.array(z.string().trim().min(1)).optional(),
  sourceNotes: z.array(z.string().trim().min(1)).optional(),
  rawSummary: z.string().trim().min(1).optional(),
})
const pptPreviewNarrativeAngleSchema = z.enum(["executive-brief", "campaign-story", "data-proof", "action-plan"])

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
const pptPreviewStyleKeySchema = z.custom<import("@/lib/lead-tools/ppt-preview-data-fixed").PptPreviewStyleKey>(
  (value) => isKnownPptPreviewStyleKey(value),
  "Unknown PPT preview style",
)

const pptPreviewVariantSchema = z.object({
  key: z.string(),
  styleKey: pptPreviewStyleKeySchema,
  templateId: pptFrontendTemplateIdSchema.optional(),
  narrativeAngle: pptPreviewNarrativeAngleSchema.optional(),
  slotLabel: z.enum(["A", "B", "C", "D"]).optional(),
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
  templateMode: pptPreviewTemplateModeSchema.optional(),
  selectedTemplateId: pptFrontendTemplateIdSchema.nullable().optional(),
  pageCount: pptPreviewPageCountSchema.nullable().optional(),
  resolvedPageCount: pptPreviewPageCountSchema.optional(),
})

const pptPreviewRequestSchema = z
  .object({
    prompt: z.string().trim().min(1, "Prompt is required"),
    researchBrief: z
      .union([
        z
          .string()
          .trim()
          .min(1, "Research brief must not be empty")
          .max(12_000, "Research brief is too long"),
        pptPreviewResearchBriefSchema,
      ])
      .optional(),
    scenario: pptScenarioSchema.default("marketing-campaign"),
    language: pptLanguageSchema.default("zh-CN"),
    model: pptPreviewModelSchema.optional(),
    previewRuntime: pptPreviewRuntimeSchema.optional(),
    templateMode: pptPreviewTemplateModeSchema.default("auto-4"),
    templateId: pptFrontendTemplateIdSchema.optional(),
    narrativeAngle: pptPreviewNarrativeAngleSchema.optional(),
    pageCount: pptPreviewPageCountSchema.nullable().optional(),
    images: z.array(pptPreviewInputImageSchema).max(12).optional(),
  })
  .superRefine((value, context) => {
    if (value.templateMode === "single-template" && !value.templateId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Template is required for single-template mode",
        path: ["templateId"],
      })
    }
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

function assertPptProtectedArtifactReady(
  deck: PptPreviewDeck,
  selectedVariant: ReturnType<typeof getSelectedVariant>,
  previewSessionId: string | undefined,
) {
  if (deck.previewEngine === "frontend-slides-html" && selectedVariant.preview?.htmlDocument) {
    return
  }

  if (previewSessionId) {
    return
  }

  throw new LeadToolRuntimeError(
    "bad_request",
    "Preview session missing. Generate the PPT preview again before opening, downloading, or exporting.",
    400,
  )
}

async function persistLeadToolPreviewResult(params: {
  toolSlug: string
  inputPayload: Record<string, unknown>
  deck: PptPreviewDeck
  previewSessionId?: string
  currentUser: AuthUser | null | undefined
}) {
  const platformRun = await createLeadToolPlatformRun({
    currentUser: params.currentUser,
    toolSlug: params.toolSlug,
    action: "preview",
    inputPayload: params.inputPayload,
    normalizedResult: {
      previewSessionId: params.previewSessionId ?? null,
      deckTitle: params.deck.title,
      variantCount: params.deck.variants.length,
      pageCount: params.deck.pageCount ?? null,
      resolvedPageCount: params.deck.resolvedPageCount ?? resolvePptPreviewDeckPageCount(params.deck),
    },
  })

  const platformArtifact = await saveLeadToolPreviewArtifact({
    currentUser: params.currentUser,
    toolSlug: params.toolSlug,
    run: platformRun,
    deck: params.deck,
    previewSessionId: params.previewSessionId,
  })

  return {
    platformRunId: platformRun?.id,
    platformArtifactId: platformArtifact?.id,
  }
}

async function persistLeadToolSelectedResult(params: {
  toolSlug: string
  action: "download" | "finalize"
  inputPayload: Record<string, unknown>
  deck: PptPreviewDeck
  selectedVariant: ReturnType<typeof getSelectedVariant>
  previewSessionId?: string
  currentUser: AuthUser | null | undefined
  finalizeResult?: LeadToolPptFinalizeResponse
  downloadResult?: LeadToolPptDownloadResponse
}) {
  const platformRun = await createLeadToolPlatformRun({
    currentUser: params.currentUser,
    toolSlug: params.toolSlug,
    action: params.action,
    inputPayload: params.inputPayload,
    normalizedResult: {
      selectedVariantKey: params.selectedVariant.key,
      selectedVariantName: params.selectedVariant.name,
      previewSessionId: params.previewSessionId ?? null,
      pageCount: params.deck.pageCount ?? null,
      resolvedPageCount: params.deck.resolvedPageCount ?? resolvePptPreviewDeckPageCount(params.deck),
      action: params.action,
    },
  })

  const platformArtifact = await saveLeadToolSelectedArtifact({
    currentUser: params.currentUser,
    toolSlug: params.toolSlug,
    run: platformRun,
    deck: params.deck,
    selectedVariant: params.selectedVariant,
    previewSessionId: params.previewSessionId,
    action: params.action,
    finalizeResult: params.finalizeResult,
    downloadResult: params.downloadResult,
  })

  const platformWorkItem = await promoteLeadToolArtifactToWork({
    currentUser: params.currentUser,
    artifact: platformArtifact,
    title: `${params.deck.title} ${params.selectedVariant.name}`,
    summary: params.selectedVariant.summary,
    metadata: {
      toolSlug: params.toolSlug,
      selectedVariantKey: params.selectedVariant.key,
      selectedVariantStyleKey: params.selectedVariant.styleKey,
      previewSessionId: params.previewSessionId ?? null,
    },
  })

  return {
    platformRunId: platformRun?.id,
    platformArtifactId: platformArtifact?.id,
    platformWorkItemId: platformWorkItem?.id,
  }
}

export async function buildLeadToolPreview(slug: string, input: unknown, user?: AuthUser | null) {
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
      const platformMeta = await persistLeadToolPreviewResult({
        toolSlug: tool.slug,
        inputPayload: payload,
        deck: result.deck,
        previewSessionId: result.previewSessionId,
        currentUser: user,
      })

      return {
        ...result,
        meta: {
          ...result.meta,
          tool: tool.slug,
          ...platformMeta,
        },
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("lead_tool_provider_missing:")) {
        const fallbackResult = await engines.preview.buildPreview(payload, {
          allowMockFallback: true,
          resolvedModels: models,
        })
        const platformMeta = await persistLeadToolPreviewResult({
          toolSlug: tool.slug,
          inputPayload: payload,
          deck: fallbackResult.deck,
          previewSessionId: fallbackResult.previewSessionId,
          currentUser: user,
        })

        return {
          ...fallbackResult,
          meta: {
            ...fallbackResult.meta,
            tool: tool.slug,
            providerFallback: error.message,
            ...platformMeta,
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
  assertPptProtectedArtifactReady(payload.deck, selectedVariant, payload.previewSessionId)
  const engines = getLeadToolPptEngines()
  const result = await engines.export.buildFinalize(
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
  const platformMeta = await persistLeadToolSelectedResult({
    toolSlug: tool.slug,
    action: "finalize",
    inputPayload: {
      selectedVariantKey: payload.selectedVariantKey,
      previewSessionId: payload.previewSessionId ?? null,
      deckTitle: payload.deck.title,
      pageCount: payload.deck.pageCount ?? null,
      resolvedPageCount: payload.deck.resolvedPageCount ?? resolvePptPreviewDeckPageCount(payload.deck),
    },
    deck: payload.deck,
    selectedVariant,
    previewSessionId: payload.previewSessionId,
    currentUser: user,
    finalizeResult: result,
  })

  return {
    ...result,
    meta: platformMeta,
  }
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
  assertPptProtectedArtifactReady(payload.deck, selectedVariant, payload.previewSessionId)
  const engines = getLeadToolPptEngines()
  const result = await engines.export.buildDownload(
    {
      deck: payload.deck,
      selectedVariant,
      previewSessionId: payload.previewSessionId,
    },
    {
      user,
    },
  )
  const platformMeta = await persistLeadToolSelectedResult({
    toolSlug: tool.slug,
    action: "download",
    inputPayload: {
      selectedVariantKey: payload.selectedVariantKey,
      previewSessionId: payload.previewSessionId ?? null,
      deckTitle: payload.deck.title,
      pageCount: payload.deck.pageCount ?? null,
      resolvedPageCount: payload.deck.resolvedPageCount ?? resolvePptPreviewDeckPageCount(payload.deck),
    },
    deck: payload.deck,
    selectedVariant,
    previewSessionId: payload.previewSessionId,
    currentUser: user,
    downloadResult: result,
  })

  return {
    ...result,
    meta: platformMeta,
  }
}
