import type { AppLocale } from "@/lib/i18n/config"

type LocalizedText = {
  zh: string
  en: string
}

export type PlatformStatus = "live" | "beta" | "planned"
export type PlatformSurface = "public" | "workspace" | "both"
export type PlatformCapabilityKind = "text" | "image" | "video" | "audio" | "agent"
export type ProviderBindingStatus = "active" | "fallback" | "planned"

export type ProviderBinding = {
  provider: string
  status: ProviderBindingStatus
  note: LocalizedText
}

type PlatformDirectoryItemBase = {
  slug: string
  status: PlatformStatus
  surface: PlatformSurface
  title: LocalizedText
  summary: LocalizedText
  proofPoints: LocalizedText[]
  publicHref?: string
  workspaceHref?: string
}

export type CapabilityDescriptor = PlatformDirectoryItemBase & {
  kind: PlatformCapabilityKind
  bindings: ProviderBinding[]
}

export type AgentCard = PlatformDirectoryItemBase & {
  focus: LocalizedText
}

export type PluginDescriptor = PlatformDirectoryItemBase & {
  integratesWith: LocalizedText
}

export type McpServiceDescriptor = PlatformDirectoryItemBase & {
  serviceType: LocalizedText
}

export type WorkflowTemplate = PlatformDirectoryItemBase & {
  trigger: LocalizedText
}

export type PlatformHubLink = {
  slug: string
  title: LocalizedText
  summary: LocalizedText
  href: string
}

export type PlatformCatalogSurface = "public" | "workspace" | "all"

type LocalizedPlatformDirectoryItemBase = Omit<
  PlatformDirectoryItemBase,
  "title" | "summary" | "proofPoints"
> & {
  title: string
  summary: string
  proofPoints: string[]
}

export type LocalizedCapabilityDescriptor = Omit<
  CapabilityDescriptor,
  "title" | "summary" | "proofPoints" | "bindings"
> & {
  title: string
  summary: string
  proofPoints: string[]
  bindings: Array<{
    provider: string
    status: ProviderBindingStatus
    note: string
  }>
}

export type LocalizedAgentCard = Omit<AgentCard, "title" | "summary" | "proofPoints" | "focus"> &
  LocalizedPlatformDirectoryItemBase & {
    focus: string
  }

export type LocalizedPluginDescriptor = Omit<
  PluginDescriptor,
  "title" | "summary" | "proofPoints" | "integratesWith"
> &
  LocalizedPlatformDirectoryItemBase & {
    integratesWith: string
  }

export type LocalizedMcpServiceDescriptor = Omit<
  McpServiceDescriptor,
  "title" | "summary" | "proofPoints" | "serviceType"
> &
  LocalizedPlatformDirectoryItemBase & {
    serviceType: string
  }

export type LocalizedWorkflowTemplate = Omit<
  WorkflowTemplate,
  "title" | "summary" | "proofPoints" | "trigger"
> &
  LocalizedPlatformDirectoryItemBase & {
    trigger: string
  }

function localizeText(locale: AppLocale, value: LocalizedText) {
  return locale === "zh" ? value.zh : value.en
}

function localizeBase<T extends PlatformDirectoryItemBase>(locale: AppLocale, item: T) {
  return {
    ...item,
    title: localizeText(locale, item.title),
    summary: localizeText(locale, item.summary),
    proofPoints: item.proofPoints.map((point) => localizeText(locale, point)),
  }
}

function matchesSurface(itemSurface: PlatformSurface, surface: PlatformCatalogSurface) {
  if (surface === "all") return true
  if (itemSurface === "both") return true
  return itemSurface === surface
}

export const platformHubLinks: PlatformHubLink[] = [
  {
    slug: "capabilities",
    title: { zh: "能力中心", en: "Capabilities" },
    summary: { zh: "按文本、图片、视频、智能体统一查看平台能力。", en: "Browse the platform by text, image, video, and agent capabilities." },
    href: "/capabilities",
  },
  {
    slug: "agents",
    title: { zh: "智能体广场", en: "Agent Square" },
    summary: { zh: "查看可复用的营销智能体与企业角色编排。", en: "Browse reusable marketing agents and enterprise role orchestration." },
    href: "/agents",
  },
  {
    slug: "plugins",
    title: { zh: "插件目录", en: "Plugins" },
    summary: { zh: "统一管理图片、视频、知识、自动化扩展。", en: "Manage the extensions that attach image, video, knowledge, and automation capabilities." },
    href: "/plugins",
  },
  {
    slug: "mcp-services",
    title: { zh: "MCP 服务", en: "MCP Services" },
    summary: { zh: "整理外部能力接入点，先做目录与配置，后补执行平台。", en: "Expose external tool bridges through a registry-first MCP directory." },
    href: "/mcp-services",
  },
  {
    slug: "workflows",
    title: { zh: "工作流", en: "Workflows" },
    summary: { zh: "把反复出现的营销任务沉淀成可复用流程。", en: "Turn repeatable marketing work into reusable, visible workflow templates." },
    href: "/workflows",
  },
]

