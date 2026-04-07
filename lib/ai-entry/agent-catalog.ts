export type AiEntryAgentCategory = "general" | "executive"

export type LocalizedText = {
  zh: string
  en: string
}

export type AiEntryAgentCatalogItem = {
  id: string
  category: AiEntryAgentCategory
  name: LocalizedText
  description: LocalizedText
}

export type AiEntryAgentCatalogGroup = {
  id: AiEntryAgentCategory
  label: LocalizedText
}

const GROUPS: AiEntryAgentCatalogGroup[] = [
  {
    id: "general",
    label: { zh: "通用", en: "General" },
  },
  {
    id: "executive",
    label: { zh: "专家顾问套件", en: "Executive Consulting Suite" },
  },
]

const AGENTS: AiEntryAgentCatalogItem[] = [
  {
    id: "general",
    category: "general",
    name: { zh: "通用助手", en: "General Assistant" },
    description: {
      zh: "默认 AI 对话助手，适合日常问答与任务协作。",
      en: "Default AI chat assistant for everyday Q&A and task support.",
    },
  },
  {
    id: "executive-diagnostic",
    category: "executive",
    name: { zh: "经营诊断顾问", en: "Executive Diagnostic Advisor" },
    description: {
      zh: "跨品牌、增长、销售、组织、运营、财务与法务风险的综合诊断。",
      en: "Cross-functional diagnosis across strategy, growth, sales, org, ops, finance, and legal risk.",
    },
  },
  {
    id: "executive-brand",
    category: "executive",
    name: { zh: "品牌战略顾问", en: "Brand Strategy Advisor (Executive)" },
    description: {
      zh: "聚焦定位、价值主张、叙事结构和品牌决策优先级。",
      en: "Focus on positioning, value proposition, narrative, and priority brand decisions.",
    },
  },
  {
    id: "executive-growth",
    category: "executive",
    name: { zh: "增长顾问", en: "Growth Advisor (Executive)" },
    description: {
      zh: "聚焦增长瓶颈诊断、实验优先级和执行节奏。",
      en: "Focus on bottleneck diagnosis, experiment priority, and execution cadence.",
    },
  },
  {
    id: "executive-sales-strategy",
    category: "executive",
    name: { zh: "销售策略顾问", en: "Sales Strategy Advisor" },
    description: {
      zh: "聚焦客户细分、销售路径、报价策略与赢单机制。",
      en: "Focus on segmentation, sales path, pricing strategy, and win-rate mechanics.",
    },
  },
  {
    id: "executive-sales-management",
    category: "executive",
    name: { zh: "销售管理体系顾问", en: "Sales Management System Advisor" },
    description: {
      zh: "聚焦销售过程管理、预测准确性与团队管理机制。",
      en: "Focus on process control, forecast quality, and sales management systems.",
    },
  },
  {
    id: "executive-org-hr",
    category: "executive",
    name: { zh: "组织与人效顾问", en: "Organization & HR Advisor" },
    description: {
      zh: "聚焦组织分工、人才结构、激励与绩效机制。",
      en: "Focus on org design, talent mix, incentives, and performance mechanics.",
    },
  },
  {
    id: "executive-operations",
    category: "executive",
    name: { zh: "运营与交付顾问", en: "Operations & Delivery Advisor" },
    description: {
      zh: "聚焦交付能力、流程标准化与运营效率。",
      en: "Focus on delivery capacity, process standardization, and operational efficiency.",
    },
  },
  {
    id: "executive-finance",
    category: "executive",
    name: { zh: "财务经营顾问", en: "Finance Management Advisor" },
    description: {
      zh: "聚焦现金流、利润结构、费用效率与预算优先级。",
      en: "Focus on cash flow, margin structure, spending efficiency, and budget priorities.",
    },
  },
  {
    id: "executive-legal-risk",
    category: "executive",
    name: { zh: "法务风控顾问", en: "Legal Risk Screening Advisor" },
    description: {
      zh: "聚焦中国大陆合同与劳动用工场景下的风险筛查与边界建议。",
      en: "Focus on bounded legal risk screening for PRC contract and employment matters.",
    },
  },
]

const AGENT_ID_SET = new Set(AGENTS.map((item) => item.id))

export function getAiEntryAgentCatalog() {
  return AGENTS
}

export function getAiEntryAgentGroups() {
  return GROUPS
}

export function getDefaultAiEntryAgentId() {
  return "general"
}

export function isAiEntryAgentId(value: string | null | undefined): value is string {
  return typeof value === "string" && AGENT_ID_SET.has(value)
}

export function getAiEntryAgentById(agentId: string | null | undefined) {
  if (!isAiEntryAgentId(agentId)) return null
  return AGENTS.find((item) => item.id === agentId) || null
}
