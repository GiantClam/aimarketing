import {
  buildPreviewStyleBody,
  buildPreviewStyleBullet,
  buildPreviewStyleKicker,
  buildPreviewStyleTitle,
} from "@/lib/lead-tools/ppt-preview-copy"

export type PptScenario = "marketing-campaign" | "product-launch" | "sales-deck" | "training"
export type PptLanguage = "zh-CN" | "en-US"
export type PptPreviewLayout =
  | "cover"
  | "agenda"
  | "insight"
  | "comparison"
  | "evidence"
  | "stats"
  | "chart"
  | "process"
  | "timeline"
export type PptPreviewPageIntent =
  | "cover"
  | "contents"
  | "statement"
  | "spotlight"
  | "comparison"
  | "stats"
  | "chart"
  | "process"
  | "closing"
export type PptPreviewStructuredField =
  | "bullets"
  | "contentsItems"
  | "comparisonItems"
  | "spotlightItems"
  | "metricItems"
  | "chartItems"
  | "processItems"
  | "closingItems"
export type PptPreviewVisualPriority = "hero" | "structured" | "comparison" | "evidence" | "data" | "flow" | "closing"
export type PptPreviewStyleKey =
  | "ppt169_brutalist_ai_newspaper_2026"
  | "ppt169_sugar_rush_memphis"
  | "ppt169_pritzker_2026"
  | "ppt169_swiss_grid_systems"
export type PptPreviewModelValue = "MiniMax-M2.7-highspeed" | "MiniMax-M3" | "gpt-5.4" | "step-3.7-flash"
export type PptPreviewTemplateMode = "auto-4" | "single-template"
export type PptFrontendTemplateId = "long-table" | "playful" | "broadside" | "neo-grid-bold"
export type PptPreviewPageCount = number
export type PptPreviewNarrativeAngle = "executive-brief" | "campaign-story" | "data-proof" | "action-plan"

export const MIN_PPT_PREVIEW_PAGE_COUNT = 4
export const MAX_PPT_PREVIEW_PAGE_COUNT = 20
export const DEFAULT_PPT_PREVIEW_PAGE_COUNT = 9

export type PptPreviewResearchBrief = {
  topic: string
  keyFacts: string[]
  numericEvidence?: string[]
  risks?: string[]
  implications?: string[]
  sourceNotes?: string[]
  rawSummary?: string
}

export type PptPreviewRequest = {
  prompt: string
  researchBrief?: string | PptPreviewResearchBrief
  scenario: PptScenario
  language: PptLanguage
  model?: PptPreviewModelValue
  templateMode?: PptPreviewTemplateMode
  templateId?: PptFrontendTemplateId
  narrativeAngle?: PptPreviewNarrativeAngle
  pageCount?: PptPreviewPageCount | null
  images?: PptPreviewInputImage[]
}

export type PptPreviewInputImage = {
  url: string
  title?: string | null
  mimeType?: string | null
  sourceNodeKey?: string | null
  role?: "cover" | "content" | "logo" | "reference"
}

export type PptPreviewSlide = {
  id: string
  layout: PptPreviewLayout
  intent?: PptPreviewPageIntent
  nativePageType?: string
  structuredFields?: PptPreviewStructuredField[]
  kicker: string
  title: string
  body: string
  bullets: string[]
  contentsItems?: Array<{
    index: string
    title: string
    detail: string
  }>
  comparisonItems?: Array<{
    label: string
    title: string
    detail: string
  }>
  spotlightItems?: Array<{
    title: string
    detail: string
  }>
  metricItems?: Array<{
    value: string
    label: string
    note?: string
  }>
  chartItems?: Array<{
    label: string
    value: number
    detail: string
  }>
  processItems?: Array<{
    step: string
    title: string
    detail: string
  }>
  closingItems?: Array<{
    label: string
    detail: string
  }>
  image?: PptPreviewInputImage
  accent: string
}

export type PptPreviewAsset = {
  mimeType: "image/svg+xml" | "image/png"
  width: number
  height: number
  dataUrl: string
}

export type PptPreviewTemplateSlotSchema = {
  layout: PptPreviewLayout
  intent: PptPreviewPageIntent
  nativePageType: string
  structuredFields: readonly PptPreviewStructuredField[]
  visualPriority: PptPreviewVisualPriority
  fallbackIntents?: readonly PptPreviewPageIntent[]
}