export const platformCapabilities: CapabilityDescriptor[] = [
  {
    slug: "ai-chat",
    kind: "text",
    status: "live",
    surface: "both",
    title: { zh: "AI 对话工作台", en: "AI Chat Workspace" },
    summary: {
      zh: "统一承接多模型对话、顾问入口、联网搜索和企业上下文。",
      en: "The shared chat surface for multi-model conversations, advisor entry, web search, and enterprise context.",
    },
    proofPoints: [
      { zh: "复用 ai-entry 现有能力", en: "Reuses the existing ai-entry runtime." },
      { zh: "可作为智能体执行入口", en: "Acts as the execution entry for agent-backed flows." },
      { zh: "适合企业工作台与登录后深度使用", en: "Fits both enterprise workspace and logged-in deep usage." },
    ],
    publicHref: "/tools/ai-chat",
    workspaceHref: "/dashboard/ai",
    bindings: [
      {
        provider: "pptoken",
        status: "active",
        note: { zh: "当前文本主路由之一。", en: "Current primary routing path for text models." },
      },
    ],
  },
  {
    slug: "ai-ppt",
    kind: "text",
    status: "live",
    surface: "both",
    title: { zh: "AI PPT", en: "AI PPT" },
    summary: {
      zh: "沿用现有 PPT 工具与 ppt-master 能力，向平台级预览、导出和模板化延展。",
      en: "Build on the current PPT tooling and ppt-master work to support platform-level preview, export, and templating.",
    },
    proofPoints: [
      { zh: "public 工具站已上线首版入口", en: "Already live as a first public toolsite entry." },
      { zh: "支持登录前预览、登录后导出", en: "Supports preview before login and export after login." },
      { zh: "后续承接企业级模板和品牌规范", en: "Ready to expand toward enterprise templates and brand systems." },
    ],
    publicHref: "/tools/ai-ppt-preview",
    workspaceHref: "/dashboard/capabilities?feature=ai-ppt",
    bindings: [
      {
        provider: "pptoken",
        status: "active",
        note: { zh: "当前 PPT 预览默认依赖文本 provider 路由。", en: "Current PPT preview uses the shared text provider routing." },
      },
    ],
  },
  {
    slug: "ai-image",
    kind: "image",
    status: "beta",
    surface: "both",
    title: { zh: "AI 绘图与设计助手", en: "AI Image and Design Assistant" },
    summary: {
      zh: "保留现有 image-assistant 工作台，向平台级图片能力目录、引用素材和企业工作流演进。",
      en: "Keep the current image assistant workspace while elevating it into a platform image capability with references and enterprise workflows.",
    },
    proofPoints: [
      { zh: "现有图片工作台可继续复用", en: "The existing image workspace remains reusable." },
      { zh: "支持 public 工具站承接图片入口", en: "Can feed public toolsite image entry points." },
      { zh: "后续目标是统一到图片/视频任务层", en: "Moves toward the shared image/video task runtime." },
    ],
    publicHref: "/tools/ai-image",
    workspaceHref: "/dashboard/image-assistant",
    bindings: [
      {
        provider: "runninghub",
        status: "planned",
        note: { zh: "文档定义中的目标图片任务通道。", en: "Target image task provider defined by the platform plan." },
      },
      {
        provider: "pptoken",
        status: "fallback",
        note: { zh: "现有图片 runtime 仍保留兼容链路。", en: "The current image runtime still keeps a compatible fallback path." },
      },
    ],
  },
  {
    slug: "ai-video",
    kind: "video",
    status: "beta",
    surface: "both",
    title: { zh: "AI 视频工作台", en: "AI Video Workspace" },
    summary: {
      zh: "基于现有视频生成工作台，扩展为平台级视频生成、视频编辑和分发前置入口。",
      en: "Extend the current video workspace into a platform surface for generation, editing, and distribution-adjacent entry points.",
    },
    proofPoints: [
      { zh: "保留现有 dashboard/video 入口", en: "Keeps the current dashboard/video entry." },
      { zh: "后续接文生视频、图生视频、数字人", en: "Ready to host text-to-video, image-to-video, and digital avatar flows." },
      { zh: "与企业工作流和多账号分发协同", en: "Built to coordinate with enterprise workflows and distribution pipelines." },
    ],
    publicHref: "/tools/ai-video",
    workspaceHref: "/dashboard/capabilities?workspace=media&feature=ai-video",
    bindings: [
      {
        provider: "runninghub",
        status: "planned",
        note: { zh: "作为统一视频任务层的目标通道。", en: "Target provider for the unified video task layer." },
      },
    ],
  },
  {
    slug: "ai-music",
    kind: "audio",
    status: "beta",
    surface: "both",
    title: { zh: "AI 音乐入口", en: "AI Music Entry" },
    summary: {
      zh: "为配乐、主题音乐、声音克隆和语音合成补齐统一入口，并通过 MiniMax 音频 runtime 承接真实执行。",
      en: "Adds one entry for soundtrack, voice cloning, and speech synthesis powered by the MiniMax audio runtime.",
    },
    proofPoints: [
      { zh: "新增独立 public tool 页面", en: "Ships as a dedicated public tool page." },
      { zh: "与图片/视频共用统一 media task adapter", en: "Shares the same media task adapter as image and video." },
      { zh: "通过 MiniMax 音频 provider 统一承接音色、语音和音乐任务", en: "Routes voice, speech, and music work through a unified MiniMax audio provider." },
    ],
    publicHref: "/tools/ai-music",
    workspaceHref: "/dashboard/capabilities?workspace=media&feature=ai-music",
    bindings: [
      {
        provider: "minimax",
        status: "active",
        note: { zh: "作为 shared media runtime 的音频执行 provider。", en: "Acts as the audio execution provider inside the shared media runtime." },
      },
    ],
  },
  {
    slug: "agent-platform",
    kind: "agent",
    status: "beta",
    surface: "both",
    title: { zh: "智能体中台", en: "Agent Platform" },
    summary: {
      zh: "以注册表优先的方式组织 Agent、插件、MCP、工作流，并复用现有执行能力。",
      en: "Organize agents, plugins, MCP services, and workflows with a registry-first approach backed by existing runtimes.",
    },
    proofPoints: [
      { zh: "先做目录、配置、绑定关系", en: "Starts with directory, configuration, and bindings." },
      { zh: "后续再补执行沙箱和高级编排", en: "Execution sandboxes and advanced orchestration come later." },
      { zh: "同时服务 public 广场与企业后台", en: "Serves both the public square and the enterprise workspace." },
    ],
    publicHref: "/agents",
    workspaceHref: "/dashboard/agent-platform",
    bindings: [
      {
        provider: "ai-entry",
        status: "active",
        note: { zh: "当前智能体执行主要复用 ai-entry。", en: "Current agent execution primarily reuses ai-entry." },
      },
    ],
  },
]

