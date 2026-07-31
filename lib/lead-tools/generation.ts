import { generateText, streamText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"

import {
  executeAiEntryWithProviderFailover,
  getConfiguredAiEntryProviders,
  type AiEntryProviderConfig,
  type AiEntryProviderId,
} from "@/lib/ai-entry/provider-routing"
import { generateStructuredObjectWithWriterModel, generateTextWithWriterModel, hasAibermApiKey, hasCrazyrouteApiKey } from "@/lib/writer/aiberm"
import { getLeadToolFinalModel, getLeadToolPreviewModel } from "@/lib/lead-tools/config"
import {
  buildPreviewStyleBody,
  buildPreviewStyleBullet,
  buildPreviewStyleKicker,
  buildPreviewStyleTitle,
  buildPreviewSystemPrompt,
  buildPreviewUserPrompt,
  isPreviewPlaceholder,
} from "@/lib/lead-tools/ppt-preview-copy"
import {
  buildPptPreviewDeckFromPlans,
  buildMockPptPreview,
  getPptPreviewLayoutSequence,
  getPptPreviewTemplateCapability,
  getPptPreviewTemplateLabel,
  resolvePptPreviewTemplateMode,
  type PptFrontendTemplateId,
  type PptPreviewDeck,
  type PptPreviewRequest,
  type PptPreviewSlide,
  pptPreviewStyles,
} from "@/lib/lead-tools/ppt-preview-data-fixed"
import { renderPptPreviewDeckAssets } from "@/lib/lead-tools/ppt-master-preview"
import { buildMockSeoMetaPreview, type SeoMetaPreview, type SeoMetaRequest, type SeoMetaVariant } from "@/lib/lead-tools/seo-meta-data"
import { loadPublicSeoSkillInstruction } from "@/lib/seo-tools/skill-loader"
import {
  buildMockSeoTitlePlan,
  buildSeoTitleReport,
  normalizeSeoTitleGeneratedPlan,
  type SeoTitleGeneratedPlan,
  type SeoTitleInput,
  type SeoTitleReport,
} from "@/lib/seo-tools/title-report"

type LeadToolPptPlan = {
  title: string
  outline: string[]
  slides: Array<Omit<PptPreviewSlide, "id" | "accent">>
}

type LeadToolSeoPlan = {
  summary: string
  variants: [SeoMetaVariant, SeoMetaVariant, SeoMetaVariant]
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

function buildPptSystemPrompt(request: PptPreviewRequest) {
  const templateMode = resolvePptPreviewTemplateMode(request)
  const templateLabel =
    templateMode === "single-template" && request.templateId
      ? getPptPreviewTemplateLabel(request.templateId, request.language)
      : undefined

  return buildPreviewSystemPrompt(request, {
    layoutSequence: getPptPreviewLayoutSequence(request.pageCount),
    templateMode,
    templateLabel,
  })
}

function buildPptUserPrompt(request: PptPreviewRequest) {
  const templateMode = resolvePptPreviewTemplateMode(request)
  const templateLabel =
    templateMode === "single-template" && request.templateId
      ? getPptPreviewTemplateLabel(request.templateId, request.language)
      : undefined

  return buildPreviewUserPrompt(request, {
    layoutSequence: getPptPreviewLayoutSequence(request.pageCount),
    templateMode,
    templateLabel,
  })
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

function buildSeoTitleUserPrompt(request: SeoTitleInput) {
  return [
    `Keyword: ${request.keyword}`,
    `Page type: ${request.pageType}`,
    `Target audience: ${request.audience}`,
    `Target region: ${request.region}`,
    `Output language: ${request.language}`,
    `Current title: ${request.currentTitle || "Not provided"}`,
    `Brand: ${request.brandName || "Not provided"}`,
    `Value proposition: ${request.valueProposition || "Not provided"}`,
    "Generate 10 to 12 genuinely distinct title angles. Do not claim to have searched Google, accessed SERP data, inspected competitors, or measured CTR.",
    "The intent hypothesis must explicitly say it is inferred from the input and is not live-SERP validated.",
  ].join("\n")
}

export function hasLeadToolGenerationProvider() {
  return (
    hasLeadToolMinimaxProvider() ||
    hasLeadToolStepfunProvider() ||
    Boolean(getConfiguredAiEntryProviders().length) ||
    hasAibermApiKey() ||
    hasCrazyrouteApiKey()
  )
}

function normalizeText(raw: unknown) {
  return typeof raw === "string" ? raw.trim() : ""
}

function getLeadToolMinimaxConfig() {
  const apiKey = normalizeText(process.env.LEAD_TOOLS_MINIMAX_API_KEY)
  const baseURL = normalizeText(process.env.LEAD_TOOLS_MINIMAX_BASE_URL) || "https://api.minimaxi.com/v1"
  const model = normalizeText(process.env.LEAD_TOOLS_MINIMAX_MODEL)

  return {
    apiKey,
    baseURL,
    model,
  }
}

function getLeadToolStepfunConfig() {
  const apiKey = normalizeText(process.env.LEAD_TOOLS_STEPFUN_API_KEY || process.env.STEPFUN_API_KEY)
  const baseURL =
    normalizeText(process.env.LEAD_TOOLS_STEPFUN_BASE_URL || process.env.STEPFUN_BASE_URL) ||
    "https://api.stepfun.com/v1"
  const model = normalizeText(process.env.LEAD_TOOLS_STEPFUN_MODEL || process.env.STEPFUN_MODEL)

  return {
    apiKey,
    baseURL,
    model,
  }
}

function hasLeadToolMinimaxProvider() {
  const config = getLeadToolMinimaxConfig()
  return Boolean(config.apiKey && config.baseURL && config.model)
}

function hasLeadToolStepfunProvider() {
  const config = getLeadToolStepfunConfig()
  return Boolean(config.apiKey && config.baseURL)
}

function hasLeadToolPptokenProvider() {
  return getConfiguredAiEntryProviders().some((provider) => provider.id === "pptoken")
}

async function generateTextWithLeadToolPreviewProvider(params: {
  systemPrompt: string
  userPrompt: string
  model: string
  maxOutputTokens?: number
  timeoutMs?: number
}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs ?? 42_000)

  try {
  if (hasLeadToolMinimaxProvider()) {
    const config = getLeadToolMinimaxConfig()
    const provider = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })

    const response = await generateText({
      model: provider.chat(config.model || params.model),
      system: params.systemPrompt,
      prompt: params.userPrompt,
      maxOutputTokens: params.maxOutputTokens,
      abortSignal: controller.signal,
    })

    const text = response.text.trim()
    if (!text) {
      throw new Error("lead_tool_preview_empty_response")
    }

    return {
      text,
      providerId: "minimax",
      model: config.model || params.model,
    }
  }

  if (hasLeadToolStepfunProvider()) {
    const config = getLeadToolStepfunConfig()
    const provider = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })

    const response = await generateText({
      model: provider.chat(config.model || params.model),
      system: params.systemPrompt,
      prompt: params.userPrompt,
      maxOutputTokens: params.maxOutputTokens,
      abortSignal: controller.signal,
    })

    const text = response.text.trim()
    if (!text) {
      throw new Error("lead_tool_preview_empty_response")
    }

    return {
      text,
      providerId: "stepfun",
      model: config.model || params.model,
    }
  }

  if (hasLeadToolPptokenProvider()) {
    const result = await executeAiEntryWithProviderFailover(
      async (providerRun) => {
        const response = await generateText({
          model: providerRun.provider.chat(providerRun.model),
          system: params.systemPrompt,
          prompt: params.userPrompt,
          maxOutputTokens: params.maxOutputTokens,
          abortSignal: controller.signal,
        })

        const text = response.text.trim()
        if (!text) {
          throw new Error("lead_tool_preview_empty_response")
        }

        return text
      },
      {
        preferredProviderId: "pptoken",
        preferredModel: params.model,
        forcePreferredProvider: true,
      },
    )

    return {
      text: result.result,
      providerId: result.providerId,
      model: result.model,
    }
  }

  const text = await generateTextWithWriterModel(params.systemPrompt, params.userPrompt, params.model, {
    temperature: 0.45,
    maxTokens: params.maxOutputTokens ?? 1400,
    timeoutMs: Math.min(params.timeoutMs ?? 42_000, 36_000),
    totalTimeoutMs: params.timeoutMs ?? 42_000,
    signal: controller.signal,
  })

  return {
    text,
    providerId: hasAibermApiKey() ? "aiberm" : hasCrazyrouteApiKey() ? "crazyroute" : "writer",
    model: params.model,
  }
  } finally {
    clearTimeout(timeoutId)
  }
}

