export type PptBriefScenario =
  | "marketing-campaign"
  | "product-launch"
  | "sales-deck"
  | "training"

export type PptBriefLanguage = "zh-CN" | "en-US"

export type PptBriefMissingField =
  | "audience"
  | "goal"
  | "scenario"
  | "language"

export type PptBriefState = {
  topic: string | null
  audience: string | null
  goal: string | null
  scenario: PptBriefScenario | null
  language: PptBriefLanguage | null
  pageCount: number | null
  tone: string | null
  mustInclude: string[]
  missingFields: PptBriefMissingField[]
  readyForPreview: boolean
  suggestedValues: {
    audience: string
    goal: string
    scenario: PptBriefScenario
    language: PptBriefLanguage
    pageCount: number
    tone: string
  }
}

export type PptBriefConfirmationContext = {
  sourcePrompt: string | null
  audience: string
  goal: string
  scenario: PptBriefScenario
  language: PptBriefLanguage
  pageCount: number | null
  tone: string | null
  mustInclude: string[]
}

export type PptBriefUpdateInput = {
  topic: string
  audience: string
  goal: string
  scenario: PptBriefScenario
  language: PptBriefLanguage
  pageCount?: number | null
  tone?: string | null
  mustInclude?: string[]
}

const PPT_BRIEF_CONFIRMATION_CONTEXT_PREFIX = "<!-- ai-entry-ppt-brief-confirmation:"
const PPT_BRIEF_CONFIRMATION_CONTEXT_SUFFIX = " -->"

type PreparedPreviewInput = {
  prompt: string
  sourcePrompt?: string
  audience: string
  goal: string
  scenario: PptBriefScenario
  language: PptBriefLanguage
  pageCount?: number
  tone?: string
  mustInclude?: string[]
  researchBrief?: unknown
  templateMode?: "auto-4" | "single-template"
  templateId?: string
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function readOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
}

const BRIEF_FIELD_PREFIX = String.raw`(?:^|[;\n；。,.，]\s*|(?:请|帮我|我想|希望)?\s*(?:把|将)\s*(?:这份\s*)?(?:PPT|演示稿)?\s*)`
const BRIEF_FIELD_ASSIGNMENT = String.raw`(?:\s*请)?\s*(?:[:=：]|是|改为|改成|调整为|设置为|修改为|换成|变更为|变为|to)`
const BRIEF_FIELD_VALUE = String.raw`\s*([^\n;；。,.，]+)`
const BRIEF_PAGE_COUNT_VALUE = String.raw`\s*(\d{1,2})\s*(?:页|p\b|pages?|slides?)?`

const EXPLICIT_BRIEF_FIELD_PATTERNS = {
  topic: new RegExp(`${BRIEF_FIELD_PREFIX}(?:主题|题目|topic)${BRIEF_FIELD_ASSIGNMENT}${BRIEF_FIELD_VALUE}`, "giu"),
  audience: new RegExp(`${BRIEF_FIELD_PREFIX}(?:受众|对象|audience)${BRIEF_FIELD_ASSIGNMENT}${BRIEF_FIELD_VALUE}`, "giu"),
  goal: new RegExp(`${BRIEF_FIELD_PREFIX}(?:目标|目的|goal|objective)${BRIEF_FIELD_ASSIGNMENT}${BRIEF_FIELD_VALUE}`, "giu"),
  scenario: new RegExp(`${BRIEF_FIELD_PREFIX}(?:场景|用途|scenario|use case)${BRIEF_FIELD_ASSIGNMENT}${BRIEF_FIELD_VALUE}`, "giu"),
  language: new RegExp(`${BRIEF_FIELD_PREFIX}(?:语言|lang(?:uage)?)${BRIEF_FIELD_ASSIGNMENT}${BRIEF_FIELD_VALUE}`, "giu"),
  pageCount: new RegExp(
    `${BRIEF_FIELD_PREFIX}(?:页数|页码|slide count|page count|pages?|slides?)${BRIEF_FIELD_ASSIGNMENT}${BRIEF_PAGE_COUNT_VALUE}`,
    "giu",
  ),
  tone: new RegExp(`${BRIEF_FIELD_PREFIX}(?:语气|风格|tone|style)${BRIEF_FIELD_ASSIGNMENT}${BRIEF_FIELD_VALUE}`, "giu"),
  mustInclude: new RegExp(
    `${BRIEF_FIELD_PREFIX}(?:必须包含|包括|包含|must include|include)${BRIEF_FIELD_ASSIGNMENT}${BRIEF_FIELD_VALUE}`,
    "giu",
  ),
} as const