export const platformAgents: AgentCard[] = [
  {
    slug: "brand-strategy-agent",
    status: "live",
    surface: "both",
    title: { zh: "品牌策略 Agent", en: "Brand Strategy Agent" },
    summary: { zh: "围绕定位、品牌主张和传播框架进行策略协作。", en: "Supports positioning, brand proposition, and communications strategy." },
    proofPoints: [
      { zh: "复用现有 advisor / ai-entry 能力", en: "Builds on the existing advisor and ai-entry capabilities." },
      { zh: "适合企业方案、市场分析、品牌升级", en: "Fits enterprise planning, market analysis, and brand refresh work." },
    ],
    publicHref: "/agents/brand-strategy-agent",
    workspaceHref: "/dashboard/agent-platform",
    focus: { zh: "品牌与增长", en: "Brand and growth" },
  },
  {
    slug: "growth-marketing-agent",
    status: "live",
    surface: "both",
    title: { zh: "增长营销 Agent", en: "Growth Marketing Agent" },
    summary: { zh: "面向投放、增长实验、漏斗优化和 SEO 运营协作。", en: "Supports paid growth, experiments, funnel optimization, and SEO operations." },
    proofPoints: [
      { zh: "连接 public 工具站与企业工作台", en: "Bridges the public toolsite and enterprise workspace." },
      { zh: "适合工具获客、活动转化和内容协同", en: "Fits acquisition tooling, campaign conversion, and content coordination." },
    ],
    publicHref: "/agents/growth-marketing-agent",
    workspaceHref: "/dashboard/agent-platform",
    focus: { zh: "增长与获客", en: "Growth and acquisition" },
  },
  {
    slug: "public-relations-agent",
    status: "planned",
    surface: "both",
    title: { zh: "公共关系 Agent", en: "Public Relations Agent" },
    summary: { zh: "为舆情监控、对外口径和危机沟通预留入口。", en: "Reserves the entry point for sentiment monitoring, external comms, and crisis messaging." },
    proofPoints: [
      { zh: "本阶段只保留入口与 UI 交互", en: "Only the entry and UI surface are included in this phase." },
      { zh: "真实舆情能力在后续阶段实现", en: "The actual sentiment workflow lands in a later phase." },
    ],
    publicHref: "/agents",
    workspaceHref: "/dashboard/agent-platform",
    focus: { zh: "舆情与对外沟通", en: "Sentiment and external communications" },
  },
  {
    slug: "video-ops-agent",
    status: "planned",
    surface: "both",
    title: { zh: "视频运营 Agent", en: "Video Operations Agent" },
    summary: { zh: "为视频复刻、热点视频处理、分发协同保留骨架。", en: "Keeps a platform entry for video remake, trend handling, and distribution coordination." },
    proofPoints: [
      { zh: "视频复刻和热门视频检索暂不做真实 runtime", en: "Video remake and hot-video search stay deferred at runtime level." },
      { zh: "企业工作流入口会先保留", en: "The enterprise workflow entry remains in place first." },
    ],
    publicHref: "/agents",
    workspaceHref: "/dashboard/agent-platform",
    focus: { zh: "视频与分发", en: "Video and distribution" },
  },
]

