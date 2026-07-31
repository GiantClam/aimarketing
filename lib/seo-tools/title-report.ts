import { z } from "zod"

import { scoreSeoTitle, type SeoTitleRuleScore } from "./title-score"

export const seoTitleInputSchema = z.object({
  keyword: z.string().trim().min(2, "Keyword is required").max(120, "Keyword must be 120 characters or fewer"),
  pageType: z.enum(["landing-page", "blog-post", "product-page", "feature-page"]).default("landing-page"),
  audience: z.string().trim().min(2, "Audience is required").max(160, "Audience must be 160 characters or fewer"),
  region: z.string().trim().min(2, "Region is required").max(80, "Region must be 80 characters or fewer"),
  language: z.enum(["zh-CN", "en-US"]).default("en-US"),
  currentTitle: z.string().trim().max(180, "Current title must be 180 characters or fewer").optional(),
  brandName: z.string().trim().max(80, "Brand name must be 80 characters or fewer").optional(),
  valueProposition: z.string().trim().max(240, "Value proposition must be 240 characters or fewer").optional(),
})

export type SeoTitleInput = z.infer<typeof seoTitleInputSchema>

const DEFAULT_ASSESSMENT = {
  intentMatch: 4,
  clarity: 4,
  differentiation: 4,
  promiseCredibility: 4,
  explanation: "Clear, intent-led title direction with a specific user benefit.",
} satisfies SeoTitleModelAssessment

export const seoTitleModelAssessmentSchema = z.object({
  intentMatch: z.number().min(1).max(5),
  clarity: z.number().min(1).max(5),
  differentiation: z.number().min(1).max(5),
  promiseCredibility: z.number().min(1).max(5),
  explanation: z.string().trim().min(1).max(600),
})

export type SeoTitleModelAssessment = z.infer<typeof seoTitleModelAssessmentSchema>

export const seoTitleCandidatePlanSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(2).max(180),
  angle: z.string().trim().min(1).max(120),
  rationale: z.string().trim().min(1).max(600),
  // DeepSeek occasionally omits this supplementary block when it has already
  // supplied the title, angle, and rationale. Keep the report usable and let
  // deterministic title checks complete the assessment instead of rejecting
  // every candidate.
  modelAssessment: seoTitleModelAssessmentSchema.optional(),
})

export type SeoTitleCandidate = Omit<z.infer<typeof seoTitleCandidatePlanSchema>, "modelAssessment"> & {
  modelAssessment: SeoTitleModelAssessment
  ruleScore: SeoTitleRuleScore
}

export type SeoTitleReport = {
  keyword: string
  pageType: SeoTitleInput["pageType"]
  audience: string
  region: string
  language: SeoTitleInput["language"]
  generatedAt: string
  intentHypothesis: string
  candidates: SeoTitleCandidate[]
  recommendedCandidateId: string
  abTests: Array<{ name: string; variantA: string; variantB: string; hypothesis: string }>
  risks: string[]
}

export const seoTitleGeneratedPlanSchema = z.object({
  keyword: z.string().trim().min(2).max(120),
  pageType: z.enum(["landing-page", "blog-post", "product-page", "feature-page"]),
  audience: z.string().trim().min(2).max(160),
  region: z.string().trim().min(2).max(80),
  language: z.enum(["zh-CN", "en-US"]),
  intentHypothesis: z.string().trim().min(1).max(800),
  candidates: z.array(seoTitleCandidatePlanSchema).min(10).max(12),
  recommendedCandidateId: z.string().trim().min(1).max(80),
  abTests: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    variantA: z.string().trim().min(1).max(180),
    variantB: z.string().trim().min(1).max(180),
    hypothesis: z.string().trim().min(1).max(600),
  })).min(2).max(3),
  risks: z.array(z.string().trim().min(1).max(500)).min(2).max(5),
})

export type SeoTitleGeneratedPlan = z.infer<typeof seoTitleGeneratedPlanSchema>

function pageTypeLabel(pageType: SeoTitleInput["pageType"], isChinese: boolean) {
  const labels = isChinese
    ? { "landing-page": "落地页", "blog-post": "文章", "product-page": "产品页", "feature-page": "功能页" }
    : { "landing-page": "landing page", "blog-post": "blog post", "product-page": "product page", "feature-page": "feature page" }
  return labels[pageType]
}

