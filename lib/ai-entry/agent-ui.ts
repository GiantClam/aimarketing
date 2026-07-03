import { getAiEntryAgentById } from "@/lib/ai-entry/agent-catalog"

type AiEntryAgentUiLocale = "zh" | "en"

type PromptPair = {
  zh: string[]
  en: string[]
}

const DEFAULT_QUICK_PROMPTS: PromptPair = {
  zh: [
    "帮我拆解这个问题，直接给出结论、步骤和交付物。",
    "把下面的信息整理成结构化方案，优先输出可执行动作。",
    "基于这段背景，给我一版清晰、专业、可直接使用的回复。",
  ],
  en: [
    "Break this down and give me conclusions, steps, and deliverables directly.",
    "Turn the context below into a structured plan with execution-ready actions.",
    "Based on this background, draft a clear professional response I can use right away.",
  ],
}

const QUICK_PROMPTS_BY_AGENT: Record<string, PromptPair> = {
  "executive-diagnostic": {
    zh: [
      "基于公司现状做一次经营诊断，按优先级给出问题、原因和动作。",
      "把品牌、增长、销售、组织、财务一起看，给我 90 天改善计划。",
      "识别当前最危险的经营风险，并给出止损动作和负责人建议。",
    ],
    en: [
      "Run a business diagnosis and rank the issues, causes, and next actions.",
      "Look across brand, growth, sales, org, and finance, then give me a 90-day improvement plan.",
      "Identify the most dangerous operating risks and propose stop-loss actions with clear owners.",
    ],
  },
  "executive-brand": {
    zh: [
      "基于这段业务介绍，重写品牌定位、价值主张和一句话口号。",
      "帮我梳理品牌叙事结构，并给出首页最该强调的核心表达。",
      "分析竞品后，给出品牌差异化策略和传播重点。",
    ],
    en: [
      "Based on this business intro, rewrite the positioning, value proposition, and one-line slogan.",
      "Structure the brand narrative and tell me what the homepage should emphasize most.",
      "Review the competitors and give me a differentiation strategy with communication priorities.",
    ],
  },
  "executive-growth": {
    zh: [
      "分析当前增长瓶颈，给我未来 30 天实验排期和优先级。",
      "基于这个渠道数据，输出漏斗诊断、关键假设和第一批动作。",
      "给我一套获客、转化、留存联动的增长计划，直接列执行节奏。",
    ],
    en: [
      "Analyze the current growth bottleneck and give me a prioritized 30-day experiment plan.",
      "Based on this channel data, produce a funnel diagnosis, key hypotheses, and the first actions.",
      "Create an acquisition, conversion, and retention plan with a concrete execution cadence.",
    ],
  },
  "executive-ppt": {
    zh: [
      "根据这份 brief，生成一套可编辑 PPT 的目录、页稿和设计要求。",
      "把这段方案整理成适合汇报的可编辑 PPT 结构，并补齐每页要点。",
      "基于目标受众和场景，输出可编辑 PPT 的完整制作指令。",
    ],
    en: [
      "Turn this brief into an editable PPT outline, page copy, and design requirements.",
      "Restructure this proposal into an editable presentation deck and fill in the key points for each page.",
      "Based on the audience and use case, generate a complete editable PPT production brief.",
    ],
  },
  "executive-presentation-ppt": {
    zh: [
      "围绕这个主题生成一套演讲型 PPT，大纲要有起承转合。",
      "把这份材料改写成适合路演的演讲型展示稿，突出叙事节奏。",
      "为 10 分钟现场分享设计一套有节奏的演示结构和讲述重点。",
    ],
    en: [
      "Build a presentation-first deck around this topic with a clear narrative arc.",
      "Rewrite this material into a pitch-style presentation deck with stronger storytelling flow.",
      "Design a paced presentation structure for a 10-minute live talk, including speaking beats.",
    ],
  },
  "executive-sales-strategy": {
    zh: [
      "帮我拆解目标客户、销售路径和报价策略，给出赢单打法。",
      "基于这个产品，设计一套销售推进节奏和关键话术。",
      "分析当前商机卡点，给出提升成交率的优先动作。",
    ],
    en: [
      "Break down the target customers, sales path, and pricing strategy into a win plan.",
      "Design a sales motion and key talking points for this product.",
      "Analyze the current deal blockers and give me the highest-impact actions to improve close rate.",
    ],
  },
  "executive-sales-management": {
    zh: [
      "帮我设计销售过程管理机制和周度复盘模板。",
      "针对这支销售团队，梳理预测、跟进和考核机制。",
      "给我一套提升销售管理效率的 SOP 和指标面板。",
    ],
    en: [
      "Design a sales process management system and a weekly review template.",
      "For this sales team, define the forecasting, follow-up, and performance mechanisms.",
      "Give me an SOP and metric dashboard to improve sales management efficiency.",
    ],
  },
  "executive-org-hr": {
    zh: [
      "根据业务阶段，给出组织分工、招聘优先级和绩效建议。",
      "分析当前团队结构问题，并给出调整方案和过渡安排。",
      "为这个岗位体系设计人效目标、激励和协作机制。",
    ],
    en: [
      "Based on the business stage, define the org split, hiring priorities, and performance recommendations.",
      "Analyze the current team structure problems and suggest adjustments with a transition plan.",
      "Design productivity goals, incentives, and collaboration rules for this role system.",
    ],
  },
  "executive-operations": {
    zh: [
      "梳理当前交付流程，给出提效和标准化方案。",
      "分析运营链路中的瓶颈，并设计改进动作和负责分工。",
      "给我一套从接单到复盘的交付运营 SOP。",
    ],
    en: [
      "Map the current delivery process and propose efficiency and standardization improvements.",
      "Analyze bottlenecks in the operating chain and design improvement actions with clear ownership.",
      "Create an operating SOP from intake to delivery review.",
    ],
  },
  "executive-finance": {
    zh: [
      "基于这份经营数据，分析现金流、利润和费用效率。",
      "给我一套预算优先级和降本提效建议，按影响大小排序。",
      "识别当前财务经营风险，并给出修正动作和监控指标。",
    ],
    en: [
      "Based on this operating data, analyze cash flow, margins, and spending efficiency.",
      "Give me budget priorities and cost-efficiency actions ranked by impact.",
      "Identify the current finance risks and recommend corrective actions with monitoring metrics.",
    ],
  },
  "executive-legal-risk": {
    zh: [
      "从合同和用工角度筛查风险，并给出处理建议。",
      "帮我梳理这项合作可能的合规边界和注意事项。",
      "列出当前业务最需要优先补的法务风控动作。",
    ],
    en: [
      "Screen this from contract and employment angles, then give me risk handling advice.",
      "Outline the compliance boundaries and cautions for this cooperation setup.",
      "List the legal and risk-control actions this business should fix first.",
    ],
  },
}