export type PptPreviewTemplateCapability = {
  templateId: string
  summary: string
  slots: readonly PptPreviewTemplateSlotSchema[]
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

export type PptPreviewVariant = Omit<PptPreviewVariantStyle, "key"> & {
  key: string
  styleKey: PptPreviewStyleKey
  templateId?: PptFrontendTemplateId
  narrativeAngle?: PptPreviewNarrativeAngle
  slotLabel?: "A" | "B" | "C" | "D"
  outline?: string[]
  slides: PptPreviewSlide[]
  preview?: {
    format: "svg"
    themeId: string
    cover: PptPreviewAsset
    slides: PptPreviewAsset[]
    htmlDocument?: {
      fileName: string
      html: string
    }
  }
}

export type PptPreviewDeck = {
  title: string
  scenario: PptScenario
  language: PptLanguage
  generatedAt: string
  outline: string[]
  variants: PptPreviewVariant[]
  previewEngine?: "ppt-master-svg" | "ppt-master-project" | "frontend-slides-html"
  previewSessionId?: string
  provider?: string
  previewModel?: string
  source?: "live" | "mock"
  templateMode?: PptPreviewTemplateMode
  selectedTemplateId?: PptFrontendTemplateId | null
  pageCount?: PptPreviewPageCount | null
  resolvedPageCount?: PptPreviewPageCount
}

export type PptPreviewVariantDescriptor = {
  key: string
  slotLabel: "A" | "B" | "C" | "D"
  style: PptPreviewVariantStyle
  templateId: PptFrontendTemplateId
  narrativeAngle?: PptPreviewNarrativeAngle
}

export const pptPreviewStyleIntentMap: Readonly<
  Record<PptPreviewStyleKey, Record<PptPreviewLayout, PptPreviewPageIntent>>
> = {
  "ppt169_brutalist_ai_newspaper_2026": {
    cover: "cover",
    agenda: "contents",
    insight: "statement",
    comparison: "comparison",
    evidence: "spotlight",
    stats: "stats",
    chart: "chart",
    process: "process",
    timeline: "closing",
  },
  "ppt169_sugar_rush_memphis": {
    cover: "cover",
    agenda: "contents",
    insight: "spotlight",
    comparison: "comparison",
    evidence: "statement",
    stats: "stats",
    chart: "chart",
    process: "process",
    timeline: "closing",
  },
  "ppt169_pritzker_2026": {
    cover: "cover",
    agenda: "contents",
    insight: "statement",
    comparison: "comparison",
    evidence: "spotlight",
    stats: "stats",
    chart: "chart",
    process: "process",
    timeline: "closing",
  },
  "ppt169_swiss_grid_systems": {
    cover: "cover",
    agenda: "contents",
    insight: "statement",
    comparison: "comparison",
    evidence: "spotlight",
    stats: "stats",
    chart: "chart",
    process: "process",
    timeline: "closing",
  },
} as const

const pptPreviewStructuredFieldsByIntent: Readonly<Record<PptPreviewPageIntent, readonly PptPreviewStructuredField[]>> = {
  cover: ["bullets"],
  contents: ["contentsItems"],
  statement: ["bullets"],
  spotlight: ["spotlightItems"],
  comparison: ["comparisonItems"],
  stats: ["metricItems"],
  chart: ["chartItems"],
  process: ["processItems"],
  closing: ["closingItems"],
} as const

function createTemplateSlot(
  layout: PptPreviewLayout,
  intent: PptPreviewPageIntent,
  nativePageType: string,
  visualPriority: PptPreviewVisualPriority,
  fallbackIntents?: readonly PptPreviewPageIntent[],
): PptPreviewTemplateSlotSchema {
  return {
    layout,
    intent,
    nativePageType,
    structuredFields: pptPreviewStructuredFieldsByIntent[intent],
    visualPriority,
    fallbackIntents,
  }
}

export const pptPreviewTemplateCapabilities: Readonly<Record<PptPreviewStyleKey, PptPreviewTemplateCapability>> = {
  "ppt169_brutalist_ai_newspaper_2026": {
    templateId: "long-table",
    summary: "Long Table prioritizes agenda clarity, ledger structures, moderated comparisons, and service-style closing blocks.",
    slots: [
      createTemplateSlot("cover", "cover", "editorial-cover", "hero"),
      createTemplateSlot("agenda", "contents", "agenda-ledger", "structured"),
      createTemplateSlot("insight", "statement", "quote-verdict", "hero"),
      createTemplateSlot("comparison", "comparison", "featured-edition-compare", "comparison"),
      createTemplateSlot("evidence", "spotlight", "evidence-matrix", "evidence"),
      createTemplateSlot("stats", "stats", "metric-ledger", "data"),
      createTemplateSlot("chart", "chart", "index-board", "data", ["comparison", "stats", "spotlight"]),
      createTemplateSlot("process", "process", "schedule-ledger", "flow", ["closing", "contents", "spotlight"]),
      createTemplateSlot("timeline", "closing", "service-close", "closing", ["process", "spotlight"]),
    ],
  },
  "ppt169_sugar_rush_memphis": {
    templateId: "playful",
    summary: "Playful favors branded bursts, collage comparisons, chart boards, and guided flow tracks instead of cartoon fallback chips.",
    slots: [
      createTemplateSlot("cover", "cover", "brand-burst-cover", "hero"),
      createTemplateSlot("agenda", "contents", "orbit-contents", "structured"),
      createTemplateSlot("insight", "spotlight", "brand-proof-band", "evidence"),
      createTemplateSlot("comparison", "comparison", "collage-compare", "comparison"),
      createTemplateSlot("evidence", "statement", "vision-frame", "hero"),
      createTemplateSlot("stats", "stats", "signal-pop-grid", "data"),
      createTemplateSlot("chart", "chart", "brand-chart-board", "data", ["comparison", "stats", "spotlight"]),
      createTemplateSlot("process", "process", "brand-flow-track", "flow", ["closing", "contents", "spotlight"]),
      createTemplateSlot("timeline", "closing", "ribbon-close", "closing", ["process", "spotlight"]),
    ],
  },
  "ppt169_pritzker_2026": {
    templateId: "broadside",
    summary: "Broadside emphasizes declaration posters, supporting columns, spillover boards, and action broadsides with explicit support text.",
    slots: [
      createTemplateSlot("cover", "cover", "poster-cover", "hero"),
      createTemplateSlot("agenda", "contents", "column-contents-board", "structured"),
      createTemplateSlot("insight", "statement", "declaration-poster", "hero"),
      createTemplateSlot("comparison", "comparison", "broadside-contrast-column", "comparison"),
      createTemplateSlot("evidence", "spotlight", "proof-poster-column", "evidence"),
      createTemplateSlot("stats", "stats", "market-barboard", "data"),
      createTemplateSlot("chart", "chart", "spillover-barboard", "data", ["comparison", "stats", "spotlight"]),
      createTemplateSlot("process", "process", "action-broadside", "flow", ["closing", "spotlight", "contents"]),
      createTemplateSlot("timeline", "closing", "closing-broadside", "closing", ["process", "spotlight"]),
    ],
  },
  "ppt169_swiss_grid_systems": {
    templateId: "neo-grid-bold",
    summary: "Neo-Grid Bold is the most modular preset, leaning on visible rails, signal boards, grid comparisons, and action sequences.",
    slots: [
      createTemplateSlot("cover", "cover", "grid-hero", "hero"),
      createTemplateSlot("agenda", "contents", "module-rail", "structured"),
      createTemplateSlot("insight", "statement", "decision-grid", "hero"),
      createTemplateSlot("comparison", "comparison", "grid-compare-shell", "comparison"),
      createTemplateSlot("evidence", "spotlight", "proof-grid", "evidence"),
      createTemplateSlot("stats", "stats", "signal-count-grid", "data"),
      createTemplateSlot("chart", "chart", "signal-chart-board", "data", ["comparison", "stats", "spotlight"]),
      createTemplateSlot("process", "process", "sequence-flow-board", "flow", ["closing", "contents", "spotlight"]),
      createTemplateSlot("timeline", "closing", "action-sequence-close", "closing", ["process", "spotlight"]),
    ],
  },
} as const

export const pptPreviewStyleCapabilities: Readonly<Record<PptPreviewStyleKey, readonly PptPreviewPageIntent[]>> = {
  "ppt169_brutalist_ai_newspaper_2026": pptPreviewTemplateCapabilities["ppt169_brutalist_ai_newspaper_2026"].slots.map((slot) => slot.intent),
  "ppt169_sugar_rush_memphis": pptPreviewTemplateCapabilities["ppt169_sugar_rush_memphis"].slots.map((slot) => slot.intent),
  "ppt169_pritzker_2026": pptPreviewTemplateCapabilities["ppt169_pritzker_2026"].slots.map((slot) => slot.intent),
  "ppt169_swiss_grid_systems": pptPreviewTemplateCapabilities["ppt169_swiss_grid_systems"].slots.map((slot) => slot.intent),
} as const

export const pptFrontendTemplateOptions = [
  {
    id: "long-table",
    label: { zh: "长桌纪要", en: "Long Table" },
    styleKey: "ppt169_brutalist_ai_newspaper_2026",
    summary: { zh: "规则线、分栏和议题感最强。", en: "Ruled, structured, boardroom-style." },
  },
  {
    id: "playful",
    label: { zh: "轻快玩味", en: "Playful" },
    styleKey: "ppt169_sugar_rush_memphis",
    summary: { zh: "圆角、贴纸和高亮色块最强。", en: "Rounded, bright, energetic." },
  },
  {
    id: "broadside",
    label: { zh: "告示海报", en: "Broadside" },
    styleKey: "ppt169_pritzker_2026",
    summary: { zh: "大字号、强栏位和宣言感最强。", en: "Poster-like, bold, declarative." },
  },
  {
    id: "neo-grid-bold",
    label: { zh: "新网格粗体", en: "Neo Grid Bold" },
    styleKey: "ppt169_swiss_grid_systems",
    summary: { zh: "可见网格、强对比模块和策略界面感最强。", en: "Visible grids, modular, strategic." },
  },
] as const satisfies ReadonlyArray<{
  id: PptFrontendTemplateId
  label: { zh: string; en: string }
  styleKey: PptPreviewStyleKey
  summary: { zh: string; en: string }
}>

export const pptPreviewNarrativeAngles = [
  {
    id: "executive-brief",
    slotLabel: "A",
    label: { zh: "Executive Brief", en: "Executive Brief" },
    prompt: {
      zh: "把这一版写成适合管理层快速决策的 executive brief，优先给结论、风险和下一步。",
      en: "Write this version as an executive brief that prioritizes the call, risk posture, and immediate next steps.",
    },
  },
  {
    id: "campaign-story",
    slotLabel: "B",
    label: { zh: "Campaign Story", en: "Campaign Story" },
    prompt: {
      zh: "把这一版写成更有叙事节奏和受众牵引的 campaign story，强调场景、传播和说服路径。",
      en: "Write this version as a campaign story with stronger narrative momentum, audience pull, and persuasion pacing.",
    },
  },
  {
    id: "data-proof",
    slotLabel: "C",
    label: { zh: "Data Proof", en: "Data Proof" },
    prompt: {
      zh: "把这一版写成 data proof 视角，优先用证据、指标和对照关系支撑判断。",
      en: "Write this version from a data-proof angle that leans on evidence, metrics, and comparative support.",
    },
  },
  {
    id: "action-plan",
    slotLabel: "D",
    label: { zh: "Action Plan", en: "Action Plan" },
    prompt: {
      zh: "把这一版写成 action plan，优先说明执行顺序、负责人视角和落地动作。",
      en: "Write this version as an action plan that makes execution order, ownership, and rollout steps explicit.",
    },
  },
] as const satisfies ReadonlyArray<{
  id: PptPreviewNarrativeAngle
  slotLabel: "A" | "B" | "C" | "D"
  label: { zh: string; en: string }
  prompt: { zh: string; en: string }
}>

export const pptPreviewLayoutSequenceByPageCount: Readonly<Record<number, readonly PptPreviewLayout[]>> = {
  5: ["cover", "agenda", "insight", "comparison", "timeline"],
  7: ["cover", "agenda", "insight", "evidence", "stats", "process", "timeline"],
  9: ["cover", "agenda", "insight", "comparison", "evidence", "stats", "chart", "process", "timeline"],
} as const

const pptPreviewBaseLayoutsBeforeClosing: readonly PptPreviewLayout[] = [
  "cover",
  "agenda",
  "insight",
  "comparison",
  "evidence",
  "stats",
  "chart",
  "process",
] as const

const pptPreviewRepeatableMiddleLayouts: readonly PptPreviewLayout[] = [
  "insight",
  "comparison",
  "evidence",
  "stats",
  "chart",
  "process",
] as const

export const pptPreviewLayouts: readonly PptPreviewLayout[] = [
  "cover",
  "agenda",
  "insight",
  "comparison",
  "evidence",
  "stats",
  "chart",
  "process",
  "timeline",
] as const
const pptPreviewPageIntents: readonly PptPreviewPageIntent[] = [
  "cover",
  "contents",
  "statement",
  "spotlight",
  "comparison",
  "stats",
  "chart",
  "process",
  "closing",
] as const

export function isPptPreviewLayout(value: string): value is PptPreviewLayout {
  return (pptPreviewLayouts as readonly string[]).includes(value)
}

export function isPptPreviewPageIntent(value: string): value is PptPreviewPageIntent {
  return (pptPreviewPageIntents as readonly string[]).includes(value)
}

export function resolvePptPreviewSlideIntent(styleKey: PptPreviewStyleKey, layout: PptPreviewLayout): PptPreviewPageIntent {
  return pptPreviewStyleIntentMap[styleKey][layout]
}

export function resolvePptPreviewSlideLayout(styleKey: PptPreviewStyleKey, intent: PptPreviewPageIntent): PptPreviewLayout {
  const match = (Object.entries(pptPreviewStyleIntentMap[styleKey]) as Array<[PptPreviewLayout, PptPreviewPageIntent]>).find(
    ([, mappedIntent]) => mappedIntent === intent,
  )

  return match?.[0] ?? "timeline"
}

export function getPptPreviewStyleIntentSequence(styleKey: PptPreviewStyleKey): readonly PptPreviewPageIntent[] {
  return pptPreviewLayouts.map((layout) => pptPreviewStyleIntentMap[styleKey][layout])
}

export function getPptPreviewStyleSlots(styleKey: PptPreviewStyleKey) {
  return pptPreviewTemplateCapabilities[styleKey].slots
}

export function getPptPreviewStructuredFieldsForIntent(intent: PptPreviewPageIntent) {
  return [...pptPreviewStructuredFieldsByIntent[intent]]
}

export function getPptPreviewTemplateCapability(styleKey: PptPreviewStyleKey) {
  return pptPreviewTemplateCapabilities[styleKey]
}

export function getPptPreviewTemplateSlotByLayout(styleKey: PptPreviewStyleKey, layout: PptPreviewLayout) {
  return pptPreviewTemplateCapabilities[styleKey].slots.find((slot) => slot.layout === layout)
}

export function getPptPreviewTemplateSlotByIntent(styleKey: PptPreviewStyleKey, intent: PptPreviewPageIntent) {
  return pptPreviewTemplateCapabilities[styleKey].slots.find((slot) => slot.intent === intent)
}

export function resolveOptionalPptPreviewPageCount(value: unknown): PptPreviewPageCount | null {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value.trim(), 10) : Number.NaN
  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.max(MIN_PPT_PREVIEW_PAGE_COUNT, Math.min(MAX_PPT_PREVIEW_PAGE_COUNT, Math.round(parsed)))
}

