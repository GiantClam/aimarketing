import type { AppLocale } from "@/lib/i18n/config"
import type { AiToolKey } from "@/lib/seo/ai-cost-calculator"
import type { SeoPage } from "@/lib/seo/pages"

type SeoUiCopy = {
  landingBadge: string
  brandDemand: string
  bestFit: string
  relatedPages: string
  faqEyebrow: string
  faqTitle: string
  footerCtaEyebrow: string
  footerCtaTitle: string
}

type AiCostPageCopy = {
  eyebrow: string
  budgetSignal: string
  teamCostScan: string
  title: string
  description: string
  calculatorInputKicker: string
  calculatorInputTitle: string
  calculatorInputDescription: string
  teamSize: string
  estimatePerUser: (low: string, high: string) => string
  byokTitle: string
  byokDescription: string
  estimatedCost: string
  monthlyCost: string
  annualCost: string
  savingsRange: string
  recommendedStartingPoint: string
  benefits: string[]
  primaryCta: string
  secondaryCta: string
  disclaimer: string
}

const seoUiCopy: Record<AppLocale, SeoUiCopy> = {
  en: {
    landingBadge: "SEO Landing",
    brandDemand: "Brand Demand",
    bestFit: "Best fit",
    relatedPages: "Related pages",
    faqEyebrow: "FAQ",
    faqTitle: "Questions teams ask before switching",
    footerCtaEyebrow: "Ready to consolidate your AI marketing stack?",
    footerCtaTitle: "Give your team one workspace for models, agents, context, and marketing output.",
  },
  zh: {
    landingBadge: "SEO 落地页",
    brandDemand: "品牌需求",
    bestFit: "最适合谁",
    relatedPages: "相关页面",
    faqEyebrow: "常见问题",
    faqTitle: "团队切换前最常问的问题",
    footerCtaEyebrow: "准备收敛你的 AI 营销工具栈了吗？",
    footerCtaTitle: "给团队一个统一工作台，把模型、Agent、上下文和营销产出放到一起。",
  },
}

const aiCostPageCopy: Record<AppLocale, AiCostPageCopy> = {
  en: {
    eyebrow: "AI cost calculator",
    budgetSignal: "Budget Signal",
    teamCostScan: "Team Cost Scan",
    title: "Compare how much your marketing team spends on separate AI tools",
    description:
      "Estimate your monthly and annual AI software cost across ChatGPT, Claude, Gemini, image tools, writing tools, and search tools. Then compare it with one shared AI Marketing workspace for marketing content, research, and workflows.",
    calculatorInputKicker: "Cost Input",
    calculatorInputTitle: "Estimate your current AI stack",
    calculatorInputDescription: "Enter the number of active users for each tool type.",
    teamSize: "Team size",
    estimatePerUser: (low, high) => `Estimate: ${low}-${high} per user / month`,
    byokTitle: "We need BYOK or heavier model usage",
    byokDescription: "Select this when your team wants to connect its own API keys or expects high-frequency model usage.",
    estimatedCost: "Estimated cost",
    monthlyCost: "Monthly AI software cost",
    annualCost: "Annual AI software cost",
    savingsRange: "Potential monthly savings range",
    recommendedStartingPoint: "Recommended starting point",
    benefits: [
      "One shared AI workspace with multiple models.",
      "Marketing agents for strategy, copy, images, websites, and video scripts.",
      "Team permissions, shared credits, and company context.",
    ],
    primaryCta: "Start your team workspace",
    secondaryCta: "Compare with ChatGPT Team",
    disclaimer:
      "Estimates are illustrative and should be checked against live vendor pricing. AI Marketing does not promise unlimited GPT, Claude, Gemini, or image generation usage.",
  },
  zh: {
    eyebrow: "AI 成本计算器",
    budgetSignal: "预算信号",
    teamCostScan: "团队成本扫描",
    title: "对比你的营销团队在分散 AI 工具上的花费",
    description:
      "估算团队在 ChatGPT、Claude、Gemini、图片工具、写作工具和搜索工具上的月度与年度成本，再与一个共享的 AI Marketing 工作台进行对比。",
    calculatorInputKicker: "成本输入",
    calculatorInputTitle: "估算你当前的 AI 工具栈",
    calculatorInputDescription: "输入每类工具当前活跃使用者的人数。",
    teamSize: "团队人数",
    estimatePerUser: (low, high) => `估算：每位用户每月 ${low}-${high}`,
    byokTitle: "我们需要 BYOK 或更高频的模型使用",
    byokDescription: "如果你的团队希望接入自有 API Key，或预计会有高频模型调用，请勾选这一项。",
    estimatedCost: "成本估算",
    monthlyCost: "每月 AI 软件成本",
    annualCost: "每年 AI 软件成本",
    savingsRange: "潜在月度节省区间",
    recommendedStartingPoint: "建议起步方案",
    benefits: [
      "一个共享工作台，同时接入多个 AI 模型。",
      "覆盖策略、文案、图片、网站和视频脚本的营销 Agent。",
      "团队权限、共享积分和企业上下文统一管理。",
    ],
    primaryCta: "开启团队工作台",
    secondaryCta: "对比 ChatGPT Team",
    disclaimer:
      "以上估算仅作参考，仍应以各供应商的实时定价为准。AI Marketing 不承诺 GPT、Claude、Gemini 或图片生成的无限量使用。",
  },
}