export const platformPlugins: PluginDescriptor[] = [
  {
    slug: "writer-memory",
    status: "live",
    surface: "workspace",
    title: { zh: "Writer Memory", en: "Writer Memory" },
    summary: { zh: "把品牌语气、历史内容和灵感沉淀成可复用记忆层。", en: "Turns brand voice, prior content, and inspiration into reusable memory." },
    proofPoints: [
      { zh: "已可服务 writer 工作台", en: "Already supports the writer workspace." },
      { zh: "适合未来接入 Agent 和工作流", en: "Fits future agent and workflow bindings." },
    ],
    workspaceHref: "/dashboard/writer",
    integratesWith: { zh: "Writer / Agent", en: "Writer / Agent" },
  },
  {
    slug: "image-reference-assets",
    status: "beta",
    surface: "both",
    title: { zh: "素材引用插件", en: "Reference Asset Plugin" },
    summary: { zh: "统一管理设计参考图、品牌素材和图片工作流输入。", en: "Standardizes design references, brand assets, and image workflow inputs." },
    proofPoints: [
      { zh: "复用现有 image-assistant 资产逻辑", en: "Reuses the current image-assistant asset flow." },
      { zh: "可作为 public 与 enterprise 共用扩展层", en: "Works as a shared extension layer for public and enterprise surfaces." },
    ],
    publicHref: "/plugins",
    workspaceHref: "/dashboard/plugins",
    integratesWith: { zh: "Image / PPT / Workflows", en: "Image / PPT / Workflows" },
  },
  {
    slug: "web-search-connector",
    status: "planned",
    surface: "both",
    title: { zh: "联网搜索插件", en: "Web Search Connector" },
    summary: { zh: "把搜索增强、实时信息检索和内容引用纳入统一插件目录。", en: "Brings search augmentation and real-time retrieval into the shared plugin directory." },
    proofPoints: [
      { zh: "先做目录和配置，不做完整连接管理", en: "Starts as a directory and configuration surface, not full connection management." },
    ],
    publicHref: "/plugins",
    workspaceHref: "/dashboard/plugins",
    integratesWith: { zh: "AI 对话 / SEO / Agent", en: "AI Chat / SEO / Agent" },
  },
  {
    slug: "runninghub-media",
    status: "planned",
    surface: "both",
    title: { zh: "RunningHub 媒体插件", en: "RunningHub Media Plugin" },
    summary: { zh: "作为图片和视频统一任务层的目标插件位。", en: "Acts as the target plugin binding for the shared image and video task layer." },
    proofPoints: [
      { zh: "本阶段重点是 provider binding 和目录展示", en: "This phase focuses on provider bindings and directory presentation." },
    ],
    publicHref: "/plugins",
    workspaceHref: "/dashboard/plugins",
    integratesWith: { zh: "Image / Video", en: "Image / Video" },
  },
]

