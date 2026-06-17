import type { PptPreviewRequest, PptPreviewSlide, PptPreviewStyleKey } from "@/lib/lead-tools/ppt-preview-data-fixed"

export function trimPreviewTerminalPunctuation(value: string) {
  return value.trim().replace(/[。！？.!?]+$/u, "")
}

function stripDecorativeEmoji(value: string) {
  return value
    .replace(/[\p{Extended_Pictographic}\u2600-\u27BF]+/gu, "")
    .replace(/\uFE0F/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim()
}

function appendPreviewTerminalPunctuation(value: string, language: PptPreviewRequest["language"]) {
  const clean = trimPreviewTerminalPunctuation(value)
  if (!clean) {
    return ""
  }

  return `${clean}${language === "zh-CN" ? "。" : "."}`
}

export function isPreviewPlaceholder(value: string) {
  const normalized = value.trim().toLowerCase()
  return !normalized || normalized.includes("待确认") || normalized.includes("placeholder") || normalized.includes("tbd")
}

type PreviewPromptOptions = {
  layoutSequence: PptPreviewSlide["layout"][]
  templateMode: "auto-4" | "single-template"
  templateLabel?: string
  narrativeAngleLabel?: string
  narrativeAnglePrompt?: string
}

export function buildPreviewSystemPrompt(request: PptPreviewRequest, options: PreviewPromptOptions) {
  const { language } = request
  const pageCount = request.pageCount ?? 9
  const layoutSequenceLabel = options.layoutSequence.join(", ")
  const templateInstruction =
    options.templateMode === "single-template"
      ? language === "zh-CN"
        ? `当前固定模板为 ${options.templateLabel || "指定模板"}，当前候选的叙事角是 ${options.narrativeAngleLabel || "指定角度"}。${options.narrativeAnglePrompt || ""}`
        : `The selected template is ${options.templateLabel || "the chosen template"} and this candidate must follow the ${options.narrativeAngleLabel || "selected"} narrative angle. ${options.narrativeAnglePrompt || ""}`
      : language === "zh-CN"
        ? "当前是 auto-4 模式：每个候选都要忠于自己的原生模板风格，而不是共用一个中性底稿。"
        : "This run is in auto-4 mode: each candidate must fully commit to its own native template language instead of sharing a neutral base deck."

  if (language === "zh-CN") {
    return [
      "你是 frontend-slides 预览链路里的演示文稿策划助手。",
      `目标是直接生成一套适合商业展示的 ${pageCount} 页高信号 PPT 内容方案。`,
      "必须输出中文。",
      "必须严格返回结构化结果，不要输出 JSON 之外的说明。",
      `slides 顺序固定为 ${layoutSequenceLabel}。`,
      "当 agenda 页出现时，额外提供 contentsItems[{index,title,detail}]；当 evidence 页出现时，额外提供 spotlightItems[{title,detail}]；当 timeline 页出现时，额外提供 closingItems[{label,detail}]。",
      "当 comparison 页出现时，额外提供 comparisonItems[{label,title,detail}]；当 stats 页出现时，额外提供 metricItems[{value,label,note}]；当 chart 页出现时，额外提供 chartItems[{label,value,detail}]；当 process 页出现时，额外提供 processItems[{step,title,detail}]。",
      "虽然字段顺序固定，但每一页必须按所选模板的原生页型去写，不要把所有页面都写成普通文字说明页。",
      "cover 必须像正式封面；timeline 默认作为结尾页 / next steps / closing page，而不是流水账时间线，除非主题本身必须按时间推进。",
      "每页 body 控制在 1 句，最多 2 句；非 agenda 页的 bullets 尽量控制在 2-3 条，句子要短。",
      "标题必须短，适合大字号展示；不要写成长句标题。",
      "至少有一页要天然适合做图表、对比板、指标卡或步骤卡，不要让整套内容退化成纯文字说明。",
      "禁止把原始 prompt 直接加编号后当作标题、章节名、图表项或步骤项。",
      "禁止输出 Step 1、Section 2、Signal 3、模块 4、章节 5 这类空壳标签，除非后面紧跟有具体业务含义的真实标题与说明。",
      "禁止说自己需要进一步确认、需要更多资料或需要联网检索。",
      "不要引用来源，不要写占位词，不要输出模板提示语。",
      "当前输出就是某一个独立风格版的最终内容草案，不要假设后续还有共享底稿或统一改写。",
      "每个风格版本都必须形成自己的判断、结构和行动建议，不能只换语气不换内容角度。",
      templateInstruction,
    ].join(" ")
  }

  return [
    "You are the presentation strategist inside a frontend-slides preview pipeline.",
    `Generate one business-ready ${pageCount}-slide high-signal presentation plan.`,
    "Output in English only.",
    "Return structured data only.",
    `Keep slide order fixed as: ${layoutSequenceLabel}.`,
    "When the layout is agenda, also return contentsItems[{index,title,detail}]. When the layout is evidence, return spotlightItems[{title,detail}]. When the layout is timeline, return closingItems[{label,detail}].",
    "When the layout is comparison, also return comparisonItems[{label,title,detail}]. When the layout is stats, return metricItems[{value,label,note}]. When the layout is chart, return chartItems[{label,value,detail}]. When the layout is process, return processItems[{step,title,detail}].",
    "Even though the field order is fixed, each slot must behave like the selected preset's native page intent rather than becoming generic text slides.",
    "The cover must read like a real cover slide. The timeline slide should default to a closing / next-steps slide unless the topic truly requires chronology.",
    "Each body should be one sentence, at most two. Outside the agenda slide, keep bullets to 2-3 concise items.",
    "Keep titles short enough for oversized display typography.",
    "At least one slide should naturally support charts, comparison boards, metric cards, or step cards rather than reading as pure prose.",
    "Do not turn the raw topic into numbered clones like 'Topic 3' or 'Topic 4 1' and treat them as real slide titles or chart items.",
    "Do not output hollow labels such as 'Step 1', 'Section 2', or 'Signal 3' unless they are followed by real business-specific titles and explanations.",
    "Do not ask follow-up questions, do not reference research, and do not use placeholders.",
    "This output is already one standalone style-specific deck draft. Do not assume a shared base plan will be restyled later.",
    "Each style version must introduce its own judgment, framing, and actionability rather than only changing the tone.",
    templateInstruction,
  ].join(" ")
}

export function buildPreviewUserPrompt(request: PptPreviewRequest, options: PreviewPromptOptions) {
  const pageCount = request.pageCount ?? 9
  return [
    `Topic: ${request.prompt}`,
    `Scenario: ${request.scenario}`,
    `Language: ${request.language}`,
    `Page count: ${pageCount}`,
    `Layout sequence: ${options.layoutSequence.join(", ")}`,
    `Template mode: ${options.templateMode}`,
    options.templateLabel ? `Template: ${options.templateLabel}` : null,
    options.narrativeAngleLabel ? `Narrative angle: ${options.narrativeAngleLabel}` : null,
    "Generate one concrete PPT preview plan that feels ready for a real customer-facing deck.",
    "Assume the model must synthesize the content directly without web research or citations.",
    "Avoid placeholders and generic wording.",
    'The topic is already known and must appear explicitly. Do not write placeholders like "待确认主题", "TBD", or "placeholder".',
    "Treat this version as one independent deck, not a neutral base layer shared with other variants.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")
}

export function buildPreviewStyleKicker(
  styleKey: PptPreviewStyleKey,
  layout: PptPreviewSlide["layout"],
  language: PptPreviewRequest["language"],
) {
  const zhMap: Record<PptPreviewStyleKey, Record<PptPreviewSlide["layout"], string>> = {
    "ppt169_brutalist_ai_newspaper_2026": {
      cover: "长桌主议题",
      agenda: "议程清单",
      insight: "案头判断",
      comparison: "路径并置",
      evidence: "证据摘录",
      stats: "数字记录",
      chart: "图示展开",
      process: "推进步骤",
      timeline: "执行排期",
    },
    "ppt169_sugar_rush_memphis": {
      cover: "PLAY MODE",
      agenda: "出场顺序",
      insight: "高亮观点",
      comparison: "玩法对比",
      evidence: "信号贴纸",
      stats: "数字蹦点",
      chart: "扩散图谱",
      process: "行动节奏",
      timeline: "节奏安排",
    },
    "ppt169_pritzker_2026": {
      cover: "大字报头",
      agenda: "栏目排版",
      insight: "核心宣言",
      comparison: "正反对照",
      evidence: "引证栏",
      stats: "数字告示",
      chart: "外溢图版",
      process: "行动张贴",
      timeline: "下一张告示",
    },
    "ppt169_swiss_grid_systems": {
      cover: "GRID BRIEF",
      agenda: "模块目录",
      insight: "关键判断",
      comparison: "系统比较",
      evidence: "PROOF GRID",
      stats: "SIGNAL COUNT",
      chart: "SPREAD MAP",
      process: "ACTION FLOW",
      timeline: "推进序列",
    },
  }

  const enMap: Record<PptPreviewStyleKey, Record<PptPreviewSlide["layout"], string>> = {
    "ppt169_brutalist_ai_newspaper_2026": {
      cover: "LONG TABLE",
      agenda: "AGENDA",
      insight: "DESK VERDICT",
      comparison: "PATHS",
      evidence: "PROOF NOTE",
      stats: "NUMBERS",
      chart: "DIAGRAM",
      process: "ROUTE",
      timeline: "SCHEDULE",
    },
    "ppt169_sugar_rush_memphis": {
      cover: "PLAY MODE",
      agenda: "DROP ORDER",
      insight: "SPARK NOTE",
      comparison: "REMIX VIEW",
      evidence: "PROOF POP",
      stats: "NUMBER POP",
      chart: "SPREAD MAP",
      process: "PACE FLOW",
      timeline: "PACE PLAN",
    },
    "ppt169_pritzker_2026": {
      cover: "BROADSIDE",
      agenda: "COLUMNS",
      insight: "DECLARATION",
      comparison: "COUNTERTEXT",
      evidence: "PROOF COLUMN",
      stats: "FIGURES",
      chart: "SPREAD DIAGRAM",
      process: "POSTED STEPS",
      timeline: "POSTING ORDER",
    },
    "ppt169_swiss_grid_systems": {
      cover: "GRID BRIEF",
      agenda: "MODULES",
      insight: "KEY JUDGMENT",
      comparison: "SYSTEM MAP",
      evidence: "PROOF GRID",
      stats: "SIGNALS",
      chart: "SPREAD MAP",
      process: "ACTION FLOW",
      timeline: "NEXT SEQUENCE",
    },
  }

  return language === "zh-CN" ? zhMap[styleKey][layout] : enMap[styleKey][layout]
}

export function buildPreviewStyleTitle(
  styleKey: PptPreviewStyleKey,
  layout: PptPreviewSlide["layout"],
  title: string,
  fallbackTitle: string,
  language: PptPreviewRequest["language"],
) {
  void styleKey
  void layout
  void language

  const clean =
    trimPreviewTerminalPunctuation(stripDecorativeEmoji(title)) ||
    trimPreviewTerminalPunctuation(stripDecorativeEmoji(fallbackTitle))
  return clean
}

export function buildPreviewStyleBody(
  styleKey: PptPreviewStyleKey,
  body: string,
  language: PptPreviewRequest["language"],
) {
  void styleKey
  return appendPreviewTerminalPunctuation(stripDecorativeEmoji(body), language)
}

export function buildPreviewStyleBullet(
  styleKey: PptPreviewStyleKey,
  bullet: string,
  index: number,
  language: PptPreviewRequest["language"],
) {
  void styleKey
  void index
  void language

  const clean = trimPreviewTerminalPunctuation(stripDecorativeEmoji(bullet)).replace(/^\d+\.\s*/u, "")
  return clean
}