function stripMarkdownDecorations(value: string) {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim()
}

function looksLikePlaceholder(value: string) {
  return isPreviewPlaceholder(value)
}

function extractJsonObjectBlock(rawText: string, errorCode = "json_object_missing") {
  const cleanedText = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
  const candidates: string[] = []

  for (const match of cleanedText.matchAll(/```json\s*([\s\S]*?)```/gi)) {
    if (match[1]?.trim()) {
      candidates.push(match[1].trim())
    }
  }

  for (const match of cleanedText.matchAll(/```\s*([\s\S]*?)```/gi)) {
    if (match[1]?.trim()) {
      candidates.push(match[1].trim())
    }
  }

  const slidesObjectMatch = cleanedText.match(/\{[\s\S]*"slides"\s*:\s*\[[\s\S]*\}\s*$/i)
  if (slidesObjectMatch?.[0]?.trim()) {
    candidates.push(slidesObjectMatch[0].trim())
  }

  const firstBrace = cleanedText.indexOf("{")
  const lastBrace = cleanedText.lastIndexOf("}")
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(cleanedText.slice(firstBrace, lastBrace + 1))
  }

  for (const candidate of candidates) {
    try {
      JSON.parse(candidate)
      return candidate
    } catch {
      continue
    }
  }

  throw new Error(errorCode)
}