export const platformMcpServices: McpServiceDescriptor[] = [
  {
    slug: "web-search-mcp",
    status: "planned",
    surface: "both",
    title: { zh: "Web Search MCP", en: "Web Search MCP" },
    summary: { zh: "统一整理搜索类工具和实时信息源的 MCP 入口。", en: "Organizes search tools and real-time information sources under MCP registry." },
    proofPoints: [
      { zh: "先做目录、说明和绑定位", en: "Starts with directory, docs, and binding slots." },
    ],
    publicHref: "/mcp-services",
    workspaceHref: "/dashboard/mcp-services",
    serviceType: { zh: "搜索与检索", en: "Search and retrieval" },
  },
  {
    slug: "document-parsing-mcp",
    status: "beta",
    surface: "both",
    title: { zh: "Document Parsing MCP", en: "Document Parsing MCP" },
    summary: { zh: "面向文档理解、PPT、知识库和长内容解析的标准化入口。", en: "A standard bridge for document understanding, PPT, knowledge-base, and long-form parsing." },
    proofPoints: [
      { zh: "适合 AI PPT、知识库和企业资料接入", en: "Fits AI PPT, knowledge-base, and enterprise document ingestion." },
    ],
    publicHref: "/mcp-services",
    workspaceHref: "/dashboard/mcp-services",
    serviceType: { zh: "文档解析", en: "Document parsing" },
  },
  {
    slug: "design-context-mcp",
    status: "planned",
    surface: "workspace",
    title: { zh: "Design Context MCP", en: "Design Context MCP" },
    summary: { zh: "为设计稿、品牌规范和组件语境提供统一读取层。", en: "Provides a shared read layer for design files, brand guidelines, and component context." },
    proofPoints: [
      { zh: "先补中台配置，不做完整外部执行平台", en: "Ships as a registry/config surface before full external execution." },
    ],
    workspaceHref: "/dashboard/mcp-services",
    serviceType: { zh: "设计上下文", en: "Design context" },
  },
  {
    slug: "market-data-mcp",
    status: "planned",
    surface: "workspace",
    title: { zh: "Market Data MCP", en: "Market Data MCP" },
    summary: { zh: "为市场情报、趋势分析、行业数据预留接入点。", en: "Reserves a bridge for market intelligence, trend analysis, and sector data." },
    proofPoints: [
      { zh: "后续可衔接舆情监控与行业研究", en: "Can later power sentiment monitoring and industry research." },
    ],
    workspaceHref: "/dashboard/mcp-services",
    serviceType: { zh: "市场数据", en: "Market data" },
  },
]