export function resolvePptPreviewPageCount(value: unknown, fallback = DEFAULT_PPT_PREVIEW_PAGE_COUNT): PptPreviewPageCount {
  return resolveOptionalPptPreviewPageCount(value) ?? fallback
}

export function getPptPreviewLayoutSequence(pageCount: PptPreviewPageCount | undefined | null): PptPreviewLayout[] {
  const resolvedPageCount = resolvePptPreviewPageCount(pageCount)
  const predefinedSequence = pptPreviewLayoutSequenceByPageCount[resolvedPageCount]
  if (predefinedSequence) {
    return [...predefinedSequence]
  }

  if (resolvedPageCount <= 1) {
    return ["cover"]
  }

  if (resolvedPageCount === 2) {
    return ["cover", "timeline"]
  }

  if (resolvedPageCount === 3) {
    return ["cover", "agenda", "timeline"]
  }

  const sequence: PptPreviewLayout[] = [
    ...pptPreviewBaseLayoutsBeforeClosing.slice(0, Math.min(resolvedPageCount - 1, pptPreviewBaseLayoutsBeforeClosing.length)),
  ]
  let repeatIndex = 0
  while (sequence.length < resolvedPageCount - 1) {
    sequence.push(pptPreviewRepeatableMiddleLayouts[repeatIndex % pptPreviewRepeatableMiddleLayouts.length]!)
    repeatIndex += 1
  }

  return [...sequence, "timeline"]
}

export function getPptPreviewStyleSlotSequence(styleKey: PptPreviewStyleKey, pageCount: PptPreviewPageCount | undefined | null) {
  return getPptPreviewLayoutSequence(pageCount)
    .map((layout) => getPptPreviewTemplateSlotByLayout(styleKey, layout))
    .filter((slot): slot is NonNullable<typeof slot> => Boolean(slot))
}

