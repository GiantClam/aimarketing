export type PptScenario = "marketing-campaign" | "product-launch" | "sales-deck" | "training"
export type PptLanguage = "zh-CN" | "en-US"
export type PptPreviewStyleKey = "swiss-grid" | "editorial-poster" | "neo-brutalism" | "aurora-glass"

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

export type PptPreviewAsset = {
  mimeType: "image/svg+xml"
  width: number
  height: number
  dataUrl: string
}

export type PptPreviewVariantStyle = {
  key: PptPreviewStyleKey
  name: string
  summary: string
  stylePrompt: string
  palette: {
    background: string
    foreground: string
    accent: string
    panel: string
    border: string
  }
  strengths: readonly string[]
}

export type PptPreviewVariant = PptPreviewVariantStyle & {
  slides: PptPreviewSlide[]
  preview?: {
    format: "svg"
    themeId: string
    cover: PptPreviewAsset
    slides: PptPreviewAsset[]
  }
}

export type PptPreviewDeck = {
  title: string
  scenario: PptScenario
  language: PptLanguage
  generatedAt: string
  outline: string[]
  variants: PptPreviewVariant[]
  previewEngine?: "ppt-master-svg"
  provider?: string
  previewModel?: string
  source?: "live" | "mock"
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

export const pptPreviewStyles: readonly PptPreviewVariantStyle[] = [
  {
    key: "swiss-grid",
    name: "Swiss Grid",
    summary: "冷静、克制、强网格的咨询感版本，适合高层判断和信息压缩。",
    stylePrompt:
      "Use a Swiss editorial grid. Make the copy decisive, modular, and highly compressed. Favor sharp headers, disciplined contrast, and concrete recommendations.",
    palette: {
      background: "#f4f0e8",
      foreground: "#111111",
      accent: "#c1121f",
      panel: "#ebe3d4",
      border: "#d5c8b3",
    },
    strengths: ["结构强", "高密度", "咨询感"],
  },
  {
    key: "editorial-poster",
    name: "Editorial Poster",
    summary: "海报化大字标题、强视觉呼吸感，适合趋势故事和强记忆点表达。",
    stylePrompt:
      "Write like a premium editorial poster story. Headlines should be emotionally charged, memorable, and cinematic while staying presentation-ready.",
    palette: {
      background: "#f7efe6",
      foreground: "#201614",
      accent: "#d35c2c",
      panel: "#fff8f0",
      border: "#e9d5c4",
    },
    strengths: ["大字海报", "叙事张力", "适合传播"],
  },
  {
    key: "neo-brutalism",
    name: "Neo Brutalism",
    summary: "高对比色块、极粗层级和攻击性标题，适合首屏冲击和产品发声。",
    stylePrompt:
      "Write like a neo-brutalist launch deck. The copy should feel aggressive, blunt, and high-contrast, with short decisive claims and visible momentum.",
    palette: {
      background: "#070707",
      foreground: "#fffdf6",
      accent: "#d7ff37",
      panel: "#111111",
      border: "#343434",
    },
    strengths: ["冲击强", "块面大", "产品发声"],
  },
  {
    key: "aurora-glass",
    name: "Aurora Glass",
    summary: "冷色发光、透明叠层和未来产品感，适合 AI、SaaS 和技术主题。",
    stylePrompt:
      "Write like a premium future-facing SaaS keynote. Balance clarity with aspiration. Each slide should feel polished, product-like, and slightly futuristic.",
    palette: {
      background: "#09111d",
      foreground: "#f7fbff",
      accent: "#65e9ff",
      panel: "#13233b",
      border: "#2f5875",
    },
    strengths: ["发光层次", "未来感", "科技产品"],
  },
] as const

const scenarioDescriptors: Record<PptScenario, { chinese: string; english: string; outline: string[] }> = {
  "marketing-campaign": {
    chinese: "营销策划",
    english: "marketing campaign",
    outline: ["机会窗口", "受众判断", "策略主轴", "执行组合", "转化动作"],
  },
  "product-launch": {
    chinese: "产品发布",
    english: "product launch",
    outline: ["市场背景", "产品定位", "核心亮点", "发布叙事", "下一步动作"],
  },
  "sales-deck": {
    chinese: "销售提案",
    english: "sales proposal",
    outline: ["业务问题", "解决路径", "价值证明", "实施计划", "合作建议"],
  },
  training: {
    chinese: "培训课件",
    english: "training deck",
    outline: ["学习目标", "关键概念", "方法步骤", "案例拆解", "行动清单"],
  },
}

function sentenceByLanguage(language: PptLanguage, zh: string, en: string) {
  return language === "zh-CN" ? zh : en
}

function buildMockVariantSlides(
  style: PptPreviewVariantStyle,
  title: string,
  scenario: PptScenario,
  language: PptLanguage,
) {
  const descriptor = scenarioDescriptors[scenario]
  const topic = title.trim()

  return [
    {
      id: `${style.key}-cover`,
      layout: "cover" as const,
      kicker: sentenceByLanguage(language, descriptor.chinese, descriptor.english.toUpperCase()),
      title: topic,
      body: sentenceByLanguage(
        language,
        `围绕“${topic}”快速搭出一套 ${style.name} 风格的展示稿，先判断方向，再进入完整生成。`,
        `A ${style.name} preview deck built around "${topic}" so users can judge the direction before export.`,
      ),
      bullets: [
        sentenceByLanguage(language, "预览优先速度，不等待完整 PPTX", "Preview prioritizes speed over final PPTX export"),
        sentenceByLanguage(language, "同一主题并发比较 4 种讲法", "Compare four narrative directions in parallel"),
        sentenceByLanguage(language, "把登录动作留给高意图节点", "Keep login for high-intent moments"),
      ],
      accent: style.palette.accent,
    },
    {
      id: `${style.key}-agenda`,
      layout: "agenda" as const,
      kicker: sentenceByLanguage(language, "结构总览", "STRUCTURE"),
      title: sentenceByLanguage(language, "这一版建议怎么讲", "How this version should unfold"),
      body: sentenceByLanguage(
        language,
        `从场景判断切入，再过渡到方法、对比和执行建议，保持 5 页内可快速浏览。`,
        `Open with context, move into the method, then land on comparison and action in five scannable slides.`,
      ),
      bullets: descriptor.outline.map((item, index) => sentenceByLanguage(language, `${index + 1}. ${item}`, `${index + 1}. ${item}`)),
      accent: style.palette.accent,
    },
    {
      id: `${style.key}-insight`,
      layout: "insight" as const,
      kicker: sentenceByLanguage(language, "核心洞察", "INSIGHT"),
      title: sentenceByLanguage(language, "为什么先做视觉预览", "Why visual preview comes first"),
      body: sentenceByLanguage(
        language,
        `用户第一反应不是“文件能不能下载”，而是“这套表达值不值得继续”。预览越快，越能提高后续动作转化。`,
        `The first question is not whether the file can download. It is whether this direction deserves another step. Faster previews improve conversion.`,
      ),
      bullets: [
        sentenceByLanguage(language, "先验证方向，再投入完整生成", "Validate direction before committing to full generation"),
        sentenceByLanguage(language, "视觉差异比文案说明更容易判断", "Visual contrast is easier to judge than descriptive copy"),
        sentenceByLanguage(language, "更适合首页和 SEO 流量承接", "Better for homepage and SEO traffic capture"),
      ],
      accent: style.palette.accent,
    },
    {
      id: `${style.key}-comparison`,
      layout: "comparison" as const,
      kicker: sentenceByLanguage(language, "预览层 vs 成品层", "PREVIEW VS FINAL"),
      title: sentenceByLanguage(language, "这条链路为什么更轻", "Why this pipeline feels lighter"),
      body: sentenceByLanguage(
        language,
        `预览只解决“快看到”，成品层再解决“可编辑、可导出、可交付”。前者负责转化，后者负责完成任务。`,
        `Preview solves speed-to-visual. The final layer solves editability, export, and delivery. The first converts; the second completes the job.`,
      ),
      bullets: [
        sentenceByLanguage(language, "Preview: SVG 视觉结果", "Preview: SVG visual result"),
        sentenceByLanguage(language, "Final: 可编辑 PPTX", "Final: editable PPTX"),
        sentenceByLanguage(language, "登录留在下载和完整生成", "Login stays at download and final generation"),
      ],
      accent: style.palette.accent,
    },
    {
      id: `${style.key}-timeline`,
      layout: "timeline" as const,
      kicker: sentenceByLanguage(language, "下一步", "NEXT"),
      title: sentenceByLanguage(language, "看到合适方向之后", "After the right direction appears"),
      body: sentenceByLanguage(
        language,
        `保留当前会话，选择最接近预期的风格，再进入完整生成或下载。`,
        `Preserve the current session, choose the strongest direction, then continue to full generation or download.`,
      ),
      bullets: [
        sentenceByLanguage(language, "锁定最接近预期的风格", "Lock the closest visual direction"),
        sentenceByLanguage(language, "登录后继续完整导出", "Continue to full export after login"),
        sentenceByLanguage(language, "保持会话不断裂", "Keep the session continuous"),
      ],
      accent: style.palette.accent,
    },
  ]
}

export function getPptPreviewStyleByKey(styleKey: PptPreviewStyleKey) {
  return pptPreviewStyles.find((style) => style.key === styleKey)
}

export function buildMockPptPreview(request: PptPreviewRequest): PptPreviewDeck {
  const title = request.prompt.trim() || sentenceByLanguage(request.language, "AI 营销方案", "AI Marketing Plan")
  const descriptor = scenarioDescriptors[request.scenario]

  return {
    title,
    scenario: request.scenario,
    language: request.language,
    generatedAt: new Date().toISOString(),
    outline: descriptor.outline.slice(0, 5),
    provider: "mock",
    source: "mock",
    variants: pptPreviewStyles.map((style) => ({
      ...style,
      slides: buildMockVariantSlides(style, title, request.scenario, request.language),
    })),
  }
}

export function buildPptPreviewDeckFromPlans(
  request: PptPreviewRequest,
  plans: Array<{
    styleKey: PptPreviewStyleKey
    title: string
    outline: readonly string[]
    provider?: string
    slides: Array<Omit<PptPreviewSlide, "id" | "accent">>
  }>,
): PptPreviewDeck {
  const firstPlan = plans[0]
  const fallbackTitle = request.prompt.trim() || sentenceByLanguage(request.language, "AI 营销方案", "AI Marketing Plan")
  const descriptor = scenarioDescriptors[request.scenario]

  return {
    title: firstPlan?.title.trim() || fallbackTitle,
    scenario: request.scenario,
    language: request.language,
    generatedAt: new Date().toISOString(),
    outline: (firstPlan?.outline ?? descriptor.outline).slice(0, 5),
    provider: firstPlan?.provider || "live",
    source: "live",
    variants: pptPreviewStyles.map((style) => {
      const plan = plans.find((item) => item.styleKey === style.key)
      const slides = (plan?.slides ?? buildMockVariantSlides(style, fallbackTitle, request.scenario, request.language)).slice(0, 5)
      const fallbackSlideTitles = (plan?.outline ?? descriptor.outline).slice(0, 5)

      return {
        ...style,
        slides: slides.map((slide, index) => ({
          ...slide,
          title: slide.title?.trim() || (index === 0 ? fallbackTitle : fallbackSlideTitles[index] || fallbackTitle),
          id: `${style.key}-${slide.layout}-${index + 1}`,
          accent: style.palette.accent,
        })),
      }
    }),
  }
}