export const platformWorkflowTemplates: WorkflowTemplate[] = [
  {
    slug: "campaign-launch",
    status: "beta",
    surface: "both",
    title: { zh: "Campaign Launch", en: "Campaign Launch" },
    summary: { zh: "从 brief、PPT、文案、图片到落地页的一条龙营销启动流程。", en: "A reusable launch flow from brief to PPT, copy, visuals, and landing pages." },
    proofPoints: [
      { zh: "适合 public 工具站向企业工作台升级", en: "Bridges the public toolsite into the enterprise workspace." },
      { zh: "能串联 AI 对话、PPT、Writer、Image", en: "Connects AI chat, PPT, writer, and image workflows." },
    ],
    publicHref: "/workflows",
    workspaceHref: "/dashboard/workflows",
    trigger: { zh: "营销 brief", en: "Marketing brief" },
  },
  {
    slug: "content-repurpose",
    status: "live",
    surface: "both",
    title: { zh: "Content Repurpose", en: "Content Repurpose" },
    summary: { zh: "把研究结论、文章、脚本和平台内容复用成多格式输出。", en: "Repurpose research, articles, scripts, and platform content into multiple outputs." },
    proofPoints: [
      { zh: "复用 writer 与 AI 对话能力", en: "Reuses writer and AI chat capabilities." },
      { zh: "适合作为 SEO 与社媒工作流模板", en: "Fits both SEO and social media workflow templates." },
    ],
    publicHref: "/workflows",
    workspaceHref: "/dashboard/workflows",
    trigger: { zh: "现有内容资产", en: "Existing content assets" },
  },
  {
    slug: "lead-to-outreach",
    status: "beta",
    surface: "workspace",
    title: { zh: "Lead-to-Outreach", en: "Lead-to-Outreach" },
    summary: { zh: "把 ICP、线索分层、外联文案与销售推进收敛成统一获客流程。", en: "Unify ICP mapping, lead tiering, outreach copy, and sales progression into one pipeline." },
    proofPoints: [
      { zh: "承接 enterprise workflow productization P0 模板。", en: "Implements the enterprise workflow productization P0 template." },
      { zh: "连接获客、外联与销售主流程。", en: "Connects pipeline, outbound, and sales execution." },
    ],
    workspaceHref: "/dashboard/workflows",
    trigger: { zh: "目标客户画像与产品说明", en: "ICP and offer brief" },
  },
  {
    slug: "visual-ad-pipeline",
    status: "planned",
    surface: "both",
    title: { zh: "Visual Ad Pipeline", en: "Visual Ad Pipeline" },
    summary: { zh: "把图片生成、素材引用、视频延展和广告版本测试串起来。", en: "Connects image generation, reference assets, video extension, and ad variation testing." },
    proofPoints: [
      { zh: "目标连接图片与视频任务层", en: "Targets the shared image and video task layer." },
    ],
    publicHref: "/workflows",
    workspaceHref: "/dashboard/workflows",
    trigger: { zh: "活动主题 + 品牌素材", en: "Campaign theme plus brand assets" },
  },
  {
    slug: "sales-proposal",
    status: "beta",
    surface: "workspace",
    title: { zh: "Sales Proposal", en: "Sales Proposal" },
    summary: { zh: "把赢单主题、提案结构、异议处理和高层材料收敛成统一销售提案流。", en: "Unifies win themes, proposal structure, objection handling, and executive packaging into one proposal workflow." },
    proofPoints: [
      { zh: "承接 enterprise workflow productization 的销售提案场景。", en: "Implements the sales-proposal scenario from enterprise workflow productization." },
      { zh: "可连接销售、法务和知识沉淀主流程。", en: "Connects sales, legal, and knowledge-retention flows." },
    ],
    workspaceHref: "/dashboard/workflows",
    trigger: { zh: "客户需求 brief", en: "Customer proposal brief" },
  },
  {
    slug: "paid-media-creative-pipeline",
    status: "beta",
    surface: "workspace",
    title: { zh: "Paid Media Creative Pipeline", en: "Paid Media Creative Pipeline" },
    summary: { zh: "把账户结构、创意测试、追踪 QA 和投放审计收敛成统一投放创意流水线。", en: "Brings account structure, creative testing, tracking QA, and paid-media audits into one delivery pipeline." },
    proofPoints: [
      { zh: "覆盖 P1 付费投放创意工作流。", en: "Covers the P1 paid-media creative workflow." },
      { zh: "能串联 PPC、Paid Social、Creative 和 Tracking。", en: "Connects PPC, paid social, creative, and tracking." },
    ],
    workspaceHref: "/dashboard/workflows",
    trigger: { zh: "Offer brief + 预算结构", en: "Offer brief plus budget structure" },
  },
  {
    slug: "seo-aeo-growth-engine",
    status: "beta",
    surface: "both",
    title: { zh: "SEO/AEO Growth Engine", en: "SEO/AEO Growth Engine" },
    summary: { zh: "把 SEO、AEO、AI 引用准备和内容改写放进同一条搜索增长主链路。", en: "Brings SEO, AEO, AI citation readiness, and content rewrites into one search-growth chain." },
    proofPoints: [
      { zh: "覆盖 P1 SEO/AEO Growth Engine 场景。", en: "Implements the P1 SEO/AEO Growth Engine scenario." },
      { zh: "可连接知识检索与知识写入节点。", en: "Connects explicit knowledge retrieve and write nodes." },
    ],
    publicHref: "/workflows",
    workspaceHref: "/dashboard/workflows",
    trigger: { zh: "搜索增长目标 + 内容资产", en: "Search growth goal plus content assets" },
  },
  {
    slug: "short-video-growth",
    status: "beta",
    surface: "workspace",
    title: { zh: "Short Video Growth", en: "Short Video Growth" },
    summary: { zh: "把短视频定位、脚本、样片和视频资产沉淀串成可复用增长流程。", en: "Connects short-form positioning, scripts, drafts, and video retention into a reusable growth workflow." },
    proofPoints: [
      { zh: "覆盖 P1 Short Video Growth 场景。", en: "Implements the P1 Short Video Growth scenario." },
      { zh: "连接短视频创意、生成和资产沉淀。", en: "Connects short-video ideation, generation, and asset retention." },
    ],
    workspaceHref: "/dashboard/workflows",
    trigger: { zh: "视频 brief + 参考素材", en: "Video brief plus source assets" },
  },
  {
    slug: "brand-asset-factory",
    status: "beta",
    surface: "workspace",
    title: { zh: "Brand Asset Factory", en: "Brand Asset Factory" },
    summary: { zh: "把品牌叙事、视觉方向、页面结构和资产归档沉淀成一条品牌资产工厂。", en: "Turns brand narrative, visual direction, page structure, and filing into one brand-asset factory." },
    proofPoints: [
      { zh: "覆盖 P1 品牌资产工厂场景。", en: "Implements the P1 brand-asset factory scenario." },
      { zh: "连接品牌、UI/UX 与资产治理。", en: "Connects brand, UI/UX, and asset governance." },
    ],
    workspaceHref: "/dashboard/workflows",
    trigger: { zh: "品牌 brief", en: "Brand brief" },
  },
  {
    slug: "reputation-guard",
    status: "planned",
    surface: "workspace",
    title: { zh: "Reputation Guard", en: "Reputation Guard" },
    summary: { zh: "为舆情监控与公共关系响应保留后续企业工作流。", en: "Reserves the enterprise workflow entry for sentiment monitoring and PR response." },
    proofPoints: [
      { zh: "本阶段只保留工作流模板与说明", en: "This phase ships only the template and explanation." },
    ],
    workspaceHref: "/dashboard/workflows",
    trigger: { zh: "品牌舆情事件", en: "Brand reputation signal" },
  },
  {
    slug: "compliance-review",
    status: "planned",
    surface: "workspace",
    title: { zh: "Compliance Review", en: "Compliance Review" },
    summary: { zh: "把控制目标、隐私审查、行业规则和替代表达沉淀为可追踪合规流。", en: "Turns control objectives, privacy review, sector rules, and safer alternatives into a traceable compliance workflow." },
    proofPoints: [
      { zh: "覆盖 P2 合规审查工作流。", en: "Implements the P2 compliance-review workflow." },
      { zh: "显式保留知识节点与审计沉淀。", en: "Keeps explicit knowledge nodes and audit retention in the flow." },
    ],
    workspaceHref: "/dashboard/workflows",
    trigger: { zh: "审查材料 + 风险目标", en: "Review material plus risk goal" },
  },
  {
    slug: "training-enablement",
    status: "planned",
    surface: "workspace",
    title: { zh: "Training Enablement", en: "Training Enablement" },
    summary: { zh: "把 SOP、课程结构、练习任务和培训评估串成培训赋能主流程。", en: "Turns SOPs, curriculum design, practice tasks, and assessment into one enablement workflow." },
    proofPoints: [
      { zh: "覆盖 P2 培训赋能工作流。", en: "Implements the P2 training-enablement workflow." },
      { zh: "可连接资料输入、课程输出和知识沉淀。", en: "Connects material intake, course outputs, and knowledge retention." },
    ],
    workspaceHref: "/dashboard/workflows",
    trigger: { zh: "SOP / 培训资料", en: "SOP or training materials" },
  },
  {
    slug: "knowledge-asset-loop",
    status: "beta",
    surface: "workspace",
    title: { zh: "Knowledge Asset Loop", en: "Knowledge Asset Loop" },
    summary: { zh: "把最近的内容、素材和视频输出重新整理、升格、归档并写回知识库。", en: "Reorganizes recent content, creative, and video outputs, promotes them, archives them, and writes them back into knowledge." },
    proofPoints: [
      { zh: "覆盖 P2 知识资产沉淀工作流。", en: "Implements the P2 knowledge-asset-loop workflow." },
      { zh: "补齐素材库、作品库和知识库闭环。", en: "Closes the loop across asset, work, and knowledge libraries." },
    ],
    workspaceHref: "/dashboard/workflows",
    trigger: { zh: "最近输出 + 归档目标", en: "Recent outputs plus retention goal" },
  },
]