function normalizeBasePlan(rawPlan: any, request: PptPreviewRequest): LeadToolPptPlan {
  const fallbackLayouts = getPptPreviewLayoutSequence(request.pageCount)
  const fallbackTitle = request.prompt.trim()
  const rawSlides = Array.isArray(rawPlan?.slides) ? rawPlan.slides : []

  const slides = fallbackLayouts.map((layout, index) => {
    const rawSlide = rawSlides[index] ?? {}
    const titleCandidate = typeof rawSlide?.title === "string" ? stripMarkdownDecorations(rawSlide.title) : ""
    const bodyCandidate = typeof rawSlide?.body === "string" ? stripMarkdownDecorations(rawSlide.body) : ""
    const kickerCandidate = typeof rawSlide?.kicker === "string" ? stripMarkdownDecorations(rawSlide.kicker) : ""
    const bulletCandidates = Array.isArray(rawSlide?.bullets)
      ? rawSlide.bullets.map((item: unknown) => (typeof item === "string" ? stripMarkdownDecorations(item) : "")).filter(Boolean)
      : []

    return {
      layout,
      kicker: kickerCandidate || `Slide ${index + 1}`,
      title: titleCandidate || (index === 0 ? fallbackTitle : `${fallbackTitle} · ${layout}`),
      body: bodyCandidate || `${fallbackTitle} 的第 ${index + 1} 页需要更明确的判断和解释。`,
      bullets: (bulletCandidates.length ? bulletCandidates : [`聚焦 ${fallbackTitle}`, `完成 ${layout} 页表达`]).slice(0, 4),
    }
  }) as LeadToolPptPlan["slides"]

  const rawOutline = Array.isArray(rawPlan?.outline)
    ? rawPlan.outline.map((item: unknown) => (typeof item === "string" ? stripMarkdownDecorations(item) : "")).filter(Boolean)
    : []

  const normalizedTitle =
    typeof rawPlan?.title === "string" && !looksLikePlaceholder(rawPlan.title)
      ? stripMarkdownDecorations(rawPlan.title)
      : fallbackTitle

  const normalizedOutline = rawOutline.length >= fallbackLayouts.length ? rawOutline : slides.map((slide) => slide.title).slice(0, fallbackLayouts.length)

  slides[0] = {
    ...slides[0],
    title: fallbackTitle,
  }

  return {
    title: normalizedTitle,
    outline: normalizedOutline,
    slides,
  }
}

function buildStyledPlans(basePlan: LeadToolPptPlan, request: PptPreviewRequest) {
  return (providerId: string) => pptPreviewStyles.map((style) => ({
    variantKey: style.key,
    styleKey: style.key,
    templateId: getPptPreviewTemplateCapability(style.key).templateId as PptFrontendTemplateId,
    title: basePlan.title,
    outline: basePlan.outline,
    provider: providerId,
    slides: basePlan.slides.map((slide) => {
      const baseTitle = slide.title || basePlan.title || request.prompt.trim()
      const baseBody = slide.body || request.prompt.trim()
      return {
        ...slide,
        kicker: buildPreviewStyleKicker(style.key, slide.layout, request.language),
        title: buildPreviewStyleTitle(style.key, slide.layout, baseTitle, request.prompt.trim(), request.language),
        body: buildPreviewStyleBody(style.key, baseBody, request.language),
        bullets: slide.bullets.map((bullet, index) => buildPreviewStyleBullet(style.key, bullet, index, request.language)),
      }
    }),
  }))
}

export async function generateLeadToolPptPreview(request: PptPreviewRequest): Promise<PptPreviewDeck> {
  const providerResult = await generateTextWithLeadToolPreviewProvider({
    systemPrompt: [
      buildPptSystemPrompt(request),
      request.language === "zh-CN"
        ? "只输出一个 JSON 对象，不要 markdown，不要解释。"
        : "Return only one JSON object with no markdown and no explanation.",
    ].join(" "),
    userPrompt: buildPptUserPrompt(request),
    model: getLeadToolPreviewModel("ai-ppt-preview"),
  })
  const rawPlan = JSON.parse(extractJsonObjectBlock(providerResult.text, "ppt_preview_json_missing"))
  const basePlan = normalizeBasePlan(rawPlan, request)
  const plans = buildStyledPlans(basePlan, request)(providerResult.providerId)

  return {
    ...renderPptPreviewDeckAssets(buildPptPreviewDeckFromPlans(request, plans)),
    previewModel: providerResult.model,
  }
}

