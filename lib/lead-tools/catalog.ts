import type { AppLocale } from "@/lib/i18n/config"
import { getLeadToolFinalModel, getLeadToolPreviewModel } from "@/lib/lead-tools/config"

export type LeadToolStatus = "live" | "coming_soon"
export type LeadToolMedia =
  | "chat"
  | "presentation"
  | "seo"
  | "image"
  | "video"
  | "ads"
  | "email"

export type LeadToolScene =
  | "content_creation"
  | "seo_growth"
  | "design_creative"
  | "video_growth"
  | "research_analysis"
  | "agent_collaboration"
  | "brand_strategy"
  | "reputation_response"
  | "lead_generation"
  | "campaign_launch"

export type LeadToolAccessMode =
  | "guest"
  | "preview_then_login"
  | "workspace_entry"
  | "deferred"

export type LeadToolFaq = {
  question: string
  answer: string
}

export type LeadToolDefinition = {
  slug: string
  name: string
  shortName: string
  tagline: string
  description: string
  category: string
  icon: "presentation" | "seo" | "ads" | "email" | "chat" | "image" | "video"
  media: LeadToolMedia
  scenes: LeadToolScene[]
  href: string
  status: LeadToolStatus
  featured?: boolean
  accessMode: LeadToolAccessMode
  previewEnabled: boolean
  downloadRequiresLogin: boolean
  finalizeRequiresLogin: boolean
  previewModel: string
  finalModel: string
  proofPoints: string[]
  faqs: LeadToolFaq[]
}

