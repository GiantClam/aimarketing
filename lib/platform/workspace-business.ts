import type { AppLocale } from "@/lib/i18n/config"

export type WorkspaceBusinessSlug = string

type LocalizedText = {
  zh: string
  en: string
}

export type LocalizedWorkspaceBusinessEntry = {
  slug: WorkspaceBusinessSlug
  iconKey:
    | "content"
    | "creative"
    | "lead"
    | "sales"
    | "operations"
    | "knowledge"
    | "compliance"
    | "training"
    | "talent"
    | "legal"
  title: string
  summary: string
  description: string
  outcomes: string[]
  href: string
  workflowSlugs: string[]
  relatedLinks: Array<{
    label: string
    href: string
  }>
  expertWorkbenchHref?: string
  expertWorkbenchLabel?: string
}

export const CORE_WORKSPACE_BUSINESS_SLUGS = [
  "content-growth",
  "brand-creative",
  "lead-conversion",
  "sales-close",
  "enterprise-operations",
  "knowledge-assets",
  "compliance-risk",
  "training-enablement",
  "talent-recruiting",
  "legal-ops",
] as const

export const IMPORTED_WORKSPACE_BUSINESS_SLUGS = [
  "academic",
  "design",
  "engineering",
  "finance",
  "game-development",
  "gis",
  "marketing",
  "paid-media",
  "product",
  "project-management",
  "sales",
  "security",
  "spatial-computing",
  "specialized",
  "support",
  "testing",
] as const

export const WORKSPACE_BUSINESS_SLUGS = [
  ...CORE_WORKSPACE_BUSINESS_SLUGS,
  ...IMPORTED_WORKSPACE_BUSINESS_SLUGS,
] as const

export function isWorkspaceBusinessSlug(value: string | null | undefined): value is WorkspaceBusinessSlug {
  return Boolean(value && WORKSPACE_BUSINESS_SLUGS.includes(value as (typeof WORKSPACE_BUSINESS_SLUGS)[number]))
}

export function resolveWorkspaceBusinessSlug(
  value: string | null | undefined,
  fallback: WorkspaceBusinessSlug = "content-growth",
) {
  return isWorkspaceBusinessSlug(value) ? value : fallback
}

export function buildDashboardBusinessHref(
  slug: WorkspaceBusinessSlug,
  options?: {
    agentId?: string | null
  },
) {
  const params = new URLSearchParams({ view: slug })
  const normalizedAgentId = typeof options?.agentId === "string" ? options.agentId.trim() : ""
  if (normalizedAgentId) params.set("agent", normalizedAgentId)
  return `/dashboard/business?${params.toString()}`
}

