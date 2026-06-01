export type PptScenario = "marketing-campaign" | "product-launch" | "sales-deck" | "training"
export type PptLanguage = "zh-CN" | "en-US"

export type PptPreviewRequest = {
  prompt: string
  scenario: PptScenario
  language: PptLanguage
}

export type PptPreviewSlide = {
  id: string
  layout: "cover" | "agenda" | "insight" | "comparison" | "timeline"
  kicker: string
  title: string
  body: string
  bullets: string[]
  accent: string
}

export type PptPreviewVariant = {
  key: string
  name: string
  summary: string
  palette: {
    background: string
    foreground: string
    accent: string
    panel: string
    border: string
  }
  strengths: readonly string[]
  slides: PptPreviewSlide[]
}

export type PptPreviewDeck = {
  title: string
  scenario: PptScenario
  language: PptLanguage
  generatedAt: string
  outline: string[]
  variants: PptPreviewVariant[]
}

export const pptScenarioOptions: Array<{ value: PptScenario; label: string; description: string }> = [
  { value: "marketing-campaign", label: "营销策划", description: "适合增长活动、内容营销和渠道方案" },
  { value: "product-launch", label: "产品发布", description: "适合新品发布、定位表达和 GTM 介绍" },
  { value: "sales-deck", label: "销售提案", description: "适合方案销售、客户提案和商务沟通" },
  { value: "training", label: "培训课件", description: "适合入门培训、知识沉淀和内部分享" },
]

export const pptLanguageOptions: Array<{ value: PptLanguage; label: string }> = [
  { value: "zh-CN", label: "中文" },
  { value: "en-US", label: "English" },
]

export const pptPreviewStyles = [
  {
    key: "professional-business",
    name: "专业商务",
    summary: "稳重清晰，适合汇报、提案和客户沟通。",
    palette: {
      background: "#120d0d",
      foreground: "#f7f4f2",
      accent: "#f25555",
      panel: "#1d1414",
      border: "#3f2a2a",
    },
    strengths: ["结构感强", "重点信息突出", "适合企业场景"],
  },
  {
    key: "magazine-editorial",
    name: "杂志视觉",
    summary: "更强调封面与画面张力，适合品牌表达。",
    palette: {
      background: "#f8efe8",
      foreground: "#241714",
      accent: "#d3451c",
      panel: "#fff8f2",
      border: "#efcdb8",
    },
    strengths: ["视觉记忆点强", "适合品牌故事", "封面冲击感更好"],
  },
  {
    key: "growth-marketing",
    name: "增长营销",
    summary: "偏增长和转化导向，适合漏斗、策略和实验表达。",
    palette: {
      background: "#07151b",
      foreground: "#f4fffd",
      accent: "#29d3b0",
      panel: "#0d232b",
      border: "#1e4b56",
    },
    strengths: ["数据感更强", "适合策略拆解", "增长语言明确"],
  },
  {
    key: "minimal-launch",
    name: "极简发布",
    summary: "版面克制，信息层级极简，适合发布会和产品介绍。",
    palette: {
      background: "#ffffff",
      foreground: "#151515",
      accent: "#bc2323",
      panel: "#f6f3f1",
      border: "#e5dbd7",
    },
    strengths: ["阅读压力低", "适合产品表达", "更容易二次编辑"],
  },
] as const

const scenarioDescriptors: Record<PptScenario, { chinese: string; english: string; outline: string[] }> = {
  "marketing-campaign": {
    chinese: "营销策划",
    english: "marketing campaign",
    outline: ["市场机会", "核心策略", "渠道打法", "执行节奏", "转化目标"],
  },
  "product-launch": {
    chinese: "产品发布",
    english: "product launch",
    outline: ["产品定位", "目标用户", "发布亮点", "传播策略", "上线节奏"],
  },
  "sales-deck": {
    chinese: "销售提案",
    english: "sales proposal",
    outline: ["客户问题", "方案概览", "价值对比", "实施计划", "合作建议"],
  },
  training: {
    chinese: "培训课件",
    english: "training deck",
    outline: ["学习目标", "核心知识", "实操步骤", "案例说明", "行动建议"],
  },
}

function sentenceByLanguage(language: PptLanguage, zh: string, en: string) {
  return language === "zh-CN" ? zh : en
}

type PptVariantStyle = (typeof pptPreviewStyles)[number]