export const leadToolsCatalog: LeadToolDefinition[] = [
  {
    slug: "ai-chat",
    name: "AI 对话工作台入口",
    shortName: "AI 对话",
    tagline: "从 public toolsite 进入统一 AI 对话与顾问工作台。",
    description:
      "把多模型对话、顾问入口、联网搜索与企业上下文统一导向现有 AI workspace，不再让普通用户只能从企业导航里偶然进入。",
    category: "Conversation",
    icon: "chat",
    media: "chat",
    scenes: ["agent_collaboration", "research_analysis", "brand_strategy"],
    href: "/tools/ai-chat",
    status: "live",
    accessMode: "workspace_entry",
    previewEnabled: false,
    downloadRequiresLogin: true,
    finalizeRequiresLogin: false,
    previewModel: "pptoken + openrouter",
    finalModel: "ai-entry workspace runtime",
    proofPoints: ["统一 AI 对话入口", "登录后进入现有 workspace", "对齐平台级 provider routing"],
    faqs: [
      {
        question: "为什么这是工具页，而不是直接跳到工作台？",
        answer: "public toolsite 需要一个能承接搜索流量和普通用户理解成本的入口页，再把高价值动作导回现有工作台。",
      },
      {
        question: "登录前能直接使用吗？",
        answer: "当前以清晰入口与能力说明为主，真正进入多会话 AI workspace 时会要求登录。",
      },
    ],
  },
  {
    slug: "ai-ppt-preview",
    name: "AI PPT 快速预览",
    shortName: "PPT 预览",
    tagline: "输入一个主题，并发获得 4 种高质量 HTML Slides 预览版本。",
    description:
      "面向 SEO 引流与首页转化的首个样板工具。先并发生成 4 个差异明显的 HTML Slides 方案，再在高价值动作上触发登录和下载。",
    category: "Presentation",
    icon: "presentation",
    media: "presentation",
    scenes: ["content_creation", "brand_strategy", "campaign_launch"],
    href: "/tools/ai-ppt-preview",
    status: "live",
    featured: true,
    accessMode: "preview_then_login",
    previewEnabled: true,
    downloadRequiresLogin: true,
    finalizeRequiresLogin: true,
    previewModel: getLeadToolPreviewModel("ai-ppt-preview"),
    finalModel: getLeadToolFinalModel("ai-ppt-preview"),
    proofPoints: ["4 种风格并发 HTML 预览", "登录前即可预览", "下载动作登录后继续"],
    faqs: [
      {
        question: "需要先登录才能看到结果吗？",
        answer: "不需要。游客可以直接生成多风格预览，登录只在下载和完整生成时触发。",
      },
      {
        question: "为什么先做预览，而不是直接下载文件？",
        answer: "预览更快出现，用户能先判断风格、文案和版式方向是否正确，再决定是否继续打开或下载 HTML 成品。",
      },
      {
        question: "模型能自定义吗？",
        answer: "当前 MVP 由平台统一指定预览模型和最终模型，保证速度、成本和结果稳定性。",
      },
    ],
  },
  {
    slug: "ai-image",
    name: "AI 绘图与设计助手入口",
    shortName: "AI 绘图",
    tagline: "从 public toolsite 进入图片设计、改图和素材引用工作台。",
    description: "把现有 image-assistant 从企业页面能力，扩成普通用户也能理解并进入的公开产品入口。",
    category: "Image",
    icon: "image",
    media: "image",
    scenes: ["design_creative", "campaign_launch", "content_creation"],
    href: "/tools/ai-image",
    status: "live",
    accessMode: "workspace_entry",
    previewEnabled: false,
    downloadRequiresLogin: true,
    finalizeRequiresLogin: false,
    previewModel: "runninghub",
    finalModel: "image-assistant workspace runtime",
    proofPoints: ["对齐图片任务层", "复用现有 image-assistant", "支持品牌素材与参考图流程"],
    faqs: [
      {
        question: "这个入口会重做一套图片工作台吗？",
        answer: "不会。它会优先复用现有 image-assistant runtime，只把入口、定位和转化链路放到 public toolsite。",
      },
      {
        question: "为什么要单独做公开入口？",
        answer: "因为普通用户更需要按“我要做图”来理解产品，而不是先理解企业后台结构。",
      },
    ],
  },
  {
    slug: "ai-video",
    name: "AI 视频工作台入口",
    shortName: "AI 视频",
    tagline: "从 public toolsite 进入视频生成与媒体工作流。",
    description: "公开承接 AI 视频能力，让用户先理解视频生成入口，再逐步进入现有 dashboard/video 的正式流程。",
    category: "Video",
    icon: "video",
    media: "video",
    scenes: ["video_growth", "campaign_launch", "design_creative"],
    href: "/tools/ai-video",
    status: "live",
    accessMode: "workspace_entry",
    previewEnabled: false,
    downloadRequiresLogin: true,
    finalizeRequiresLogin: false,
    previewModel: "runninghub",
    finalModel: "video workspace runtime",
    proofPoints: ["统一视频入口", "保留现有 dashboard/video runtime", "为后续视频复刻与热门检索预留扩展位"],
    faqs: [
      {
        question: "视频复刻和热门视频检索现在能用吗？",
        answer: "当前阶段保留入口与平台位置，但真实能力仍在 deferred 范围内，不会假装已经完成。",
      },
      {
        question: "这个页面和企业工作台是什么关系？",
        answer: "它是 public toolsite 的入口页，真正的视频任务执行仍会进入现有 workspace runtime。",
      },
    ],
  },
  {
    slug: "ai-seo-meta-generator",
    name: "AI SEO Meta 生成器",
    shortName: "SEO Meta",
    tagline: "根据页面主题，一次给出标题、描述和结构化建议。",
    description: "适合从搜索流量切入的通用工具，将复用相同的预览、登录门槛和埋点框架。",
    category: "SEO",
    icon: "seo",
    media: "seo",
    scenes: ["seo_growth", "research_analysis", "content_creation"],
    href: "/tools/ai-seo-meta-generator",
    status: "live",
    accessMode: "guest",
    previewEnabled: true,
    downloadRequiresLogin: false,
    finalizeRequiresLogin: false,
    previewModel: getLeadToolPreviewModel("ai-seo-meta-generator"),
    finalModel: getLeadToolFinalModel("ai-seo-meta-generator"),
    proofPoints: ["适合长尾 SEO 页面", "低输入门槛", "一次生成多组 Meta 方向"],
    faqs: [
      {
        question: "这个工具需要登录吗？",
        answer: "不需要。当前版本以预览和复制结果为主，游客可以直接使用。",
      },
      {
        question: "适合哪些页面？",
        answer: "适合工具页、落地页、产品页、功能页，以及围绕长尾关键词扩展的 SEO 页面。",
      },
      {
        question: "为什么要做多个 Meta 版本？",
        answer: "不同页面目标需要不同表达角度，多个版本更适合做 SEO 迭代、A/B 测试和程序化页面扩展。",
      },
    ],
  },
  {
    slug: "sentiment-monitoring",
    name: "AI 舆情监控入口",
    shortName: "舆情监控",
    tagline: "为企业舆情监控、危机响应和对外口径保留正式工具入口。",
    description:
      "这是平台化扩充阶段明确保留的 deferred 能力入口。当前先提供定位、场景说明和企业入口，不伪装成已经完成的真实监控系统。",
    category: "SEO",
    icon: "seo",
    media: "seo",
    scenes: ["reputation_response", "research_analysis", "agent_collaboration"],
    href: "/tools/sentiment-monitoring",
    status: "coming_soon",
    accessMode: "deferred",
    previewEnabled: false,
    downloadRequiresLogin: false,
    finalizeRequiresLogin: false,
    previewModel: "planned",
    finalModel: "deferred platform runtime",
    proofPoints: ["保留 public 入口与 UI", "对齐 Agent Platform 与后续工作流", "真实监控链路本阶段 deferred"],
    faqs: [
      {
        question: "现在已经能监控品牌舆情了吗？",
        answer: "还没有。这一阶段先保留工具入口、企业工作台入口和平台位置，真实监控数据链路会在后续阶段实现。",
      },
      {
        question: "为什么现在就要放入口？",
        answer: "因为平台信息架构和企业购买路径需要提前成立，不能等真实监控系统落地后再补产品入口。",
      },
    ],
  },
  {
    slug: "video-remake-studio",
    name: "AI 视频复刻入口",
    shortName: "视频复刻",
    tagline: "为视频复刻、拆解和再生产保留正式 public toolsite 入口。",
    description:
      "在现有视频工作台之上，先用统一主题和平台说明承接用户心智，再等待后续真实视频复刻 runtime 接入。",
    category: "Video",
    icon: "video",
    media: "video",
    scenes: ["video_growth", "design_creative", "campaign_launch"],
    href: "/tools/video-remake-studio",
    status: "coming_soon",
    accessMode: "deferred",
    previewEnabled: false,
    downloadRequiresLogin: false,
    finalizeRequiresLogin: false,
    previewModel: "planned",
    finalModel: "deferred video runtime",
    proofPoints: ["保留视频复刻入口", "继续复用现有视频工作台骨架", "不把 deferred 能力伪装成可用功能"],
    faqs: [
      {
        question: "现在能直接上传视频做复刻吗？",
        answer: "还不能。当前页面只保留产品入口、说明和企业级后续路径，真实复刻执行链不在本阶段范围内。",
      },
    ],
  },
  {
    slug: "hot-video-research",
    name: "热门视频检索入口",
    shortName: "热门视频检索",
    tagline: "为热点视频发现、选题研究和分发协同保留平台入口。",
    description:
      "当前先作为视频运营与研究能力的 public 入口，让用户理解这个能力在平台中的位置，同时明确它仍属于 deferred 模块。",
    category: "Video",
    icon: "video",
    media: "video",
    scenes: ["research_analysis", "video_growth", "lead_generation"],
    href: "/tools/hot-video-research",
    status: "coming_soon",
    accessMode: "deferred",
    previewEnabled: false,
    downloadRequiresLogin: false,
    finalizeRequiresLogin: false,
    previewModel: "planned",
    finalModel: "deferred research runtime",
    proofPoints: ["保留热门视频检索入口", "连接视频运营与工作流模板", "本阶段只做入口和交互说明"],
    faqs: [
      {
        question: "现在能直接检索热门视频吗？",
        answer: "还不能。这一阶段只保留目录、详情页和企业入口，不提供伪造的检索结果或假数据 runtime。",
      },
    ],
  },
  {
    slug: "ai-ads-copy-generator",
    name: "AI 广告文案多版本生成器",
    shortName: "广告文案",
    tagline: "为广告投放快速生成多版本标题与正文。",
    description: "未来用于承接广告文案、投放优化和创意测试场景的引流工具。",
    category: "Ads",
    icon: "ads",
    media: "ads",
    scenes: ["lead_generation", "content_creation", "campaign_launch"],
    href: "/tools/ai-ads-copy-generator",
    status: "coming_soon",
    accessMode: "deferred",
    previewEnabled: true,
    downloadRequiresLogin: true,
    finalizeRequiresLogin: false,
    previewModel: getLeadToolPreviewModel("ai-ads-copy-generator"),
    finalModel: getLeadToolFinalModel("ai-ads-copy-generator"),
    proofPoints: ["适合营销投放", "多版本并排对比", "可复用统一登录门槛"],
    faqs: [],
  },
  {
    slug: "ai-email-subject-generator",
    name: "AI 邮件标题优化器",
    shortName: "邮件标题",
    tagline: "针对不同受众和场景生成更高打开率的邮件标题。",
    description: "适合 B2B、销售和营销自动化相关流量的轻量引流工具。",
    category: "Email",
    icon: "email",
    media: "email",
    scenes: ["lead_generation", "content_creation", "campaign_launch"],
    href: "/tools/ai-email-subject-generator",
    status: "coming_soon",
    accessMode: "deferred",
    previewEnabled: true,
    downloadRequiresLogin: false,
    finalizeRequiresLogin: false,
    previewModel: getLeadToolPreviewModel("ai-email-subject-generator"),
    finalModel: getLeadToolFinalModel("ai-email-subject-generator"),
    proofPoints: ["输入门槛极低", "适合做程序化示例页", "可导流到主产品"],
    faqs: [],
  },
]

