import type { AppLocale } from "@/lib/i18n/config"
import { localizePublicPath } from "@/lib/i18n/routing"

type PublicNavKey = "alternatives" | "compare" | "solutions" | "resources" | "pricing" | "tools"

type PublicNavItem = {
  key: PublicNavKey
  label: string
  href: string
}

type PublicResourceLink = {
  label: string
  title: string
  href: string
}

type PublicAudienceCard = {
  title: string
  description: string
  href: string
}

type PublicCapabilityCard = {
  title: string
  description: string
}

type PublicWorkflowStep = {
  title: string
  description: string
}

type PublicFaq = {
  question: string
  answer: string
}

type PublicPricingGuardrail = {
  title: string
  description: string
}

type PublicHomeCopy = {
  eyebrow: string
  systemLabel: string
  campaignControlLabel: string
  title: string
  description: string
  supportingCopy: string
  primaryCta: string
  compareCta: string
  calculatorCta: string
  demoCta: string
  trustPoints: string[]
  replacementEyebrow: string
  replacementStack: string[]
  sharedOutputLabel: string
  replacementTitle: string
  modeLabel: string
  modeValue: string
  statusLabel: string
  statusValue: string
  capabilitiesEyebrow: string
  capabilityLabel: (index: number) => string
  capabilityCards: PublicCapabilityCard[]
  workflowEyebrow: string
  workflowTitle: string
  workflowDescription: string
  workflows: PublicWorkflowStep[]
  audienceEyebrow: string
  audienceTitle: string
  exploreSolutionsCta: string
  useCaseLabel: (index: number) => string
  openDetailLabel: string
  audienceCards: PublicAudienceCard[]
  resources: PublicResourceLink[]
  pricingEyebrow: string
  pricingTitle: string
  pricingDescription: string
  pricingCta: string
  faqEyebrow: string
  faqTitle: string
  faqs: PublicFaq[]
  finalEyebrow: string
  finalTitle: string
  finalDescription: string
  signalLabel: (index: number) => string
}

type PublicPricingPageCopy = {
  eyebrow: string
  matrixLabel: string
  sharedWorkspaceLabel: string
  title: string
  description: string
  primaryCta: string
  calculatorCta: string
  guardrailsTitle: string
  guardrails: PublicPricingGuardrail[]
}

type PublicPricingGridCopy = {
  free: string
  recommended: string
  starterAccess: string
  perMonth: string
  workspaceMember: (count: number) => string
  creditsLine: (monthlyCredits: number, trialCredits: number) => string
  imageQuality: (quality: string) => string
  priorityQueue: string
  videoGeneration: (level: string) => string
  freePlanNote: string
  paidPlanNote: string
  startWorkspace: string
}

type PublicFooterCopy = {
  systemFooterLabel: string
  description: string
  contact: string
  copyright: (year: number) => string
}

type PublicHeaderCopy = {
  productName: string
  tagline: string
  brandOpsReady: string
  login: string
  startWorkspace: string
  navItems: PublicNavItem[]
}

export type PublicCopy = {
  header: PublicHeaderCopy
  footer: PublicFooterCopy
  home: PublicHomeCopy
  pricingGrid: PublicPricingGridCopy
  pricingPage: PublicPricingPageCopy
}

const NAV_LINKS: Record<PublicNavKey, string> = {
  alternatives: "/alternatives/chatgpt-team-alternative",
  compare: "/compare/best-ai-workspace-for-marketing-teams",
  solutions: "/use-cases/ai-workspace-for-marketing-teams",
  resources: "/resources",
  pricing: "/pricing",
  tools: "/tools",
}