const zhEntries: LocalizedWorkspaceBusinessEntry[] = [
  {
    slug: "content-growth",
    iconKey: "content",
    title: "内容增长",
    summary: "把 AI 对话、Writer、SEO、工作流串成内容生产与增长动作链。",
    description:
      "面向内容团队、SEO 团队和增长团队，先组织选题、内容生成、结构优化、交付复用，再衔接后续知识沉淀。",
    outcomes: ["内容选题与大纲", "SEO 标题与描述", "长文生产与复写", "内容工作流复用"],
    href: buildDashboardBusinessHref("content-growth"),
    workflowSlugs: ["content-repurpose", "campaign-launch"],
    relatedLinks: [
      { label: "AI 对话", href: "/dashboard/ai" },
      { label: "Writer", href: "/dashboard/writer" },
      { label: "工作流", href: "/dashboard/workflows" },
      { label: "能力中心", href: "/dashboard/capabilities" },
    ],
  },
  {
    slug: "brand-creative",
    iconKey: "creative",
    title: "品牌创意",
    summary: "围绕文案、PPT、图片和创意智能体组织统一品牌创作入口。",
    description:
      "面向品牌团队和创意团队，把品牌策略、视觉创意、提案材料和图片工作台放进同一条业务视角路线。",
    outcomes: ["品牌信息梳理", "视觉方向探索", "PPT 提案准备", "图片与创意资产沉淀"],
    href: buildDashboardBusinessHref("brand-creative"),
    workflowSlugs: ["campaign-launch", "visual-ad-pipeline"],
    relatedLinks: [
      { label: "Writer", href: "/dashboard/writer" },
      { label: "AI 图片", href: "/dashboard/image-assistant" },
      { label: "视频工作台", href: "/dashboard/video" },
      { label: "智能体中台", href: "/dashboard/agent-platform" },
      { label: "能力中心", href: "/dashboard/capabilities" },
    ],
  },
  {
    slug: "lead-conversion",
    iconKey: "lead",
    title: "获客转化",
    summary: "把公司检索、线索挖掘、工作流和对话入口收敛到获客编排层。",
    description:
      "面向市场与销售前链路，把目标客户识别、线索筛选、触达准备和自动化流程集中在一个入口层中。",
    outcomes: ["目标客户搜集", "线索筛选与分层", "外联准备与提纲", "自动化触达流程"],
    href: buildDashboardBusinessHref("lead-conversion"),
    workflowSlugs: ["campaign-launch"],
    relatedLinks: [
      { label: "AI 对话", href: "/dashboard/ai" },
      { label: "工作流", href: "/dashboard/workflows" },
      { label: "获客顾问", href: "/dashboard/advisor/lead-hunter/new" },
      { label: "公司检索", href: "/dashboard/advisor/company-search/new" },
    ],
  },
  {
    slug: "sales-close",
    iconKey: "sales",
    title: "销售成交",
    summary: "围绕成交顾问、销售提案、异议处理和跟进输出组织专家工作台入口。",
    description:
      "面向销售、咨询和商业化团队，把成交策略、客户应答、提案材料和复盘动作收回到一个专家工作台结构中。",
    outcomes: ["销售对话准备", "提案结构与说法", "异议处理建议", "跟进摘要与复盘"],
    href: buildDashboardBusinessHref("sales-close"),
    workflowSlugs: ["content-repurpose"],
    relatedLinks: [
      { label: "AI 对话", href: "/dashboard/ai" },
      { label: "Writer", href: "/dashboard/writer" },
      { label: "视频工作台", href: "/dashboard/video" },
      { label: "智能体中台", href: "/dashboard/agent-platform" },
    ],
    expertWorkbenchHref: "/dashboard/agent-platform/sales-close-expert",
    expertWorkbenchLabel: "打开成交专家工作台",
  },
  {
    slug: "enterprise-operations",
    iconKey: "operations",
    title: "企业运营",
    summary: "把任务、工作流、用量、算力和治理入口组织成企业运营视角。",
    description:
      "面向运营和管理员，把任务状态、执行工作流、用量监控、算力配置和治理动作放在同一条运营入口中。",
    outcomes: ["任务与执行状态", "工作流运营", "用量与 credits 观察", "治理配置与协作规则"],
    href: buildDashboardBusinessHref("enterprise-operations"),
    workflowSlugs: ["content-repurpose", "campaign-launch"],
    relatedLinks: [
      { label: "工作流", href: "/dashboard/workflows" },
      { label: "平台设置", href: "/dashboard/platform-settings" },
      { label: "计费", href: "/dashboard/billing" },
      { label: "能力中心", href: "/dashboard/capabilities" },
    ],
  },
  {
    slug: "knowledge-assets",
    iconKey: "knowledge",
    title: "知识与资产",
    summary: "把知识库、素材沉淀、复用入口和团队治理放进统一资产视角。",
    description:
      "面向团队沉淀与复用，把知识库、输出留存、素材管理和企业策略入口组织成可持续复用的资产层。",
    outcomes: ["知识库入口", "输出沉淀动作", "素材与作品留存占位", "团队复用路径"],
    href: buildDashboardBusinessHref("knowledge-assets"),
    workflowSlugs: ["content-repurpose"],
    relatedLinks: [
      { label: "知识入口", href: "/dashboard/knowledge-base" },
      { label: "AI 图片", href: "/dashboard/image-assistant" },
      { label: "视频工作台", href: "/dashboard/video" },
      { label: "平台设置", href: "/dashboard/platform-settings" },
      { label: "计费", href: "/dashboard/billing" },
    ],
  },
  {
    slug: "compliance-risk",
    iconKey: "compliance",
    title: "合规与风险",
    summary: "把营销合规、隐私、审计准备和风控审查放进一个可执行专家入口。",
    description:
      "面向市场、运营、法务和安全协作场景，先筛查内容、数据和流程风险，再输出证据、整改和升级建议。",
    outcomes: ["营销合规审查", "隐私与数据风险", "审计准备清单", "整改与升级建议"],
    href: buildDashboardBusinessHref("compliance-risk"),
    workflowSlugs: ["campaign-launch"],
    relatedLinks: [
      { label: "AI 对话", href: "/dashboard/ai" },
      { label: "工作流", href: "/dashboard/workflows" },
      { label: "平台设置", href: "/dashboard/platform-settings" },
      { label: "能力中心", href: "/dashboard/capabilities" },
    ],
  },
  {
    slug: "training-enablement",
    iconKey: "training",
    title: "培训与赋能",
    summary: "围绕课程设计、销售赋能、岗位训练和知识转化组织培训生产入口。",
    description:
      "面向管理者、培训负责人和业务专家，把能力差距、课程结构、练习设计和评估机制转成可交付方案。",
    outcomes: ["培训需求诊断", "课程与练习设计", "销售赋能材料", "效果评估机制"],
    href: buildDashboardBusinessHref("training-enablement"),
    workflowSlugs: ["content-repurpose"],
    relatedLinks: [
      { label: "知识入口", href: "/dashboard/knowledge-base" },
      { label: "Writer", href: "/dashboard/writer" },
      { label: "AI 对话", href: "/dashboard/ai" },
      { label: "工作流", href: "/dashboard/workflows" },
    ],
  },
  {
    slug: "talent-recruiting",
    iconKey: "talent",
    title: "招聘与人才",
    summary: "把招聘计划、候选人评估、入职路径和人效信息沉淀成统一人才工作台。",
    description:
      "面向 HR、招聘负责人和业务面试官，组织岗位画像、筛选标准、面试题库、入职节奏和风险提示。",
    outcomes: ["岗位画像与渠道", "候选人评估", "面试问题设计", "入职 90 天计划"],
    href: buildDashboardBusinessHref("talent-recruiting"),
    workflowSlugs: ["content-repurpose"],
    relatedLinks: [
      { label: "AI 对话", href: "/dashboard/ai" },
      { label: "Writer", href: "/dashboard/writer" },
      { label: "知识入口", href: "/dashboard/knowledge-base" },
      { label: "平台设置", href: "/dashboard/platform-settings" },
    ],
  },
  {
    slug: "legal-ops",
    iconKey: "legal",
    title: "法律与合同",
    summary: "围绕合同审查、客户 intake、法律风险摘要和律师协作准备结构化入口。",
    description:
      "面向经营、销售、法务和外部律师协作场景，先做事实整理与风险筛查，再输出可升级给专业律师的材料。",
    outcomes: ["合同风险摘要", "客户 intake 清单", "条款审查要点", "律师协作材料"],
    href: buildDashboardBusinessHref("legal-ops"),
    workflowSlugs: ["content-repurpose"],
    relatedLinks: [
      { label: "AI 对话", href: "/dashboard/ai" },
      { label: "Writer", href: "/dashboard/writer" },
      { label: "知识入口", href: "/dashboard/knowledge-base" },
      { label: "平台设置", href: "/dashboard/platform-settings" },
    ],
  },
]