export const featuredLeadTool = leadToolsCatalog.find((tool) => tool.featured) ?? leadToolsCatalog[0]

export function getLeadToolBySlug(slug: string) {
  return leadToolsCatalog.find((tool) => tool.slug === slug)
}

export function getLeadToolPaths() {
  return leadToolsCatalog.map((tool) => tool.href)
}

const localizedLeadToolCopy: Record<
  AppLocale,
  Record<
    string,
    Pick<LeadToolDefinition, "name" | "shortName" | "tagline" | "description" | "proofPoints" | "faqs">
  >
> = {
  zh: {
    "ai-chat": {
      name: "AI 对话工作台入口",
      shortName: "AI 对话",
      tagline: "从 public toolsite 进入统一 AI 对话与顾问工作台。",
      description: "把多模型对话、顾问入口、联网搜索与企业上下文统一导向现有 AI workspace。",
      proofPoints: ["统一 AI 对话入口", "登录后进入现有 workspace", "对齐平台级 provider routing"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "ai-chat")?.faqs ?? [],
    },
    "ai-ppt-preview": {
      name: "AI PPT 快速预览",
      shortName: "PPT 预览",
      tagline: "输入一个主题，并发获得 4 种高质量 HTML Slides 预览版本。",
      description: "先并发生成 4 个差异明显的 HTML Slides 方案，再继续打开或下载 HTML 成品。",
      proofPoints: ["4 种风格并发 HTML 预览", "登录前即可预览", "下载动作登录后继续"],
      faqs: [
        {
          question: "需要先登录才能看到结果吗？",
          answer: "不需要。游客可以直接生成多风格预览，登录只在下载和完整生成时触发。",
        },
        {
          question: "为什么先做预览，而不是直接下载文件？",
          answer: "预览更快出现，用户能先判断风格、文案和版式方向是否正确，再决定是否继续打开或下载 HTML 成品。",
        },
        {
          question: "模型能自定义吗？",
          answer: "当前版本支持平台预设模型选择，默认会优先使用更稳定的预览模型。",
        },
      ],
    },
    "ai-seo-meta-generator": {
      name: "AI SEO Meta 生成器",
      shortName: "SEO Meta",
      tagline: "根据页面主题，一次给出标题、描述和结构化建议。",
      description: "适合从搜索流量切入的通用工具，复用相同的预览、登录门槛和埋点框架。",
      proofPoints: ["适合长尾 SEO 页面", "低输入门槛", "一次生成多组 Meta 方向"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "ai-seo-meta-generator")?.faqs ?? [],
    },
    "ai-image": {
      name: "AI 绘图与设计助手入口",
      shortName: "AI 绘图",
      tagline: "从 public toolsite 进入图片设计、改图和素材引用工作台。",
      description: "把现有 image-assistant 从企业页面能力，扩成普通用户也能理解并进入的公开产品入口。",
      proofPoints: ["对齐图片任务层", "复用现有 image-assistant", "支持品牌素材与参考图流程"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "ai-image")?.faqs ?? [],
    },
    "ai-video": {
      name: "AI 视频工作台入口",
      shortName: "AI 视频",
      tagline: "从 public toolsite 进入视频生成与媒体工作流。",
      description: "公开承接 AI 视频能力，让用户先理解视频生成入口，再逐步进入现有 dashboard/video 的正式流程。",
      proofPoints: ["统一视频入口", "保留现有 dashboard/video runtime", "为后续视频复刻与热门检索预留扩展位"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "ai-video")?.faqs ?? [],
    },
    "sentiment-monitoring": {
      name: "AI 舆情监控入口",
      shortName: "舆情监控",
      tagline: "为企业舆情监控、危机响应和对外口径保留正式工具入口。",
      description: "当前先保留 public 入口、企业入口和平台位置，不伪装成已经完成的真实舆情监控系统。",
      proofPoints: ["保留 public 入口与 UI", "对齐 Agent Platform 与后续工作流", "真实监控链路本阶段 deferred"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "sentiment-monitoring")?.faqs ?? [],
    },
    "video-remake-studio": {
      name: "AI 视频复刻入口",
      shortName: "视频复刻",
      tagline: "为视频复刻、拆解和再生产保留正式 public toolsite 入口。",
      description: "先用统一主题承接用户心智，再等待后续真实视频复刻 runtime 接入。",
      proofPoints: ["保留视频复刻入口", "继续复用现有视频工作台骨架", "不把 deferred 能力伪装成可用功能"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "video-remake-studio")?.faqs ?? [],
    },
    "hot-video-research": {
      name: "热门视频检索入口",
      shortName: "热门视频检索",
      tagline: "为热点视频发现、选题研究和分发协同保留平台入口。",
      description: "当前先作为视频运营与研究能力的 public 入口，同时明确它仍属于 deferred 模块。",
      proofPoints: ["保留热门视频检索入口", "连接视频运营与工作流模板", "本阶段只做入口和交互说明"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "hot-video-research")?.faqs ?? [],
    },
    "ai-ads-copy-generator": {
      name: "AI 广告文案多版本生成器",
      shortName: "广告文案",
      tagline: "为广告投放快速生成多版本标题与正文。",
      description: "未来用于承接广告文案、投放优化和创意测试场景的引流工具。",
      proofPoints: ["适合营销投放", "多版本并排对比", "可复用统一登录门槛"],
      faqs: [],
    },
    "ai-email-subject-generator": {
      name: "AI 邮件标题优化器",
      shortName: "邮件标题",
      tagline: "针对不同受众和场景生成更高打开率的邮件标题。",
      description: "适合 B2B、销售和营销自动化相关流量的轻量引流工具。",
      proofPoints: ["输入门槛极低", "适合做程序化示例页", "可导流到主产品"],
      faqs: [],
    },
  },
  en: {
    "ai-chat": {
      name: "AI Chat Workspace Entry",
      shortName: "AI Chat",
      tagline: "Route public-toolsite traffic into the unified AI chat and advisor workspace.",
      description: "Turn multi-model chat, advisor entry, search, and enterprise context into a clear public product entry instead of a hidden workspace-only surface.",
      proofPoints: ["Unified AI chat entry", "Moves into the existing workspace after login", "Aligned with platform provider routing"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "ai-chat")?.faqs ?? [],
    },
    "ai-ppt-preview": {
      name: "AI PPT Preview",
      shortName: "PPT Preview",
      tagline: "Enter one topic and get four parallel HTML slide directions.",
      description: "Generate four clearly differentiated HTML Slides directions first, then open or download the selected HTML result.",
      proofPoints: ["4 parallel HTML slide directions", "Preview before login", "Login continues the download action"],
      faqs: [
        {
          question: "Do I need to log in before seeing results?",
          answer: "No. Visitors can generate and compare the previews first. Login is only required for protected follow-up actions.",
        },
        {
          question: "Why preview first instead of downloading immediately?",
          answer: "Preview appears faster and lets users validate style, copy, and layout direction before opening or downloading the HTML output.",
        },
        {
          question: "Can I choose a model?",
          answer: "Yes. The current version keeps a curated set of preview models, with the more stable one used as the default.",
        },
      ],
    },
    "ai-seo-meta-generator": {
      name: "AI SEO Meta Generator",
      shortName: "SEO Meta",
      tagline: "Generate titles, descriptions, and structured directions from one page topic.",
      description: "A lightweight SEO acquisition tool that reuses the same runtime, preview pattern, and conversion gate.",
      proofPoints: ["Great for long-tail SEO pages", "Low input friction", "Multiple meta angles in one run"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "ai-seo-meta-generator")?.faqs ?? [],
    },
    "ai-image": {
      name: "AI Image and Design Entry",
      shortName: "AI Image",
      tagline: "Use one public entry to reach image design, editing, and reference-based workflows.",
      description: "Elevates the existing image assistant into a public-facing product entry while preserving the current workspace runtime.",
      proofPoints: ["Aligned with the image task layer", "Reuses the current image assistant", "Supports brand assets and references"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "ai-image")?.faqs ?? [],
    },
    "ai-video": {
      name: "AI Video Workspace Entry",
      shortName: "AI Video",
      tagline: "Route public-toolsite visitors into video generation and media workflows.",
      description: "Creates a clear public landing path for video generation before handing users into the existing dashboard/video runtime.",
      proofPoints: ["Unified video entry", "Keeps the current dashboard/video runtime", "Leaves room for future video-clone and trending modules"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "ai-video")?.faqs ?? [],
    },
    "sentiment-monitoring": {
      name: "AI Sentiment Monitoring Entry",
      shortName: "Sentiment Monitoring",
      tagline: "Keep a formal public entry for sentiment monitoring, crisis response, and external communications.",
      description: "This phase keeps the product entry, enterprise route, and platform position without pretending the real monitoring stack is finished.",
      proofPoints: ["Keeps the public entry and UI", "Aligns with Agent Platform and later workflows", "Real monitoring runtime stays deferred this phase"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "sentiment-monitoring")?.faqs ?? [],
    },
    "video-remake-studio": {
      name: "AI Video Remake Entry",
      shortName: "Video Remake",
      tagline: "Keep a formal public-toolsite entry for video remake, deconstruction, and regeneration.",
      description: "Use the shared theme and platform framing first, then connect the real remake runtime in a later phase.",
      proofPoints: ["Keeps the video-remake entry visible", "Continues to reuse the video workspace skeleton", "Does not fake a finished runtime"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "video-remake-studio")?.faqs ?? [],
    },
    "hot-video-research": {
      name: "Hot Video Research Entry",
      shortName: "Hot Video Research",
      tagline: "Reserve the public platform entry for trending-video discovery, topic research, and distribution coordination.",
      description: "This acts as the public entry for video-ops research while clearly marking the runtime as deferred.",
      proofPoints: ["Keeps a trending-video discovery entry", "Connects video operations and workflow templates", "Ships only entry and interaction guidance this phase"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "hot-video-research")?.faqs ?? [],
    },
    "ai-ads-copy-generator": {
      name: "AI Ads Copy Generator",
      shortName: "Ads Copy",
      tagline: "Generate multiple ad title and body directions for campaigns.",
      description: "Planned as a lead-gen tool for paid acquisition and creative testing workflows.",
      proofPoints: ["Built for paid marketing", "Compare variants side by side", "Reuses the shared login gate"],
      faqs: [],
    },
    "ai-email-subject-generator": {
      name: "AI Email Subject Generator",
      shortName: "Email Subject",
      tagline: "Create stronger email subject lines for different audiences and intents.",
      description: "A lightweight lead-gen tool for B2B, sales, and lifecycle messaging scenarios.",
      proofPoints: ["Very low input friction", "Great for programmatic example pages", "Can route traffic into the main product"],
      faqs: [],
    },
  },
}

export function localizeLeadTool(tool: LeadToolDefinition, locale: AppLocale): LeadToolDefinition {
  const localized = localizedLeadToolCopy[locale][tool.slug]
  if (!localized) return tool

  return {
    ...tool,
    ...localized,
  }
}

export function getLocalizedLeadToolsCatalog(locale: AppLocale) {
  return leadToolsCatalog.map((tool) => localizeLeadTool(tool, locale))
}

export function getLocalizedLeadToolBySlug(slug: string, locale: AppLocale) {
  const tool = getLeadToolBySlug(slug)
  return tool ? localizeLeadTool(tool, locale) : undefined
}
