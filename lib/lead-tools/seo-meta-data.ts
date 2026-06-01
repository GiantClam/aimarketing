export type SeoPageType = "landing-page" | "blog-post" | "product-page" | "feature-page"
export type SeoLanguage = "zh-CN" | "en-US"

export type SeoMetaRequest = {
  topic: string
  pageType: SeoPageType
  audience: string
  language: SeoLanguage
}

export type SeoMetaVariant = {
  key: string
  name: string
  angle: string
  title: string
  description: string
  keywords: string[]
  slug: string
  h1: string
  cta: string
}

export type SeoMetaPreview = {
  topic: string
  pageType: SeoPageType
  audience: string
  language: SeoLanguage
  generatedAt: string
  summary: string
  variants: SeoMetaVariant[]
}

export const seoPageTypeOptions: Array<{ value: SeoPageType; label: string; description: string }> = [
  { value: "landing-page", label: "落地页", description: "适合产品获客、广告承接和工具页 SEO" },
  { value: "blog-post", label: "博客文章", description: "适合内容营销、长尾词和知识型页面" },
  { value: "product-page", label: "产品页", description: "适合核心功能、价格和转化页面" },
  { value: "feature-page", label: "功能页", description: "适合单功能场景和程序化 SEO 页面" },
]

export const seoLanguageOptions: Array<{ value: SeoLanguage; label: string }> = [
  { value: "zh-CN", label: "中文" },
  { value: "en-US", label: "English" },
]

const pageTypeLabelMap: Record<SeoPageType, { zh: string; en: string }> = {
  "landing-page": { zh: "落地页", en: "landing page" },
  "blog-post": { zh: "博客文章", en: "blog post" },
  "product-page": { zh: "产品页", en: "product page" },
  "feature-page": { zh: "功能页", en: "feature page" },
}

function byLanguage(language: SeoLanguage, zh: string, en: string) {
  return language === "zh-CN" ? zh : en
}

function sanitizeSlug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

export function buildMockSeoMetaPreview(request: SeoMetaRequest): SeoMetaPreview {
  const pageType = pageTypeLabelMap[request.pageType]
  const topic = request.topic.trim()

  const variants: SeoMetaVariant[] = [
    {
      key: "conversion-first",
      name: byLanguage(request.language, "转化优先", "Conversion First"),
      angle: byLanguage(request.language, "强调结果和行动，适合工具页与获客页。", "Action-oriented and high-intent for acquisition pages."),
      title: byLanguage(
        request.language,
        `${topic}：快速生成高转化 ${pageType.zh} | AI Marketing`,
        `${topic}: Build a high-converting ${pageType.en} fast | AI Marketing`,
      ),
      description: byLanguage(
        request.language,
        `面向${request.audience}，快速获得可上线的 ${pageType.zh} 文案、结构与转化建议，先看到结果，再持续优化 SEO 表现。`,
        `Built for ${request.audience}, generate a launch-ready ${pageType.en} with stronger messaging, structure, and SEO intent.`,
      ),
      keywords: [
        topic,
        byLanguage(request.language, `${topic}工具`, `${topic} tool`),
        byLanguage(request.language, `${topic}生成器`, `${topic} generator`),
      ],
      slug: sanitizeSlug(topic),
      h1: byLanguage(request.language, `${topic} 生成器`, `${topic} Generator`),
      cta: byLanguage(request.language, "立即生成并优化页面", "Generate and optimize now"),
    },
    {
      key: "seo-coverage",
      name: byLanguage(request.language, "长尾覆盖", "Long-tail Coverage"),
      angle: byLanguage(request.language, "强调搜索意图和可索引内容覆盖。", "Focuses on search intent and indexable coverage."),
      title: byLanguage(
        request.language,
        `${topic} ${pageType.zh}模板、标题与 Meta 描述建议`,
        `${topic} ${pageType.en} templates, titles, and meta description ideas`,
      ),
      description: byLanguage(
        request.language,
        `围绕 ${topic} 组织更适合搜索引擎收录的标题、描述和 H1 结构，帮助 ${request.audience} 更快搭建 SEO 友好页面。`,
        `Create search-friendly titles, descriptions, and H1 structures around ${topic} for ${request.audience}.`,
      ),
      keywords: [
        byLanguage(request.language, `${topic}模板`, `${topic} template`),
        byLanguage(request.language, `${topic}标题`, `${topic} title`),
        byLanguage(request.language, `${topic} meta 描述`, `${topic} meta description`),
      ],
      slug: sanitizeSlug(`${topic} template`),
      h1: byLanguage(request.language, `${topic} SEO 标题与 Meta 建议`, `${topic} SEO Title & Meta Ideas`),
      cta: byLanguage(request.language, "查看更多 SEO 版本", "Explore more SEO variants"),
    },
    {
      key: "authority-signal",
      name: byLanguage(request.language, "专业可信", "Authority Signal"),
      angle: byLanguage(request.language, "强调专业度、可信度和行业判断。", "Leans into trust, expertise, and authority."),
      title: byLanguage(
        request.language,
        `${topic} 最佳实践：为${request.audience}设计更可信的 ${pageType.zh}`,
        `${topic} best practices: a more credible ${pageType.en} for ${request.audience}`,
      ),
      description: byLanguage(
        request.language,
        `用更专业的语气表达 ${topic} 的价值、使用场景和差异化优势，适合希望兼顾品牌感与 SEO 的页面。`,
        `Frame ${topic} with stronger clarity, trust, and differentiation for pages that need both SEO and brand confidence.`,
      ),
      keywords: [
        byLanguage(request.language, `${topic}最佳实践`, `${topic} best practices`),
        byLanguage(request.language, `${topic}案例`, `${topic} examples`),
        byLanguage(request.language, `${topic}指南`, `${topic} guide`),
      ],
      slug: sanitizeSlug(`${topic} best practices`),
      h1: byLanguage(request.language, `${topic} 最佳实践指南`, `${topic} Best Practices Guide`),
      cta: byLanguage(request.language, "生成更专业的页面版本", "Generate a more authoritative version"),
    },
  ]

  return {
    topic,
    pageType: request.pageType,
    audience: request.audience.trim(),
    language: request.language,
    generatedAt: new Date().toISOString(),
    summary: byLanguage(
      request.language,
      `已为 ${topic} 生成 3 组 SEO Meta 方向，可直接用于 ${pageType.zh}、工具页或程序化长尾页面。`,
      `Generated 3 SEO meta directions for ${topic}, ready for ${pageType.en}s and programmatic landing pages.`,
    ),
    variants,
  }
}