function normalizeAgentId(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : ""
  return normalized || null
}

export function resolveAiEntryRequestedAgentId(input: {
  forcedAgentId?: string | null
  selectedAgentId?: string | null
  routeAgentId?: string | null
}) {
  return (
    normalizeAgentId(input.forcedAgentId) ||
    normalizeAgentId(input.selectedAgentId) ||
    normalizeAgentId(input.routeAgentId) ||
    null
  )
}

export function resolveAiEntryAgentName(
  agentId: string | null | undefined,
  locale: AiEntryAgentUiLocale,
) {
  const agent = getAiEntryAgentById(agentId)
  if (!agent) return null
  return locale === "zh"
    ? agent.name.zh || agent.name.en
    : agent.name.en || agent.name.zh
}

export function resolveAiEntryAgentDescription(
  agentId: string | null | undefined,
  locale: AiEntryAgentUiLocale,
) {
  const agent = getAiEntryAgentById(agentId)
  if (!agent) return null
  return locale === "zh"
    ? agent.description.zh || agent.description.en
    : agent.description.en || agent.description.zh
}

export function resolveAiEntryWorkspaceTitle(input: {
  agentId?: string | null
  locale: AiEntryAgentUiLocale
  isConsultingEntry: boolean
  defaultTitle: string
}) {
  const agentName = resolveAiEntryAgentName(input.agentId, input.locale)
  if (agentName) return agentName
  if (input.isConsultingEntry) {
    return input.locale === "zh" ? "咨询专家" : "Consulting Advisor"
  }
  return input.defaultTitle
}

export function resolveAiEntryWorkspaceSubtitle(input: {
  agentId?: string | null
  locale: AiEntryAgentUiLocale
  isConsultingEntry: boolean
  defaultSubtitle: string
}) {
  const agentDescription = resolveAiEntryAgentDescription(input.agentId, input.locale)
  if (agentDescription) return agentDescription
  if (input.isConsultingEntry) {
    return input.locale === "zh"
      ? "企业咨询专家对话入口"
      : "Enterprise consulting advisor entry"
  }
  return input.defaultSubtitle
}

export function resolveAiEntryWorkspaceKicker(input: {
  agentId?: string | null
  locale: AiEntryAgentUiLocale
  defaultKicker: string
}) {
  if (!normalizeAgentId(input.agentId)) return input.defaultKicker
  return input.locale === "zh" ? "Agent 工作台" : "Agent Workspace"
}

export function resolveAiEntryWorkspacePlaceholder(input: {
  agentId?: string | null
  agentName?: string | null
  locale: AiEntryAgentUiLocale
  defaultPlaceholder: string
}) {
  const normalizedAgentId = normalizeAgentId(input.agentId)
  const normalizedAgentName = String(input.agentName || "").trim()
  if (!normalizedAgentId || !normalizedAgentName) return input.defaultPlaceholder

  return input.locale === "zh"
    ? `请输入你希望${normalizedAgentName}完成的任务...`
    : `Describe what you want ${normalizedAgentName} to do...`
}

export function getAiEntryQuickPrompts(input: {
  agentId?: string | null
  locale: AiEntryAgentUiLocale
}) {
  const normalizedAgentId = normalizeAgentId(input.agentId)
  const localeKey = input.locale
  const promptSet =
    (normalizedAgentId ? QUICK_PROMPTS_BY_AGENT[normalizedAgentId] : null) ||
    DEFAULT_QUICK_PROMPTS

  return [...promptSet[localeKey]]
}