const enEntries: LocalizedWorkspaceBusinessEntry[] = [
  {
    slug: "content-growth",
    iconKey: "content",
    title: "Content growth",
    summary: "Connect AI chat, Writer, SEO, and workflows into one content production and growth lane.",
    description:
      "Built for content, SEO, and growth teams that need one operating surface for planning, generation, optimization, and reuse.",
    outcomes: ["Content planning and outlines", "SEO titles and descriptions", "Long-form production and rewrites", "Reusable workflow runs"],
    href: buildDashboardBusinessHref("content-growth"),
    workflowSlugs: ["content-repurpose", "campaign-launch"],
    relatedLinks: [
      { label: "AI Chat", href: "/dashboard/ai" },
      { label: "Writer", href: "/dashboard/writer" },
      { label: "Workflows", href: "/dashboard/workflows" },
      { label: "Capabilities", href: "/dashboard/capabilities" },
    ],
  },
  {
    slug: "brand-creative",
    iconKey: "creative",
    title: "Brand creative",
    summary: "Unify copy, PPT, image, and creative-agent entry points around brand output.",
    description:
      "Designed for brand and creative teams that need one route for strategy, visual exploration, presentation materials, and asset refinement.",
    outcomes: ["Brand narrative alignment", "Visual direction exploration", "Pitch deck preparation", "Creative asset reuse"],
    href: buildDashboardBusinessHref("brand-creative"),
    workflowSlugs: ["campaign-launch", "visual-ad-pipeline"],
    relatedLinks: [
      { label: "Writer", href: "/dashboard/writer" },
      { label: "Image workspace", href: "/dashboard/image-assistant" },
      { label: "Video workspace", href: "/dashboard/video" },
      { label: "Agent platform", href: "/dashboard/agent-platform" },
      { label: "Capabilities", href: "/dashboard/capabilities" },
    ],
  },
  {
    slug: "lead-conversion",
    iconKey: "lead",
    title: "Lead conversion",
    summary: "Bring company research, lead discovery, workflows, and AI chat into one acquisition lane.",
    description:
      "Made for marketing and pre-sales teams that need one workspace layer for target-account research, lead qualification, outreach prep, and automation.",
    outcomes: ["Target account research", "Lead qualification", "Outreach preparation", "Automation orchestration"],
    href: buildDashboardBusinessHref("lead-conversion"),
    workflowSlugs: ["campaign-launch"],
    relatedLinks: [
      { label: "AI Chat", href: "/dashboard/ai" },
      { label: "Workflows", href: "/dashboard/workflows" },
      { label: "Lead hunter", href: "/dashboard/advisor/lead-hunter/new" },
      { label: "Company search", href: "/dashboard/advisor/company-search/new" },
    ],
  },
  {
    slug: "sales-close",
    iconKey: "sales",
    title: "Sales close",
    summary: "Organize closing experts, pitch support, objection handling, and follow-up output in one expert lane.",
    description:
      "Built for sales, consulting, and commercial teams that need one expert-workbench structure for closing strategy, customer response, materials, and review.",
    outcomes: ["Call preparation", "Pitch structure and messaging", "Objection handling", "Follow-up summaries and review"],
    href: buildDashboardBusinessHref("sales-close"),
    workflowSlugs: ["content-repurpose"],
    relatedLinks: [
      { label: "AI Chat", href: "/dashboard/ai" },
      { label: "Writer", href: "/dashboard/writer" },
      { label: "Video workspace", href: "/dashboard/video" },
      { label: "Agent platform", href: "/dashboard/agent-platform" },
    ],
    expertWorkbenchHref: "/dashboard/agent-platform/sales-close-expert",
    expertWorkbenchLabel: "Open closing expert workbench",
  },
  {
    slug: "enterprise-operations",
    iconKey: "operations",
    title: "Enterprise operations",
    summary: "Turn tasks, workflows, usage, compute, and governance into one operating view for the company.",
    description:
      "Made for operators and admins who need one place to review execution status, workflow rollout, usage posture, compute policy, and governance actions.",
    outcomes: ["Task and execution visibility", "Workflow operations", "Usage and credits monitoring", "Governance and collaboration policy"],
    href: buildDashboardBusinessHref("enterprise-operations"),
    workflowSlugs: ["content-repurpose", "campaign-launch"],
    relatedLinks: [
      { label: "Workflows", href: "/dashboard/workflows" },
      { label: "Platform settings", href: "/dashboard/platform-settings" },
      { label: "Billing", href: "/dashboard/billing" },
      { label: "Capabilities", href: "/dashboard/capabilities" },
    ],
  },
  {
    slug: "knowledge-assets",
    iconKey: "knowledge",
    title: "Knowledge and assets",
    summary: "Group knowledge, reusable outputs, asset handoff, and governance into one reusable asset lane.",
    description:
      "Made for teams that need an operating layer for knowledge capture, asset retention, reuse, and controlled enterprise sharing.",
    outcomes: ["Knowledge base front door", "Output retention actions", "Asset and library placeholders", "Team reuse routes"],
    href: buildDashboardBusinessHref("knowledge-assets"),
    workflowSlugs: ["content-repurpose"],
    relatedLinks: [
      { label: "Knowledge hub", href: "/dashboard/knowledge-base" },
      { label: "Image workspace", href: "/dashboard/image-assistant" },
      { label: "Video workspace", href: "/dashboard/video" },
      { label: "Platform settings", href: "/dashboard/platform-settings" },
      { label: "Billing", href: "/dashboard/billing" },
    ],
  },
  {
    slug: "compliance-risk",
    iconKey: "compliance",
    title: "Compliance and risk",
    summary: "Bring marketing compliance, privacy, audit readiness, and risk review into one expert lane.",
    description:
      "Made for marketing, operations, legal, and security teams that need practical screening, evidence, remediation, and escalation guidance.",
    outcomes: ["Marketing compliance review", "Privacy and data risk", "Audit readiness checklists", "Remediation and escalation guidance"],
    href: buildDashboardBusinessHref("compliance-risk"),
    workflowSlugs: ["campaign-launch"],
    relatedLinks: [
      { label: "AI Chat", href: "/dashboard/ai" },
      { label: "Workflows", href: "/dashboard/workflows" },
      { label: "Platform settings", href: "/dashboard/platform-settings" },
      { label: "Capabilities", href: "/dashboard/capabilities" },
    ],
  },
  {
    slug: "training-enablement",
    iconKey: "training",
    title: "Training enablement",
    summary: "Structure curriculum, sales enablement, role practice, and knowledge transfer into one production lane.",
    description:
      "Built for managers, enablement leads, and subject-matter experts who need to turn capability gaps into deliverable learning programs.",
    outcomes: ["Training needs diagnosis", "Curriculum and practice design", "Sales enablement assets", "Effectiveness measurement"],
    href: buildDashboardBusinessHref("training-enablement"),
    workflowSlugs: ["content-repurpose"],
    relatedLinks: [
      { label: "Knowledge hub", href: "/dashboard/knowledge-base" },
      { label: "Writer", href: "/dashboard/writer" },
      { label: "AI Chat", href: "/dashboard/ai" },
      { label: "Workflows", href: "/dashboard/workflows" },
    ],
  },
  {
    slug: "talent-recruiting",
    iconKey: "talent",
    title: "Talent and recruiting",
    summary: "Organize hiring plans, candidate assessment, onboarding, and talent knowledge into one HR lane.",
    description:
      "Made for HR, hiring leads, and interview teams that need role profiles, screening standards, interview questions, onboarding cadence, and risk notes.",
    outcomes: ["Role profiles and channels", "Candidate assessment", "Interview question design", "First 90-day onboarding plans"],
    href: buildDashboardBusinessHref("talent-recruiting"),
    workflowSlugs: ["content-repurpose"],
    relatedLinks: [
      { label: "AI Chat", href: "/dashboard/ai" },
      { label: "Writer", href: "/dashboard/writer" },
      { label: "Knowledge hub", href: "/dashboard/knowledge-base" },
      { label: "Platform settings", href: "/dashboard/platform-settings" },
    ],
  },
  {
    slug: "legal-ops",
    iconKey: "legal",
    title: "Legal and contracts",
    summary: "Structure contract review, client intake, legal-risk summaries, and attorney collaboration prep.",
    description:
      "Built for business, sales, legal, and outside-counsel workflows that need fact organization, risk screening, and attorney-ready materials.",
    outcomes: ["Contract risk summaries", "Client intake checklists", "Clause review points", "Attorney collaboration materials"],
    href: buildDashboardBusinessHref("legal-ops"),
    workflowSlugs: ["content-repurpose"],
    relatedLinks: [
      { label: "AI Chat", href: "/dashboard/ai" },
      { label: "Writer", href: "/dashboard/writer" },
      { label: "Knowledge hub", href: "/dashboard/knowledge-base" },
      { label: "Platform settings", href: "/dashboard/platform-settings" },
    ],
  },
]

