import type { LeadToolRelatedLink } from "@/lib/lead-tools/catalog"
import type { PptLanguage, PptScenario } from "@/lib/lead-tools/ppt-preview-data-fixed"
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
  relatedLinks?: LeadToolRelatedLink[]
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
  {
    kind: "seo-meta",
    toolSlug: "press-release-generator",
    slug: "press-release-examples",
    title: "Press Release Examples",
    summary: "Scenario-based press release examples for launches, updates, and partnership announcements.",
    intent: "Useful when teams need example structures before drafting a final announcement.",
    tags: ["press release examples", "launch copy", "announcement writing"],
    request: {
      topic: "Press release examples",
      audience: "Marketing teams and communications leads",
      pageType: "blog-post",
      language: "en-US",
    },
    sections: [
      {
        title: "What these examples should teach",
        body: "Strong press release examples show how the headline, lead, proof, and quote sections work together around one announcement angle.",
      },
      {
        title: "How to use them in a real workflow",
        body: "Review the example type that matches your scenario, then move into AI Chat or the copy workflow with the same release brief and proof points.",
      },
      {
        title: "What makes release examples more useful",
        body: "The best examples do more than sound formal. They show which facts matter, how the story is framed, and where the reader should go next.",
      },
    ],
    relatedLinks: [
      {
        href: "/tools/press-release-generator",
        label: "Press Release Generator",
        description: "Return to the main generator page after choosing the right example structure.",
      },
      {
        href: "/agents/growth-marketing-agent",
        label: "Growth Marketing Agent",
        description: "Carry the same launch narrative into the rest of the campaign workflow.",
      },
    ],
  },
  {
    kind: "seo-meta",
    toolSlug: "bio-generator",
    slug: "bio-examples",
    title: "Bio Examples",
    summary: "Examples for founder bios, team bios, speaker bios, and short profile introductions.",
    intent: "Useful when teams need to compare tone, length, and positioning before drafting a final bio.",
    tags: ["bio examples", "founder bio", "team profile"],
    request: {
      topic: "Bio examples",
      audience: "Founders, operators, and marketing teams",
      pageType: "blog-post",
      language: "en-US",
    },
    sections: [
      {
        title: "What a good bio example proves",
        body: "A strong bio example shows how to balance role clarity, proof, and tone without turning the person into a list of job titles.",
      },
      {
        title: "How to adapt across channels",
        body: "Start from the same positioning notes, then shorten or expand the version for website bios, LinkedIn summaries, or speaker intros.",
      },
      {
        title: "What to avoid",
        body: "Weak bios read like resumes or vague mission statements. The better versions show why this person or team matters to a specific audience.",
      },
    ],
    relatedLinks: [
      {
        href: "/tools/bio-generator",
        label: "Bio Generator",
        description: "Return to the main generator page after reviewing example tones and formats.",
      },
      {
        href: "/agents/brand-strategy-agent",
        label: "Brand Strategy Agent",
        description: "Clarify positioning before rewriting bios across multiple channels.",
      },
    ],
  },
  {
    kind: "seo-meta",
    toolSlug: "bio-generator",
    slug: "linkedin-headline-examples",
    title: "LinkedIn Headline Examples",
    summary: "Examples for tighter professional headlines with clearer positioning and proof.",
    intent: "Useful when teams need short profile hooks rather than full-length bios.",
    tags: ["linkedin headline examples", "profile positioning", "personal brand copy"],
    request: {
      topic: "LinkedIn headline examples",
      audience: "Founders, consultants, and marketing operators",
      pageType: "feature-page",
      language: "en-US",
    },
    sections: [
      {
        title: "What the best headline examples do",
        body: "They communicate role, audience, and differentiator quickly enough that the headline still works in limited profile space.",
      },
      {
        title: "How to write shorter without losing meaning",
        body: "Keep the role and audience clear, then choose the single strongest proof or positioning angle instead of cramming every capability into one line.",
      },
      {
        title: "How to connect this to a longer bio",
        body: "Treat the headline as the hook. The full bio can carry the deeper proof and narrative once the profile has earned attention.",
      },
    ],
    relatedLinks: [
      {
        href: "/tools/bio-generator",
        label: "Bio Generator",
        description: "Move from short profile hooks into fuller bio drafts when the positioning is clear.",
      },
      {
        href: "/tools/bio-generator/examples/bio-examples",
        label: "Bio Examples",
        description: "Compare shorter profile hooks with longer biography formats on the same topic.",
      },
    ],
  },
  {
    kind: "seo-meta",
    toolSlug: "product-description-generator",
    slug: "product-description-examples",
    title: "Product Description Examples",
    summary: "Examples for ecommerce listings, launch pages, and marketing-led product description angles.",
    intent: "Useful when teams want reference outputs before drafting final product page copy.",
    tags: ["product description examples", "ecommerce copy", "product page writing"],
    request: {
      topic: "Product description examples",
      audience: "Ecommerce and marketing teams",
      pageType: "landing-page",
      language: "en-US",
    },
    sections: [
      {
        title: "What these examples should reveal",
        body: "The best product description examples show how features, benefits, and proof change depending on channel, buyer stage, and the action the reader should take next.",
      },
      {
        title: "How to use the examples in production",
        body: "Choose the structure closest to your product type, then adapt the proof, objections, and CTA to the actual page or marketplace context.",
      },
      {
        title: "Why examples matter before drafting",
        body: "Examples make it easier to spot whether your current description is too vague, too feature-heavy, or missing the buyer motivation entirely.",
      },
    ],
    relatedLinks: [
      {
        href: "/tools/product-description-generator",
        label: "Product Description Generator",
        description: "Return to the main generator page after choosing the best example angle.",
      },
      {
        href: "/agents/website-copy-agent",
        label: "Website Copy Agent",
        description: "Expand product description ideas into fuller page sections and supporting copy.",
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

export function getLeadToolExamplePaths() {
  return leadToolExamples.map((example) => getLeadToolExampleHref(example.toolSlug, example.slug))
}