function getDefaultAssessment(language: SeoTitleInput["language"]): SeoTitleModelAssessment {
  if (language === "zh-CN") {
    return {
      ...DEFAULT_ASSESSMENT,
      explanation: "标题清晰表达了搜索意图与用户价值，仍需结合真实数据验证。",
    }
  }

  return DEFAULT_ASSESSMENT
}

export function buildMockSeoTitlePlan(input: SeoTitleInput): SeoTitleGeneratedPlan {
  const isChinese = input.language === "zh-CN"
  const pageLabel = pageTypeLabel(input.pageType, isChinese)
  const value = input.valueProposition || (isChinese ? "更清晰地完成页面目标" : "make the page goal clearer")
  const compactValue = Array.from(value).slice(0, 32).join("")
  const brandSuffix = input.brandName ? (isChinese ? `｜${input.brandName}` : ` | ${input.brandName}`) : ""
  const templates = isChinese
    ? [
        `${input.keyword}：帮助${input.audience}${compactValue}的${pageLabel}${brandSuffix}`,
        `${input.keyword}怎么选：${input.audience}的关键判断框架${brandSuffix}`,
        `${input.keyword}：从${compactValue}到落地的实用指南${brandSuffix}`,
        `${input.audience}如何用${input.keyword}${compactValue}${brandSuffix}`,
        `${input.keyword}${pageLabel}清单：上线前先确认这 5 点${brandSuffix}`,
        `${input.keyword}与手动方案对比：哪种更适合${input.audience}？${brandSuffix}`,
        `${input.keyword}方法论：让${compactValue}更可执行${brandSuffix}`,
        `${input.keyword}案例：${input.audience}可复用的${pageLabel}思路${brandSuffix}`,
        `选择${input.keyword}前，${input.audience}要先看这几个信号${brandSuffix}`,
        `${input.keyword}：为${compactValue}准备的${pageLabel}标题方向${brandSuffix}`,
      ]
    : [
        `${input.keyword}: A ${pageLabel} for ${input.audience} to ${compactValue}${brandSuffix}`,
        `How to Choose ${input.keyword}: A Decision Framework for ${input.audience}${brandSuffix}`,
        `${input.keyword}: A Practical Guide to ${compactValue}${brandSuffix}`,
        `How ${input.audience} Use ${input.keyword} to ${compactValue}${brandSuffix}`,
        `${input.keyword} ${pageLabel} Checklist: 5 Things to Confirm Before Launch${brandSuffix}`,
        `${input.keyword} vs. Manual Work: Which Fits ${input.audience}?${brandSuffix}`,
        `The ${input.keyword} Framework for Making ${compactValue} Actionable${brandSuffix}`,
        `${input.keyword} Examples: Reusable ${pageLabel} Ideas for ${input.audience}${brandSuffix}`,
        `What ${input.audience} Should Check Before Choosing ${input.keyword}${brandSuffix}`,
        `${input.keyword}: ${pageLabel} Title Directions for ${compactValue}${brandSuffix}`,
      ]
  const angleNames = isChinese
    ? ["实用入门", "选择比较", "清晰解释", "结果导向", "行动清单", "方案对比", "方法论", "案例参考", "降低决策成本", "页面承接"]
    : ["Practical guide", "Selection intent", "Clear explanation", "Outcome-led", "Action checklist", "Comparison", "Framework", "Examples", "Decision confidence", "Page handoff"]
  const currentTitleContext = input.currentTitle
    ? isChinese
      ? `，用于替换当前标题「${input.currentTitle}」`
      : `, replacing the current title “${input.currentTitle}”`
    : ""
  const candidates = templates.map((title, index) => ({
    id: `title-${index + 1}`,
    title,
    angle: angleNames[index] || `Angle ${index + 1}`,
    rationale: isChinese
      ? `以${pageLabel}的页面目的和“${value}”为核心，为${input.audience}提供可测试的标题方向${currentTitleContext}。`
      : `Built for this ${pageLabel}, the stated goal “${value},” and ${input.audience}${currentTitleContext} without claiming live SERP or competitor data.`,
    modelAssessment: {
      ...DEFAULT_ASSESSMENT,
      explanation: isChinese
        ? `标题围绕${pageLabel}的用户任务表达关键词与价值，但仍需通过真实数据验证。`
        : `The title connects the keyword to a ${pageLabel} task and stated value; real data is still required for validation.`,
    },
  }))
  return {
    keyword: input.keyword,
    pageType: input.pageType,
    audience: input.audience,
    region: input.region,
    language: input.language,
    intentHypothesis: isChinese
      ? `这是针对${pageLabel}、${input.audience}和“${value}”推断的搜索意图假设，尚未使用实时 SERP 验证。`
      : `This is an intent hypothesis for a ${pageLabel}, ${input.audience}, and the goal “${value}”; it has not been validated with live SERP data.`,
    candidates,
    recommendedCandidateId: candidates[0]?.id || "title-1",
    abTests: [
      {
        name: isChinese ? "价值表达" : "Value framing",
        variantA: candidates[0]?.title || "",
        variantB: candidates[3]?.title || "",
        hypothesis: isChinese ? "明确的结果承诺会提高高意图访问者的点击意愿。" : "A concrete outcome may improve clicks from high-intent visitors.",
      },
      {
        name: isChinese ? "教育与比较" : "Education vs. comparison",
        variantA: candidates[2]?.title || "",
        variantB: candidates[5]?.title || "",
        hypothesis: isChinese ? "不同任务阶段的搜索者会偏好不同的标题角度。" : "Searchers at different decision stages may prefer different title angles.",
      },
    ],
    risks: isChinese
      ? ["未使用实时 SERP 或竞品数据验证。", "规则评分用于辅助决策，不能预测真实 CTR。"]
      : ["This report does not validate live SERP or competitor data.", "Rule scores support decisions; they do not predict actual CTR."],
  }
}