export type SeoTitleProviderOptions = {
  preferredProviderId?: AiEntryProviderId | null
  preferredModel?: string | null
  forcePreferredProvider?: boolean
  disableProviderFailover?: boolean
  disableSameProviderModelFallback?: boolean
  providerConfigs?: AiEntryProviderConfig[]
}

async function generateSeoTitlePlanWithDefaultProvider(params: {
  input: SeoTitleInput
  systemPrompt: string
  userPrompt: string
  providerOptions?: SeoTitleProviderOptions
}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 40_000)

  try {
    const providerResult = await executeAiEntryWithProviderFailover(
      async (providerRun) => {
        const prompt = [
          params.systemPrompt,
          "Return only one valid JSON object. Do not use markdown, code fences, or commentary.",
          "The object must contain keyword, pageType, audience, region, language, intentHypothesis, candidates, recommendedCandidateId, abTests, and risks.",
          params.userPrompt,
        ].join("\n\n")
        const response = streamText({
          model: providerRun.provider.chat(providerRun.model),
          prompt,
          maxOutputTokens: 2_200,
          providerOptions: {
            openai: {
              reasoningEffort: "none",
            },
          },
          abortSignal: controller.signal,
        })
        let text = ""
        for await (const delta of response.textStream) {
          text += delta
        }
        text = text.trim()
        if (!text) throw new Error("seo_title_empty_response")
        return text
      },
      {
        preferredProviderId: params.providerOptions?.preferredProviderId || "deepseek",
        preferredModel:
          params.providerOptions?.preferredModel || getLeadToolPreviewModel("seo-title-generator"),
        ...(params.providerOptions || {}),
      },
    )

    return normalizeSeoTitleGeneratedPlan(
      JSON.parse(extractJsonObjectBlock(providerResult.result, "seo_title_json_missing")),
      params.input,
    )
  } finally {
    clearTimeout(timeoutId)
  }
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

export async function generateSeoTitleReport(
  request: SeoTitleInput,
  providerOptions?: SeoTitleProviderOptions,
): Promise<SeoTitleReport> {
  const skillInstruction = await loadPublicSeoSkillInstruction("headline-generator")
  const systemPrompt = [
    "You are producing a free SEO title analysis report.",
    "Use the supplied skill instructions as editorial method, but follow the output schema exactly.",
    "This public route has no live SERP, DataForSEO, GSC, GA4, page crawling, or paid tool data. Never invent or imply those sources.",
    "Make every rationale, model judgment, and A/B test specific to the supplied page type, audience, current title, and value proposition. Do not repeat generic explanations.",
    skillInstruction,
  ].join("\n\n")
  const userPrompt = buildSeoTitleUserPrompt(request)
  const plan: SeoTitleGeneratedPlan = await generateSeoTitlePlanWithDefaultProvider({
    input: request,
    systemPrompt,
    userPrompt,
    providerOptions,
  })

  return buildSeoTitleReport({
    ...plan,
    keyword: request.keyword,
    pageType: request.pageType,
    audience: request.audience,
    region: request.region,
    language: request.language,
  })
}

export async function generateSeoTitleReportWithFallback(
  request: SeoTitleInput,
  allowMockFallback: boolean,
  providerOptions?: SeoTitleProviderOptions,
): Promise<SeoTitleReport> {
  if (!hasLeadToolGenerationProvider()) {
    if (allowMockFallback) return buildSeoTitleReport(buildMockSeoTitlePlan(request))
    throw new Error("lead_tool_provider_missing")
  }

  try {
    return await generateSeoTitleReport(request, providerOptions)
  } catch (error) {
    if (allowMockFallback) {
      console.warn("lead-tools.seo-title.fallback", {
        message: error instanceof Error ? error.message : String(error),
      })
      return buildSeoTitleReport(buildMockSeoTitlePlan(request))
    }
    throw error
  }
}

export async function generateLeadToolPptPreviewWithFallback(
  request: PptPreviewRequest,
  allowMockFallback: boolean,
): Promise<PptPreviewDeck> {
  if (!hasLeadToolGenerationProvider()) {
    if (allowMockFallback) {
      return renderPptPreviewDeckAssets(buildMockPptPreview(request))
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
      return renderPptPreviewDeckAssets(buildMockPptPreview(request))
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
