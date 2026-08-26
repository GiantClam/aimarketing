import type { WorkbenchAgentDirectoryGroup, WorkbenchAgentDirectoryCard } from "./agent-directory";

export type WorkbenchOnlineAgent = {
  id: string;
  category: "general" | "executive" | "business";
  name: { zh: string; en: string };
  description: { zh: string; en: string };
};

const coreAgents: Array<[string, "general" | "executive", string, string, string, string]> = [
  ["general", "general", "通用助手", "General Assistant", "默认 AI 对话助手，适合日常问答与任务协作。", "Default AI chat assistant for everyday Q&A and task support."],
  ["executive-diagnostic", "executive", "经营诊断顾问", "Executive Diagnostic Advisor", "跨品牌、增长、销售、组织、运营、财务与法务风险的综合诊断。", "Cross-functional diagnosis across strategy, growth, sales, org, ops, finance, and legal risk."],
  ["executive-brand", "executive", "品牌战略顾问", "Brand Strategy Advisor (Executive)", "聚焦定位、价值主张、叙事结构和品牌决策优先级。", "Focus on positioning, value proposition, narrative, and priority brand decisions."],
  ["executive-growth", "executive", "增长顾问", "Growth Advisor (Executive)", "聚焦增长瓶颈诊断、实验优先级和执行节奏。", "Focus on bottleneck diagnosis, experiment priority, and execution cadence."],
  ["executive-ppt", "executive", "可编辑 PPT 助手", "Editable PPT Assistant", "通过对话梳理目标、结构与风格，并生成可编辑 PPTX。", "Shape the goal, structure, and style, then generate an editable PPTX deck."],
  ["executive-presentation-ppt", "executive", "演讲型 PPT 助手", "Presentation PPT Assistant", "生成演讲结构、讲稿与本地 PPT 产物，强调叙事节奏与现场表达。", "Create talk structure, notes, and local PPT artifacts optimized for live delivery."],
  ["executive-sales-strategy", "executive", "销售策略顾问", "Sales Strategy Advisor", "聚焦客户细分、销售路径、报价策略与赢单机制。", "Focus on segmentation, sales path, pricing strategy, and win-rate mechanics."],
  ["executive-sales-management", "executive", "销售管理体系顾问", "Sales Management System Advisor", "聚焦销售过程管理、预测准确性与团队管理机制。", "Focus on process control, forecast quality, and sales management systems."],
  ["executive-org-hr", "executive", "组织与人效顾问", "Organization & HR Advisor", "聚焦组织分工、人才结构、激励与绩效机制。", "Focus on org design, talent mix, incentives, and performance mechanics."],
  ["executive-operations", "executive", "运营与交付顾问", "Operations & Delivery Advisor", "聚焦交付能力、流程标准化与运营效率。", "Focus on delivery capacity, standardization, and operational efficiency."],
  ["executive-finance", "executive", "财务经营顾问", "Finance Management Advisor", "聚焦现金流、利润结构、费用效率与预算优先级。", "Focus on cash flow, margin structure, spending efficiency, and budget priorities."],
  ["executive-legal-risk", "executive", "法务风控顾问", "Legal Risk Screening Advisor", "聚焦合同与劳动用工场景下的风险筛查与边界建议。", "Focus on bounded contract and employment risk screening."],
];

