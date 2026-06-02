import type { AppLocale } from "@/lib/i18n/config"
import { getLeadToolFinalModel, getLeadToolPreviewModel } from "@/lib/lead-tools/config"

export type LeadToolStatus = "live" | "coming_soon"

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
  icon: "presentation" | "seo" | "ads" | "email"
  href: string
  status: LeadToolStatus
  featured?: boolean
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
    slug: "ai-ppt-preview",
    name: "AI PPT 快速预览",
    shortName: "PPT 预览",
    tagline: "输入一个主题，并发获得 4 种高质量 HTML Slides 预览版本。",
    description:
      "面向 SEO 引流与首页转化的首个样板工具。先并发生成 4 个差异明显的 HTML Slides 方案，再在高价值动作上触发登录和下载。",
    category: "Presentation",
    icon: "presentation",
    href: "/tools/ai-ppt-preview",
    status: "live",
    featured: true,
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
    slug: "ai-seo-meta-generator",
    name: "AI SEO Meta 生成器",
    shortName: "SEO Meta",
    tagline: "根据页面主题，一次给出标题、描述和结构化建议。",
    description: "适合从搜索流量切入的通用工具，将复用相同的预览、登录门槛和埋点框架。",
    category: "SEO",
    icon: "seo",
    href: "/tools/ai-seo-meta-generator",
    status: "live",
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
    slug: "ai-ads-copy-generator",
    name: "AI 广告文案多版本生成器",
    shortName: "广告文案",
    tagline: "为广告投放快速生成多版本标题与正文。",
    description: "未来用于承接广告文案、投放优化和创意测试场景的引流工具。",
    category: "Ads",
    icon: "ads",
    href: "/tools/ai-ads-copy-generator",
    status: "coming_soon",
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
    href: "/tools/ai-email-subject-generator",
    status: "coming_soon",
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

const localizedLeadToolCopy: Record<
  AppLocale,
  Record<
    string,
    Pick<LeadToolDefinition, "name" | "shortName" | "tagline" | "description" | "proofPoints" | "faqs">
  >
> = {
  zh: {
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