const importedCategoryEntryMeta: Record<
  string,
  {
    iconKey: LocalizedWorkspaceBusinessEntry["iconKey"]
    title: LocalizedText
    summary: LocalizedText
    description: LocalizedText
    outcomes: LocalizedText[]
    workflowSlugs: string[]
  }
> = {
  academic: {
    iconKey: "knowledge",
    title: { zh: "学术研究", en: "Academic" },
    summary: { zh: "面向研究、论文、方法论和深度分析类智能体。", en: "A marketplace lane for research, papers, methodology, and deep-analysis agents." },
    description: { zh: "适合需要研究框架、论证结构、文献分析和高密度知识整理的任务。", en: "Built for research framing, argument structure, literature analysis, and dense knowledge synthesis." },
    outcomes: [
      { zh: "研究摘要", en: "Research summaries" },
      { zh: "论点结构", en: "Argument structures" },
      { zh: "证据整理", en: "Evidence synthesis" },
    ],
    workflowSlugs: ["content-repurpose"],
  },
  design: {
    iconKey: "creative",
    title: { zh: "设计", en: "Design" },
    summary: { zh: "面向品牌、界面、视觉叙事和创意设计类智能体。", en: "A marketplace lane for brand, UI, visual storytelling, and creative design agents." },
    description: { zh: "适合品牌视觉、UI/UX、图像提示词和叙事表达类工作。", en: "Built for brand visuals, UI/UX, image prompting, and narrative-driven design work." },
    outcomes: [
      { zh: "视觉方向", en: "Visual direction" },
      { zh: "设计建议", en: "Design recommendations" },
      { zh: "创意结构", en: "Creative structures" },
    ],
    workflowSlugs: ["visual-ad-pipeline", "campaign-launch"],
  },
  engineering: {
    iconKey: "operations",
    title: { zh: "工程开发", en: "Engineering" },
    summary: { zh: "面向架构、代码、平台、集成和工程实现类智能体。", en: "A marketplace lane for architecture, code, platform, integration, and engineering implementation agents." },
    description: { zh: "适合技术实现、系统设计、排障和工程决策类任务。", en: "Built for implementation planning, systems design, debugging, and engineering decisions." },
    outcomes: [
      { zh: "技术方案", en: "Technical plans" },
      { zh: "排障路径", en: "Debug paths" },
      { zh: "实现建议", en: "Implementation guidance" },
    ],
    workflowSlugs: ["content-repurpose"],
  },
  finance: {
    iconKey: "operations",
    title: { zh: "财务", en: "Finance" },
    summary: { zh: "面向预算、规划、分析和财务经营类智能体。", en: "A marketplace lane for budgeting, planning, analysis, and finance operations agents." },
    description: { zh: "适合预算取舍、财务分析、经营复盘和资金规划。", en: "Built for financial tradeoffs, planning, performance review, and operating analysis." },
    outcomes: [
      { zh: "预算判断", en: "Budget decisions" },
      { zh: "财务分析", en: "Financial analysis" },
      { zh: "经营复盘", en: "Operating reviews" },
    ],
    workflowSlugs: ["content-repurpose"],
  },
  "game-development": {
    iconKey: "creative",
    title: { zh: "游戏开发", en: "Game Development" },
    summary: { zh: "面向游戏设计、技术美术、叙事和关卡类智能体。", en: "A marketplace lane for game design, technical art, narrative, and level-design agents." },
    description: { zh: "适合概念设计、玩法结构、内容制作和游戏体验规划。", en: "Built for gameplay concepts, systems thinking, content production, and game experience planning." },
    outcomes: [
      { zh: "玩法方案", en: "Gameplay plans" },
      { zh: "内容结构", en: "Content structures" },
      { zh: "制作建议", en: "Production guidance" },
    ],
    workflowSlugs: ["visual-ad-pipeline"],
  },
  gis: {
    iconKey: "knowledge",
    title: { zh: "地理空间", en: "GIS" },
    summary: { zh: "面向空间数据、地图分析和 GIS 解决方案类智能体。", en: "A marketplace lane for spatial data, mapping analysis, and GIS solution agents." },
    description: { zh: "适合空间数据整理、制图表达、地理分析和相关技术咨询。", en: "Built for spatial data prep, cartography, geospatial analysis, and related technical consulting." },
    outcomes: [
      { zh: "地图分析", en: "Map analysis" },
      { zh: "空间数据方案", en: "Spatial data plans" },
      { zh: "GIS 咨询", en: "GIS consulting" },
    ],
    workflowSlugs: ["content-repurpose"],
  },
  marketing: {
    iconKey: "content",
    title: { zh: "营销", en: "Marketing" },
    summary: { zh: "面向 SEO、内容、社媒、平台运营和增长类营销智能体。", en: "A marketplace lane for SEO, content, social, platform ops, and growth marketing agents." },
    description: { zh: "适合内容增长、平台分发、流量策略和营销协同。", en: "Built for content growth, channel distribution, traffic strategy, and marketing coordination." },
    outcomes: [
      { zh: "内容策略", en: "Content strategy" },
      { zh: "渠道分发", en: "Channel distribution" },
      { zh: "增长动作", en: "Growth actions" },
    ],
    workflowSlugs: ["content-repurpose", "campaign-launch"],
  },
  "paid-media": {
    iconKey: "lead",
    title: { zh: "付费投放", en: "Paid Media" },
    summary: { zh: "面向 PPC、社媒广告、程序化投放和追踪归因类智能体。", en: "A marketplace lane for PPC, paid social, programmatic, and tracking-attribution agents." },
    description: { zh: "适合广告结构、投放优化、素材测试和归因治理。", en: "Built for ad structure, optimization, creative testing, and attribution governance." },
    outcomes: [
      { zh: "投放结构", en: "Campaign architecture" },
      { zh: "优化建议", en: "Optimization guidance" },
      { zh: "归因判断", en: "Attribution judgment" },
    ],
    workflowSlugs: ["campaign-launch"],
  },
  product: {
    iconKey: "operations",
    title: { zh: "产品", en: "Product" },
    summary: { zh: "面向产品策略、反馈分析和优先级判断类智能体。", en: "A marketplace lane for product strategy, feedback synthesis, and prioritization agents." },
    description: { zh: "适合产品规划、用户反馈整理和 roadmap 决策。", en: "Built for product planning, feedback synthesis, and roadmap decision support." },
    outcomes: [
      { zh: "产品优先级", en: "Product priorities" },
      { zh: "反馈洞察", en: "Feedback insight" },
      { zh: "路线规划", en: "Roadmap guidance" },
    ],
    workflowSlugs: ["content-repurpose"],
  },
  "project-management": {
    iconKey: "operations",
    title: { zh: "项目管理", en: "Project Management" },
    summary: { zh: "面向项目推进、实验跟踪和跨团队协调类智能体。", en: "A marketplace lane for project delivery, experiment tracking, and cross-functional coordination agents." },
    description: { zh: "适合阶段规划、协作推进、风险追踪和执行管理。", en: "Built for milestone planning, coordination, risk tracking, and execution management." },
    outcomes: [
      { zh: "推进计划", en: "Execution plans" },
      { zh: "里程碑结构", en: "Milestone structures" },
      { zh: "协作节奏", en: "Coordination cadence" },
    ],
    workflowSlugs: ["content-repurpose"],
  },
  sales: {
    iconKey: "sales",
    title: { zh: "销售", en: "Sales" },
    summary: { zh: "面向获客、发现、赢单、提案和销售运营类智能体。", en: "A marketplace lane for prospecting, discovery, deal strategy, proposals, and revenue operations agents." },
    description: { zh: "适合机会判断、赢单策略、外联和提案推进。", en: "Built for opportunity diagnosis, win strategy, outbound, and proposal work." },
    outcomes: [
      { zh: "赢单策略", en: "Win strategy" },
      { zh: "外联动作", en: "Outbound actions" },
      { zh: "提案优化", en: "Proposal improvements" },
    ],
    workflowSlugs: ["content-repurpose"],
  },
  security: {
    iconKey: "compliance",
    title: { zh: "安全", en: "Security" },
    summary: { zh: "面向安全架构、审计、渗透、事件响应和合规类智能体。", en: "A marketplace lane for security architecture, audit, pentest, incident response, and compliance agents." },
    description: { zh: "适合漏洞评估、控制审查、审计准备和风险升级。", en: "Built for vulnerability assessment, control review, audit readiness, and escalation." },
    outcomes: [
      { zh: "安全评估", en: "Security assessments" },
      { zh: "控制缺口", en: "Control gaps" },
      { zh: "审计准备", en: "Audit readiness" },
    ],
    workflowSlugs: ["campaign-launch"],
  },
  "spatial-computing": {
    iconKey: "creative",
    title: { zh: "空间计算", en: "Spatial Computing" },
    summary: { zh: "面向 XR、visionOS、空间交互和沉浸式体验类智能体。", en: "A marketplace lane for XR, visionOS, spatial interaction, and immersive experience agents." },
    description: { zh: "适合空间体验规划、交互方式和相关技术实现思考。", en: "Built for spatial experience planning, interaction design, and related implementation thinking." },
    outcomes: [
      { zh: "空间交互方案", en: "Spatial interaction plans" },
      { zh: "体验结构", en: "Experience structures" },
      { zh: "技术路线", en: "Technical approaches" },
    ],
    workflowSlugs: ["visual-ad-pipeline"],
  },
  specialized: {
    iconKey: "operations",
    title: { zh: "专项顾问", en: "Specialized" },
    summary: { zh: "面向多领域专项顾问、行业角色和专业流程类智能体。", en: "A marketplace lane for specialized consultants, domain roles, and niche operational agents." },
    description: { zh: "适合行业专门问题、业务流程和专业角色辅助任务。", en: "Built for domain-specific questions, niche workflows, and specialist role support." },
    outcomes: [
      { zh: "专业判断", en: "Specialist judgment" },
      { zh: "流程建议", en: "Workflow guidance" },
      { zh: "角色辅助", en: "Role support" },
    ],
    workflowSlugs: ["content-repurpose"],
  },
  support: {
    iconKey: "knowledge",
    title: { zh: "支持运营", en: "Support" },
    summary: { zh: "面向分析汇总、信息分发和支持运营类智能体。", en: "A marketplace lane for analytics, summaries, report distribution, and support operations agents." },
    description: { zh: "适合数据摘要、运营报告、支持流程和内部信息分发。", en: "Built for data summaries, operating reports, support flows, and internal distribution." },
    outcomes: [
      { zh: "运营摘要", en: "Operating summaries" },
      { zh: "数据报告", en: "Data reports" },
      { zh: "分发动作", en: "Distribution actions" },
    ],
    workflowSlugs: ["content-repurpose"],
  },
  testing: {
    iconKey: "compliance",
    title: { zh: "测试与 QA", en: "Testing" },
    summary: { zh: "面向 API、性能、可访问性、工具评估和 QA 类智能体。", en: "A marketplace lane for API, performance, accessibility, tooling, and QA agents." },
    description: { zh: "适合测试设计、结果分析、质量验证和改进建议。", en: "Built for test design, result analysis, quality validation, and improvement guidance." },
    outcomes: [
      { zh: "测试计划", en: "Test plans" },
      { zh: "质量报告", en: "Quality reports" },
      { zh: "验证建议", en: "Validation guidance" },
    ],
    workflowSlugs: ["content-repurpose"],
  },
}

