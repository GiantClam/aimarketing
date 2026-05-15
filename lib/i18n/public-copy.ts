import type { AppLocale } from "@/lib/i18n/config"

type PublicNavKey = "alternatives" | "compare" | "solutions" | "calculator" | "pricing"

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

type PublicPricingGuardrail = {
  title: string
  description: string
}

type PublicHomeCopy = {
  eyebrow: string
  title: string
  description: string
  primaryCta: string
  compareCta: string
  calculatorCta: string
  demoCta: string
  trustPoints: string[]
  replacementEyebrow: string
  replacementStack: string[]
  sharedOutputLabel: string
  replacementTitle: string
  capabilitiesEyebrow: string
  capabilityCards: PublicCapabilityCard[]
  workflowEyebrow: string
  workflowTitle: string
  workflowDescription: string
  workflows: PublicWorkflowStep[]
  audienceEyebrow: string
  audienceTitle: string
  exploreSolutionsCta: string
  audienceCards: PublicAudienceCard[]
  resources: PublicResourceLink[]
  pricingEyebrow: string
  pricingTitle: string
  pricingDescription: string
  pricingCta: string
  finalEyebrow: string
  finalTitle: string
  finalDescription: string
}

type PublicPricingPageCopy = {
  eyebrow: string
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
  description: string
  contact: string
  copyright: (year: number) => string
}

type PublicHeaderCopy = {
  productName: string
  tagline: string
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
  compare: "/compare/best-ai-workspace-for-small-teams",
  solutions: "/solutions/ai-for-small-marketing-teams",
  calculator: "/resources/ai-subscription-cost-calculator",
  pricing: "/pricing",
}

