import { getAiEntryAgentById } from "@/lib/ai-entry/agent-catalog"
import type { LocalizedBusinessAgentConfig } from "@/lib/platform/business-agents"
import type { WorkspaceBusinessSlug } from "@/lib/platform/workspace-business"

type Locale = "zh" | "en"

type ExecutiveBusinessMenuBinding = {
  businessSlug: WorkspaceBusinessSlug
  artifactKinds: LocalizedBusinessAgentConfig["artifactKinds"]
  samplePrompts: {
    zh: string[]
    en: string[]
  }
}

const EXECUTIVE_BUSINESS_MENU_BINDINGS: Record<string, ExecutiveBusinessMenuBinding> = {
  "executive-diagnostic": {
    businessSlug: "enterprise-operations",
    artifactKinds: ["brief", "plan", "report"],
    samplePrompts: {
      zh: ["围绕当前企业经营情况，先给我一版诊断结论、关键风险和优先动作。"],
      en: ["Assess the current operating situation and give me diagnosis, risks, and top priorities."],
    },
  },
  "executive-brand": {
    businessSlug: "brand-creative",
    artifactKinds: ["brief", "plan", "copy"],
    samplePrompts: {
      zh: ["围绕当前品牌定位与产品信息，给我一版品牌战略诊断和调整建议。"],
      en: ["Use the current brand and product context to produce a brand strategy diagnosis and adjustment plan."],
    },
  },
  "executive-growth": {
    businessSlug: "content-growth",
    artifactKinds: ["brief", "plan", "report"],
    samplePrompts: {
      zh: ["分析当前增长瓶颈，给我一版实验优先级、节奏和执行建议。"],
      en: ["Analyze the growth bottlenecks and build an experiment priority list, cadence, and execution plan."],
    },
  },
  "executive-ppt": {
    businessSlug: "brand-creative",
    artifactKinds: ["brief", "asset", "report"],
    samplePrompts: {
      zh: ["根据这个业务 brief，帮我梳理一版可直接生成 PPT 的提案结构。"],
      en: ["Turn this business brief into a proposal structure that can be used to generate a PPT deck."],
    },
  },
  "executive-sales-strategy": {
    businessSlug: "sales-close",
    artifactKinds: ["brief", "plan", "report"],
    samplePrompts: {
      zh: ["围绕当前客户机会，给我一版成交策略、报价逻辑和下一步动作。"],
      en: ["Build a close plan for this opportunity, including pricing logic and next actions."],
    },
  },
  "executive-sales-management": {
    businessSlug: "sales-close",
    artifactKinds: ["brief", "plan", "report"],
    samplePrompts: {
      zh: ["诊断当前销售管理问题，给我一版过程管理和预测机制优化建议。"],
      en: ["Diagnose the current sales-management issues and suggest process and forecasting improvements."],
    },
  },
  "executive-org-hr": {
    businessSlug: "talent-recruiting",
    artifactKinds: ["brief", "plan", "report"],
    samplePrompts: {
      zh: ["结合当前组织情况，给我一版岗位、激励和人效优化建议。"],
      en: ["Given the current org context, propose role design, incentives, and team-efficiency improvements."],
    },
  },
  "executive-operations": {
    businessSlug: "enterprise-operations",
    artifactKinds: ["brief", "plan", "report"],
    samplePrompts: {
      zh: ["围绕当前运营流程，给我一版交付、协作和效率优化方案。"],
      en: ["Review the current operations flow and recommend delivery, collaboration, and efficiency improvements."],
    },
  },
  "executive-finance": {
    businessSlug: "finance",
    artifactKinds: ["brief", "plan", "report"],
    samplePrompts: {
      zh: ["围绕现金流、利润结构和预算，给我一版财务经营诊断。"],
      en: ["Assess cash flow, margin structure, and budget priorities for the current business."],
    },
  },
  "executive-legal-risk": {
    businessSlug: "legal-ops",
    artifactKinds: ["brief", "plan", "report"],
    samplePrompts: {
      zh: ["先帮我识别当前合同或经营动作里的主要法务与风控风险。"],
      en: ["Identify the main legal and risk issues in the current contract or operating action."],
    },
  },
}

export function isExecutiveBusinessMenuAgentId(agentId: string | null | undefined): agentId is string {
  return typeof agentId === "string" && agentId in EXECUTIVE_BUSINESS_MENU_BINDINGS
}

export function getLocalizedExecutiveBusinessMenuAgentById(
  locale: Locale,
  agentId: string | null | undefined,
): LocalizedBusinessAgentConfig | null {
  if (!isExecutiveBusinessMenuAgentId(agentId)) return null

  const agent = getAiEntryAgentById(agentId)
  const binding = EXECUTIVE_BUSINESS_MENU_BINDINGS[agentId]
  if (!agent || !binding) return null

  const localizedName = locale === "zh" ? agent.name.zh : agent.name.en
  const localizedDescription = locale === "zh" ? agent.description.zh : agent.description.en

  return {
    businessSlug: binding.businessSlug,
    agentId: agent.id,
    promptDocumentPath: agent.id,
    name: localizedName,
    summary: localizedDescription,
    systemPromptSummary: localizedDescription,
    samplePrompts: locale === "zh" ? binding.samplePrompts.zh : binding.samplePrompts.en,
    workflowSlugs: [],
    artifactKinds: binding.artifactKinds,
    executionMode: "direct_agent",
    linkedWorkflowId: null,
    linkedWorkflowTitle: null,
  }
}