export function resolvePptPreviewDeckPageCount(deck: Pick<PptPreviewDeck, "resolvedPageCount" | "pageCount" | "variants"> | null | undefined) {
  if (!deck) {
    return DEFAULT_PPT_PREVIEW_PAGE_COUNT
  }

  const variantSlideCount = Math.max(0, ...deck.variants.map((variant) => variant.slides.length))
  const fallbackCount = variantSlideCount > 0 ? variantSlideCount : deck.pageCount
  return resolvePptPreviewPageCount(deck.resolvedPageCount ?? fallbackCount)
}

export function resolvePptPreviewTemplateMode(request: Pick<PptPreviewRequest, "templateMode" | "templateId">) {
  if (request.templateMode === "single-template" && request.templateId) {
    return "single-template" as const
  }

  return "auto-4" as const
}

export function getPptFrontendTemplateOption(templateId: PptFrontendTemplateId) {
  return pptFrontendTemplateOptions.find((option) => option.id === templateId)
}

export function getPptPreviewStyleKeyByTemplateId(templateId: PptFrontendTemplateId) {
  return getPptFrontendTemplateOption(templateId)?.styleKey ?? null
}

export function getPptPreviewNarrativeAngleOption(angle: PptPreviewNarrativeAngle) {
  return pptPreviewNarrativeAngles.find((item) => item.id === angle)
}

export function getPptPreviewTemplateLabel(templateId: PptFrontendTemplateId, language: PptLanguage) {
  const option = getPptFrontendTemplateOption(templateId)
  if (!option) return templateId
  return language === "zh-CN" ? option.label.zh : option.label.en
}

export function getPptPreviewNarrativeAngleLabel(angle: PptPreviewNarrativeAngle, language: PptLanguage) {
  const option = getPptPreviewNarrativeAngleOption(angle)
  if (!option) return angle
  return language === "zh-CN" ? option.label.zh : option.label.en
}

export function getPptPreviewNarrativeAnglePrompt(angle: PptPreviewNarrativeAngle, language: PptLanguage) {
  const option = getPptPreviewNarrativeAngleOption(angle)
  if (!option) return ""
  return language === "zh-CN" ? option.prompt.zh : option.prompt.en
}

export function buildPptPreviewVariantDescriptors(request: PptPreviewRequest): PptPreviewVariantDescriptor[] {
  const templateMode = resolvePptPreviewTemplateMode(request)

  if (templateMode === "single-template" && request.templateId) {
    const styleKey = getPptPreviewStyleKeyByTemplateId(request.templateId)
    const style = styleKey ? getPptPreviewStyleByKey(styleKey) : null
    if (style) {
      const narrativeAngles = request.narrativeAngle
        ? pptPreviewNarrativeAngles.filter((angle) => angle.id === request.narrativeAngle)
        : pptPreviewNarrativeAngles

      return narrativeAngles.map((angle, index) => ({
        key: `${request.templateId}-${angle.id}`,
        slotLabel: (["A", "B", "C", "D"][index] ?? angle.slotLabel) as "A" | "B" | "C" | "D",
        style,
        templateId: request.templateId as PptFrontendTemplateId,
        narrativeAngle: angle.id,
      }))
    }
  }

  const slotLabels: Array<"A" | "B" | "C" | "D"> = ["A", "B", "C", "D"]
  return pptPreviewStyles.map((style, index) => ({
    key: style.key,
    slotLabel: slotLabels[index] ?? "D",
    style,
    templateId: pptPreviewTemplateCapabilities[style.key].templateId as PptFrontendTemplateId,
  }))
}

export function buildPptPreviewIntentSequenceLabel(
  styleKey: PptPreviewStyleKey,
  language: PptLanguage,
  pageCount?: PptPreviewPageCount | null,
) {
  const sequence = pageCount
    ? getPptPreviewStyleSlotSequence(styleKey, pageCount).map((slot) => slot.intent)
    : getPptPreviewStyleIntentSequence(styleKey)
  const zhLabels: Record<PptPreviewPageIntent, string> = {
    cover: "封面",
    contents: "目录",
    statement: "宣言页",
    spotlight: "高亮观点页",
    comparison: "对照页",
    stats: "数据页",
    chart: "图表页",
    process: "流程页",
    closing: "结束页",
  }
  const enLabels: Record<PptPreviewPageIntent, string> = {
    cover: "cover",
    contents: "contents",
    statement: "statement",
    spotlight: "spotlight",
    comparison: "comparison",
    stats: "stats",
    chart: "chart",
    process: "process",
    closing: "closing",
  }

  const labels = language === "zh-CN" ? zhLabels : enLabels
  return sequence.map((intent) => labels[intent]).join(" -> ")
}