function buildImportedWorkspaceEntries(
  locale: AppLocale | "zh" | "en",
  includedSlugs?: readonly string[] | null,
) {
  const allowedSlugs = includedSlugs ? new Set(includedSlugs) : null

  return Object.entries(importedCategoryEntryMeta)
    .filter(([slug]) => !allowedSlugs || allowedSlugs.has(slug))
    .map(([slug, meta]) => ({
    slug,
    iconKey: meta.iconKey,
    title: locale === "zh" ? meta.title.zh : meta.title.en,
    summary: locale === "zh" ? meta.summary.zh : meta.summary.en,
    description: locale === "zh" ? meta.description.zh : meta.description.en,
    outcomes: meta.outcomes.map((item) => (locale === "zh" ? item.zh : item.en)),
    href: buildDashboardBusinessHref(slug),
    workflowSlugs: [...meta.workflowSlugs],
    relatedLinks:
      locale === "zh"
        ? [
            { label: "AI 对话", href: "/dashboard/ai" },
            { label: "智能体中台", href: "/dashboard/agent-platform" },
            { label: "工作流", href: "/dashboard/workflows" },
          ]
        : [
            { label: "AI Chat", href: "/dashboard/ai" },
            { label: "Agent platform", href: "/dashboard/agent-platform" },
            { label: "Workflows", href: "/dashboard/workflows" },
          ],
    }))
}

