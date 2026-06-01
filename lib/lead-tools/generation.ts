import { generateStructuredObjectWithWriterModel, hasAibermApiKey, hasCrazyrouteApiKey } from "@/lib/writer/aiberm"
import { getLeadToolFinalModel, getLeadToolPreviewModel } from "@/lib/lead-tools/config"
import {
  buildPptPreviewDeckFromPlan,
  buildMockPptPreview,
  type PptPreviewDeck,
  type PptPreviewRequest,
  type PptPreviewSlide,
} from "@/lib/lead-tools/ppt-preview-data"
import { buildMockSeoMetaPreview, type SeoMetaPreview, type SeoMetaRequest, type SeoMetaVariant } from "@/lib/lead-tools/seo-meta-data"

type LeadToolPptPlan = {
  title: string
  outline: [string, string, string, string, string]
  slides: [
    Omit<PptPreviewSlide, "id" | "accent">,
    Omit<PptPreviewSlide, "id" | "accent">,
    Omit<PptPreviewSlide, "id" | "accent">,
    Omit<PptPreviewSlide, "id" | "accent">,
    Omit<PptPreviewSlide, "id" | "accent">,
  ]
}

type LeadToolSeoPlan = {
  summary: string
  variants: [SeoMetaVariant, SeoMetaVariant, SeoMetaVariant]
}

function buildPptPlanSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "outline", "slides"],
    properties: {
      title: { type: "string" },
      outline: {
        type: "array",
        minItems: 5,
        maxItems: 5,
        items: { type: "string" },
      },
      slides: {
        type: "array",
        minItems: 5,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["layout", "kicker", "title", "body", "bullets"],
          properties: {
            layout: {
              type: "string",
              enum: ["cover", "agenda", "insight", "comparison", "timeline"],
            },
            kicker: { type: "string" },
            title: { type: "string" },
            body: { type: "string" },
            bullets: {
              type: "array",
              minItems: 2,
              maxItems: 4,
              items: { type: "string" },
            },
          },
        },
      },
    },
  } satisfies Record<string, unknown>
}

function buildSeoPlanSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "variants"],
    properties: {
      summary: { type: "string" },
      variants: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "name", "angle", "title", "description", "keywords", "slug", "h1", "cta"],
          properties: {
            key: { type: "string" },
            name: { type: "string" },
            angle: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            keywords: {
              type: "array",
              minItems: 3,
              maxItems: 6,
              items: { type: "string" },
            },
            slug: { type: "string" },
            h1: { type: "string" },
            cta: { type: "string" },
          },
        },
      },
    },
  } satisfies Record<string, unknown>
}

function buildPptSystemPrompt(language: PptPreviewRequest["language"]) {
  if (language === "zh-CN") {
    return [
      "你是一个专业的演示文稿策划助手。",
      "目标是为用户生成一个适合商业展示的 5 页 PPT 内容规划。",
      "必须输出中文。",
      "必须严格返回结构化结果，不要输出 JSON 之外的说明。",
      "slides 顺序固定为: cover, agenda, insight, comparison, timeline。",
      "每页 body 控制在 1-2 句，bullets 保持 2-4 条，可直接放到 PPT。",
    ].join(" ")
  }

  return [
    "You are a presentation strategist.",
    "Generate a business-ready 5-slide PPT content plan.",
    "Output in English only.",
    "Return structured data only.",
    "Keep slide order fixed as: cover, agenda, insight, comparison, timeline.",
    "Each body should be 1-2 sentences and bullets should be concise and presentation-ready.",
  ].join(" ")
}

function buildPptUserPrompt(request: PptPreviewRequest) {
  return [
    `Topic: ${request.prompt}`,
    `Scenario: ${request.scenario}`,
    `Language: ${request.language}`,
    "Generate a concrete PPT plan that feels ready for a real customer-facing preview.",
    "Avoid placeholders and generic wording.",
  ].join("\n")
}