export function buildPptPreviewTemplateCapabilityLabel(styleKey: PptPreviewStyleKey, language: PptLanguage) {
  const slots = getPptPreviewStyleSlots(styleKey)

  return slots
    .map((slot) => {
      const fields = slot.structuredFields.join(", ")
      const fallback = slot.fallbackIntents?.join(" -> ") ?? ""
      if (language === "zh-CN") {
        return `${slot.layout}/${slot.intent}: ${slot.nativePageType} | 结构字段: ${fields}${fallback ? ` | 退化来源: ${fallback}` : ""}`
      }
      return `${slot.layout}/${slot.intent}: ${slot.nativePageType} | structured fields: ${fields}${fallback ? ` | fallback sources: ${fallback}` : ""}`
    })
    .join("\n")
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

export const pptPreviewModelOptions: Array<{
  value: PptPreviewModelValue
  label: string
  provider: "minimax" | "pptoken" | "stepfun"
  description: string
}> = [
  {
    value: "MiniMax-M2.7-highspeed",
    label: "MiniMax M2.7 Highspeed",
    provider: "minimax",
    description: "速度优先，适合 4 份并行预览。",
  },
  {
    value: "MiniMax-M3",
    label: "MiniMax M3",
    provider: "minimax",
    description: "推理更重，适合更强表达但通常更慢。",
  },
  {
    value: "gpt-5.4",
    label: "GPT-5.4",
    provider: "pptoken",
    description: "通过 pptoken 路由，稳定性更高。",
  },
  {
    value: "step-3.7-flash",
    label: "Step 3.7 Flash",
    provider: "stepfun",
    description: "通过阶跃星辰直连路由，适合并发生成耗时测试。",
  },
]

export const pptPreviewStyles: readonly PptPreviewVariantStyle[] = [
  {
    key: "ppt169_brutalist_ai_newspaper_2026",
    name: "Long Table",
    summary: "frontend-slides 的长桌纪要模板，规则线、分栏和议题感最强，适合董事会汇报、策略复盘和结构化叙事。",
    stylePrompt:
      "Use the Long Table preset. Write like a chaired long-table review with ruled sections, moderated discussion logic, meeting-grade clarity, and explicit conclusions from each agenda block.",
    palette: {
      background: "#FAF1E2",
      foreground: "#B53D2A",
      accent: "#B53D2A",
      panel: "#FFF7EC",
      border: "#D9BCA6",
    },
    strengths: ["结构强", "议题感", "桌面纪要"],
  },
  {
    key: "ppt169_sugar_rush_memphis",
    name: "Playful",
    summary: "frontend-slides 的轻快玩味模板，圆角、浮动贴纸和高亮色块最强，适合发布、教育和品牌故事。",
    stylePrompt:
      "Use the Playful preset. Write with springy momentum, bright hooks, floating highlights, friendly rhythm, and punchy but still commercially useful storytelling.",
    palette: {
      background: "#F0C8A0",
      foreground: "#1A1A1A",
      accent: "#1A1A1A",
      panel: "#F7DEC6",
      border: "#D29A6F",
    },
    strengths: ["轻快节奏", "圆角贴纸", "亲和力强"],
  },
  {
    key: "ppt169_pritzker_2026",
    name: "Broadside",
    summary: "frontend-slides 的告示海报模板，大字号、强栏位和印刷张力最强，适合观点宣言、campaign 和冲击型表达。",
    stylePrompt:
      "Use the Broadside preset. Write like a printed broadside with oversized declarations, stark contrast, poster-grade urgency, and memorable one-line verdicts anchored by supporting columns.",
    palette: {
      background: "#111111",
      foreground: "#F0ECE5",
      accent: "#E85D26",
      panel: "#1A1A18",
      border: "#282826",
    },
    strengths: ["大标题", "印刷感", "宣言式表达"],
  },
  {
    key: "ppt169_swiss_grid_systems",
    name: "Neo-Grid Bold",
    summary: "frontend-slides 的新网格粗体模板，可见网格、强对比模块和现代策略界面感最强，适合产品、咨询和分析型 deck。",
    stylePrompt:
      "Use the Neo-Grid Bold preset. Write with visible-grid discipline, modular boldness, sharp section labels, and decisive strategy language that feels contemporary rather than archival.",
    palette: {
      background: "#ECECE8",
      foreground: "#0A0A0A",
      accent: "#E6FF3D",
      panel: "#F5F4EF",
      border: "#CFCFC8",
    },
    strengths: ["可见网格", "现代策略感", "粗体模块"],
  },
] as const

const pptPreviewStyleSummaries: Record<PptPreviewStyleKey, { zh: string; en: string }> = {
  "ppt169_brutalist_ai_newspaper_2026": {
    zh: "frontend-slides 的长桌纪要模板，规则线、分栏和议题感最强，适合董事会汇报、策略复盘和结构化叙事。",
    en: "A frontend-slides long-table review preset with ruled sections, strong agenda structure, and board-style narrative clarity.",
  },
  "ppt169_sugar_rush_memphis": {
    zh: "frontend-slides 的轻快玩味模板，圆角、浮动贴纸和高亮色块最强，适合发布、教育和品牌故事。",
    en: "A frontend-slides playful preset with rounded geometry, floating sticker energy, and bright highlight blocks for launches and brand stories.",
  },
  "ppt169_pritzker_2026": {
    zh: "frontend-slides 的告示海报模板，大字号、强栏位和印刷张力最强，适合观点宣言、campaign 和冲击型表达。",
    en: "A frontend-slides broadside poster preset with oversized type, strong columns, and print tension for bold declarations and campaign statements.",
  },
  "ppt169_swiss_grid_systems": {
    zh: "frontend-slides 的新网格粗体模板，可见网格、强对比模块和现代策略界面感最强，适合产品、咨询和分析型 deck。",
    en: "A frontend-slides neo-grid preset with visible rails, high-contrast modules, and a contemporary strategy-interface feel for analytical decks.",
  },
}

export function getPptPreviewStyleSummary(styleKey: PptPreviewStyleKey | null | undefined, language: PptLanguage) {
  const localizedSummary = styleKey ? pptPreviewStyleSummaries[styleKey as PptPreviewStyleKey] : undefined
  if (localizedSummary) {
    return language === "zh-CN" ? localizedSummary.zh : localizedSummary.en
  }

  const style = styleKey ? getPptPreviewStyleByKey(styleKey as PptPreviewStyleKey) : undefined
  if (style?.summary) {
    return style.summary
  }

  return language === "zh-CN" ? "正式 AI PPT 模板。" : "Formal AI PPT template."
}

const scenarioDescriptors: Record<PptScenario, { chinese: string; english: string; outline: string[] }> = {
  "marketing-campaign": {
    chinese: "营销策划",
    english: "marketing campaign",
    outline: ["机会窗口", "受众判断", "策略主轴", "竞争对照", "证据锚点", "关键数据", "扩散图谱", "执行路径", "转化动作"],
  },
  "product-launch": {
    chinese: "产品发布",
    english: "product launch",
    outline: ["市场背景", "产品定位", "核心亮点", "对位竞品", "用户证据", "关键指标", "能力图解", "发布节奏", "下一步动作"],
  },
  "sales-deck": {
    chinese: "销售提案",
    english: "sales proposal",
    outline: ["业务问题", "决策结构", "价值主张", "方案对比", "信任证明", "收益数据", "交付图解", "实施计划", "合作建议"],
  },
  training: {
    chinese: "培训课件",
    english: "training deck",
    outline: ["学习目标", "知识地图", "关键概念", "易混对比", "案例证据", "指标读法", "图示拆解", "方法步骤", "行动清单"],
  },
}

function sentenceByLanguage(language: PptLanguage, zh: string, en: string) {
  return language === "zh-CN" ? zh : en
}

function buildExtendedScenarioOutline(
  scenario: PptScenario,
  layouts: readonly PptPreviewLayout[],
  language: PptLanguage,
) {
  const descriptor = scenarioDescriptors[scenario]
  const layoutLabels: Record<PptPreviewLayout, { zh: string; en: string }> = {
    cover: { zh: "主题封面", en: "Topic Cover" },
    agenda: { zh: "内容导航", en: "Content Map" },
    insight: { zh: "核心判断", en: "Core Insight" },
    comparison: { zh: "方案对照", en: "Option Comparison" },
    evidence: { zh: "证据补充", en: "Proof Layer" },
    stats: { zh: "指标补充", en: "Metric Layer" },
    chart: { zh: "图示扩展", en: "Chart Extension" },
    process: { zh: "执行细化", en: "Execution Detail" },
    timeline: { zh: "收尾动作", en: "Closing Actions" },
  }

  const occurrences = new Map<PptPreviewLayout, number>()
  return layouts.map((layout, index) => {
    const baseOutline = descriptor.outline[index]
    if (baseOutline) {
      return baseOutline
    }

    const occurrence = (occurrences.get(layout) ?? 0) + 1
    occurrences.set(layout, occurrence)
    const label = layoutLabels[layout]
    return language === "zh-CN" ? `${label.zh} ${occurrence}` : `${label.en} ${occurrence}`
  })
}

function applyTemplateSlotMetadata<T extends { layout: PptPreviewLayout; intent?: PptPreviewPageIntent }>(
  styleKey: PptPreviewStyleKey,
  slide: T,
) {
  const slot =
    getPptPreviewTemplateSlotByLayout(styleKey, slide.layout) ??
    (slide.intent ? getPptPreviewTemplateSlotByIntent(styleKey, slide.intent) : undefined)

  if (!slot) {
    return slide
  }

  return {
    ...slide,
    intent: slide.intent ?? slot.intent,
    nativePageType: slot.nativePageType,
    structuredFields: [...slot.structuredFields],
  }
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
      intent: resolvePptPreviewSlideIntent(style.key, "cover"),
      kicker: sentenceByLanguage(language, descriptor.chinese, descriptor.english.toUpperCase()),
      title: topic,
      body: sentenceByLanguage(
        language,
        `围绕“${topic}”快速搭出一套 ${style.name} 风格的展示稿，先判断方向，再进入完整生成。`,
        `A ${style.name} preview deck built around "${topic}" so users can judge the direction before export.`,
      ),
      bullets: [
        sentenceByLanguage(language, "预览优先速度，先输出可直接打开的 HTML", "Preview prioritizes speed and outputs HTML first"),
        sentenceByLanguage(language, "同一主题并发比较 4 种讲法", "Compare four narrative directions in parallel"),
        sentenceByLanguage(language, "把登录动作留给高意图节点", "Keep login for high-intent moments"),
      ],
      accent: style.palette.accent,
    },
    {
      id: `${style.key}-agenda`,
      layout: "agenda" as const,
      intent: resolvePptPreviewSlideIntent(style.key, "agenda"),
      kicker: sentenceByLanguage(language, "结构总览", "STRUCTURE"),
      title: sentenceByLanguage(language, "这一版建议怎么讲", "How this version should unfold"),
      body: sentenceByLanguage(
        language,
        "从场景判断切入，再过渡到证据、数据、图示和执行建议，保持 9 页内可快速浏览。",
        "Open with context, then move through proof, data, diagrams, and action in nine scannable slides.",
      ),
      bullets: descriptor.outline.map((item, index) => sentenceByLanguage(language, `${index + 1}. ${item}`, `${index + 1}. ${item}`)),
      contentsItems: descriptor.outline.slice(0, 9).map((item, index) => ({
        index: String(index + 1).padStart(2, "0"),
        title: item,
        detail: sentenceByLanguage(
          language,
          `这一段重点处理${item}，保持节奏向下一页推进。`,
          `This section frames ${item} before moving the story to the next page.`,
        ),
      })),
      accent: style.palette.accent,
    },
    {
      id: `${style.key}-insight`,
      layout: "insight" as const,
      intent: resolvePptPreviewSlideIntent(style.key, "insight"),
      kicker: sentenceByLanguage(language, "核心洞察", "INSIGHT"),
      title: sentenceByLanguage(language, "为什么先做视觉预览", "Why visual preview comes first"),
      body: sentenceByLanguage(
        language,
        "用户第一反应不是“文件能不能下载”，而是“这套表达值不值得继续”。预览越快，越能提高后续动作转化。",
        "The first question is not whether the file can download. It is whether this direction deserves another step. Faster previews improve conversion.",
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
      intent: resolvePptPreviewSlideIntent(style.key, "comparison"),
      kicker: sentenceByLanguage(language, "预览层 vs 成品层", "PREVIEW VS FINAL"),
      title: sentenceByLanguage(language, "这条链路为什么更轻", "Why this pipeline feels lighter"),
      body: sentenceByLanguage(
        language,
        "预览只解决“快看到”，下载层再解决“可打开、可分享、可归档”。前者负责转化，后者负责交付。",
        "Preview solves speed-to-visual. The download layer solves openability, sharing, and archiving. The first converts; the second delivers.",
      ),
      bullets: [
        sentenceByLanguage(language, "Preview: SVG 视觉结果", "Preview: SVG visual result"),
        sentenceByLanguage(language, "Download: HTML 成品", "Download: HTML artifact"),
        sentenceByLanguage(language, "登录留在打开和下载动作", "Login stays at open and download moments"),
      ],
      comparisonItems: [
        {
          label: "A",
          title: sentenceByLanguage(language, "预览层", "Preview Layer"),
          detail: sentenceByLanguage(language, "负责快速判断表达是否值得继续。", "Handles fast judgment on whether the direction deserves another step."),
        },
        {
          label: "B",
          title: sentenceByLanguage(language, "成品层", "Final Layer"),
          detail: sentenceByLanguage(language, "负责可编辑导出与完整交付。", "Handles editable export and final delivery."),
        },
      ],
      accent: style.palette.accent,
    },
    {
      id: `${style.key}-evidence`,
      layout: "evidence" as const,
      intent: resolvePptPreviewSlideIntent(style.key, "evidence"),
      kicker: sentenceByLanguage(language, "证据锚点", "PROOF"),
      title: sentenceByLanguage(language, "哪些事实最值得挂在墙上", "What deserves to stay pinned"),
      body: sentenceByLanguage(
        language,
        "这一页用可被重复引用的证据、判断和一句话结论来稳住整套叙事的可信度。",
        "Use quotable proof, crisp evidence, and one-line verdicts to stabilize the deck's credibility.",
      ),
      bullets: [
        sentenceByLanguage(language, "用已发生事实替代抽象判断", "Anchor the claim in things that already happened"),
        sentenceByLanguage(language, "把证据写成可复述的一句话", "Make each proof point repeatable in one line"),
        sentenceByLanguage(language, "让这一页承担说服而不是铺垫", "Let this page persuade rather than merely bridge"),
      ],
      spotlightItems: [
        {
          title: sentenceByLanguage(language, "事实锚点", "Anchor fact"),
          detail: sentenceByLanguage(language, "先摆出最难被反驳的事实，再进入判断。", "Lead with the least arguable fact before making the call."),
        },
        {
          title: sentenceByLanguage(language, "一句话复述", "Repeatable line"),
          detail: sentenceByLanguage(language, "每个证据都应能被复述成一句可引用的话。", "Each proof point should collapse into a single quotable line."),
        },
        {
          title: sentenceByLanguage(language, "说服作用", "Persuasion role"),
          detail: sentenceByLanguage(language, "这一页负责加固判断，而不是继续铺垫。", "This page should harden conviction rather than prolong setup."),
        },
      ],
      accent: style.palette.accent,
    },
    {
      id: `${style.key}-stats`,
      layout: "stats" as const,
      intent: resolvePptPreviewSlideIntent(style.key, "stats"),
      kicker: sentenceByLanguage(language, "关键数据", "STATS"),
      title: sentenceByLanguage(language, "哪些数字会改变决策", "Which numbers change the call"),
      body: sentenceByLanguage(
        language,
        "把主题折成几个最关键的量化信号，不求多，只保留最能影响判断的指标。",
        "Reduce the topic to a handful of signals that materially change decision-making.",
      ),
      bullets: [
        sentenceByLanguage(language, "保留 3 到 4 个最硬的数字", "Keep only the 3 to 4 hardest numbers"),
        sentenceByLanguage(language, "每个数字都要说明影响什么", "Each number must explain what it changes"),
        sentenceByLanguage(language, "指标之间要能形成强弱关系", "The metrics should imply relative pressure"),
      ],
      metricItems: [
        { value: "03", label: sentenceByLanguage(language, "关键指标", "Core metrics"), note: sentenceByLanguage(language, "数量控制", "Tight count") },
        { value: "09", label: sentenceByLanguage(language, "页面总数", "Slides"), note: sentenceByLanguage(language, "提升承载", "Higher capacity") },
        { value: "04", label: sentenceByLanguage(language, "并行风格", "Variants"), note: sentenceByLanguage(language, "同题对比", "Side-by-side") },
      ],
      accent: style.palette.accent,
    },
    {
      id: `${style.key}-chart`,
      layout: "chart" as const,
      intent: resolvePptPreviewSlideIntent(style.key, "chart"),
      kicker: sentenceByLanguage(language, "图示扩散", "CHART"),
      title: sentenceByLanguage(language, "影响如何向外扩散", "How the impact propagates outward"),
      body: sentenceByLanguage(
        language,
        "把复杂影响关系压成一眼能读懂的图示逻辑，而不是继续堆文字解释。",
        "Compress the impact chain into a readable visual logic instead of another paragraph stack.",
      ),
      bullets: [
        sentenceByLanguage(language, "先给出主轴，再显示外溢", "Show the core axis first, then the spillover"),
        sentenceByLanguage(language, "图示要比文字更先被读懂", "The diagram should resolve before the paragraph does"),
        sentenceByLanguage(language, "一页只做一种传播结构", "Keep one propagation logic per page"),
      ],
      chartItems: [
        { label: sentenceByLanguage(language, "通行", "Transit"), value: 78, detail: sentenceByLanguage(language, "先受影响", "First hit") },
        { label: sentenceByLanguage(language, "保费", "Insurance"), value: 62, detail: sentenceByLanguage(language, "成本抬升", "Premium rise") },
        { label: sentenceByLanguage(language, "油价", "Oil"), value: 54, detail: sentenceByLanguage(language, "波动放大", "Volatility spreads") },
        { label: sentenceByLanguage(language, "预期", "Sentiment"), value: 88, detail: sentenceByLanguage(language, "市场外溢", "Spillover into markets") },
      ],
      accent: style.palette.accent,
    },
    {
      id: `${style.key}-process`,
      layout: "process" as const,
      intent: resolvePptPreviewSlideIntent(style.key, "process"),
      kicker: sentenceByLanguage(language, "执行路径", "PROCESS"),
      title: sentenceByLanguage(language, "如果要行动，顺序是什么", "If action follows, what is the order"),
      body: sentenceByLanguage(
        language,
        "把应对动作和推进顺序拆成可执行步骤，让结尾页之前先形成节奏感。",
        "Turn the response into executable steps so the deck develops momentum before the close.",
      ),
      bullets: [
        sentenceByLanguage(language, "先识别，后切换，再放大", "Identify first, reroute second, scale third"),
        sentenceByLanguage(language, "动作之间要有依赖关系", "The steps should imply dependency"),
        sentenceByLanguage(language, "让读者知道下一步从哪里开始", "Make the first move unmistakable"),
      ],
      processItems: [
        { step: "01", title: sentenceByLanguage(language, "识别", "Identify"), detail: sentenceByLanguage(language, "先确认风险来源与受影响航线。", "Confirm the source of risk and exposed routes first.") },
        { step: "02", title: sentenceByLanguage(language, "切换", "Reroute"), detail: sentenceByLanguage(language, "切换航线或交付节奏。", "Reroute lanes or delivery cadence.") },
        { step: "03", title: sentenceByLanguage(language, "对冲", "Hedge"), detail: sentenceByLanguage(language, "同步处理价格与供应风险。", "Address pricing and supply exposure in parallel.") },
        { step: "04", title: sentenceByLanguage(language, "跟踪", "Track"), detail: sentenceByLanguage(language, "持续监控外溢指标。", "Track spillover indicators continuously.") },
      ],
      accent: style.palette.accent,
    },
    {
      id: `${style.key}-timeline`,
      layout: "timeline" as const,
      intent: resolvePptPreviewSlideIntent(style.key, "timeline"),
      kicker: sentenceByLanguage(language, "下一步", "NEXT"),
      title: sentenceByLanguage(language, "看到合适方向之后", "After the right direction appears"),
      body: sentenceByLanguage(
        language,
        "保留当前会话，选择最接近预期的风格，再进入完整生成或下载。",
        "Preserve the current session, choose the strongest direction, then continue to full generation or download.",
      ),
      bullets: [
        sentenceByLanguage(language, "锁定最接近预期的风格", "Lock the closest visual direction"),
        sentenceByLanguage(language, "登录后继续完整导出", "Continue to full export after login"),
        sentenceByLanguage(language, "保持会话不断裂", "Keep the session continuous"),
      ],
      closingItems: [
        {
          label: sentenceByLanguage(language, "Choose", "Choose"),
          detail: sentenceByLanguage(language, "先锁定最接近预期的风格。", "Lock the strongest visual direction first."),
        },
        {
          label: sentenceByLanguage(language, "Open", "Open"),
          detail: sentenceByLanguage(language, "打开 HTML 成品页做最终判断。", "Open the HTML deck for a final read-through."),
        },
        {
          label: sentenceByLanguage(language, "Export", "Export"),
          detail: sentenceByLanguage(language, "需要时再进入完整导出链路。", "Only then continue into the heavier export path."),
        },
      ],
      accent: style.palette.accent,
    },
  ].map((slide) => applyTemplateSlotMetadata(style.key, slide))
}