function readLastExplicitFieldValue(pattern: RegExp, text: string) {
  const matches = [...text.matchAll(new RegExp(pattern.source, pattern.flags))]
  const value = matches.at(-1)?.[1]
  return readOptionalString(value)
}

function normalizeExplicitLanguage(value: string | null): PptBriefLanguage | null {
  if (!value) return null
  if (/(中文|汉语|简体|zh)/iu.test(value)) return "zh-CN"
  if (/(英文|英语|english|en)/iu.test(value)) return "en-US"
  return null
}

function normalizeExplicitPageCount(value: string | null) {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 4 || parsed > 20) return null
  return parsed
}

function extractExplicitBriefFields(text: string): {
  topic: string | null
  audience: string | null
  goal: string | null
  scenario: PptBriefScenario | null
  language: PptBriefLanguage | null
  pageCount: number | null
  tone: string | null
  mustInclude: string[]
} {
  const audience = readLastExplicitFieldValue(EXPLICIT_BRIEF_FIELD_PATTERNS.audience, text)
  const topic = readLastExplicitFieldValue(EXPLICIT_BRIEF_FIELD_PATTERNS.topic, text)
  const goal = readLastExplicitFieldValue(EXPLICIT_BRIEF_FIELD_PATTERNS.goal, text)
  const scenarioText = readLastExplicitFieldValue(EXPLICIT_BRIEF_FIELD_PATTERNS.scenario, text)
  const languageText = readLastExplicitFieldValue(EXPLICIT_BRIEF_FIELD_PATTERNS.language, text)
  const tone = readLastExplicitFieldValue(EXPLICIT_BRIEF_FIELD_PATTERNS.tone, text)
  const mustIncludeText = readLastExplicitFieldValue(EXPLICIT_BRIEF_FIELD_PATTERNS.mustInclude, text)

  return {
    topic,
    audience,
    goal,
    scenario: scenarioText ? inferScenario(scenarioText) : null,
    language: normalizeExplicitLanguage(languageText),
    pageCount: normalizeExplicitPageCount(
      readLastExplicitFieldValue(EXPLICIT_BRIEF_FIELD_PATTERNS.pageCount, text),
    ),
    tone,
    mustInclude: mustIncludeText
      ? mustIncludeText.split(/[，,、;；]/u).map((item) => item.trim()).filter(Boolean)
      : [],
  }
}

function inferLanguage(text: string): PptBriefLanguage {
  return /[\u4e00-\u9fff]/u.test(text) ? "zh-CN" : "en-US"
}

function inferScenario(text: string): PptBriefScenario | null {
  if (/(培训|课件|教学|讲解|课堂|lecture|classroom|workshop|training|onboarding)/iu.test(text)) return "training"
  if (
    /(战略汇报|战略分析|研究汇报|分析汇报|现状汇报|briefing|analysis|report|review|军事分析|局势分析|复盘汇报)/iu.test(
      text,
    )
  ) {
    return "sales-deck"
  }
  if (
    /(路演|提案|客户|销售|pitch|proposal|sales|investor|解决方案|产品方案|方案PPT|方案汇报|合作方式)/iu.test(
      text,
    )
  ) {
    return "sales-deck"
  }
  if (/(发布|上市|上新|launch|release|go-to-market|gtm|product intro|产品介绍)/iu.test(text)) {
    return "product-launch"
  }
  if (/(品牌|营销|campaign|marketing|推广|传播)/iu.test(text)) return "marketing-campaign"
  return null
}