function buildSeoSystemPrompt(language: SeoMetaRequest["language"]) {
  if (language === "zh-CN") {
    return [
      "你是一个 SEO 内容策略师。",
      "目标是生成 3 组可直接使用的 Meta 方向。",
      "必须输出中文。",
      "返回结构化结果，不要输出额外说明。",
      "title 和 description 需要可上线，keywords 需要适合搜索意图。",
    ].join(" ")
  }

  return [
    "You are an SEO strategist.",
    "Generate 3 launch-ready meta directions.",
    "Output in English only.",
    "Return structured data only with distinct positioning across the 3 variants.",
  ].join(" ")
}

function buildSeoUserPrompt(request: SeoMetaRequest) {
  return [
    `Topic: ${request.topic}`,
    `Audience: ${request.audience}`,
    `Page type: ${request.pageType}`,
    `Language: ${request.language}`,
    "Each variant should have a clearly different search and conversion angle.",
  ].join("\n")
}

export function hasLeadToolGenerationProvider() {
  return hasAibermApiKey() || hasCrazyrouteApiKey()
}

export async function generateLeadToolPptPreview(request: PptPreviewRequest): Promise<PptPreviewDeck> {
  const plan = (await generateStructuredObjectWithWriterModel({
    model: getLeadToolPreviewModel("ai-ppt-preview"),
    systemPrompt: buildPptSystemPrompt(request.language),
    userPrompt: buildPptUserPrompt(request),
    toolName: "return_ppt_preview_plan",
    toolDescription: "Return a concise 5-slide PPT preview plan for the requested topic.",
    jsonSchema: buildPptPlanSchema(),
    options: {
      temperature: 0.6,
      maxTokens: 2200,
      timeoutMs: 60_000,
      totalTimeoutMs: 75_000,
    },
  })) as LeadToolPptPlan

  return buildPptPreviewDeckFromPlan(request, plan)
}

export async function generateLeadToolSeoPreview(request: SeoMetaRequest): Promise<SeoMetaPreview> {
  const plan = (await generateStructuredObjectWithWriterModel({
    model: getLeadToolPreviewModel("ai-seo-meta-generator"),
    systemPrompt: buildSeoSystemPrompt(request.language),
    userPrompt: buildSeoUserPrompt(request),
    toolName: "return_seo_meta_preview",
    toolDescription: "Return three SEO meta variants for the requested page topic.",
    jsonSchema: buildSeoPlanSchema(),
    options: {
      temperature: 0.5,
      maxTokens: 1800,
      timeoutMs: 45_000,
      totalTimeoutMs: 60_000,
    },
  })) as LeadToolSeoPlan

  return {
    topic: request.topic.trim(),
    pageType: request.pageType,
    audience: request.audience.trim(),
    language: request.language,
    generatedAt: new Date().toISOString(),
    summary: plan.summary,
    variants: plan.variants,
  }
}

export async function generateLeadToolPptPreviewWithFallback(
  request: PptPreviewRequest,
  allowMockFallback: boolean,
): Promise<PptPreviewDeck> {
  if (!hasLeadToolGenerationProvider()) {
    if (allowMockFallback) {
      return buildMockPptPreview(request)
    }

    throw new Error("lead_tool_provider_missing")
  }

  try {
    return await generateLeadToolPptPreview(request)
  } catch (error) {
    if (allowMockFallback) {
      console.warn("lead-tools.ppt.preview.fallback", {
        message: error instanceof Error ? error.message : String(error),
      })
      return buildMockPptPreview(request)
    }

    throw error
  }
}

export async function generateLeadToolSeoPreviewWithFallback(
  request: SeoMetaRequest,
  allowMockFallback: boolean,
): Promise<SeoMetaPreview> {
  if (!hasLeadToolGenerationProvider()) {
    if (allowMockFallback) {
      return buildMockSeoMetaPreview(request)
    }

    throw new Error("lead_tool_provider_missing")
  }

  try {
    return await generateLeadToolSeoPreview(request)
  } catch (error) {
    if (allowMockFallback) {
      console.warn("lead-tools.seo.preview.fallback", {
        message: error instanceof Error ? error.message : String(error),
      })
      return buildMockSeoMetaPreview(request)
    }

    throw error
  }
}

export function getLeadToolResolvedModels(slug: string) {
  return {
    previewModel: getLeadToolPreviewModel(slug),
    finalModel: getLeadToolFinalModel(slug),
  }
}
