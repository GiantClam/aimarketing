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

export type LeadToolContentSection = {
  heading: string
  body: string[]
}

export type LeadToolRelatedLink = {
  href: string
  label: string
  description: string
}

export type LeadToolCta = {
  label: string
  href: string
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
  contentSections?: LeadToolContentSection[]
  relatedLinks?: LeadToolRelatedLink[]
  primaryCta?: LeadToolCta
  secondaryCta?: LeadToolCta
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
    previewModel: "pptoken + enterprise routing",
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
    name: "AI PPT 生成器",
    shortName: "AI PPT",
    tagline: "输入主题，按模板生成 4 个正式候选；页数可指定，也可交给 AI 自动规划。",
    description:
      "面向 SEO 引流与首页转化的正式 AI PPT 工具。游客先看到 4 个可对比的 HTML Slides 候选，可选模板、手填页数或留空让 AI 自动规划，再在登录后继续打开和下载 HTML 成品。",
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
    proofPoints: ["4 个候选并排预览", "模板可切换，页数可手填或交给 AI", "登录前即可预览，登录后继续打开与下载 HTML 成品"],
    faqs: [
      {
        question: "需要先登录才能看到结果吗？",
        answer: "不需要。游客可以直接生成并比较 4 个候选版本，登录只在打开或下载 HTML 成品时触发。",
      },
      {
        question: "可以自己选模板和页数吗？",
        answer: "可以。你可以在自动四模板和单模板四叙事之间切换，手动填写 4-20 页，或者留空让 AI 先规划实际页数。",
      },
      {
        question: "为什么一次给 4 个候选？",
        answer: "因为正式 PPT 的关键不是只生成一份，而是先比较 4 个模板或 4 个叙事角度，快速判断哪条表达路线最值得继续。",
      },
      {
        question: "为什么先做 HTML 预览，而不是直接下载 PPTX？",
        answer: "因为当前 frontend-slides 运行时原生输出就是 HTML。它更快，也更适合先验证模板、文案和页数规划是否正确。",
      },
    ],
  },
  {
    slug: "ai-image",
    name: "AI Image Tool for Branding Teams",
    shortName: "AI Image Tool",
    tagline: "Create campaign visuals, brand references, and marketing images from one shared workspace.",
    description:
      "Create campaign visuals, brand references, and marketing images from one shared AI workspace built for branding and marketing teams.",
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
    proofPoints: ["Create on-brand campaign visuals", "Reuse brand references and image prompts", "Continue in the shared image workspace"],
    faqs: [
      {
        question: "What can branding teams create with this AI image tool?",
        answer: "Use it for campaign visuals, brand references, image variations, and marketing assets that need the same brand context across a team.",
      },
      {
        question: "Can I use brand references with the image tool?",
        answer: "Yes. The public entry is designed to continue into the existing image-assistant workspace, where teams can keep references and task context together.",
      },
      {
        question: "Is this an image generator or a full design workspace?",
        answer: "It is the public entry to the existing image workspace, so teams can move from image generation into reference, editing, and review workflows instead of stopping at one prompt.",
      },
    ],
    contentSections: [
      {
        heading: "Create on-brand campaign visuals",
        body: [
          "Start with the campaign goal, audience, format, and brand direction instead of a generic image prompt. This helps the team produce visuals that fit the launch rather than isolated images that need to be rebuilt later.",
        ],
      },
      {
        heading: "Use brand references and image prompts",
        body: [
          "Keep reference images, creative direction, and prompt decisions close to the task so designers and marketers can review the same visual context before publishing.",
        ],
      },
      {
        heading: "AI image tool vs generic image generators",
        body: [
          "A generic generator can create an image quickly. A team workspace becomes more useful when the output must stay connected to brand context, campaign assets, and the next review or editing step.",
        ],
      },
    ],
    relatedLinks: [
      {
        href: "/use-cases/ai-workspace-for-marketing-teams",
        label: "AI Workspace for Marketing Teams",
        description: "See how image work fits into a shared content, research, and campaign workflow.",
      },
      {
        href: "/agents/image-generation-agent",
        label: "Image Generation Agent",
        description: "Use a structured agent workflow when the visual brief needs reusable brand context.",
      },
      {
        href: "/pricing",
        label: "AI Marketing pricing",
        description: "Review the workspace path before consolidating image and marketing tools.",
      },
    ],
    primaryCta: {
      label: "Create campaign visuals",
      href: "/dashboard/image-assistant",
    },
    secondaryCta: {
      label: "See the marketing workspace",
      href: "/use-cases/ai-workspace-for-marketing-teams",
    },
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
    proofPoints: ["统一视频入口", "覆盖 4 个已上线视频流", "保留现有 dashboard/video runtime"],
    faqs: [
      {
        question: "当前视频工作台支持哪些能力？",
        answer: "当前只开放文生视频、图生视频、口播数字人和视频高清化四个入口，都会统一进入现有视频工作台异步执行。",
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
    slug: "content-brief-generator",
    name: "Content Brief Generator",
    shortName: "Content Brief",
    tagline: "Turn one topic, audience, and goal into a structured SEO-ready content brief.",
    description:
      "Create a reusable content brief with sections, proof points, FAQs, CTA direction, and internal-link ideas before the draft starts.",
    category: "SEO",
    icon: "seo",
    media: "seo",
    scenes: ["seo_growth", "content_creation", "research_analysis"],
    href: "/tools/content-brief-generator",
    status: "live",
    accessMode: "guest",
    previewEnabled: false,
    downloadRequiresLogin: false,
    finalizeRequiresLogin: false,
    previewModel: getLeadToolPreviewModel("ai-seo-meta-generator"),
    finalModel: "ai-seo-meta-generator + AI chat workflow",
    proofPoints: ["Build briefs before drafting", "Plan sections, FAQs, and internal links", "Route directly into SEO production workflows"],
    faqs: [
      {
        question: "Does this replace the writer or the article workflow?",
        answer: "No. This page is the planning layer. It helps teams create a stronger brief before moving into drafting or SEO review.",
      },
      {
        question: "What should I prepare before using a content brief generator?",
        answer: "The main topic, search intent, audience, business goal, and any proof or internal links the page should include.",
      },
    ],
    contentSections: [
      {
        heading: "What this generator should produce",
        body: [
          "A good content brief should capture the keyword, audience, intent, page angle, required sections, proof, FAQs, and CTA path before the team starts drafting.",
          "That makes the brief useful for outlines, title ideas, SEO reviews, and internal-link planning instead of acting like a simple note.",
        ],
      },
      {
        heading: "How teams use it inside the current product",
        body: [
          "Use the brief as the shared context, then move into the AI SEO Meta Generator for title and description directions or into AI Chat and the SEO article workflow for a fuller draft.",
        ],
      },
    ],
    relatedLinks: [
      {
        href: "/resources/what-is-a-content-brief",
        label: "What Is a Content Brief?",
        description: "Read the guide before turning the concept into a reusable template or workflow.",
      },
      {
        href: "/tools/ai-seo-meta-generator",
        label: "AI SEO Meta Generator",
        description: "Generate title and description variants from the same brief once the page structure is clear.",
      },
      {
        href: "/agents/seo-article-agent",
        label: "SEO Article Agent",
        description: "Move from planning into a more structured article workflow with review context.",
      },
    ],
    primaryCta: {
      label: "Generate meta from your brief",
      href: "/tools/ai-seo-meta-generator",
    },
    secondaryCta: {
      label: "Open the SEO workflow",
      href: "/use-cases/ai-workspace-for-seo-teams",
    },
  },
  {
    slug: "product-description-generator",
    name: "Product Description Generator",
    shortName: "Product Description",
    tagline: "Create sharper ecommerce and marketing product descriptions from one product brief.",
    description:
      "Turn product details, audience, and offer positioning into product descriptions for ecommerce pages, campaigns, and launch assets.",
    category: "SEO",
    icon: "seo",
    media: "seo",
    scenes: ["content_creation", "lead_generation", "brand_strategy"],
    href: "/tools/product-description-generator",
    status: "live",
    accessMode: "workspace_entry",
    previewEnabled: false,
    downloadRequiresLogin: false,
    finalizeRequiresLogin: false,
    previewModel: "AI chat + copy workflow",
    finalModel: "website-copy-agent",
    proofPoints: ["Built for ecommerce and landing pages", "Connects product proof to clearer copy", "Works with examples and website-copy workflows"],
    faqs: [
      {
        question: "Can this help with ecommerce product pages and ads?",
        answer: "Yes. The same product context can be used for marketplace descriptions, landing-page sections, and campaign copy variants.",
      },
      {
        question: "What input matters most?",
        answer: "Use product facts, audience pain points, proof, tone, and the action the reader should take next.",
      },
    ],
    contentSections: [
      {
        heading: "What a strong product description needs",
        body: [
          "The best descriptions explain what the product is, why it matters to the buyer, and what proof supports the claim. They should also match the channel, whether the copy is for ecommerce, a landing page, or a launch email.",
        ],
      },
      {
        heading: "How to use the current product stack",
        body: [
          "Use AI Chat or the website-copy workflow to draft multiple variants, then compare them against examples and the final page goal before publishing.",
        ],
      },
    ],
    relatedLinks: [
      {
        href: "/tools/product-description-generator/examples/product-description-examples",
        label: "Product Description Examples",
        description: "Review example angles before drafting your own ecommerce or campaign version.",
      },
      {
        href: "/agents/website-copy-agent",
        label: "Website Copy Agent",
        description: "Turn product notes into a more structured page-level copy workflow.",
      },
      {
        href: "/use-cases/ai-workspace-for-marketing-teams",
        label: "AI Workspace for Marketing Teams",
        description: "See how teams keep product messaging, proof, and review context in one place.",
      },
    ],
    primaryCta: {
      label: "Open AI Chat for copy drafting",
      href: "/tools/ai-chat",
    },
    secondaryCta: {
      label: "See product description examples",
      href: "/tools/product-description-generator/examples/product-description-examples",
    },
  },
  {
    slug: "press-release-generator",
    name: "Press Release Generator",
    shortName: "Press Release",
    tagline: "Draft structured press releases with launch context, proof, and a stronger narrative arc.",
    description:
      "Use one release brief to generate launch announcements, product updates, funding stories, and campaign-led press release drafts.",
    category: "SEO",
    icon: "seo",
    media: "seo",
    scenes: ["content_creation", "campaign_launch", "brand_strategy"],
    href: "/tools/press-release-generator",
    status: "live",
    accessMode: "workspace_entry",
    previewEnabled: false,
    downloadRequiresLogin: false,
    finalizeRequiresLogin: false,
    previewModel: "AI chat + website copy workflow",
    finalModel: "growth-marketing-agent",
    proofPoints: ["Structured for launch narratives", "Supports examples, templates, and final copy", "Routes into broader campaign workflows"],
    faqs: [
      {
        question: "Is this best for launch news only?",
        answer: "No. The same structure can support product updates, partnerships, executive announcements, and campaign-led releases.",
      },
      {
        question: "What makes press release drafts stronger?",
        answer: "A clear announcement angle, supporting proof, audience context, quotes, and a realistic next step for the reader.",
      },
    ],
    contentSections: [
      {
        heading: "What this page should help teams do",
        body: [
          "A press release generator should help the team move from announcement context into a structured narrative that includes the key angle, supporting evidence, and quote-ready points.",
        ],
      },
      {
        heading: "How to turn the page into real output",
        body: [
          "Use the examples first, then draft inside AI Chat or a copy workflow so the same announcement context can continue into the final campaign assets.",
        ],
      },
    ],
    relatedLinks: [
      {
        href: "/tools/press-release-generator/examples/press-release-examples",
        label: "Press Release Examples",
        description: "Use scenario-based examples to choose the right release structure before writing.",
      },
      {
        href: "/agents/growth-marketing-agent",
        label: "Growth Marketing Agent",
        description: "Carry the same launch context into channel plans, campaign copy, and follow-up assets.",
      },
      {
        href: "/agents/website-copy-agent",
        label: "Website Copy Agent",
        description: "Reuse the announcement narrative in landing pages and product messaging after the release is drafted.",
      },
    ],
    primaryCta: {
      label: "Draft with AI Chat",
      href: "/tools/ai-chat",
    },
    secondaryCta: {
      label: "Browse press release examples",
      href: "/tools/press-release-generator/examples/press-release-examples",
    },
  },
  {
    slug: "bio-generator",
    name: "Bio Generator",
    shortName: "Bio Generator",
    tagline: "Generate personal, founder, team, and speaker bios with clearer positioning.",
    description:
      "Create bios for websites, social profiles, speaker pages, and brand introductions using the same positioning brief.",
    category: "SEO",
    icon: "seo",
    media: "seo",
    scenes: ["content_creation", "brand_strategy", "lead_generation"],
    href: "/tools/bio-generator",
    status: "live",
    accessMode: "workspace_entry",
    previewEnabled: false,
    downloadRequiresLogin: false,
    finalizeRequiresLogin: false,
    previewModel: "AI chat + brand workflow",
    finalModel: "brand-strategy-agent",
    proofPoints: ["Works for founder, team, and speaker bios", "Keeps positioning and tone consistent", "Supports examples for profile rewrites"],
    faqs: [
      {
        question: "Can one bio brief support different channels?",
        answer: "Yes. Teams often reuse the same positioning notes for website bios, LinkedIn summaries, and speaker intros with channel-specific length changes.",
      },
      {
        question: "What improves bio quality the most?",
        answer: "Use role context, proof, target audience, differentiators, and the tone the bio should project.",
      },
    ],
    contentSections: [
      {
        heading: "What makes a bio useful",
        body: [
          "A strong bio quickly explains who the person or team is, why their work matters, and what proof or differentiator supports the claim. The format changes by channel, but the positioning logic should stay consistent.",
        ],
      },
      {
        heading: "Where this fits in the current workflow",
        body: [
          "Start with the positioning brief, review examples, then use AI Chat or a brand workflow to create channel-specific versions without rewriting the whole story from zero.",
        ],
      },
    ],
    relatedLinks: [
      {
        href: "/tools/bio-generator/examples/bio-examples",
        label: "Bio Examples",
        description: "Review short, medium, and profile-style bio patterns before drafting your own.",
      },
      {
        href: "/tools/bio-generator/examples/linkedin-headline-examples",
        label: "LinkedIn Headline Examples",
        description: "Use tighter examples when the profile needs a stronger hook in fewer words.",
      },
      {
        href: "/agents/brand-strategy-agent",
        label: "Brand Strategy Agent",
        description: "Turn raw background notes into clearer positioning before drafting the final bio.",
      },
    ],
    primaryCta: {
      label: "Open AI Chat for bio drafting",
      href: "/tools/ai-chat",
    },
    secondaryCta: {
      label: "See bio examples",
      href: "/tools/bio-generator/examples/bio-examples",
    },
  },
  {
    slug: "seo-title-generator",
    name: "Free SEO Title Generator",
    shortName: "SEO Title",
    tagline: "Create SEO title ideas from any keyword, page type, and audience.",
    description:
      "Generate SEO title ideas for blog posts, landing pages, tools, and comparison pages. Enter a keyword and get copy-ready title options in seconds.",
    category: "SEO",
    icon: "seo",
    media: "seo",
    scenes: ["seo_growth", "content_creation", "research_analysis"],
    href: "/tools/seo-title-generator",
    status: "live",
    accessMode: "guest",
    previewEnabled: false,
    downloadRequiresLogin: false,
    finalizeRequiresLogin: false,
    previewModel: getLeadToolPreviewModel("ai-seo-meta-generator"),
    finalModel: getLeadToolFinalModel("ai-seo-meta-generator"),
    proofPoints: ["Multiple title angles per keyword", "Fits blog, tool, and compare pages", "Copy-ready titles, H1s, and meta directions"],
    faqs: [
      {
        question: "How long should an SEO title be?",
        answer: "Aim for a clear, specific title that fits the page intent and usually stays close to the visible search result width. Review the final title in context rather than relying on a character count alone.",
      },
      {
        question: "Is an SEO title the same as a meta title?",
        answer: "They usually refer to the same title-tag field shown to search engines, while the on-page H1 can be slightly different when the page needs a more natural reading headline.",
      },
      {
        question: "How do I write an SEO title users will click?",
        answer: "Match the search intent, make the outcome concrete, use the important keyword naturally, and give the searcher a specific reason to choose the result without overpromising.",
      },
      {
        question: "How is this different from a generic headline generator?",
        answer: "It generates title directions around search intent, page type, audience, and click clarity instead of optimizing only for a catchy headline.",
      },
      {
        question: "Should I generate titles before or after the content brief?",
        answer: "Generate them after the brief is clear but before the draft is finalized, so the title reflects the intended structure and next action.",
      },
    ],
    contentSections: [
      {
        heading: "What a strong SEO title should do",
        body: [
          "A strong title should match the searcher's intent, signal the page angle quickly, and avoid overpromising what the content will deliver. The best variants also reflect the page type, such as a guide, generator, comparison, or examples page.",
        ],
      },
      {
        heading: "How to use this with existing tools",
        body: [
          "Use the AI SEO Meta Generator when you want titles and descriptions together, or start here when your team specifically needs SEO title variants for programmatic pages and landing pages.",
        ],
      },
    ],
    relatedLinks: [
      {
        href: "/tools/ai-seo-meta-generator",
        label: "AI SEO Meta Generator",
        description: "Expand title ideas into descriptions and structural page guidance in the same workflow.",
      },
      {
        href: "/resources/aida-marketing",
        label: "AIDA Marketing",
        description: "Use message-flow logic when title variations need stronger positioning and CTA relevance.",
      },
      {
        href: "/resources/what-is-a-content-brief",
        label: "What Is a Content Brief?",
        description: "Start from the brief when the page angle is still unclear and titles feel too generic.",
      },
    ],
    primaryCta: {
      label: "Generate titles and meta",
      href: "/tools/ai-seo-meta-generator",
    },
    secondaryCta: {
      label: "Plan the content brief first",
      href: "/tools/content-brief-generator",
    },
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
const HIDDEN_VIDEO_TOOL_SLUGS = new Set(["video-remake-studio", "hot-video-research"])

export function getLeadToolBySlug(slug: string) {
  if (HIDDEN_VIDEO_TOOL_SLUGS.has(slug)) {
    return undefined
  }
  return leadToolsCatalog.find((tool) => tool.slug === slug)
}

export function getLeadToolPaths() {
  return leadToolsCatalog.filter((tool) => !HIDDEN_VIDEO_TOOL_SLUGS.has(tool.slug)).map((tool) => tool.href)
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
      name: "AI PPT 生成器",
      shortName: "AI PPT",
      tagline: "输入主题，按模板生成 4 个正式候选；页数可指定，也可交给 AI 自动规划。",
      description: "先生成 4 个正式 HTML Slides 候选，再继续比较模板、页数规划和叙事角度，最后进入打开、下载与完整导出。",
      proofPoints: ["4 个候选并排预览", "模板可切换，页数可手填或交给 AI", "登录前即可预览，登录后继续下载与完整导出"],
      faqs: [
        {
          question: "需要先登录才能看到结果吗？",
          answer: "不需要。游客可以直接生成并比较 4 个候选版本，登录只在下载、打开受保护成品和完整导出时触发。",
        },
        {
          question: "可以自己选模板和页数吗？",
          answer: "可以。你可以在自动四模板和单模板四叙事之间切换，手动填写 4-20 页，或者留空让 AI 先规划实际页数。",
        },
        {
          question: "为什么一次给 4 个候选？",
          answer: "因为正式 PPT 的关键不是只生成一份，而是先比较 4 个模板或 4 个叙事角度，快速判断哪条表达路线最值得继续。",
        },
        {
          question: "为什么先做 HTML 预览，而不是直接下载 PPTX？",
          answer: "HTML 预览更快出现，能先验证模板、文案和页数规划是否正确，再进入登录后的下载和完整导出链路。",
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
    "content-brief-generator": {
      name: "内容简报生成器",
      shortName: "内容简报",
      tagline: "把主题、受众和目标整理成可执行的 SEO 内容简报。",
      description: "先产出结构化 brief，再继续生成标题、描述、FAQ 和内链方向。",
      proofPoints: ["写作前先统一 brief", "支持章节、FAQ 与内链规划", "可直接导向 SEO 生产流程"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "content-brief-generator")?.faqs ?? [],
    },
    "product-description-generator": {
      name: "产品描述生成器",
      shortName: "产品描述",
      tagline: "基于产品信息快速生成电商与营销场景的描述文案。",
      description: "把产品卖点、受众和证据整理成适合商品页、落地页和活动页的描述。",
      proofPoints: ["适合电商与落地页", "让产品证据更清楚", "可衔接示例页与文案工作流"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "product-description-generator")?.faqs ?? [],
    },
    "press-release-generator": {
      name: "新闻稿生成器",
      shortName: "新闻稿",
      tagline: "围绕发布背景、证据和叙事线生成结构化新闻稿草案。",
      description: "适合产品发布、合作公告、融资动态和活动传播场景的新闻稿起草。",
      proofPoints: ["适合发布型叙事", "支持示例与模板回看", "可继续导向 campaign 工作流"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "press-release-generator")?.faqs ?? [],
    },
    "bio-generator": {
      name: "个人简介生成器",
      shortName: "个人简介",
      tagline: "生成适合官网、社媒、演讲者介绍和团队页的 bio 文案。",
      description: "用同一份定位 brief 生成个人、创始人、团队和 speaker bio。",
      proofPoints: ["适合个人与团队介绍", "保持定位与语气一致", "支持示例页改写"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "bio-generator")?.faqs ?? [],
    },
    "seo-title-generator": {
      name: "免费 SEO 标题生成器",
      shortName: "SEO 标题",
      tagline: "围绕关键词、页面类型和受众快速生成多组 SEO 标题方向。",
      description: "输入关键词即可为文章、落地页、工具页和对比页生成可直接使用的 SEO 标题选项。",
      proofPoints: ["一个关键词多种标题角度", "覆盖文章、工具与对比页", "可直接复制标题、H1 与 Meta 方向"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "seo-title-generator")?.faqs ?? [],
    },
    "ai-image": {
      name: "面向品牌团队的 AI 图片工具",
      shortName: "AI 图片工具",
      tagline: "在一个共享工作台中创建 campaign 视觉、品牌参考图和营销图片。",
      description: "面向品牌与营销团队，在一个共享 AI 工作台中创建 campaign 视觉、品牌参考图和营销图片。",
      proofPoints: ["创建符合品牌的 campaign 视觉", "复用品牌参考图与图片提示词", "继续进入共享图片工作台"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "ai-image")?.faqs ?? [],
    },
    "ai-video": {
      name: "AI 视频工作台入口",
      shortName: "AI 视频",
      tagline: "从 public toolsite 进入视频生成与媒体工作流。",
      description: "公开承接 AI 视频能力，让用户先理解视频生成入口，再逐步进入现有 dashboard/video 的正式流程。",
      proofPoints: ["统一视频入口", "覆盖 4 个已上线视频流", "保留现有 dashboard/video runtime"],
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
      name: "AI PPT Generator",
      shortName: "AI PPT",
      tagline: "Enter one topic, pick a template flow, and get four formal candidates with manual or AI-planned page counts.",
      description:
        "Generate four formal HTML Slides candidates first, compare template choices, narrative directions, and resolved page counts, then continue into protected open and HTML download actions.",
      proofPoints: ["4 candidates side by side", "Template choice plus manual or AI page planning", "Preview before login, continue open and HTML download after login"],
      faqs: [
        {
          question: "Do I need to log in before seeing results?",
          answer: "No. Visitors can generate and compare all four candidates first. Login is only required for protected open and HTML download follow-up actions.",
        },
        {
          question: "Can I choose the template and page count?",
          answer: "Yes. You can switch between auto-four-template mode and single-template four-narrative mode, enter any page count from 4 to 20, or leave it blank and let AI resolve the slide count.",
        },
        {
          question: "Why generate four candidates instead of one?",
          answer: "Because the fastest path to a strong deck is comparing four template or narrative options up front, then continuing with the direction that actually reads best.",
        },
        {
          question: "Why preview in HTML before exporting PPTX?",
          answer: "Because the current frontend-slides runtime natively outputs HTML. It lands faster and is the real downloadable artifact for this preview flow.",
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
      name: "AI Image Tool for Branding Teams",
      shortName: "AI Image Tool",
      tagline: "Create campaign visuals, brand references, and marketing images from one shared workspace.",
      description: "Create campaign visuals, brand references, and marketing images from one shared AI workspace built for branding and marketing teams.",
      proofPoints: ["Create on-brand campaign visuals", "Reuse brand references and image prompts", "Continue in the shared image workspace"],
      faqs: leadToolsCatalog.find((tool) => tool.slug === "ai-image")?.faqs ?? [],
    },
    "ai-video": {
      name: "AI Video Workspace Entry",
      shortName: "AI Video",
      tagline: "Route public-toolsite visitors into video generation and media workflows.",
      description: "Creates a clear public landing path for the four shipped video flows before handing users into the existing dashboard/video runtime.",
      proofPoints: ["Unified video entry", "Covers the 4 shipped video flows", "Keeps the current dashboard/video runtime"],
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
  return leadToolsCatalog
    .filter((tool) => !HIDDEN_VIDEO_TOOL_SLUGS.has(tool.slug))
    .map((tool) => localizeLeadTool(tool, locale))
}

export function getLocalizedLeadToolBySlug(slug: string, locale: AppLocale) {
  const tool = getLeadToolBySlug(slug)
  return tool ? localizeLeadTool(tool, locale) : undefined
}