function inferAudience(text: string, language: PptBriefLanguage) {
  if (/(老板|管理层|高管|领导|board|exec|executive|management|董事会)/iu.test(text)) {
    return language === "zh-CN" ? "管理层汇报" : "Executive review"
  }
  if (/(投资人|融资|investor|fundraising|roadshow)/iu.test(text)) {
    return language === "zh-CN" ? "投资人路演" : "Investor pitch"
  }
  if (/(客户|提案|招标|client|customer|proposal|bid)/iu.test(text)) {
    return language === "zh-CN" ? "客户提案会" : "Client proposal meeting"
  }
  if (/(团队|内部|培训|同事|internal|team|training)/iu.test(text)) {
    return language === "zh-CN" ? "内部团队沟通" : "Internal team audience"
  }
  return null
}

function inferGoal(text: string, scenario: PptBriefScenario | null, language: PptBriefLanguage) {
  if (/(复盘|汇报|总结|review|report|recap)/iu.test(text)) {
    return language === "zh-CN" ? "经营汇报与决策同步" : "Business review and decision alignment"
  }
  if (/(提案|说服|赢单|proposal|convince|close)/iu.test(text)) {
    return language === "zh-CN" ? "客户提案与说服" : "Client proposal and persuasion"
  }
  if (/(路演|融资|investor|fundraising|pitch)/iu.test(text)) {
    return language === "zh-CN" ? "路演说服与融资沟通" : "Pitch and fundraising communication"
  }
  if (/(培训|教学|training|onboarding|enablement)/iu.test(text)) {
    return language === "zh-CN" ? "培训讲解与统一认知" : "Training and enablement"
  }
  if (/(发布|上市|launch|release|go-to-market)/iu.test(text)) {
    return language === "zh-CN" ? "产品发布与市场沟通" : "Product launch communication"
  }

  if (scenario === "sales-deck") {
    return language === "zh-CN" ? "客户提案与说服" : "Client proposal and persuasion"
  }
  if (scenario === "training") {
    return language === "zh-CN" ? "培训讲解与统一认知" : "Training and enablement"
  }
  if (scenario === "product-launch") {
    return language === "zh-CN" ? "产品发布与市场沟通" : "Product launch communication"
  }
  return language === "zh-CN" ? "业务表达与结构化汇报" : "Structured business presentation"
}

function inferPageCount(text: string) {
  const candidates: Array<{ index: number; value: string }> = []
  for (const match of text.matchAll(/(\d{1,2})\s*(?:页|p\b|pages?|slides?)/giu)) {
    candidates.push({ index: match.index ?? 0, value: match[1] || "" })
  }
  for (const match of text.matchAll(/(?:页数|页码|page count|slide count)\D{0,8}(\d{1,2})/giu)) {
    candidates.push({ index: match.index ?? 0, value: match[1] || "" })
  }

  const candidate = candidates.sort((left, right) => left.index - right.index).at(-1)
  if (!candidate) return null
  const parsed = Number.parseInt(candidate.value, 10)
  if (!Number.isFinite(parsed) || parsed < 4 || parsed > 20) return null
  return parsed
}

function inferTone(text: string, language: PptBriefLanguage) {
  if (/(简洁|专业|高层|决策|executive|concise|professional)/iu.test(text)) {
    return language === "zh-CN" ? "简洁、专业、决策导向" : "Concise, professional, executive-ready"
  }
  if (/(演讲|感染力|叙事|story|presentation|stage)/iu.test(text)) {
    return language === "zh-CN" ? "强叙事、适合现场表达" : "Narrative-driven and presentation-ready"
  }
  return null
}

