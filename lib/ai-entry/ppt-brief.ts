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

type PreparedPreviewInput = {
  prompt: string
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

const EXPLICIT_BRIEF_FIELD_PATTERNS = {
  audience: /(?:^|[;\n；。]\s*)(?:受众|对象|audience)\s*[:=：]\s*([^\n;；。]+)/giu,
  goal: /(?:^|[;\n；。]\s*)(?:目标|目的|goal|objective)\s*[:=：]\s*([^\n;；。]+)/giu,
  scenario: /(?:^|[;\n；。]\s*)(?:场景|用途|scenario|use case)\s*[:=：]\s*([^\n;；。]+)/giu,
  language: /(?:^|[;\n；。]\s*)(?:语言|lang(?:uage)?)\s*[:=：]\s*([^\n;；。]+)/giu,
  pageCount: /(?:^|[;\n；。]\s*)(?:页数|页码|slide count|page count|pages?|slides?)\s*[:=：]\s*(\d{1,2})/giu,
  tone: /(?:^|[;\n；。]\s*)(?:语气|风格|tone|style)\s*[:=：]\s*([^\n;；。]+)/giu,
  mustInclude: /(?:^|[;\n；。]\s*)(?:必须包含|包括|包含|must include|include)\s*[:=：]\s*([^\n]+)/giu,
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
  audience: string | null
  goal: string | null
  scenario: PptBriefScenario | null
  language: PptBriefLanguage | null
  pageCount: number | null
  tone: string | null
  mustInclude: string[]
} {
  const audience = readLastExplicitFieldValue(EXPLICIT_BRIEF_FIELD_PATTERNS.audience, text)
  const goal = readLastExplicitFieldValue(EXPLICIT_BRIEF_FIELD_PATTERNS.goal, text)
  const scenarioText = readLastExplicitFieldValue(EXPLICIT_BRIEF_FIELD_PATTERNS.scenario, text)
  const languageText = readLastExplicitFieldValue(EXPLICIT_BRIEF_FIELD_PATTERNS.language, text)
  const tone = readLastExplicitFieldValue(EXPLICIT_BRIEF_FIELD_PATTERNS.tone, text)
  const mustIncludeText = readLastExplicitFieldValue(EXPLICIT_BRIEF_FIELD_PATTERNS.mustInclude, text)

  return {
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
  if (/(培训|课件|教学|workshop|training|onboarding)/iu.test(text)) return "training"
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
  const match =
    text.match(/(\d{1,2})\s*(?:页|p\b|pages?|slides?)/iu) ||
    text.match(/(?:page count|slide count)\D{0,8}(\d{1,2})/iu)
  if (!match) return null
  const parsed = Number.parseInt(match[1] || "", 10)
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

function inferTopic(userMessages: string[]) {
  for (let index = userMessages.length - 1; index >= 0; index -= 1) {
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
  const pageCount = explicitFields.pageCount || inferPageCount(combinedText)
  const tone = explicitFields.tone || inferTone(combinedText, language)
  const mustInclude =
    explicitFields.mustInclude.length > 0
      ? explicitFields.mustInclude
      : readOptionalStringArray(
          combinedText.match(/(?:必须包含|包括|包含|must include|include)\s*[:：]\s*(.+)$/imu)?.[1]
            ?.split(/[，,、;；]/u),
        )
  const topic = inferTopic(userMessages)
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
