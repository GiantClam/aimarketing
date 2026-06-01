import { z } from "zod"

import type { AuthUser } from "@/lib/auth/session"
import { getLeadToolBySlug } from "@/lib/lead-tools/catalog"
import { type PptPreviewDeck } from "@/lib/lead-tools/ppt-preview-data"
import { buildMockSeoMetaPreview } from "@/lib/lead-tools/seo-meta-data"
import { allowLeadToolMockFallback } from "@/lib/lead-tools/config"
import {
  generateLeadToolPptPreviewWithFallback,
  generateLeadToolSeoPreviewWithFallback,
  getLeadToolResolvedModels,
} from "@/lib/lead-tools/generation"

const pptScenarioSchema = z.enum(["marketing-campaign", "product-launch", "sales-deck", "training"])
const pptLanguageSchema = z.enum(["zh-CN", "en-US"])

const pptPreviewSlideSchema = z.object({
  id: z.string(),
  layout: z.enum(["cover", "agenda", "insight", "comparison", "timeline"]),
  kicker: z.string(),
  title: z.string(),
  body: z.string(),
  bullets: z.array(z.string()),
  accent: z.string(),
})

const pptPreviewVariantSchema = z.object({
  key: z.string(),
  name: z.string(),
  summary: z.string(),
  palette: z.object({
    background: z.string(),
    foreground: z.string(),
    accent: z.string(),
    panel: z.string(),
    border: z.string(),
  }),
  strengths: z.array(z.string()),
  slides: z.array(pptPreviewSlideSchema),
})

const pptPreviewDeckSchema: z.ZodType<PptPreviewDeck> = z.object({
  title: z.string(),
  scenario: pptScenarioSchema,
  language: pptLanguageSchema,
  generatedAt: z.string(),
  outline: z.array(z.string()),
  variants: z.array(pptPreviewVariantSchema),
})

const pptPreviewRequestSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required"),
  scenario: pptScenarioSchema.default("marketing-campaign"),
  language: pptLanguageSchema.default("zh-CN"),
})

const protectedPptActionSchema = z.object({
  deck: pptPreviewDeckSchema,
  selectedVariantKey: z.string().min(1, "Selected variant is required"),
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
    let deck: PptPreviewDeck

    try {
      deck = await generateLeadToolPptPreviewWithFallback(payload, allowLeadToolMockFallback())
    } catch (error) {
      throw new LeadToolRuntimeError(
        "service_unavailable",
        error instanceof Error ? error.message : "PPT preview provider unavailable",
        503,
      )
    }

    return {
      previewSessionId: crypto.randomUUID(),
      generatedAt: deck.generatedAt,
      deck,
      meta: {
        previewModel: models.previewModel,
        mode: "fast-preview",
        tool: tool.slug,
        mockFallback: !hasLiveLookingDeck(deck),
      },
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

function hasLiveLookingDeck(deck: PptPreviewDeck) {
  return !deck.variants.every((variant) =>
    variant.slides.some((slide) => slide.body.includes("后续接入真实 PPTX 导出器") || slide.body.includes("Wire a real PPTX exporter next")),
  )
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

  return {
    jobId: crypto.randomUUID(),
    status: "queued",
    message: "完整 PPT 生成任务已创建，当前为可替换的 MVP 占位导出器。",
    requestedBy: user?.email,
    exportPlan: {
      title: payload.deck.title,
      selectedVariant: selectedVariant.name,
      slideCount: selectedVariant.slides.length,
      output: "editable-pptx",
      finalModel: models.finalModel,
    },
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

  return {
    deck: payload.deck,
    variant: selectedVariant,
  }
}