const en: PublicCopy = {
  header: {
    productName: "AI Marketing",
    tagline: "Small-team workspace",
    login: "Log in",
    startWorkspace: "Start workspace",
    navItems: [
      { key: "alternatives", label: "Alternatives", href: NAV_LINKS.alternatives },
      { key: "compare", label: "Compare", href: NAV_LINKS.compare },
      { key: "solutions", label: "Solutions", href: NAV_LINKS.solutions },
      { key: "calculator", label: "Calculator", href: NAV_LINKS.calculator },
      { key: "pricing", label: "Pricing", href: NAV_LINKS.pricing },
    ],
  },
  footer: {
    description:
      "A shared AI marketing workspace for small teams that want multiple models, specialist agents, company context, and lower subscription sprawl.",
    contact: "Contact",
    copyright: (year) => `© ${year} AI Marketing. Built for small-team marketing execution.`,
  },
  home: {
    eyebrow: "Affordable multi-model AI marketing workspace",
    title: "One AI Marketing Workspace for Small Teams",
    description:
      "Stop paying separately for ChatGPT, Claude, Gemini, writing tools, image tools, and marketing consultants. AI Marketing gives your team multiple AI models, specialist marketing agents, shared company context, and permissions in one workspace.",
    primaryCta: "Start your team workspace",
    compareCta: "Compare with ChatGPT Team",
    calculatorCta: "Calculate AI tool savings",
    demoCta: "Open demo",
    trustPoints: [
      "Multiple AI models in one shared workspace",
      "Marketing agents for brand, growth, copy, website, video, and images",
      "Team permissions, company context, and shared credits",
    ],
    replacementEyebrow: "Replace tool sprawl",
    replacementStack: ["ChatGPT", "Claude", "Gemini", "AI writing tools", "AI image tools", "marketing consultants"],
    sharedOutputLabel: "Shared workspace output",
    replacementTitle: "Campaign strategy, copy, images, websites, and video scripts from one context.",
    capabilitiesEyebrow: "Capabilities",
    capabilityCards: [
      {
        title: "Multi-model workspace",
        description: "Use the right model for strategy, research, drafting, critique, and creative direction without moving the brief across tools.",
      },
      {
        title: "Marketing agents",
        description: "Run repeatable workflows for brand strategy, growth planning, copywriting, website copy, SEO articles, images, and video scripts.",
      },
      {
        title: "Shared team context",
        description: "Keep company facts, brand rules, campaign decisions, permissions, credits, and conversation history in one workspace.",
      },
    ],
    workflowEyebrow: "Workflow",
    workflowTitle: "Marketing workflow, not generic AI chat",
    workflowDescription:
      "The workspace is built for concrete marketing jobs: brand strategy, growth planning, SEO articles, website copy, image generation, and video scripts.",
    workflows: [
      {
        title: "Plan the campaign",
        description: "Start with company context, audience, offer, and growth goal so the workspace understands the marketing problem.",
      },
      {
        title: "Choose the right agent",
        description: "Use brand, growth, copy, website, image, video, or research workflows instead of rebuilding prompts from scratch.",
      },
      {
        title: "Ship reusable assets",
        description: "Generate campaign plans, landing page sections, articles, social posts, visuals, and scripts with decisions preserved.",
      },
    ],
    audienceEyebrow: "Who it fits",
    audienceTitle: "Built for teams that need output",
    exploreSolutionsCta: "Explore solutions",
    audienceCards: [
      {
        title: "Small marketing teams",
        description: "Consolidate content, visuals, website copy, and campaign planning without buying every AI tool separately.",
        href: "/solutions/ai-for-small-marketing-teams",
      },
      {
        title: "Agencies and consultants",
        description: "Keep client context organized while producing campaign ideas, copy, visuals, and strategic recommendations.",
        href: "/solutions/ai-for-agencies",
      },
      {
        title: "Startups and operators",
        description: "Move from positioning to launch copy, outreach, articles, and growth experiments in one shared workspace.",
        href: "/solutions/ai-for-startups",
      },
    ],
    resources: [
      { label: "Cost page", title: "Estimate AI subscription savings", href: "/resources/ai-subscription-cost-calculator" },
      { label: "Comparison", title: "ChatGPT Team alternative", href: "/alternatives/chatgpt-team-alternative" },
      { label: "Agent", title: "Growth marketing agent", href: "/agents/growth-marketing-agent" },
      { label: "Visuals", title: "AI image generator for teams", href: "/agents/image-generation-agent" },
      { label: "Pricing", title: "Shared-credit workspace plans", href: "/pricing" },
      { label: "Prompts", title: "Marketing strategy prompts", href: "/prompts/marketing-strategy-prompts" },
    ],
    pricingEyebrow: "Pricing at a glance",
    pricingTitle: "Show pricing on the homepage, keep the full explanation on a dedicated page",
    pricingDescription:
      "Homepage visitors should see the rough pricing shape quickly. The dedicated pricing page still matters as a conversion support page once they want plan details, credits, and usage guardrails.",
    pricingCta: "Open full pricing page",
    finalEyebrow: "Start small",
    finalTitle: "Create one workspace before buying another AI subscription.",
    finalDescription: "Give your team a shared place for models, marketing agents, company context, permissions, and credits.",
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
    title: "Shared-credit plans for small-team AI marketing work",
    description:
      "Pricing works best as a support page, not the first thing visitors need to decode. Teams usually want to understand the workflow and savings first, then compare plans. This page gives the full plan view after the homepage, alternatives pages, and calculator have already framed the product.",
    primaryCta: "Create your workspace",
    calculatorCta: "Calculate AI tool savings",
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
    tagline: "小团队营销工作台",
    login: "登录",
    startWorkspace: "开始使用",
    navItems: [
      { key: "alternatives", label: "替代方案", href: NAV_LINKS.alternatives },
      { key: "compare", label: "产品对比", href: NAV_LINKS.compare },
      { key: "solutions", label: "解决方案", href: NAV_LINKS.solutions },
      { key: "calculator", label: "成本计算器", href: NAV_LINKS.calculator },
      { key: "pricing", label: "价格", href: NAV_LINKS.pricing },
    ],
  },
  footer: {
    description:
      "面向小团队的共享 AI 营销工作台，把多模型、专家 Agent、企业上下文与更可控的订阅成本集中到一个地方。",
    contact: "联系邮箱",
    copyright: (year) => `© ${year} AI Marketing。为小团队营销执行而建。`,
  },
  home: {
    eyebrow: "高性价比的多模型 AI 营销工作台",
    title: "一个面向小团队的 AI Marketing 工作台",
    description:
      "不必再分别为 ChatGPT、Claude、Gemini、写作工具、图片工具和营销顾问重复付费。AI Marketing 把多种 AI 模型、营销专家 Agent、企业上下文和权限体系统一放进一个工作台。",
    primaryCta: "开启团队工作台",
    compareCta: "对比 ChatGPT Team",
    calculatorCta: "计算 AI 工具节省",
    demoCta: "打开演示",
    trustPoints: [
      "多个 AI 模型统一在一个共享工作台中使用",
      "覆盖品牌、增长、文案、网站、视频和图片的营销 Agent",
      "团队权限、企业上下文和共享积分统一管理",
    ],
    replacementEyebrow: "替代工具堆叠",
    replacementStack: ["ChatGPT", "Claude", "Gemini", "AI 写作工具", "AI 图片工具", "营销顾问"],
    sharedOutputLabel: "共享工作台产出",
    replacementTitle: "从同一份上下文里产出活动策略、文案、图片、网站和视频脚本。",
    capabilitiesEyebrow: "核心能力",
    capabilityCards: [
      {
        title: "多模型工作台",
        description: "针对策略、调研、起草、批判和创意方向选择最合适的模型，不需要在多工具之间搬运 brief。",
      },
      {
        title: "营销专家 Agent",
        description: "把品牌策略、增长规划、文案写作、网站文案、SEO 文章、图片和视频脚本沉淀成可复用流程。",
      },
      {
        title: "共享团队上下文",
        description: "把企业事实、品牌规则、活动决策、权限、积分和历史对话统一保存在一个工作台里。",
      },
    ],
    workflowEyebrow: "工作流",
    workflowTitle: "不是通用 AI 聊天，而是营销执行工作流",
    workflowDescription:
      "这个工作台围绕真实营销任务设计，包括品牌策略、增长规划、SEO 文章、网站文案、图片生成和视频脚本。",
    workflows: [
      {
        title: "先规划活动",
        description: "先输入企业背景、受众、产品和增长目标，让工作台真正理解你的营销问题。",
      },
      {
        title: "选择合适的 Agent",
        description: "直接使用品牌、增长、文案、网站、图片、视频或调研流程，而不是每次从零拼提示词。",
      },
      {
        title: "产出可复用资产",
        description: "生成活动方案、落地页结构、文章、社媒内容、视觉素材和脚本，并把关键决策保留下来。",
      },
    ],
    audienceEyebrow: "适合谁",
    audienceTitle: "为真正需要产出的团队而建",
    exploreSolutionsCta: "查看解决方案",
    audienceCards: [
      {
        title: "小型营销团队",
        description: "把内容、视觉、网站文案和活动规划收敛到一个工作台，不必再分别采购每一种 AI 工具。",
        href: "/solutions/ai-for-small-marketing-teams",
      },
      {
        title: "代理商与顾问",
        description: "在管理客户上下文的同时，持续产出活动思路、文案、视觉和策略建议。",
        href: "/solutions/ai-for-agencies",
      },
      {
        title: "创业团队与业务负责人",
        description: "从定位一路推进到上线文案、外联、文章和增长实验，全部放在同一个共享工作台里。",
        href: "/solutions/ai-for-startups",
      },
    ],
    resources: [
      { label: "成本页", title: "估算 AI 订阅节省", href: "/resources/ai-subscription-cost-calculator" },
      { label: "对比", title: "ChatGPT Team 替代方案", href: "/alternatives/chatgpt-team-alternative" },
      { label: "Agent", title: "增长营销 Agent", href: "/agents/growth-marketing-agent" },
      { label: "视觉", title: "团队 AI 图片生成器", href: "/agents/image-generation-agent" },
      { label: "价格", title: "共享积分工作台套餐", href: "/pricing" },
      { label: "提示词", title: "营销策略提示词", href: "/prompts/marketing-strategy-prompts" },
    ],
    pricingEyebrow: "价格概览",
    pricingTitle: "首页先说明价格结构，完整解释放到独立价格页",
    pricingDescription:
      "访问首页的人应该先快速看懂价格大致形态；当他们想比较套餐、积分和使用边界时，再进入完整价格页。",
    pricingCta: "查看完整价格页",
    finalEyebrow: "先从小开始",
    finalTitle: "在再买一个 AI 订阅之前，先创建一个共享工作台。",
    finalDescription: "把模型、营销 Agent、企业上下文、权限和积分集中到团队共享的一个地方。",
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
    title: "面向小团队 AI 营销工作的共享积分套餐",
    description:
      "价格页更适合作为决策支持页，而不是访客第一次接触产品时就要消化的页面。团队通常会先理解工作流和节省空间，再来比较套餐。这个页面负责补齐完整的套餐信息。",
    primaryCta: "创建工作台",
    calculatorCta: "计算 AI 工具节省",
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
  return locale === "zh" ? zh : en
}

function formatNumber(value: number, locale: AppLocale) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US").format(value)
}
