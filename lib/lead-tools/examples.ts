import type { PptLanguage, PptScenario } from "@/lib/lead-tools/ppt-preview-data"
import type { SeoLanguage, SeoPageType } from "@/lib/lead-tools/seo-meta-data"

type LeadToolExampleSection = {
  title: string
  body: string
}

type LeadToolExampleBase = {
  toolSlug: string
  slug: string
  title: string
  summary: string
  intent: string
  tags: string[]
  sections: LeadToolExampleSection[]
}

export type LeadToolSeoMetaExample = LeadToolExampleBase & {
  kind: "seo-meta"
  request: {
    topic: string
    audience: string
    pageType: SeoPageType
    language: SeoLanguage
  }
}

export type LeadToolPptExample = LeadToolExampleBase & {
  kind: "ppt-preview"
  request: {
    prompt: string
    scenario: PptScenario
    language: PptLanguage
  }
}

export type LeadToolExample = LeadToolSeoMetaExample | LeadToolPptExample

const leadToolExamples: LeadToolExample[] = [
  {
    kind: "seo-meta",
    toolSlug: "ai-seo-meta-generator",
    slug: "ai-ppt-generator",
    title: "AI PPT Generator SEO Meta 示例",
    summary: "围绕高意图关键词快速生成标题、Meta 描述和程序化页面方向。",
    intent: "适合工具页、功能页和英文关键词着陆页。",
    tags: ["AI PPT generator", "Programmatic SEO", "Feature page"],
    request: {
      topic: "AI PPT generator",
      audience: "独立开发者与增长负责人",
      pageType: "feature-page",
      language: "en-US",
    },
    sections: [
      {
        title: "为什么这个词值得做示例页",
        body: "这类关键词本身就带着强工具意图，用户希望直接看到产品能不能用、输出长什么样，而不是先看品牌故事。",
      },
      {
        title: "这页应该回答什么问题",
        body: "首屏要先证明“可以快速生成预览”，中段补充多风格差异和使用场景，尾部再承接下载、完整生成或注册动作。",
      },
      {
        title: "怎么复用到更多长尾词",
        body: "只要更换主题词、受众和页面类型，就能批量生成一组新的 Meta 方向，并复用同一套页面结构和转化链路。",
      },
    ],
  },
  {
    kind: "seo-meta",
    toolSlug: "ai-seo-meta-generator",
    slug: "youtube-script-generator",
    title: "YouTube Script Generator Meta 示例",
    summary: "演示内容型关键词如何生成兼顾覆盖和转化的 Meta 版本。",
    intent: "适合博客、模板页和内容营销工具。",
    tags: ["YouTube script generator", "Blog SEO", "Content workflow"],
    request: {
      topic: "YouTube script generator",
      audience: "内容团队与创作者",
      pageType: "blog-post",
      language: "en-US",
    },
    sections: [
      {
        title: "内容型关键词的页面重点",
        body: "这类词的用户既想要工具，也想知道怎么写得更快，所以 Meta 不能只讲生成，还要强调脚本结构、模板和最佳实践。",
      },
      {
        title: "为什么需要多版本",
        body: "同一个关键词可能同时吃“模板”“最佳实践”“免费工具”等多个意图，多版本能帮助我们测试哪条路更容易拿到点击。",
      },
      {
        title: "适合搭配什么页面结构",
        body: "最常见的组合是工具入口 + 示例输出 + 常见结构模板 + FAQ，这种布局对搜索和转化都更友好。",
      },
    ],
  },
  {
    kind: "seo-meta",
    toolSlug: "ai-seo-meta-generator",
    slug: "saas-landing-page-copy",
    title: "SaaS Landing Page Copy Meta 示例",
    summary: "展示更偏 B2B 和转化导向的页面，如何组织可信感和搜索覆盖。",
    intent: "适合产品页、定价页和高客单转化页。",
    tags: ["SaaS landing page copy", "B2B SEO", "Conversion copy"],
    request: {
      topic: "SaaS landing page copy",
      audience: "B2B 营销团队",
      pageType: "landing-page",
      language: "en-US",
    },
    sections: [
      {
        title: "为什么这里不能只拼关键词",
        body: "B2B 页面需要同时传达可信度和业务结果，如果只有关键词覆盖，没有明确价值主张，点击进来也很难继续转化。",
      },
      {
        title: "Meta 应该强调什么",
        body: "更适合强调 launch-ready、high-converting、可信表达这类词，既保留搜索相关性，也能告诉用户这是为商业场景准备的内容。",
      },
      {
        title: "如何接到主产品",
        body: "示例页负责吃搜索词和教育用户，真正的动作还是把用户导到可直接体验的工具页，再在高意图动作上触发登录。",
      },
    ],
  },
  {
    kind: "ppt-preview",
    toolSlug: "ai-ppt-preview",
    slug: "product-launch-deck",
    title: "产品发布 PPT 预览示例",
    summary: "先给用户看到多风格发布稿预览，再在导出动作上拦登录。",
    intent: "适合产品发布、GTM 和新品介绍页面。",
    tags: ["Product launch", "PPT preview", "Lead capture"],
    request: {
      prompt: "AI note taker product launch deck",
      scenario: "product-launch",
      language: "en-US",
    },
    sections: [
      {
        title: "为什么 PPT 更适合先预览",
        body: "用户通常先想判断风格和结构方向是否对，再决定值不值得导出完整文件，所以预览层是更轻的第一触点。",
      },
      {
        title: "转化抓手应该放在哪里",
        body: "真正值得拦截登录的是下载和完整生成，因为这时用户已经用结果证明了意图，阻力比首屏低很多。",
      },
      {
        title: "后续怎么扩更多场景",
        body: "把 scenario 从发布、销售、培训继续扩下去，就能自然长出更多长尾示例页，而不用改整套底层链路。",
      },
    ],
  },
]

export function getLeadToolExamples(toolSlug: string) {
  return leadToolExamples.filter((example) => example.toolSlug === toolSlug)
}

export function getLeadToolExample(toolSlug: string, exampleSlug: string) {
  return leadToolExamples.find((example) => example.toolSlug === toolSlug && example.slug === exampleSlug)
}

export function getLeadToolExampleHref(toolSlug: string, exampleSlug: string) {
  return `/tools/${toolSlug}/examples/${exampleSlug}`
}

export function getLeadToolExampleParams() {
  return leadToolExamples.map((example) => ({
    slug: example.toolSlug,
    exampleSlug: example.slug,
  }))
}