const en: PublicCopy = {
  header: {
    productName: "AI Marketing",
    tagline: "Multi-model marketing workspace",
    brandOpsReady: "Brand Ops Ready",
    login: "Log in",
    startWorkspace: "Start Free",
    navItems: [
      { key: "alternatives", label: "Alternatives", href: NAV_LINKS.alternatives },
      { key: "compare", label: "Compare", href: NAV_LINKS.compare },
      { key: "solutions", label: "Use Cases", href: NAV_LINKS.solutions },
      { key: "resources", label: "Resources", href: NAV_LINKS.resources },
      { key: "tools", label: "Tools", href: NAV_LINKS.tools },
      { key: "pricing", label: "Pricing", href: NAV_LINKS.pricing },
    ],
  },
  footer: {
    systemFooterLabel: "System Footer",
    description:
      "A multi-model AI workspace for marketing content, research, visuals, and workflows, with room for BYOK, shared context, and private deployment.",
    contact: "Contact",
    copyright: (year) => `© ${year} AI Marketing. Built for marketing teams, creators, and indie operators.`,
  },
  home: {
    eyebrow: "Multi-model AI workspace for modern marketing teams",
    systemLabel: "AI Marketing System",
    campaignControlLabel: "Campaign Control",
    title: "One workspace for multiple AI models",
    description:
      "Create marketing content, run research, generate visuals, and manage AI workflows in one place.",
    supportingCopy:
      "Built for marketers, SEO operators, indie founders, and small teams that want less tool switching and more output.",
    primaryCta: "Start Free",
    compareCta: "View Pricing",
    calculatorCta: "Explore Use Cases",
    demoCta: "Open demo",
    trustPoints: [
      "Use multiple AI models without losing the shared brief or campaign context.",
      "Move from research to content, visuals, and workflow execution inside one workspace.",
      "Add BYOK, team permissions, and private deployment options when the workflow matures.",
    ],
    replacementEyebrow: "Problem",
    replacementStack: ["ChatGPT", "Claude", "Gemini", "AI writing tools", "AI image tools", "automation tools"],
    sharedOutputLabel: "What teams are trying to fix",
    replacementTitle: "Too many AI tools, too much context switching, and no shared place for marketing work.",
    modeLabel: "Mode",
    modeValue: "Brand Stack",
    statusLabel: "Status",
    statusValue: "Live",
    capabilitiesEyebrow: "Capabilities",
    capabilityLabel: (index) => `Capability ${String(index).padStart(2, "0")}`,
    capabilityCards: [
      {
        title: "Marketing content",
        description: "Draft website copy, SEO content, campaign messaging, and launch assets without rebuilding the brief in every tool.",
      },
      {
        title: "Research and planning",
        description: "Keep market research, positioning notes, and creative direction attached to the same workspace that ships the work.",
      },
      {
        title: "Reusable workflows",
        description: "Turn repeatable tasks into shared workflows with saved context, team visibility, and room for advanced setup later.",
      },
    ],
    workflowEyebrow: "How it works",
    workflowTitle: "Brief once, move across content, research, and workflow tasks faster",
    workflowDescription:
      "Start from one marketing brief, then keep the same context through positioning research, landing-page copy, SEO drafts, visuals, and team review.",
    workflows: [
      {
        title: "Set shared context",
        description: "Load the audience, offer, brand rules, and workflow goal once so the whole team starts from the same operating context.",
      },
      {
        title: "Run the right workflow",
        description: "Switch between content, research, visual, and review workflows without moving the brief to another subscription.",
      },
      {
        title: "Reuse what worked",
        description: "Preserve the winning prompts, research decisions, and final assets so the next campaign starts with context instead of guesswork.",
      },
    ],
    audienceEyebrow: "Use cases",
    audienceTitle: "Built for recurring marketing work",
    exploreSolutionsCta: "Explore use cases",
    useCaseLabel: (index) => `Use Case ${String(index).padStart(2, "0")}`,
    openDetailLabel: "Open Detail",
    audienceCards: [
      {
        title: "Marketing teams",
        description: "Keep campaign planning, content production, and cross-model review in one operating workspace.",
        href: "/use-cases/ai-workspace-for-marketing-teams",
      },
      {
        title: "SEO teams",
        description: "Turn briefs, search intent, outlines, and article production into one shared workflow instead of scattered chat history.",
        href: "/use-cases/ai-workspace-for-seo-teams",
      },
      {
        title: "Content creators",
        description: "Keep ideation, scripting, repurposing, and visual direction connected across every asset you publish.",
        href: "/use-cases/ai-workspace-for-content-creators",
      },
      {
        title: "Indie founders",
        description: "Move from positioning and research to launch copy, visuals, and workflow decisions without buying a fragmented stack.",
        href: "/use-cases/ai-workspace-for-indie-founders",
      },
    ],
    resources: [
      { label: "Brief", title: "What is a content brief?", href: "/resources/what-is-a-content-brief" },
      { label: "Strategy", title: "What is a content pillar?", href: "/resources/what-is-a-content-pillar" },
      { label: "ROI", title: "Measure content marketing ROI", href: "/resources/content-marketing-roi" },
      { label: "Compare", title: "Best AI workspace for marketing teams", href: "/compare/best-ai-workspace-for-marketing-teams" },
      { label: "Costs", title: "Compare AI tool costs", href: "/compare/compare-ai-tool-costs" },
      { label: "Pricing", title: "View workspace pricing", href: "/pricing" },
      { label: "Tool", title: "Generate SEO titles and meta", href: "/tools/seo-title-generator" },
    ],
    pricingEyebrow: "Pricing",
    pricingTitle: "Use pricing to support the buying decision after the workflow is clear",
    pricingDescription:
      "Teams usually understand pricing faster after they have seen the use cases, cost tradeoffs, and reasons to keep multiple models in one workspace.",
    pricingCta: "View Pricing",
    faqEyebrow: "FAQ",
    faqTitle: "Common questions before switching",
    faqs: [
      {
        question: "Is this mainly a pricing play?",
        answer: "No. The main value is one workspace for marketing content, research, visuals, and workflows. Pricing matters after the workflow fit is clear.",
      },
      {
        question: "Who is this built for first?",
        answer: "Marketing teams, SEO operators, creators, and indie founders who want one operating workspace instead of scattered AI subscriptions.",
      },
      {
        question: "Do we have to choose one model?",
        answer: "No. The point is to keep multiple models available while preserving shared context, reusable briefs, and team workflow visibility.",
      },
      {
        question: "Can advanced teams keep their own setup?",
        answer: "Yes. BYOK, private deployment, and deeper workflow tooling can sit behind the core workspace instead of confusing first-time visitors.",
      },
    ],
    finalEyebrow: "Start with one workflow",
    finalTitle: "Bring content, research, visuals, and workflow decisions into one workspace.",
    finalDescription: "Start with one recurring marketing workflow, then expand into shared models, reusable context, and advanced setup options.",
    signalLabel: (index) => `Signal ${String(index).padStart(2, "0")}`,
  },
  pricingGrid: {
    free: "Free",
    recommended: "Recommended",
    starterAccess: "Starter access",
    perMonth: "per month",
    workspaceMember: (count) => `${count} workspace member${count > 1 ? "s" : ""}`,
    creditsLine: (monthlyCredits, trialCredits) =>
      monthlyCredits > 0 ? `${formatNumber(monthlyCredits, "en")} monthly credits` : `${formatNumber(trialCredits, "en")} trial credits`,
    imageQuality: (quality) => `Image quality: ${quality}`,
    priorityQueue: "Priority image queue",
    videoGeneration: (level) => `Video generation: ${level}`,
    freePlanNote: "Includes a time-limited trial with starter credits so teams can test the workspace before upgrading.",
    paidPlanNote:
      "Shared-credit plans are designed for small-team production. Heavy usage can upgrade or connect provider keys where supported.",
    startWorkspace: "Start workspace",
  },
  pricingPage: {
    eyebrow: "Pricing",
    matrixLabel: "Pricing Matrix",
    sharedWorkspaceLabel: "Shared Workspace",
    title: "Pricing for a multi-model marketing workspace",
    description:
      "Pricing works best after teams understand the workspace, use cases, and cost tradeoffs. This page explains plans, credits, and where BYOK or upgrades fit.",
    primaryCta: "Start Free",
    calculatorCta: "Compare AI Tool Costs",
    guardrailsTitle: "Pricing guardrails",
    guardrails: [
      {
        title: "Credits and fair-use limits matter",
        description: "Credits and fair-use limits matter because model calls have ongoing cost.",
      },
      {
        title: "Heavy usage can scale up",
        description: "Heavy users can upgrade or connect provider keys where supported instead of relying only on starter credits.",
      },
      {
        title: "Unlimited usage is not promised",
        description: "AI Marketing does not promise unlimited GPT, Claude, Gemini, or image generation usage.",
      },
    ],
  },
}