function buildVariantSlides(
  variant: PptVariantStyle,
  title: string,
  scenario: PptScenario,
  language: PptLanguage,
) {
  const descriptor = scenarioDescriptors[scenario]
  const topic = title.trim()

  return [
    {
      id: `${variant.key}-cover`,
      layout: "cover" as const,
      kicker: sentenceByLanguage(language, descriptor.chinese, descriptor.english.toUpperCase()),
      title: topic,
      body: sentenceByLanguage(
        language,
        `围绕“${topic}”快速构建一套适合 ${descriptor.chinese} 场景的叙事型 PPT。`,
        `A fast preview deck built around "${topic}" for a ${descriptor.english} narrative.`,
      ),
      bullets: [
        sentenceByLanguage(language, "4 种风格并行预览", "4 style directions in parallel"),
        sentenceByLanguage(language, "适合首页引流与 SEO 转化", "Built for SEO traffic and homepage conversion"),
      ],
      accent: variant.palette.accent,
    },
    {
      id: `${variant.key}-agenda`,
      layout: "agenda" as const,
      kicker: sentenceByLanguage(language, "结构总览", "OVERVIEW"),
      title: sentenceByLanguage(language, "建议内容结构", "Suggested story structure"),
      body: sentenceByLanguage(
        language,
        `先用问题与机会定义场景，再收束到策略、执行和行动。`,
        `Open with the market problem, then narrow into strategy, execution, and action.`,
      ),
      bullets: descriptor.outline.map((item, index) =>
        sentenceByLanguage(language, `${index + 1}. ${item}`, `${index + 1}. ${item}`),
      ),
      accent: variant.palette.accent,
    },
    {
      id: `${variant.key}-insight`,
      layout: "insight" as const,
      kicker: sentenceByLanguage(language, "核心洞察", "KEY INSIGHT"),
      title: sentenceByLanguage(language, "为什么这个主题值得做成 PPT", "Why this deserves a deck"),
      body: sentenceByLanguage(
        language,
        `用户先想看到方向是否靠谱，而不是先等待最终文件。预览越快，越容易促成后续下载与登录。`,
        `Users want to validate the direction first. Faster previews drive stronger trust and downstream conversion.`,
      ),
      bullets: [
        sentenceByLanguage(language, "先看到价值，再决定是否继续", "See value first, decide later"),
        sentenceByLanguage(language, "多风格对比降低反复试错成本", "Multi-style comparison reduces retry cost"),
        sentenceByLanguage(language, "登录动作留给高价值节点", "Keep login for high-intent moments"),
      ],
      accent: variant.palette.accent,
    },
    {
      id: `${variant.key}-comparison`,
      layout: "comparison" as const,
      kicker: sentenceByLanguage(language, "预览 vs 完整版", "PREVIEW VS FINAL"),
      title: sentenceByLanguage(language, "双层生成链路", "Two-stage generation flow"),
      body: sentenceByLanguage(
        language,
        `预览阶段追求速度和风格对比；完整版阶段再补充完整内容、导出能力和可编辑性。`,
        `The preview layer optimizes for speed and comparison. The final layer adds completeness and export quality.`,
      ),
      bullets: [
        sentenceByLanguage(language, "Fast Preview: 结构 + 视觉风格", "Fast Preview: structure + visual direction"),
        sentenceByLanguage(language, "Final Export: 完整内容 + 可编辑输出", "Final Export: full content + editable output"),
      ],
      accent: variant.palette.accent,
    },
    {
      id: `${variant.key}-timeline`,
      layout: "timeline" as const,
      kicker: sentenceByLanguage(language, "下一步", "NEXT STEP"),
      title: sentenceByLanguage(language, "建议行动", "Recommended next step"),
      body: sentenceByLanguage(
        language,
        `选择一个最接近预期的风格，再进入登录后的完整生成流程。`,
        `Choose the strongest direction, then continue into the login-gated full generation flow.`,
      ),
      bullets: [
        sentenceByLanguage(language, "保留当前预览会话", "Preserve the current preview session"),
        sentenceByLanguage(language, "登录后继续导出", "Resume export after login"),
        sentenceByLanguage(language, "后续接入真实 PPTX 导出器", "Wire a real PPTX exporter next"),
      ],
      accent: variant.palette.accent,
    },
  ]
}

export function buildMockPptPreview(request: PptPreviewRequest): PptPreviewDeck {
  const title = request.prompt.trim() || sentenceByLanguage(request.language, "AI 营销方案", "AI Marketing Plan")
  const descriptor = scenarioDescriptors[request.scenario]

  return buildPptPreviewDeckFromPlan(request, {
    title,
    outline: descriptor.outline,
    slides: buildVariantSlides(pptPreviewStyles[0], title, request.scenario, request.language).map(({ accent: _accent, id: _id, ...slide }) => slide),
  })
}

export function buildPptPreviewDeckFromPlan(
  request: PptPreviewRequest,
  plan: {
    title: string
    outline: readonly string[]
    slides: Array<Omit<PptPreviewSlide, "id" | "accent">>
  },
): PptPreviewDeck {
  return {
    title: plan.title.trim() || request.prompt.trim() || sentenceByLanguage(request.language, "AI 营销方案", "AI Marketing Plan"),
    scenario: request.scenario,
    language: request.language,
    generatedAt: new Date().toISOString(),
    outline: plan.outline.slice(0, 5),
    variants: pptPreviewStyles.map((variant) => ({
      ...variant,
      slides: plan.slides.slice(0, 5).map((slide, index) => ({
        ...slide,
        id: `${variant.key}-${slide.layout}-${index + 1}`,
        accent: variant.palette.accent,
      })),
    })),
  }
}