const businessAgentNames: Array<[string, string, string]> = [
  ["business-content-growth", "内容增长智能体", "Content Growth Agent"], ["business-seo-repurpose", "SEO 复用智能体", "SEO Repurpose Agent"], ["business-seo-growth", "SEO 增长智能体", "SEO Growth Agent"], ["business-aeo-foundations", "AEO 基础优化智能体", "AEO Foundations Agent"], ["business-ai-citation-strategist", "AI 引用策略智能体", "AI Citation Strategist Agent"], ["business-xiaohongshu-growth-strategist", "小红书增长策略智能体", "Xiaohongshu Growth Strategist Agent"], ["business-tiktok-growth-strategist", "TikTok 增长策略智能体", "TikTok Growth Strategist Agent"], ["business-wechat-content-operator", "微信内容与私域运营智能体", "WeChat Content Operator Agent"], ["business-content-growth-strategist", "内容增长策略智能体", "Content Growth Strategist Agent"], ["business-ppc-strategist", "PPC 搜索广告策略智能体", "PPC Strategist Agent"], ["business-paid-social-strategist", "付费社媒投放策略智能体", "Paid Social Strategist Agent"], ["business-ad-creative-strategist", "广告创意策略智能体", "Ad Creative Strategist Agent"], ["business-paid-media-auditor", "付费投放审计智能体", "Paid Media Auditor Agent"], ["business-tracking-analytics-specialist", "追踪与归因分析智能体", "Tracking Analytics Specialist Agent"], ["business-pricing-analyst", "定价分析智能体", "Pricing Analyst Agent"], ["business-brand-creative", "品牌创意智能体", "Brand Creative Agent"], ["business-campaign-creative", "Campaign 创意智能体", "Campaign Creative Agent"], ["business-video-creative", "视频创意智能体", "Video Creative Agent"], ["business-lead-conversion", "获客转化智能体", "Lead Conversion Agent"], ["business-outreach-planner", "外联转化智能体", "Outreach Conversion Agent"], ["business-sales-close", "销售成交智能体", "Sales Close Agent"], ["business-objection-handler", "异议处理智能体", "Objection Handling Agent"], ["business-enterprise-operations", "企业运营智能体", "Enterprise Operations Agent"], ["business-governance-capacity", "席位与治理智能体", "Seats and Governance Agent"], ["business-knowledge-assets", "知识与资产智能体", "Knowledge and Assets Agent"], ["business-asset-curator", "资产整理智能体", "Asset Curator Agent"], ["business-video-asset-ops", "视频资产智能体", "Video Asset Agent"], ["business-pr-communications", "PR 传播智能体", "PR Communications Agent"], ["business-ui-design-system", "UI 设计系统智能体", "UI Design System Agent"], ["business-ux-architect", "UX 架构智能体", "UX Architect Agent"], ["business-proposal-strategist", "销售提案智能体", "Proposal Strategist Agent"], ["business-compliance-auditor", "合规审计智能体", "Compliance Auditor Agent"], ["business-privacy-officer", "隐私官智能体", "Privacy Officer Agent"], ["business-healthcare-marketing-compliance", "医疗营销合规智能体", "Healthcare Marketing Compliance Agent"], ["business-training-designer", "培训设计智能体", "Training Designer Agent"], ["business-recruitment-specialist", "招聘专家智能体", "Recruitment Specialist Agent"], ["business-hr-onboarding", "入职赋能智能体", "HR Onboarding Agent"], ["business-legal-document-review", "合同审查智能体", "Legal Document Review Agent"], ["business-legal-client-intake", "法律 Intake 智能体", "Legal Client Intake Agent"],
];

export const WORKBENCH_ONLINE_AGENTS: readonly WorkbenchOnlineAgent[] = [
  ...coreAgents.map(([id, category, zh, en, descriptionZh, descriptionEn]) => ({ id, category, name: { zh, en }, description: { zh: descriptionZh, en: descriptionEn } })),
  ...businessAgentNames.map(([id, zh, en]) => ({ id, category: "business" as const, name: { zh, en }, description: { zh: `${zh}，提供可执行的营销与业务协作建议。`, en: `${en} for practical marketing and business collaboration.` } })),
];

export const WORKBENCH_ONLINE_AGENT_GROUPS = [
  { id: "general", label: { zh: "通用", en: "General" } },
  { id: "executive", label: { zh: "专家顾问套件", en: "Executive Consulting Suite" } },
  { id: "business", label: { zh: "业务 Agent 工作台", en: "Business Agent Workbenches" } },
] as const;

export function buildOnlineAgentGroups(locale: "zh" | "en", configured: boolean): WorkbenchAgentDirectoryGroup[] {
  const start = locale === "zh" ? "开始本地对话" : "Start local chat";
  const needs = locale === "zh" ? "需要先在设置中配置可用模型" : "Configure an available model in Settings first";
  return WORKBENCH_ONLINE_AGENT_GROUPS.map((group) => ({
    id: group.id,
    label: group.label[locale],
    cards: WORKBENCH_ONLINE_AGENTS.filter((agent) => agent.category === group.id).map<WorkbenchAgentDirectoryCard>((agent) => ({
      id: agent.id,
      title: agent.name[locale],
      description: agent.description[locale],
      meta: group.label[locale],
      availability: configured ? "ready" : "needs-config",
      unavailableReason: configured ? undefined : needs,
      primaryAction: { id: `start:${agent.id}`, label: start, disabled: !configured },
    })),
  }));
}