const zh: PublicCopy = {
  header: {
    productName: "AI Marketing",
    tagline: "多模型营销工作台",
    brandOpsReady: "品牌运营就绪",
    login: "登录",
    startWorkspace: "免费开始",
    navItems: [
      { key: "alternatives", label: "替代方案", href: NAV_LINKS.alternatives },
      { key: "compare", label: "产品对比", href: NAV_LINKS.compare },
      { key: "solutions", label: "使用场景", href: NAV_LINKS.solutions },
      { key: "resources", label: "资源", href: NAV_LINKS.resources },
      { key: "tools", label: "工具", href: NAV_LINKS.tools },
      { key: "pricing", label: "价格", href: NAV_LINKS.pricing },
    ],
  },
  footer: {
    systemFooterLabel: "系统页脚",
    description:
      "一个面向营销内容、调研、视觉和工作流的多模型 AI 工作台，并为 BYOK、团队上下文和私有部署预留扩展空间。",
    contact: "联系邮箱",
    copyright: (year) => `© ${year} AI Marketing。为营销团队、内容创作者和独立操盘者而建。`,
  },
  home: {
    eyebrow: "面向现代营销团队的多模型 AI 工作台",
    systemLabel: "AI 营销系统",
    campaignControlLabel: "活动控制台",
    title: "一个工作台，接入多个 AI 模型",
    description:
      "在一个地方完成营销内容、市场调研、视觉生成和 AI 工作流管理。",
    supportingCopy:
      "适合营销人员、SEO 操作手、独立创始人和希望减少工具切换、提高产出的团队。",
    primaryCta: "免费开始",
    compareCta: "查看价格",
    calculatorCta: "查看使用场景",
    demoCta: "打开演示",
    trustPoints: [
      "同时使用多个 AI 模型，同时保留共享 brief 和活动上下文。",
      "把调研、内容、视觉和工作流执行放进同一个系统，而不是分散在多个订阅里。",
      "当工作流成熟后，再接入 BYOK、团队权限和私有部署选项。",
    ],
    replacementEyebrow: "问题",
    replacementStack: ["ChatGPT", "Claude", "Gemini", "AI 写作工具", "AI 图片工具", "自动化工具"],
    sharedOutputLabel: "团队真正想解决的事",
    replacementTitle: "AI 工具太多、上下文切换太频繁，而且没有一个共享的营销工作空间。",
    modeLabel: "模式",
    modeValue: "品牌工作栈",
    statusLabel: "状态",
    statusValue: "运行中",
    capabilitiesEyebrow: "核心能力",
    capabilityLabel: (index) => `能力 ${String(index).padStart(2, "0")}`,
    capabilityCards: [
      {
        title: "营销内容",
        description: "围绕同一份 brief 产出网站文案、SEO 内容、活动信息和上线素材，不必在每个工具里重讲背景。",
      },
      {
        title: "调研与规划",
        description: "让市场调研、定位笔记和创意方向留在同一个工作台里，再继续推进后续执行。",
      },
      {
        title: "可复用工作流",
        description: "把高频任务沉淀成共享工作流，保留上下文、团队可见性，并为后续高级配置留出空间。",
      },
    ],
    workflowEyebrow: "工作方式",
    workflowTitle: "同一份 brief，贯穿内容、调研和工作流任务",
    workflowDescription:
      "从定位调研开始，把同一份上下文持续带到落地页文案、SEO 草稿、视觉素材和团队复核环节。",
    workflows: [
      {
        title: "先建立共享上下文",
        description: "先录入受众、产品、品牌规则和本次目标，让整个团队围绕同一个营销背景展开工作。",
      },
      {
        title: "再运行合适的工作流",
        description: "在内容、调研、视觉和复核工作流之间切换，而不是把 brief 拆到不同订阅里重新开始。",
      },
      {
        title: "最后复用有效结果",
        description: "把成功的提示词、调研结论和最终资产保留下来，让下一次活动从已有上下文起步。",
      },
    ],
    audienceEyebrow: "使用场景",
    audienceTitle: "为高频营销工作而建",
    exploreSolutionsCta: "查看使用场景",
    useCaseLabel: (index) => `场景 ${String(index).padStart(2, "0")}`,
    openDetailLabel: "查看详情",
    audienceCards: [
      {
        title: "营销团队",
        description: "把活动规划、内容生产和跨模型复核统一收敛到同一个工作台里。",
        href: "/use-cases/ai-workspace-for-marketing-teams",
      },
      {
        title: "SEO 团队",
        description: "把 brief、搜索意图、文章结构和内容生产串成一条共享流程，而不是散落在聊天记录里。",
        href: "/use-cases/ai-workspace-for-seo-teams",
      },
      {
        title: "内容创作者",
        description: "让选题、脚本、改写和视觉方向保持连贯，不再为每一种资产切换工具和上下文。",
        href: "/use-cases/ai-workspace-for-content-creators",
      },
      {
        title: "独立创始人",
        description: "从定位、调研到上线文案和视觉决策，用一个工作台替代碎片化 AI 工具栈。",
        href: "/use-cases/ai-workspace-for-indie-founders",
      },
    ],
    resources: [
      { label: "Brief", title: "什么是内容简报？", href: "/resources/what-is-a-content-brief" },
      { label: "策略", title: "什么是内容支柱？", href: "/resources/what-is-a-content-pillar" },
      { label: "ROI", title: "如何衡量内容营销 ROI", href: "/resources/content-marketing-roi" },
      { label: "对比", title: "营销团队适合什么 AI 工作台", href: "/compare/best-ai-workspace-for-marketing-teams" },
      { label: "成本", title: "对比 AI 工具成本", href: "/compare/compare-ai-tool-costs" },
      { label: "价格", title: "查看工作台价格", href: "/pricing" },
      { label: "工具", title: "生成 SEO 标题和 Meta", href: "/tools/seo-title-generator" },
    ],
    pricingEyebrow: "价格",
    pricingTitle: "先看工作流是否匹配，再用价格页支持决策",
    pricingDescription:
      "团队通常会先理解工作台、使用场景和成本取舍，然后才需要比较套餐、积分和 BYOK 等更细的配置边界。",
    pricingCta: "查看价格",
    faqEyebrow: "常见问题",
    faqTitle: "切换前最常见的几个问题",
    faqs: [
      {
        question: "这主要是在讲价格吗？",
        answer: "不是。核心价值是把营销内容、调研、视觉和工作流放进一个工作台。价格是在确认工作流匹配之后才进入比较。",
      },
      {
        question: "这个产品最先适合谁？",
        answer: "最先适合营销团队、SEO 操作手、内容创作者和独立创始人，他们更需要一个统一工作空间，而不是更多分散的 AI 订阅。",
      },
      {
        question: "我们必须只选一个模型吗？",
        answer: "不需要。重点是保留多个模型的可用性，同时把共享上下文、可复用 brief 和团队可见性留在一个地方。",
      },
      {
        question: "高级团队还能保留自己的配置吗？",
        answer: "可以。BYOK、私有部署和更深的工作流集成应该放在升级层，而不是成为新访客进入首页后的第一层叙事。",
      },
    ],
    finalEyebrow: "先从一个流程开始",
    finalTitle: "把内容、调研、视觉和工作流决策放进同一个工作台。",
    finalDescription: "先把一个高频营销流程迁进来，再逐步扩展到共享模型、可复用上下文和高级配置选项。",
    signalLabel: (index) => `信号 ${String(index).padStart(2, "0")}`,
  },
  pricingGrid: {
    free: "免费",
    recommended: "推荐",
    starterAccess: "入门可用",
    perMonth: "每月",
    workspaceMember: (count) => `${count} 位工作台成员`,
    creditsLine: (monthlyCredits, trialCredits) =>
      monthlyCredits > 0 ? `${formatNumber(monthlyCredits, "zh")} 积分 / 月` : `${formatNumber(trialCredits, "zh")} 试用积分`,
    imageQuality: (quality) => `图片质量：${quality}`,
    priorityQueue: "图片优先队列",
    videoGeneration: (level) => `视频生成：${level}`,
    freePlanNote: "包含限时试用与入门积分，方便团队在升级前先验证工作流。",
    paidPlanNote: "共享积分套餐适合小团队日常生产。重度使用可以升级，或在支持时接入自有 provider key。",
    startWorkspace: "开始使用",
  },
  pricingPage: {
    eyebrow: "价格",
    matrixLabel: "价格矩阵",
    sharedWorkspaceLabel: "共享工作台",
    title: "面向多模型营销工作台的价格方案",
    description:
      "价格页更适合作为决策支持页。团队通常会先理解工作台、使用场景和成本取舍，再来比较套餐、积分，以及 BYOK 或升级的边界。",
    primaryCta: "免费开始",
    calculatorCta: "对比 AI 工具成本",
    guardrailsTitle: "价格边界说明",
    guardrails: [
      {
        title: "积分和公平使用限制是必要的",
        description: "模型调用会持续产生真实成本，因此积分和公平使用限制必须清晰存在。",
      },
      {
        title: "重度使用可以继续扩展",
        description: "高使用量团队可以升级套餐，或在支持时接入自有 provider key，而不是只依赖入门积分。",
      },
      {
        title: "不承诺无限量使用",
        description: "AI Marketing 不承诺 GPT、Claude、Gemini 或图片生成的无限量使用。",
      },
    ],
  },
}

export function getPublicCopy(locale: AppLocale): PublicCopy {
  const base = locale === "zh" ? zh : en

  return {
    ...base,
    header: {
      ...base.header,
      navItems: base.header.navItems.map((item) => ({
        ...item,
        href: localizePublicPath(item.href, locale),
      })),
    },
    home: {
      ...base.home,
      audienceCards: base.home.audienceCards.map((card) => ({
        ...card,
        href: localizePublicPath(card.href, locale),
      })),
      resources: base.home.resources.map((resource) => ({
        ...resource,
        href: localizePublicPath(resource.href, locale),
      })),
    },
  }
}

function formatNumber(value: number, locale: AppLocale) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US").format(value)
}