export function getLocalizedPlatformHubLinks(locale: AppLocale) {
  return platformHubLinks.map((item) => ({
    ...item,
    title: localizeText(locale, item.title),
    summary: localizeText(locale, item.summary),
  }))
}

export function getLocalizedPlatformCapabilities(locale: AppLocale, surface: PlatformCatalogSurface = "all") {
  return platformCapabilities
    .filter((item) => matchesSurface(item.surface, surface))
    .map((item) => ({
    ...localizeBase(locale, item),
    bindings: item.bindings.map((binding) => ({
      ...binding,
      note: localizeText(locale, binding.note),
    })),
  })) satisfies LocalizedCapabilityDescriptor[]
}

export function getLocalizedPlatformCapabilityBySlug(locale: AppLocale, slug: string) {
  return getLocalizedPlatformCapabilities(locale, "all").find((item) => item.slug === slug) || null
}

export function getLocalizedPlatformAgents(locale: AppLocale, surface: PlatformCatalogSurface = "all") {
  return platformAgents
    .filter((item) => matchesSurface(item.surface, surface))
    .map((item) => ({
    ...localizeBase(locale, item),
    focus: localizeText(locale, item.focus),
  })) satisfies LocalizedAgentCard[]
}

export function getLocalizedPlatformAgentBySlug(locale: AppLocale, slug: string) {
  return getLocalizedPlatformAgents(locale, "all").find((item) => item.slug === slug) || null
}