export function buildSeoTitleReport(plan: SeoTitleGeneratedPlan): SeoTitleReport {
  const titles = plan.candidates.map((candidate) => candidate.title)
  const candidates: SeoTitleCandidate[] = plan.candidates.map((candidate) => ({
    ...candidate,
    modelAssessment: candidate.modelAssessment || getDefaultAssessment(plan.language),
    ruleScore: scoreSeoTitle({ title: candidate.title, keyword: plan.keyword, candidates: titles, language: plan.language }),
  }))
  const recommendedCandidateId = candidates.some((candidate) => candidate.id === plan.recommendedCandidateId)
    ? plan.recommendedCandidateId
    : [...candidates].sort((left, right) => right.ruleScore.total - left.ruleScore.total)[0]?.id || "title-1"

  return {
    ...plan,
    generatedAt: new Date().toISOString(),
    candidates,
    recommendedCandidateId,
  }
}

export const paidSeoCapabilities = [
  {
    id: "live-serp",
    title: "Live SERP patterns",
    source: "DataForSEO",
    requirement: "Subscription or credits",
    estimatedCredits: 30,
    description: "Compare the current Top 10 titles, domains, ranking positions, and SERP features.",
  },
  {
    id: "keyword-demand",
    title: "Keyword demand and difficulty",
    source: "DataForSEO",
    requirement: "Subscription or credits",
    estimatedCredits: 30,
    description: "Use current search volume, keyword difficulty, and feature signals before prioritizing a page.",
  },
  {
    id: "performance-review",
    title: "GSC and GA4 performance review",
    source: "Your connected properties",
    requirement: "Connected property and authorization",
    estimatedCredits: 0,
    description: "Check query ownership, cannibalization, landing-page engagement, and conversion performance.",
  },
] as const

export function getLocalizedPaidSeoCapabilities(language: SeoTitleInput["language"]) {
  if (language !== "zh-CN") return paidSeoCapabilities

  const localized = {
    "live-serp": {
      title: "实时 SERP 页面格局",
      description: "对比当前 Top 10 标题、域名、排名位置与 SERP 特征。",
      source: "DataForSEO",
      requirement: "订阅或积分",
    },
    "keyword-demand": {
      title: "关键词需求与难度",
      description: "获取当前搜索量、关键词难度与 SERP 特征信号，为页面优先级提供依据。",
      source: "DataForSEO",
      requirement: "订阅或积分",
    },
    "performance-review": {
      title: "GSC 与 GA4 表现复盘",
      description: "检查查询归属、关键词互食、落地页参与度与转化表现。",
      source: "已连接的网站资源",
      requirement: "已连接资源并完成授权",
    },
  } as const

  return paidSeoCapabilities.map((capability) => ({
    ...capability,
    ...localized[capability.id],
  }))
}