const aiToolLabels: Record<AppLocale, Record<AiToolKey, string>> = {
  en: {
    chatgpt: "ChatGPT users",
    claude: "Claude users",
    gemini: "Gemini users",
    image: "Image tool users",
    writing: "Writing tool users",
    search: "Search tool users",
  },
  zh: {
    chatgpt: "ChatGPT 用户数",
    claude: "Claude 用户数",
    gemini: "Gemini 用户数",
    image: "图片工具用户数",
    writing: "写作工具用户数",
    search: "搜索工具用户数",
  },
}

const recommendedPlanLabels = {
  en: {
    "byok-workspace": "BYOK workspace",
    "team-pro": "Team Pro",
    "lifetime-basic-or-team-pro": "Lifetime Basic or Team Pro",
  },
  zh: {
    "byok-workspace": "BYOK 工作台",
    "team-pro": "Team Pro",
    "lifetime-basic-or-team-pro": "Lifetime Basic 或 Team Pro",
  },
} as const

type SeoPageTranslation = Partial<Omit<SeoPage, "slug" | "group">>

const zhSeoPageTranslations: Record<string, SeoPageTranslation> = {
  "use-cases:ai-workspace-for-marketing-teams": {
    title: "面向营销团队的 AI 工作台 | AI Marketing",
    description: "把营销内容、调研、视觉和活动工作流收敛到一个共享 AI 工作台里，而不是散落在多个独立工具中。",
    h1: "面向营销团队的 AI 工作台",
    intro: "给营销团队一个统一工作台，把内容、调研、视觉和活动工作流放到一起，而不是把任务分散在多个 AI 工具里。",
    primaryKeyword: "面向营销团队的 AI 工作台",
    secondaryKeywords: ["营销团队 AI 工作台", "多模型 AI 工作台", "营销工作流", "共享 AI 上下文"],
    audience: "需要把内容生产、调研和视觉协作放到同一套工作流里的营销团队。",
    highlights: [
      "同一份 brief 可以在调研、文案、视觉和复核之间持续复用。",
      "适合希望减少工具切换、但又不想被单一模型绑死的营销团队。",
      "重点不是更多聊天窗口，而是围绕真实营销交付建立共享工作流。",
    ],
    sections: [
      {
        heading: "这个页面真正要解决什么",
        body: [
          "营销团队的主要问题通常不是缺一个模型，而是每次从调研切到文案、再切到视觉和复核时，都要重复解释同一份项目背景。",
          "当 brief、品牌约束和活动决策散落在不同工具里时，团队会同时损失效率和一致性。",
        ],
      },
      {
        heading: "面向营销团队的实用检查清单",
        body: ["在继续购买新工具之前，先检查哪些营销流程其实已经适合收敛进一个共享工作台。"],
        bullets: [
          "先梳理那些会从调研一路流向文案、视觉和复核的高频流程。",
          "在团队开始产出前，把受众、产品和品牌上下文统一放进共享工作台。",
          "区分哪些流程需要多模型切换，哪些流程更需要结构化复核。",
          "在继续购买新的单点工具前，先验证共享工作台是否已经能覆盖主要工作流。",
        ],
      },
      {
        heading: "营销团队通常在哪里重复付费",
        body: [
          "过度支出往往来自上下文重复和流程分裂，而不是单个订阅本身。",
          "如果每次活动都要在不同聊天、写作和图片工具里重新搭建 brief，成本会同时体现在软件和时间上。",
        ],
        bullets: [
          "每次上线 brief 都要在不同聊天、写作和图片工具里重新建立。",
          "调研结论没有进入和内容、视觉资产同一个工作台，导致策略无法真正落地。",
          "如果最终交付是从多个订阅拼出来的，评审者就很难复用之前的上下文。",
          "首页、SEO 和活动内容各自从不同提示词历史开始，产品叙事就会不断漂移。",
        ],
      },
      {
        heading: "AI Marketing 在这里如何切入",
        body: [
          "AI Marketing 的定位不是替代所有模型，而是给营销团队一个统一的工作台，让多模型、共享上下文和复用工作流可以一起运转。",
          "正确的运营方式是把调研、内容、视觉和复核放进一个共享流程里，再按需要扩展 BYOK 或更高级的部署选项。",
        ],
      },
      {
        heading: "上线后该看哪些信号",
        body: ["好的收敛不只是省钱，还应该让团队更快复用同一份营销上下文。"],
        bullets: [
          "同一份 brief 能从调研一路进入文案、视觉和复核，而不必重新解释项目。",
          "团队更容易复用成功的上下文和决策，而不是每次重新生成。",
          "内链、价格页和 use-case 页面开始讲同一个产品故事，而不是成本页和提示词页各说各话。",
          "团队减少工具切换，但不必强迫所有任务都用同一个模型。",
        ],
      },
      {
        heading: "收敛之后，实际会改变什么",
        body: [
          "变化首先发生在流程层，而不是页面上的一句价值主张。团队不再把同一份 brief 重复搬运到多个工具，而是让调研、内容和视觉共用同一套上下文。",
          "一旦这种工作方式建立起来，之后再增加模型、权限或高级配置，都会比在分裂工具栈里更容易管理。",
        ],
      },
    ],
    faqs: [
      {
        question: "什么信号说明这个 use case 适合我们团队？",
        answer: "如果团队在做出最终营销资产前，总要跨多个工具反复重开同一份 brief，那更需要的是工作流收敛，而不是再加一个点状工具。",
      },
      {
        question: "我们还能保留自己的 API Key 吗？",
        answer: "可以。高频或特殊使用场景可以在支持时接入 BYOK，而不是完全依赖默认共享积分。",
      },
      {
        question: "开始收敛后，第一批该跟踪什么？",
        answer: "先同时跟踪成本和工作流质量，尤其看上下文复用是否更顺畅，以及团队是否仍然需要旧订阅来完成真实工作。",
      },
    ],
    cta: {
      primaryLabel: "开启团队工作台",
      primaryHref: "/register",
      secondaryLabel: "查看 AI 成本对比",
      secondaryHref: "/compare/compare-ai-tool-costs",
    },
    relatedLinks: [
      {
        href: "/use-cases/ai-workspace-for-seo-teams",
        label: "面向 SEO 团队的 AI 工作台",
        description: "看看搜索意图、文章结构和内容复核如何在同一个工作台里协同。",
      },
      {
        href: "/compare/best-ai-workspace-for-marketing-teams",
        label: "营销团队适合什么 AI 工作台",
        description: "对比通用 AI 工作台和面向营销执行的工作台差异。",
      },
      {
        href: "/compare/compare-ai-tool-costs",
        label: "对比 AI 工具成本",
        description: "把订阅支出和工作流分裂带来的隐性成本放在一起看。",
      },
    ],
  },
  "use-cases:ai-workspace-for-seo-teams": {
    title: "面向 SEO 团队的 AI 工作台 | AI Marketing",
    description: "把搜索意图、文章结构、草稿、更新和复核流程放进同一个 AI 工作台里。",
    h1: "面向 SEO 团队的 AI 工作台",
    intro: "把搜索意图、文章结构、草稿和内容更新放进同一个 AI 工作台，而不是散落在多个聊天和写作工具中。",
    primaryKeyword: "面向 SEO 团队的 AI 工作台",
    secondaryKeywords: ["SEO 团队 AI 工作台", "AI SEO 工作流", "内容更新工作台", "共享搜索意图上下文"],
    audience: "希望把搜索意图、写作和编辑复核串成统一流程的 SEO 团队。",
    highlights: [
      "同一套 SEO brief 能从意图研究一路进入大纲、草稿和复核。",
      "适合需要在多模型之间比较内容输出、但不想丢失上下文的 SEO 团队。",
      "重点不是单篇文章生成，而是让可复用的 SEO 工作流长期跑起来。",
    ],
  },
  "use-cases:ai-workspace-for-content-creators": {
    title: "面向内容创作者的 AI 工作台 | AI Marketing",
    description: "把选题、脚本、改写、视觉方向和发布上下文收敛到同一个工作台。",
    h1: "面向内容创作者的 AI 工作台",
    intro: "内容创作者需要一个统一工作台，把选题、脚本、改写、视觉方向和发布上下文放在一起，而不是分散在一堆 AI 标签页里。",
    primaryKeyword: "面向内容创作者的 AI 工作台",
    secondaryKeywords: ["内容创作者 AI 工作台", "脚本与改写工作流", "AI 内容工作流", "视觉与内容协同"],
    audience: "需要让选题、脚本、视觉和跨平台改写保持连贯的内容创作者。",
    highlights: [
      "一份共享 brief 可以持续驱动脚本、改写和视觉方向。",
      "适合希望提升复用率，而不是每次从空白提示词开始的创作者。",
      "核心价值是把内容生产做成可持续工作流，而不是单条输出。",
    ],
  },
  "use-cases:ai-workspace-for-indie-founders": {
    title: "面向独立创始人的 AI 工作台 | AI Marketing",
    description: "把定位、调研、上线文案和工作流决策放进同一个 AI 工作台，并更清楚地管理投入与上下文。",
    h1: "面向独立创始人的 AI 工作台",
    intro: "独立创始人需要一个 AI 工作台，把定位、调研、上线文案和工作流决策连在一起，同时更清楚地管理成本与上下文。",
    primaryKeyword: "面向独立创始人的 AI 工作台",
    secondaryKeywords: ["独立创始人 AI 工作台", "定位与上线工作流", "多模型创始人工作台", "AI 成本与工作流"],
    audience: "需要把定位、调研和上线资产收敛到同一个系统里的独立创始人。",
    highlights: [
      "让定位、调研和上线资产共用同一份产品故事。",
      "适合既关心成本，又关心工作流能否真正跑起来的独立创始人。",
      "把 BYOK 或私有部署这类高级选项留在后面，而不是一开始就分散注意力。",
    ],
  },
  "alternatives:chatgpt-team-alternative": {
    title: "ChatGPT Team 的营销团队替代方案 | AI Marketing",
    description: "对比 ChatGPT Team 和 AI Marketing，看看当团队需要多模型、共享上下文与完整营销工作流时，什么时候更适合切到统一工作台。",
    h1: "ChatGPT Team 的营销团队替代方案",
    intro: "ChatGPT Team 本身很强，但很多营销团队真正卡住的地方，不是聊天质量，而是同一份 brief 需要继续流向 SEO、图片、网站文案、审批和跨模型复核时，工作流开始分裂。",
    primaryKeyword: "ChatGPT Team 替代方案",
    secondaryKeywords: ["ChatGPT Team 替代方案", "营销团队 AI 工作台", "多模型 AI 工作台", "共享营销上下文"],
    audience: "喜欢 ChatGPT，但已经需要 Claude、Gemini、图片工具与共享营销上下文一起协作的小型营销团队。",
    highlights: [
      "如果团队主要想要 OpenAI 原生体验，ChatGPT Team 仍然可能是更直接的选择。",
      "替代方案搜索通常出现在团队开始在多个模型和多个营销工具之间重复搬运上下文的时候。",
      "核心比较点不是谁更像聊天工具，而是谁更适合承接持续的营销执行工作流。",
    ],
    comparison: {
      firstLabel: "ChatGPT Team",
      secondLabel: "AI Marketing",
      rows: [
        {
          dimension: "团队通常从哪里开始",
          first: "通常从 OpenAI 原生团队工作区开始，先解决聊天与协作问题。",
          second: "通常从营销共享工作台开始，先梳理多模型、内容和复核流程如何放在一起。",
        },
        {
          dimension: "上下文如何复用",
          first: "核心上下文留在 ChatGPT 线程里，周边营销资产往往还在别的工具中继续完成。",
          second: "品牌、公司和活动上下文会跟着内容、调研、视觉和审批流程持续复用。",
        },
        {
          dimension: "资产覆盖范围",
          first: "更适合把 ChatGPT 当成原生协作与起草环境来使用。",
          second: "更适合让 brief、文案、调研、视觉和后续营销执行在同一个地方衔接。",
        },
        {
          dimension: "购买逻辑",
          first: "当团队主要想要 OpenAI 官方产品体验时更合适。",
          second: "当团队更想减少工具分裂，并保留可复用营销上下文时更合适。",
        },
      ],
    },
    sections: [
      {
        heading: "为什么会开始搜 ChatGPT Team 替代方案",
        body: [
          "大多数团队并不是不喜欢 ChatGPT，而是发现 ChatGPT 只覆盖了其中一段工作流，剩下的图片、SEO、网站文案和审批仍然散落在别的工具里。",
          "对营销团队来说，真正的问题往往是上下文和交付链路是否能留在同一个系统，而不是单次聊天结果是否够好。",
        ],
        bullets: [
          "并不是所有成员都每天重度使用 ChatGPT，但大家都需要看到同一份营销上下文。",
          "如果营销资产仍要在别的工具里完成，团队就会开始重复搬运 brief 和复核标准。",
          "当多模型复核已经成为常态时，只保留单一模型工作区通常不够。 ",
        ],
      },
      {
        heading: "什么时候继续留在 ChatGPT Team 更合理",
        body: [
          "如果团队高度依赖 OpenAI 原生功能，而且绝大多数关键工作都能在 ChatGPT 的原生环境里闭环，继续留在 ChatGPT Team 仍然是合理选择。",
          "尤其当团队主要看重通用协作，而不是完整营销交付链路时，原生工作区会更直接。 ",
        ],
      },
      {
        heading: "什么时候 AI Marketing 更像真正的替代方案",
        body: [
          "当同一份营销 brief 需要继续流向 SEO、网站文案、图片、视频脚本和跨模型复核时，共享营销工作台通常更接近真实需求。",
          "这时团队在意的，已经不只是单个模型能力，而是内容、调研和营销决策能否持续复用。 ",
        ],
      },
      {
        heading: "切换前该问的问题",
        body: ["更好的替代方案，不是功能表最长的那个，而是最能减少团队上下文摩擦的工作流。"],
        bullets: [
          "你们是不是还在用其他工具做图片、网站文案或活动交付？",
          "获胜的 brief 和审批理由是不是仍然只留在 ChatGPT 线程里？",
          "偶发参与评审的人，是否也必须买完整高级座席才能查看上下文？",
          "当前真正要减少的是 seat 成本，还是工具分裂与上下文重建？",
        ],
      },
      {
        heading: "怎么比较总工作流成本",
        body: [
          "成本不应只看 ChatGPT Team 的单一价格，而要把图片工具、写作工具和上下文搬运成本一起算进去。",
          "对于小团队来说，更大的节省通常来自把高频营销执行收敛进同一个工作台，而不是简单换掉某个模型。 ",
        ],
      },
      {
        heading: "替换前的迁移清单",
        body: ["更稳妥的迁移方式，是先比较真实工作流，而不是只跑几组演示 prompt。"],
        bullets: [
          "先列出团队每周真正依赖的 OpenAI 原生功能，区分哪些是核心，哪些只是加分项。",
          "把一条真实活动流程迁进 AI Marketing，并带上同样的品牌与 offer 上下文。",
          "把 ChatGPT Team、图片工具和其他写作工具的总 seat 成本一起比较，再决定是否收缩订阅。",
          "只为那些仍然强依赖 OpenAI 原生环境的人保留 ChatGPT Team。 ",
        ],
      },
    ],
    faqs: [
      {
        question: "AI Marketing 会完全替代 ChatGPT Team 吗？",
        answer: "不一定。对强依赖 OpenAI 原生体验的团队，ChatGPT Team 仍然可能保留。但如果团队真正要解决的是多模型营销执行和共享上下文，AI Marketing 更贴近这个购买理由。",
      },
      {
        question: "团队通常因为什么而离开 ChatGPT Team？",
        answer: "通常不是因为输出质量本身，而是因为团队还需要别的模型、更多成员参与、以及跨内容与视觉流程的上下文复用，而这些都不适合一直靠线程拼接。",
      },
      {
        question: "最干净的替代测试方法是什么？",
        answer: "用同一份真实 brief 跑一条真实营销流程，然后比较资产覆盖、评审速度和团队在外部重写上下文的次数。 ",
      },
    ],
    cta: {
      primaryLabel: "开启团队工作台",
      primaryHref: "/register",
      secondaryLabel: "对比 AI 工具成本",
      secondaryHref: "/resources/ai-subscription-cost-calculator",
    },
    relatedLinks: [
      {
        href: "/compare/best-ai-workspace-for-marketing-teams",
        label: "营销团队适合什么 AI 工作台",
        description: "进一步比较通用 AI 工作台和面向营销执行的工作台。 ",
      },
      {
        href: "/use-cases/chatgpt-claude-gemini-in-one-workspace",
        label: "把 ChatGPT、Claude、Gemini 放进同一工作台",
        description: "看看团队如何在不丢上下文的情况下使用多个模型。 ",
      },
      {
        href: "/compare/compare-ai-tool-costs",
        label: "对比 AI 工具成本",
        description: "把 seat 成本和工作流分裂带来的隐性成本放到一起看。 ",
      },
    ],
  },
  "compare:compare-ai-tool-costs": {
    title: "对比营销团队的 AI 工具成本 | AI Marketing",
    description: "对比多个 AI 订阅和一个共享 AI 工作台的真实成本，并把支出和工作流分裂带来的摩擦一起纳入判断。",
    h1: "对比营销团队的 AI 工具成本",
    intro: "当你把模型能力和工作流成本分开来看时，团队往往更容易看清真正的 AI 支出结构。营销团队通常需要多个模型，但不一定需要多个彼此孤立的订阅。",
    primaryKeyword: "对比 AI 工具成本",
    secondaryKeywords: ["AI 工具成本对比", "营销团队 AI 成本", "共享 AI 工作台成本", "多模型 AI 工作流"],
    audience: "正在比较多个 AI 订阅和共享工作台成本结构的营销团队。",
    highlights: [
      "真正要比较的，不只是订阅单价，还包括上下文丢失和重复复核的运营成本。",
      "当同一份 brief 会穿过调研、文案、视觉和审批时，共享工作台通常更值得被认真比较。",
      "这类页面的价值在于把支出结构和工作流设计放到同一个判断框架里。",
    ],
    comparison: {
      firstLabel: "多个独立 AI 订阅",
      secondLabel: "共享 AI 工作台",
      rows: [
        {
          dimension: "团队通常从哪里开始",
          first: "通常从单个模型或单点工具开始，先解决局部任务。",
          second: "通常从共享工作台开始，先梳理哪些营销流程需要统一上下文。",
        },
        {
          dimension: "仍然需要人工复核的部分",
          first: "仍然需要在多个工具之间对齐 brief、评审标准和最终版本。",
          second: "仍然需要人工复核，但更容易在同一个工作台里保留决策过程和上下文。",
        },
        {
          dimension: "团队运作方式",
          first: "多个独立账户更容易让决策分散，最终资产背后的原因也更难追溯。",
          second: "共享工作台更容易保留胜出的 brief、评审记录和后续复用所需的上下文。",
        },
      ],
    },
    sections: [
      {
        heading: "AI 成本对比真正取决于什么",
        body: [
          "并不存在所有团队都通用的最低成本答案。更好的选择取决于你是在比较单个工具的价格，还是在比较整个营销工作流的总成本。",
          "对于营销工作，团队通常应该先定义哪类工作流最频繁、最容易丢上下文，再去比较订阅结构是否合理。",
        ],
      },
      {
        heading: "什么时候多个独立订阅看起来更划算",
        body: [
          "如果团队中确实有多个高频专门用户，而且他们每天都依赖各自厂商原生工作流，那么独立订阅可能暂时更顺手。",
          "当你还没有确定哪些流程应该标准化时，直接把所有东西塞进一个共享工作台，也可能会让成本判断失真。",
        ],
        bullets: [
          "不同角色每天都需要各自厂商原生工作流，而且能力重叠很低。",
          "团队还在测试不同类别的工具，暂时还没确定哪些流程值得标准化。",
          "如果当前工具栈主要用于探索而不是稳定交付，单纯做成本对比很容易误导。",
          "你目前更看重模型原生能力，而不是把 brief 和复核历史保留在同一个系统里。",
        ],
      },
      {
        heading: "什么时候共享 AI 工作台更划算",
        body: [
          "如果同一份营销 brief 会反复流经调研、文案、视觉和审批流程，共享工作台通常更能降低总成本。",
          "尤其当偶发参与者也需要查看输出和上下文时，共享工作台往往比给每个人都买一套高级订阅更合理。",
        ],
        bullets: [
          "同一份营销 brief 经常在调研、文案、视觉和审批之间来回流转。",
          "偶发参与者也需要查看输出和上下文，但没必要每个人都拥有完整高级订阅。",
          "管理者希望把总支出和工具分裂带来的工作流摩擦放在一起比较。",
          "团队想获得更清晰的成本视图，但不想放弃多模型和可复用上下文。",
        ],
      },
      {
        heading: "什么时候更好的答案其实是共享工作台",
        body: [
          "如果团队必须在多个模型之间比较输出、保留胜出版本的原因，并把结果复用到下一次活动里，那么工作台的重要性会和模型本身一样高。",
          "AI Marketing 的定位不是让你在第一天就定死唯一模型，而是让内容、调研和工作流在同一个系统中持续复用。",
        ],
      },
      {
        heading: "对比 AI 工具成本的决策清单",
        body: ["成本判断只有建立在真实工作流之上，才有可执行意义。"],
        bullets: [
          "统计那些真正服务于每周交付的订阅，而不是把偶发试用过的工具也算进去。",
          "检查同一份 brief 在聊天、写作、图片和复核工具之间被复制了多少次。",
          "把 seat 成本、上下文丢失、复核摩擦和重复工作流一起纳入判断。",
          "先确认哪些营销流程应该进入共享工作台，再用成本计算器估算节省空间。",
        ],
      },
      {
        heading: "为什么脱离工作流做成本对比会失真",
        body: [
          "纸面上更便宜的工具栈，实际可能更贵，因为团队会在不同工具之间反复重做调研、重写 brief、重走复核流程。",
          "这个页面的目标，是把“支出结构”与“工作流设计”放在同一个判断框架里，让营销团队能更清楚地决定该先收敛哪里。",
        ],
      },
    ],
    faqs: [
      {
        question: "AI 成本节省应该成为首页主定位吗？",
        answer: "通常不应该。成本节省更适合作为支持性论点，而更强的主定位仍然是“一个面向营销内容、调研和工作流的多模型 AI 工作台”。",
      },
      {
        question: "共享工作台会不会替代所有模型判断？",
        answer: "不会。它的作用是把多模型、共享上下文和团队工作流放在同一个系统里，让你更容易做出复用和成本层面的决策。",
      },
      {
        question: "最快的成本对比方法是什么？",
        answer: "从一条真实营销流程开始，比较同一份 brief 在当前工具栈和共享工作台里的软件成本、复核摩擦与上下文复用情况。",
      },
    ],
    cta: {
      primaryLabel: "开启团队工作台",
      primaryHref: "/register",
      secondaryLabel: "查看营销团队使用场景",
      secondaryHref: "/use-cases/ai-workspace-for-marketing-teams",
    },
    relatedLinks: [
      {
        href: "/use-cases/ai-workspace-for-marketing-teams",
        label: "面向营销团队的 AI 工作台",
        description: "查看共享工作台如何承接内容、调研、视觉和审批流程。",
      },
      {
        href: "/compare/best-ai-workspace-for-marketing-teams",
        label: "营销团队适合什么 AI 工作台",
        description: "对比通用工作台和面向营销执行的工作台差异。",
      },
      {
        href: "/alternatives/chatgpt-team-alternative",
        label: "ChatGPT Team 替代方案",
        description: "从替代方案视角看共享工作台何时比单一团队聊天产品更适合营销团队。",
      },
    ],
  },
  "compare:best-ai-workspace-for-marketing-teams": {
    title: "营销团队适合什么 AI 工作台 | AI Marketing",
    description: "对比通用 AI 工作台和面向营销执行的 AI Marketing 工作台，看看团队何时更需要共享上下文和可复用营销工作流。",
    h1: "营销团队适合什么 AI 工作台",
    intro: "对营销团队来说，最佳 AI 工作台通常不是功能最多的那个，而是最能承接内容、调研、视觉和审批流程的那个。模型能力重要，但工作流是否连贯同样重要。",
    primaryKeyword: "营销团队适合什么 AI 工作台",
    secondaryKeywords: ["营销团队 AI 工作台", "最佳 AI 工作台", "共享 AI 上下文", "多模型营销工作流"],
    audience: "正在为营销团队挑选 AI 工作台，并希望兼顾多模型、共享上下文与交付效率的决策者。",
    highlights: [
      "通用 AI 工作台和面向营销执行的工作台，解决的并不是同一个问题。",
      "真正的差异通常出现在上下文复用、交付链路和评审可见性，而不只是聊天界面或模型数量。",
      "对营销团队来说，工作台要能帮团队持续产出，而不只是把 prompt 存在一起。",
    ],
    comparison: {
      firstLabel: "通用 AI 工作台",
      secondLabel: "AI Marketing 工作台",
      rows: [
        {
          dimension: "团队通常从哪里开始",
          first: "通常从中性的 AI 协作层开始，优先服务多个部门的通用需求。",
          second: "通常从营销高频工作流开始，优先承接内容、调研、视觉和审批链路。",
        },
        {
          dimension: "人工复核仍然集中在哪",
          first: "仍然需要靠人工把调研、文案与最终资产重新串起来。",
          second: "仍然需要人工复核，但上下文、brief 与历史决定更容易保留在同一个系统里。",
        },
        {
          dimension: "团队运作方式",
          first: "更适合广泛的通用 AI 协作，但营销流程可能仍需额外工具补齐。",
          second: "更适合把营销工作流做成可复用操作系统，而不只是通用聊天协作。",
        },
      ],
    },
    sections: [
      {
        heading: "这个比较真正取决于什么",
        body: [
          "营销团队选工作台时，最容易犯的错是只看模型列表或功能矩阵，而忽略工作真正如何流动。",
          "更好的判断方式，是先看团队最常见的 brief 会不会继续流向内容、调研、视觉和审批，再看哪个工作台更能承接这条链路。",
        ],
      },
      {
        heading: "什么时候通用 AI 工作台会赢",
        body: [
          "如果企业更想先搭一个跨部门共享的 AI 协作层，而营销流程本身还不够标准化，通用工作台通常更合适。",
          "当团队更关心统一聊天协作，而不是围绕营销交付建立可复用结构时，这条路线会更自然。 ",
        ],
        bullets: [
          "工作台主要服务多个部门，而不是围绕营销团队的高频交付展开。",
          "营销流程还比较轻，暂时不需要强约束的内容或复核结构。",
          "团队更在意通用协作，而不是把调研、内容和视觉放进一个系统。",
          "还没有明确的营销 owner 需要在工作台里建立长期可复用流程。 ",
        ],
      },
      {
        heading: "什么时候 AI Marketing 工作台会赢",
        body: [
          "如果主要购买任务是持续营销执行，而不是泛化的 AI 协作，那么 AI Marketing 工作台通常更匹配。",
          "尤其当团队想同时使用多个模型，但又不想丢失共享 brief、品牌上下文和评审历史时，这种工作台更容易建立复用价值。 ",
        ],
        bullets: [
          "核心购买任务是内容、调研、视觉和营销工作流交付，而不是纯聊天协作。",
          "团队需要多个模型，但不想在模型切换时丢失共享上下文。",
          "管理者希望 use-case、compare、pricing 和 workflow 页面都指向同一个产品故事。",
          "工作台的目标是帮助营销人员持续出成果，而不是只做 prompt 协作。 ",
        ],
      },
      {
        heading: "什么时候更好的答案其实是共享工作台",
        body: [
          "如果团队需要反复比较输出、保留获胜版本的原因，并把这些决策复用到下一次活动里，那么工作台的重要性会和模型选择一样高。",
          "AI Marketing 的价值不是替你永久决定唯一模型，而是让多个模型和营销工作流在一个系统里连续运转。 ",
        ],
      },
      {
        heading: "给营销团队的判断清单",
        body: ["真正更稳的决策，通常来自对工作流的打分，而不是只对单篇输出打分。"],
        bullets: [
          "先确认工作台主要是服务通用 AI 协作，还是服务持续营销交付。",
          "比较它是否能让调研、内容、视觉与团队复核复用同一份上下文。",
          "检查这个工作台是否支持你希望 Google 和买家首先理解的产品叙事。",
          "选择最匹配团队高频营销任务的系统，而不是功能看起来最全的那一个。 ",
        ],
      },
      {
        heading: "怎么做一场公平比较",
        body: [
          "不要用三组完全不同的 demo prompt 来做判断。更公平的做法，是用同一份真实 brief、同一位评审和同一个截止时间来比较结果。",
          "这样你更容易看清，到底是模型本身更强，还是工作流结构更适合团队长期复用。 ",
        ],
      },
    ],
    faqs: [
      {
        question: "营销团队会有一个永久最优的 AI 工作台吗？",
        answer: "通常没有。更优的选择会随着团队结构、brief 质量和复核方式变化，但对营销团队来说，是否能承接持续工作流往往比单次输出更关键。",
      },
      {
        question: "共享工作台会不会替代模型判断？",
        answer: "不会。它是帮助团队保留上下文、组织输出和复用工作流，而不是取消模型选择本身。 ",
      },
      {
        question: "最快的比较方式是什么？",
        answer: "用同一份真实营销 brief 跑两套方案，再比较输出质量、评审摩擦和下次是否能更快复用获胜上下文。 ",
      },
    ],
    cta: {
      primaryLabel: "开启团队工作台",
      primaryHref: "/register",
      secondaryLabel: "估算订阅节省空间",
      secondaryHref: "/resources/ai-subscription-cost-calculator",
    },
    relatedLinks: [
      {
        href: "/resources/ai-subscription-cost-calculator",
        label: "AI 工具成本计算器",
        description: "估算分散订阅是否真的值得当前这套复杂度。 ",
      },
      {
        href: "/use-cases/ai-workspace-for-marketing-teams",
        label: "面向营销团队的 AI 工作台",
        description: "从 use-case 角度看共享营销工作台如何承接真实流程。 ",
      },
      {
        href: "/alternatives/chatgpt-team-alternative",
        label: "ChatGPT Team 替代方案",
        description: "看看营销团队何时会从单一团队聊天产品转向共享工作台。 ",
      },
    ],
  },
}

function localizedSeoPage(page: SeoPage, translation: SeoPageTranslation): SeoPage {
  return {
    ...page,
    ...translation,
    comparison: translation.comparison ?? page.comparison,
    cta: translation.cta ?? page.cta,
    sections: translation.sections ?? page.sections,
    faqs: translation.faqs ?? page.faqs,
    relatedLinks: translation.relatedLinks ?? page.relatedLinks,
  }
}

export function getSeoUiCopy(locale: AppLocale): SeoUiCopy {
  return seoUiCopy[locale]
}

export function getAiCostPageCopy(locale: AppLocale): AiCostPageCopy {
  return aiCostPageCopy[locale]
}

export function getAiToolLabel(locale: AppLocale, key: AiToolKey) {
  return aiToolLabels[locale][key]
}

export function getRecommendedPlanLabel(
  locale: AppLocale,
  key: keyof typeof recommendedPlanLabels.en,
) {
  return recommendedPlanLabels[locale][key]
}

export function localizeSeoPage(page: SeoPage, locale: AppLocale): SeoPage {
  if (locale !== "zh") return page
  const translation = zhSeoPageTranslations[`${page.group}:${page.slug}`]
  if (!translation) return page
  return localizedSeoPage(page, translation)
}