export function getPptPreviewStyleByKey(styleKey: PptPreviewStyleKey) {
  return pptPreviewStyles.find((style) => style.key === styleKey)
}

export function getPptPreviewVariantStyleKey(variant: Pick<PptPreviewVariant, "styleKey">) {
  return variant.styleKey
}

export function buildMockPptPreview(request: PptPreviewRequest): PptPreviewDeck {
  const title = request.prompt.trim() || sentenceByLanguage(request.language, "AI 营销方案", "AI Marketing Plan")
  const requestedPageCount = resolveOptionalPptPreviewPageCount(request.pageCount)
  const pageCount = resolvePptPreviewPageCount(request.pageCount)
  const layouts = getPptPreviewLayoutSequence(pageCount)
  const outline = buildExtendedScenarioOutline(request.scenario, layouts, request.language)
  const variantDescriptors = buildPptPreviewVariantDescriptors(request)
  const templateMode = resolvePptPreviewTemplateMode(request)

  return {
    title,
    scenario: request.scenario,
    language: request.language,
    generatedAt: new Date().toISOString(),
    outline,
    provider: "mock",
    source: "mock",
    templateMode,
    selectedTemplateId: templateMode === "single-template" ? request.templateId ?? null : null,
    pageCount: requestedPageCount,
    resolvedPageCount: pageCount,
    variants: variantDescriptors.map<PptPreviewVariant>((variantDescriptor) => {
      const mockSlides = buildMockVariantSlides(variantDescriptor.style, title, request.scenario, request.language)
      const slideByLayout = new Map(mockSlides.map((slide) => [slide.layout, slide]))
      const layoutOccurrences = new Map<PptPreviewLayout, number>()

      return {
        key: variantDescriptor.key,
        styleKey: variantDescriptor.style.key,
        templateId: variantDescriptor.templateId,
        narrativeAngle: variantDescriptor.narrativeAngle,
        slotLabel: variantDescriptor.slotLabel,
        name: variantDescriptor.style.name,
        summary: getPptPreviewStyleSummary(variantDescriptor.style.key, request.language),
        stylePrompt: variantDescriptor.style.stylePrompt,
        palette: variantDescriptor.style.palette,
        strengths: variantDescriptor.style.strengths,
        outline,
        slides: layouts
          .map((layout) => {
            const templateSlide = slideByLayout.get(layout)
            if (!templateSlide) {
              return null
            }

            const occurrence = (layoutOccurrences.get(layout) ?? 0) + 1
            layoutOccurrences.set(layout, occurrence)

            return {
              ...templateSlide,
              id: `${variantDescriptor.key}-${layout}-${occurrence}`,
              title: occurrence > 1 ? `${templateSlide.title} ${occurrence}` : templateSlide.title,
            }
          })
          .filter((slide): slide is NonNullable<typeof slide> => Boolean(slide)),
      }
    }),
  }
}