function stripExplicitBriefFields(text: string) {
  return Object.values(EXPLICIT_BRIEF_FIELD_PATTERNS)
    .reduce(
      (current, pattern) => current.replace(new RegExp(pattern.source, pattern.flags), " "),
      text,
    )
    .replace(/^[\s,，;；。:：\-|/]+|[\s,，;；。:：\-|/]+$/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isBriefFieldOnlyEdit(text: string) {
  const hasEditIntent =
    /(?:改|调整|设置|修改|换成|变更|太多|太少|不够|过多|过少|就行|即可|吧|change(?:d)?|adjust(?:ed)?|set|replace|too many|too few|enough|fine)/iu.test(
      text,
    )
  const hasBriefField =
    /(?:页数|页码|受众|对象|目标|目的|场景|用途|语言|风格|语气|必须包含|包括|包含|pages?|slides?)/iu.test(text) ||
    /\d{1,2}\s*页/iu.test(text)
  return hasEditIntent && hasBriefField
}

function inferTopic(userMessages: string[]) {
  for (let index = userMessages.length - 1; index >= 0; index -= 1) {
    if (isBriefFieldOnlyEdit(userMessages[index] || "")) continue
    const normalized = stripExplicitBriefFields(userMessages[index] || "")
    if (normalized) return normalized.slice(0, 120)
  }

  const normalized = (userMessages.at(-1) || "").replace(/\s+/g, " ").trim()
  return normalized ? normalized.slice(0, 120) : null
}

function buildSuggestedValues(input: {
  scenario: PptBriefScenario | null
  language: PptBriefLanguage
  audience: string | null
  goal: string | null
  pageCount: number | null
  tone: string | null
}) {
  const scenario = input.scenario || "marketing-campaign"
  const language = input.language
  return {
    audience:
      input.audience ||
      (scenario === "sales-deck"
        ? language === "zh-CN"
          ? "客户提案会"
          : "Client proposal meeting"
        : scenario === "training"
          ? language === "zh-CN"
            ? "内部团队培训"
            : "Internal training audience"
          : language === "zh-CN"
            ? "管理层汇报"
            : "Executive review"),
    goal:
      input.goal ||
      inferGoal("", scenario, language),
    scenario,
    language,
    pageCount: input.pageCount || (scenario === "training" ? 12 : 10),
    tone:
      input.tone ||
      (language === "zh-CN"
        ? "简洁、专业、决策导向"
        : "Concise, professional, decision-oriented"),
  }
}

export function createPptBriefState(input: PptBriefUpdateInput): PptBriefState {
  const topic = input.topic.trim()
  const audience = input.audience.trim()
  const goal = input.goal.trim()
  const tone = input.tone?.trim() || null
  const mustInclude = readOptionalStringArray(input.mustInclude)
  const missingFields: PptBriefMissingField[] = []

  if (!audience) missingFields.push("audience")
  if (!goal) missingFields.push("goal")
  if (!input.scenario) missingFields.push("scenario")
  if (!input.language) missingFields.push("language")

  return {
    topic: topic || null,
    audience: audience || null,
    goal: goal || null,
    scenario: input.scenario || null,
    language: input.language || null,
    pageCount: input.pageCount ?? null,
    tone,
    mustInclude,
    missingFields,
    readyForPreview: missingFields.length === 0,
    suggestedValues: buildSuggestedValues({
      scenario: input.scenario || null,
      language: input.language || "zh-CN",
      audience: audience || null,
      goal: goal || null,
      pageCount: input.pageCount ?? null,
      tone,
    }),
  }
}

export function createPptBriefStateFromConfirmationContext(
  context: PptBriefConfirmationContext,
) {
  return createPptBriefState({
    topic: context.sourcePrompt || "Untitled presentation",
    audience: context.audience,
    goal: context.goal,
    scenario: context.scenario,
    language: context.language,
    pageCount: context.pageCount,
    tone: context.tone,
    mustInclude: context.mustInclude,
  })
}

export function extractPptBriefState(input: {
  userMessages: string[]
}) {
  const userMessages = input.userMessages.map((item) => item.trim()).filter(Boolean)
  const combinedText = userMessages.join("\n")
  const latestUserText = userMessages.at(-1) || ""
  const explicitFields = extractExplicitBriefFields(combinedText)
  const language = explicitFields.language || inferLanguage(combinedText || latestUserText || "")
  const scenario = explicitFields.scenario || inferScenario(combinedText)
  const audience = explicitFields.audience || inferAudience(combinedText, language)
  const goal = explicitFields.goal || inferGoal(combinedText, scenario, language)
  const pageCount = inferPageCount(combinedText) || explicitFields.pageCount
  const tone = explicitFields.tone || inferTone(combinedText, language)
  const mustInclude =
    explicitFields.mustInclude.length > 0
      ? explicitFields.mustInclude
      : readOptionalStringArray(
          combinedText.match(/(?:必须包含|包括|包含|must include|include)\s*[:：]\s*(.+)$/imu)?.[1]
            ?.split(/[，,、;；]/u),
        )
  const topic = explicitFields.topic || inferTopic(userMessages)
  const suggestedValues = buildSuggestedValues({
    scenario,
    language,
    audience,
    goal,
    pageCount,
    tone,
  })
  const missingFields: PptBriefMissingField[] = []
  if (!audience) missingFields.push("audience")
  if (!goal) missingFields.push("goal")
  if (!scenario) missingFields.push("scenario")
  if (!language) missingFields.push("language")

  return {
    topic,
    audience,
    goal,
    scenario,
    language,
    pageCount,
    tone,
    mustInclude,
    missingFields,
    readyForPreview: missingFields.length === 0,
    suggestedValues,
  } satisfies PptBriefState
}

function normalizePptBriefConfirmationContext(value: unknown): PptBriefConfirmationContext | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  const audience = readOptionalString(record.audience)
  const goal = readOptionalString(record.goal)
  const scenario = record.scenario
  const language = record.language
  if (
    !audience ||
    !goal ||
    (scenario !== "marketing-campaign" && scenario !== "product-launch" && scenario !== "sales-deck" && scenario !== "training") ||
    (language !== "zh-CN" && language !== "en-US")
  ) {
    return null
  }

  return {
    sourcePrompt: readOptionalString(record.sourcePrompt),
    audience,
    goal,
    scenario,
    language,
    pageCount: typeof record.pageCount === "number" && Number.isFinite(record.pageCount) ? record.pageCount : null,
    tone: readOptionalString(record.tone),
    mustInclude: readOptionalStringArray(record.mustInclude),
  }
}

export function extractLatestPptBriefConfirmationContext(
  content: string | null | undefined,
): PptBriefConfirmationContext | null {
  if (typeof content !== "string" || !content.trim()) return null
  const markerPattern = new RegExp(
    `${PPT_BRIEF_CONFIRMATION_CONTEXT_PREFIX.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(\\{[\\s\\S]*?\\})\\s*-->`,
    "gu",
  )
  const matches = [...content.matchAll(markerPattern)]
  const serializedContext = matches.at(-1)?.[1]
  if (!serializedContext) return null

  try {
    return normalizePptBriefConfirmationContext(JSON.parse(serializedContext))
  } catch {
    return null
  }
}

export function stripPptBriefConfirmationContextMarkers(content: string | null | undefined) {
  const normalized = typeof content === "string" ? content : ""
  if (!normalized) return ""

  const markerPattern = new RegExp(
    `${PPT_BRIEF_CONFIRMATION_CONTEXT_PREFIX}(?:\\{[\\s\\S]*?\\})\\s*-->`,
    "gu",
  )
  return normalized.replace(markerPattern, "").replace(/\n{3,}/g, "\n\n").trim()
}

export function isPptBriefConfirmationReply(value: string | null | undefined) {
  const normalized = readOptionalString(value)?.toLowerCase() ?? ""
  if (!normalized) return false
  if (/(?:确认|确认了|好的|可以|同意|确认无误|confirm|confirmed)(?:\s*(?:brief|需求|方案|以上|上述))?(?:\s*[,，]?\s*(?:继续|进入下一步|continue))?$/iu.test(normalized)) {
    return true
  }
  return /(?:brief|需求|方案)\s*(?:确认|已确认|无误)(?:\s*[,，]?\s*(?:继续|进入下一步|continue))?$/iu.test(normalized)
}

export function buildPptBriefConfirmationMessage(state: PptBriefState, isZh: boolean) {
  if (!state.readyForPreview || !state.audience || !state.goal || !state.scenario || !state.language) {
    return buildPptBriefClarificationMessage(state, isZh)
  }

  const context: PptBriefConfirmationContext = {
    sourcePrompt: state.topic,
    audience: state.audience,
    goal: state.goal,
    scenario: state.scenario,
    language: state.language,
    pageCount: state.pageCount,
    tone: state.tone,
    mustInclude: state.mustInclude,
  }
  const marker = `${PPT_BRIEF_CONFIRMATION_CONTEXT_PREFIX}${JSON.stringify(context)}${PPT_BRIEF_CONFIRMATION_CONTEXT_SUFFIX}`
  const lines = isZh
    ? [
        "PPT brief 已整理，请先确认：",
        `- 主题：${state.topic || "未命名演示"}`,
        `- 受众：${state.audience}`,
        `- 目标：${state.goal}`,
        `- 场景：${state.scenario}`,
        `- 语言：${state.language === "zh-CN" ? "中文" : "英文"}`,
        `- 页数：${state.pageCount || state.suggestedValues.pageCount}`,
        `- 风格：${state.tone || state.suggestedValues.tone}`,
        state.mustInclude.length > 0 ? `- 必须包含：${state.mustInclude.join("；")}` : null,
        "回复“确认 brief”进入模板选择；如需修改，请直接指出字段。",
        marker,
      ]
    : [
        "Your PPT brief is ready. Please confirm it before choosing a template:",
        `- Topic: ${state.topic || "Untitled presentation"}`,
        `- Audience: ${state.audience}`,
        `- Goal: ${state.goal}`,
        `- Scenario: ${state.scenario}`,
        `- Language: ${state.language}`,
        `- Page count: ${state.pageCount || state.suggestedValues.pageCount}`,
        `- Tone: ${state.tone || state.suggestedValues.tone}`,
        state.mustInclude.length > 0 ? `- Must include: ${state.mustInclude.join("; ")}` : null,
        'Reply "confirm brief" to choose a template, or specify the fields you want to change.',
        marker,
      ]

  return lines.filter((line): line is string => Boolean(line)).join("\n")
}

export function buildPptBriefPromptSection(state: PptBriefState) {
  const lines = [
    "## PPT brief state",
    `Topic: ${state.topic || "missing"}`,
    `Audience: ${state.audience || `missing (suggested: ${state.suggestedValues.audience})`}`,
    `Goal: ${state.goal || `missing (suggested: ${state.suggestedValues.goal})`}`,
    `Scenario: ${state.scenario || `missing (suggested: ${state.suggestedValues.scenario})`}`,
    `Language: ${state.language || `missing (suggested: ${state.suggestedValues.language})`}`,
    `Page count: ${state.pageCount || `suggested ${state.suggestedValues.pageCount}`}`,
    `Tone: ${state.tone || `suggested ${state.suggestedValues.tone}`}`,
    `Ready for preview: ${state.readyForPreview ? "yes" : "no"}`,
    state.mustInclude.length > 0 ? `Must include: ${state.mustInclude.join("; ")}` : null,
    state.missingFields.length > 0
      ? `Missing fields to confirm: ${state.missingFields.join(", ")}`
      : "No blocking brief fields are missing.",
    "When brief fields are missing, first provide recommended values and assumptions, then ask only 1 to 3 short confirmation questions. Do not call PPT tools until the brief is complete enough for generation.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")

  return lines
}

export function buildPptBriefClarificationMessage(state: PptBriefState, isZh: boolean) {
  const suggestedAudience = state.suggestedValues.audience
  const suggestedGoal = state.suggestedValues.goal
  const suggestedLanguage = state.suggestedValues.language
  const suggestedPageCount = state.suggestedValues.pageCount
  const suggestedTone = state.suggestedValues.tone

  const scenarioHint = isZh
    ? "可选：战略汇报、营销方案、产品发布、销售提案、培训课件"
    : "Options: strategic briefing, marketing campaign, product launch, sales deck, training deck"
  const scenarioReplyHint = isZh
    ? "如果你回复“战略汇报 / 战略分析 / 研究汇报”，我会按战略汇报型 deck 继续。"
    : "If you reply with strategic briefing or analysis report, I will continue with a strategic briefing-style deck."

  const questions: string[] = []
  if (state.missingFields.includes("audience")) {
    questions.push(
      isZh
        ? `1. 这份 PPT 主要给谁看？建议：${suggestedAudience}。`
        : `1. Who is this deck for? Suggested: ${suggestedAudience}.`,
    )
  }
  if (state.missingFields.includes("goal")) {
    questions.push(
      isZh
        ? `2. 这份 PPT 的核心目标是什么？建议：${suggestedGoal}。`
        : `2. What is the primary goal of this deck? Suggested: ${suggestedGoal}.`,
    )
  }
  if (state.missingFields.includes("scenario")) {
    questions.push(
      isZh
        ? `${questions.length + 1}. 这次更接近哪种场景？${scenarioHint}。`
        : `${questions.length + 1}. Which scenario fits best? ${scenarioHint}.`,
    )
  }
  if (state.missingFields.includes("language")) {
    questions.push(
      isZh
        ? `${questions.length + 1}. 最终成稿用中文还是英文？建议：${suggestedLanguage}。`
        : `${questions.length + 1}. Should the final deck be in Chinese or English? Suggested: ${suggestedLanguage}.`,
    )
  }

  const summary = isZh
    ? [
        "还不能进入 PPT 预览，brief 还没补完整。",
        `当前我已确认：目标=${state.goal || suggestedGoal}；页数=${state.pageCount || suggestedPageCount}；语言=${state.language || suggestedLanguage}${state.tone ? `；语气=${state.tone}` : `；建议语气=${suggestedTone}`}`,
        "请直接补充下面缺失的信息，我收到后会继续追问，直到 brief 完整再进入预览：",
      ]
    : [
        "I cannot start the PPT preview yet because the brief is still incomplete.",
        `Confirmed so far: goal=${state.goal || suggestedGoal}; page count=${state.pageCount || suggestedPageCount}; language=${state.language || suggestedLanguage}${state.tone ? `; tone=${state.tone}` : `; suggested tone=${suggestedTone}`}`,
        "Please fill in the missing items below. I will keep asking until the brief is complete, then move into preview:",
      ]

  const closing = isZh
    ? [
        scenarioReplyHint,
        "你也可以直接按这个格式回复：受众=...；场景=...；目标=...；语言=中文/英文。",
      ]
    : [
        scenarioReplyHint,
        "You can also reply in one line like: audience=...; scenario=...; goal=...; language=Chinese/English.",
      ]

  return [...summary, ...questions.slice(0, 3), ...closing].join("\n")
}

export function buildPptTemplateRecommendationSource(input: {
  briefState: PptBriefState | null
  latestUserPrompt?: string | null
}) {
  const state = input.briefState
  const latestUserPrompt = readOptionalString(input.latestUserPrompt)
  if (!state) {
    return latestUserPrompt || ""
  }

  const lines = [
    state.topic ? `Topic: ${state.topic}` : null,
    state.audience ? `Audience: ${state.audience}` : null,
    state.goal ? `Goal: ${state.goal}` : null,
    state.scenario ? `Scenario: ${state.scenario}` : null,
    state.language ? `Language: ${state.language}` : null,
    typeof state.pageCount === "number" ? `Page count: ${state.pageCount}` : null,
    state.tone ? `Tone: ${state.tone}` : null,
    state.mustInclude.length > 0 ? `Must include: ${state.mustInclude.join("; ")}` : null,
    latestUserPrompt ? `Latest request: ${latestUserPrompt}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")

  return lines || latestUserPrompt || ""
}

export function preparePptPreviewInput(input: {
  rawInput: unknown
  briefState: PptBriefState | null
}) {
  const record = input.rawInput && typeof input.rawInput === "object"
    ? (input.rawInput as Record<string, unknown>)
    : {}

  const prompt = readOptionalString(record.prompt)
  const sourcePrompt = readOptionalString(record.sourcePrompt)
  const audience = readOptionalString(record.audience) || input.briefState?.audience || null
  const goal = readOptionalString(record.goal) || input.briefState?.goal || null
  const scenario =
    readOptionalString(record.scenario) as PptBriefScenario | null ||
    input.briefState?.scenario ||
    null
  const language =
    readOptionalString(record.language) as PptBriefLanguage | null ||
    input.briefState?.language ||
    null
  const pageCount =
    typeof record.pageCount === "number" && Number.isFinite(record.pageCount)
      ? record.pageCount
      : input.briefState?.pageCount || undefined
  const tone = readOptionalString(record.tone) || input.briefState?.tone || undefined
  const mustInclude = readOptionalStringArray(record.mustInclude)
  const missingFields: PptBriefMissingField[] = []
  if (!audience) missingFields.push("audience")
  if (!goal) missingFields.push("goal")
  if (!scenario) missingFields.push("scenario")
  if (!language) missingFields.push("language")

  if (!prompt) {
    missingFields.unshift("goal")
  }

  if (missingFields.length > 0) {
    const suggested = input.briefState?.suggestedValues || buildSuggestedValues({
      scenario,
      language: language || "zh-CN",
      audience,
      goal,
      pageCount: pageCount || null,
      tone: tone || null,
    })
    return {
      ok: false as const,
      error: {
        code: "ppt_brief_incomplete",
        message: "PPT brief is incomplete. Confirm the missing brief fields before generating the deck.",
      },
      missingFields,
      suggestedBrief: suggested,
    }
  }

  const resolvedAudience = audience as string
  const resolvedGoal = goal as string
  const resolvedScenario = scenario as PptBriefScenario
  const resolvedLanguage = language as PptBriefLanguage

  const briefLines = [
    prompt,
    "",
    "Structured brief:",
    `Audience: ${resolvedAudience}`,
    `Goal: ${resolvedGoal}`,
    `Scenario: ${resolvedScenario}`,
    `Language: ${resolvedLanguage}`,
    pageCount ? `Page count: ${pageCount}` : null,
    tone ? `Tone: ${tone}` : null,
    mustInclude.length > 0 ? `Must include: ${mustInclude.join("; ")}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")

  return {
    ok: true as const,
    input: {
      prompt: briefLines,
      ...(sourcePrompt ? { sourcePrompt } : {}),
      audience: resolvedAudience,
      goal: resolvedGoal,
      scenario: resolvedScenario,
      language: resolvedLanguage,
      ...(typeof pageCount === "number" ? { pageCount } : {}),
      ...(tone ? { tone } : {}),
      ...(mustInclude.length > 0 ? { mustInclude } : {}),
      ...(record.researchBrief ? { researchBrief: record.researchBrief } : {}),
      ...(readOptionalString(record.templateMode) ? { templateMode: record.templateMode as "auto-4" | "single-template" } : {}),
      ...(readOptionalString(record.templateId) ? { templateId: record.templateId as string } : {}),
    } satisfies PreparedPreviewInput,
  }
}