export function getLocalizedWorkspaceMarketplaceEntries(
  locale: AppLocale | "zh" | "en",
  options?: {
    includeSlugs?: readonly string[] | null
  },
) : LocalizedWorkspaceBusinessEntry[] {
  return buildImportedWorkspaceEntries(locale, options?.includeSlugs).map((entry) => ({
    ...entry,
    relatedLinks: entry.relatedLinks.map((link) => ({ ...link })),
    outcomes: [...entry.outcomes],
  }))
}

export function getLocalizedWorkspaceBusinessEntries(
  locale: AppLocale | "zh" | "en",
  options?: {
    includeImportedSlugs?: readonly string[] | null
  },
) : LocalizedWorkspaceBusinessEntry[] {
  const coreEntries = (locale === "zh" ? zhEntries : enEntries).map((entry) => ({
    ...entry,
    relatedLinks: entry.relatedLinks.map((link) => ({ ...link })),
    outcomes: [...entry.outcomes],
    expertWorkbenchHref: entry.expertWorkbenchHref,
    expertWorkbenchLabel: entry.expertWorkbenchLabel,
  }))
  return [
    ...coreEntries,
    ...getLocalizedWorkspaceMarketplaceEntries(locale, {
      includeSlugs: options?.includeImportedSlugs ?? [],
    }),
  ]
}

export function getLocalizedWorkspaceBusinessEntryBySlug(
  locale: AppLocale | "zh" | "en",
  slug: string,
  options?: {
    includeImportedSlugs?: readonly string[] | null
  },
) {
  return (
    getLocalizedWorkspaceBusinessEntries(locale, {
      includeImportedSlugs: options?.includeImportedSlugs,
    }).find((entry) => entry.slug === slug) ?? null
  )
}