export function getLocalizedPlatformPlugins(locale: AppLocale, surface: PlatformCatalogSurface = "all") {
  return platformPlugins
    .filter((item) => matchesSurface(item.surface, surface))
    .map((item) => ({
    ...localizeBase(locale, item),
    integratesWith: localizeText(locale, item.integratesWith),
  })) satisfies LocalizedPluginDescriptor[]
}

export function getLocalizedPlatformPluginBySlug(locale: AppLocale, slug: string) {
  return getLocalizedPlatformPlugins(locale, "all").find((item) => item.slug === slug) || null
}

export function getLocalizedPlatformMcpServices(locale: AppLocale, surface: PlatformCatalogSurface = "all") {
  return platformMcpServices
    .filter((item) => matchesSurface(item.surface, surface))
    .map((item) => ({
    ...localizeBase(locale, item),
    serviceType: localizeText(locale, item.serviceType),
  })) satisfies LocalizedMcpServiceDescriptor[]
}

export function getLocalizedPlatformMcpServiceBySlug(locale: AppLocale, slug: string) {
  return getLocalizedPlatformMcpServices(locale, "all").find((item) => item.slug === slug) || null
}

export function getLocalizedPlatformWorkflows(locale: AppLocale, surface: PlatformCatalogSurface = "all") {
  return platformWorkflowTemplates
    .filter((item) => matchesSurface(item.surface, surface))
    .map((item) => ({
    ...localizeBase(locale, item),
    trigger: localizeText(locale, item.trigger),
  })) satisfies LocalizedWorkflowTemplate[]
}

export function getLocalizedPlatformWorkflowBySlug(locale: AppLocale, slug: string) {
  return getLocalizedPlatformWorkflows(locale, "all").find((item) => item.slug === slug) || null
}

export function getLocalizedPlatformCatalog(locale: AppLocale, surface: PlatformCatalogSurface = "all") {
  return {
    hubs: getLocalizedPlatformHubLinks(locale),
    capabilities: getLocalizedPlatformCapabilities(locale, surface),
    agents: getLocalizedPlatformAgents(locale, surface),
    plugins: getLocalizedPlatformPlugins(locale, surface),
    mcpServices: getLocalizedPlatformMcpServices(locale, surface),
    workflows: getLocalizedPlatformWorkflows(locale, surface),
  }
}

export function getPublicPlatformPaths() {
  const hubPaths = ["/agents", "/capabilities", "/plugins", "/mcp-services", "/workflows"]

  const detailPaths = [
    ...platformCapabilities
      .filter((item) => matchesSurface(item.surface, "public"))
      .map((item) => `/capabilities/${item.slug}`),
    ...platformAgents
      .filter((item) => matchesSurface(item.surface, "public"))
      .map((item) => `/agents/${item.slug}`),
    ...platformPlugins
      .filter((item) => matchesSurface(item.surface, "public"))
      .map((item) => `/plugins/${item.slug}`),
    ...platformMcpServices
      .filter((item) => matchesSurface(item.surface, "public"))
      .map((item) => `/mcp-services/${item.slug}`),
    ...platformWorkflowTemplates
      .filter((item) => matchesSurface(item.surface, "public"))
      .map((item) => `/workflows/${item.slug}`),
  ]

  return [...new Set([...hubPaths, ...detailPaths])]
}