export function buildPptPreviewDeckFromPlans(
  request: PptPreviewRequest,
  plans: Array<{
    variantKey: string
    styleKey: PptPreviewStyleKey
    templateId: PptFrontendTemplateId
    narrativeAngle?: PptPreviewNarrativeAngle
    title: string
    outline: readonly string[]
    provider?: string
    slides: Array<Omit<PptPreviewSlide, "id" | "accent">>
  }>,
  options?: {
    resolvedPageCount?: PptPreviewPageCount | null
  },
): PptPreviewDeck {
  const firstPlan = plans[0]
  const fallbackTitle = request.prompt.trim() || sentenceByLanguage(request.language, "AI 营销方案", "AI Marketing Plan")
  const requestedPageCount = resolveOptionalPptPreviewPageCount(request.pageCount)
  const pageCount = resolvePptPreviewPageCount(
    options?.resolvedPageCount ?? firstPlan?.slides.length ?? firstPlan?.outline.length ?? request.pageCount,
  )
  const layouts = getPptPreviewLayoutSequence(pageCount)
  const fallbackOutline = buildExtendedScenarioOutline(request.scenario, layouts, request.language)
  const variantDescriptors = buildPptPreviewVariantDescriptors(request)
  const templateMode = resolvePptPreviewTemplateMode(request)
  const requestImages = normalizePptPreviewRequestImages(request.images)

  return {
    title: firstPlan?.title.trim() || fallbackTitle,
    scenario: request.scenario,
    language: request.language,
    generatedAt: new Date().toISOString(),
    outline: (firstPlan?.outline?.length ? firstPlan.outline : fallbackOutline).slice(0, pageCount),
    provider: firstPlan?.provider || "live",
    source: "live",
    templateMode,
    selectedTemplateId: templateMode === "single-template" ? request.templateId ?? null : null,
    pageCount: requestedPageCount,
    resolvedPageCount: pageCount,
    variants: variantDescriptors.map((variantDescriptor) => {
      const style = variantDescriptor.style
      const plan = plans.find((item) => item.variantKey === variantDescriptor.key)
      const fallbackSlides = buildMockVariantSlides(style, fallbackTitle, request.scenario, request.language)
      const slideCandidates = plan?.slides ?? fallbackSlides
      const fallbackSlideTitles = (plan?.outline?.length ? plan.outline : fallbackOutline).slice(0, pageCount)
      const slideByLayout = new Map(slideCandidates.map((slide) => [slide.layout, slide]))

      return {
        key: variantDescriptor.key,
        styleKey: style.key,
        templateId: variantDescriptor.templateId,
        narrativeAngle: variantDescriptor.narrativeAngle,
        slotLabel: variantDescriptor.slotLabel,
        name: style.name,
        summary: getPptPreviewStyleSummary(style.key, request.language),
        stylePrompt: style.stylePrompt,
        palette: style.palette,
        strengths: style.strengths,
        outline: (plan?.outline?.length ? plan.outline : fallbackOutline).slice(0, pageCount),
        slides: assignRequestImagesToSlides(
          layouts
            .map((layout) => slideByLayout.get(layout) ?? fallbackSlides.find((slide) => slide.layout === layout))
            .filter((slide): slide is NonNullable<typeof slide> => Boolean(slide))
            .map((slide, index) => ({
              ...applyTemplateSlotMetadata(style.key, slide),
              intent: slide.intent ?? resolvePptPreviewSlideIntent(style.key, slide.layout),
              kicker:
                !slide.kicker?.trim() || /^slide\s+\d+$/i.test(slide.kicker.trim())
                  ? buildPreviewStyleKicker(style.key, slide.layout, request.language)
                  : slide.kicker.trim(),
              title: buildPreviewStyleTitle(
                style.key,
                slide.layout,
                (slide.title?.trim() || (index === 0 ? fallbackTitle : fallbackSlideTitles[index] || fallbackTitle)).replace(
                  /\s*\/\s*(cover|agenda|insight|comparison|evidence|stats|chart|process|timeline)$/i,
                  "",
                ),
                fallbackTitle,
                request.language,
              ),
              body: buildPreviewStyleBody(style.key, slide.body?.trim() || "", request.language),
              bullets: (slide.bullets ?? []).slice(0, 4).map((bullet, bulletIndex) =>
                buildPreviewStyleBullet(style.key, bullet, bulletIndex, request.language),
              ),
              contentsItems: slide.contentsItems?.slice(0, 9),
              comparisonItems: slide.comparisonItems?.slice(0, 4),
              spotlightItems: slide.spotlightItems?.slice(0, 4),
              metricItems: slide.metricItems?.slice(0, 4),
              chartItems: slide.chartItems?.slice(0, 4),
              processItems: slide.processItems?.slice(0, 4),
              closingItems: slide.closingItems?.slice(0, 4),
              id: `${variantDescriptor.key}-${slide.layout}-${index + 1}`,
              accent: style.palette.accent,
            })),
          requestImages,
        ),
      } satisfies PptPreviewVariant
    }),
  }
}

function normalizePptPreviewRequestImages(images: PptPreviewRequest["images"]): PptPreviewInputImage[] {
  if (!Array.isArray(images)) return []

  const seenUrls = new Set<string>()
  return images.reduce<PptPreviewInputImage[]>((collected, image) => {
      const url = typeof image?.url === "string" ? image.url.trim() : ""
      if (!url || seenUrls.has(url)) return collected
      seenUrls.add(url)
      collected.push({
        url,
        title: typeof image?.title === "string" && image.title.trim() ? image.title.trim() : null,
        mimeType: typeof image?.mimeType === "string" && image.mimeType.trim() ? image.mimeType.trim() : null,
        sourceNodeKey:
          typeof image?.sourceNodeKey === "string" && image.sourceNodeKey.trim() ? image.sourceNodeKey.trim() : null,
        role: image?.role === "cover" || image?.role === "content" || image?.role === "logo" || image?.role === "reference"
          ? image.role
          : undefined,
      })
      return collected
    }, [])
}

function supportsInlineRequestImage(layout: PptPreviewLayout) {
  return layout === "cover" || layout === "insight" || layout === "comparison" || layout === "evidence"
}

function assignRequestImagesToSlides(slides: PptPreviewSlide[], images: PptPreviewInputImage[]): PptPreviewSlide[] {
  if (images.length === 0) return slides

  const coverImage = images[0]
  const contentImages = images.slice(1)
  let contentIndex = 0

  return slides.map<PptPreviewSlide>((slide) => {
    if (slide.layout === "cover") {
      return {
        ...slide,
        image: coverImage ? { ...coverImage, role: "cover" } : undefined,
      } satisfies PptPreviewSlide
    }

    if (!supportsInlineRequestImage(slide.layout) || contentIndex >= contentImages.length) {
      return slide
    }

    const image = contentImages[contentIndex]
    contentIndex += 1
    return {
      ...slide,
      image: image ? { ...image, role: "content" } : undefined,
    } satisfies PptPreviewSlide
  })
}
