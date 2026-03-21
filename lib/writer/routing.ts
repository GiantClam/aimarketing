import {
  DEFAULT_WRITER_MODE,
  DEFAULT_WRITER_PLATFORM,
  WRITER_CONTENT_TYPE_CONFIG,
  WRITER_PLATFORM_CONFIG,
  type WriterContentType,
} from "@/lib/writer/config"
import type { WriterRoutingDecision } from "@/lib/writer/types"

type RoutingInput = {
  query: string
  contentType?: WriterContentType | "" | null
  targetPlatform?: string | null
  outputForm?: string | null
  lengthTarget?: string | null
}

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : ""
}

function compact(value: string | null | undefined, fallback: string) {
  const normalized = normalizeText(value).replace(/\s+/g, " ")
  return normalized || fallback
}

function matchesAny(query: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(query))
}

export function inferWriterContentType(query: string): WriterContentType {
  if (
    matchesAny(query, [
      /\b(?:linkedin|facebook|instagram|tiktok)\b.*\b(?:post|caption)\b/i,
      /\b(?:post|caption)\b.*\b(?:linkedin|facebook|instagram|tiktok)\b/i,
      /\b(?:twitter|x)\b.*\bthread\b/i,
      /\bthread\b.*\b(?:twitter|x)\b/i,
      /wechat.*article/i,
      /公众号.*文章/u,
      /小红书.*笔记/u,
      /微博.*(?:帖子|内容)/u,
      /抖音.*(?:脚本|口播)/u,
    ])
  ) {
    if (matchesAny(query, [/(wechat|公众号|小红书|微博|抖音)/iu])) {
      return "social_cn"
    }
    return "social_global"
  }

  if (
    matchesAny(query, [
      /cold email/i,
      /follow-up email/i,
      /business email/i,
      /邮件/,
      /外贸邮件/,
      /商务邮件/,
      /开发信/,
      /回复邮件/,
    ])
  ) {
    return "email"
  }

  if (
    matchesAny(query, [
      /newsletter/i,
      /onboarding/i,
      /activation/i,
      /nurture/i,
      /retention/i,
      /re-engagement/i,
      /周报/,
      /月报/,
      /订阅邮件/,
      /生命周期邮件/,
    ])
  ) {
    return "newsletter"
  }

  if (
    matchesAny(query, [
      /landing page/i,
      /homepage/i,
      /solution page/i,
      /pricing page/i,
      /website copy/i,
      /网站文案/,
      /落地页/,
      /首页文案/,
      /产品页文案/,
      /CTA 区块/,
    ])
  ) {
    return "website_copy"
  }

  if (
    matchesAny(query, [
      /ad copy/i,
      /headline set/i,
      /creative angle/i,
      /paid social/i,
      /search ad/i,
      /广告文案/,
      /投放文案/,
      /广告标题/,
      /A\/B/,
    ])
  ) {
    return "ads"
  }

  if (
    matchesAny(query, [
      /case study/i,
      /customer story/i,
      /success story/i,
      /案例/,
      /客户故事/,
      /成功案例/,
      /销售证明/,
    ])
  ) {
    return "case_study"
  }

  if (
    matchesAny(query, [
      /product description/i,
      /\bfaq\b/i,
      /setup guide/i,
      /usage guide/i,
      /产品介绍/,
      /产品卖点/,
      /产品说明/,
      /使用指南/,
      /安装指南/,
    ])
  ) {
    return "product"
  }

  if (
    matchesAny(query, [
      /speech/i,
      /keynote/i,
      /remarks/i,
      /host script/i,
      /演讲稿/,
      /主持词/,
      /开场词/,
      /闭幕词/,
      /发言稿/,
    ])
  ) {
    return "speech"
  }

  if (matchesAny(query, [/(wechat|公众号|小红书|微博|抖音)/i])) {
    return "social_cn"
  }

  if (matchesAny(query, [/(linkedin|twitter|x thread|x post|instagram|facebook|tiktok)/i])) {
    return "social_global"
  }

  return "longform"
}

export function inferWriterTargetPlatform(query: string, contentType: WriterContentType): string {
  if (/(wechat|公众号)/i.test(query)) return "WeChat Official Account"
  if (/小红书/i.test(query)) return "Xiaohongshu"
  if (/微博/i.test(query)) return "Weibo"
  if (/抖音/i.test(query)) return "Douyin"
  if (/\blinkedin\b/i.test(query)) return "LinkedIn"
  if (/(^|[^a-z])x( thread| post)?([^a-z]|$)|twitter/i.test(query.toLowerCase())) return "X"
  if (/\binstagram\b/i.test(query)) return "Instagram"
  if (/\btiktok\b/i.test(query)) return "TikTok"
  if (/\bfacebook\b/i.test(query)) return "Facebook"

  return WRITER_CONTENT_TYPE_CONFIG[contentType].defaultTargetPlatform
}

export function inferWriterOutputForm(input: {
  contentType: WriterContentType
  targetPlatform: string
  query: string
}) {
  const normalized = input.query.toLowerCase()

  if (input.contentType === "email") {
    if (/(sequence|系列|多封)/i.test(input.query)) return "email sequence"
    if (/(reply|回复|跟进)/i.test(input.query)) return "follow-up email"
    return "single email"
  }

  if (input.contentType === "newsletter") {
    if (/(onboarding|activation|nurture|retention|re-engagement)/i.test(normalized)) {
      return "lifecycle email"
    }
    return "newsletter issue"
  }

  if (input.contentType === "website_copy") {
    if (/(pricing|价格)/i.test(input.query)) return "pricing page copy"
    if (/(homepage|首页)/i.test(input.query)) return "homepage copy"
    if (/(landing page|落地页)/i.test(input.query)) return "landing page copy"
    return "sectioned website copy"
  }

  if (input.contentType === "ads") {
    if (/(headline|标题)/i.test(input.query)) return "headline variant set"
    if (/(paid social|信息流)/i.test(normalized)) return "paid social ad variants"
    return "ad copy variant set"
  }

  if (input.contentType === "case_study") {
    if (/(summary|摘要|销售证明)/i.test(input.query)) return "sales proof summary"
    if (/(story|故事)/i.test(input.query)) return "customer story"
    return "formal case study"
  }

  if (input.contentType === "product") {
    if (/(faq|指南|guide|manual)/i.test(input.query)) return "product documentation"
    return "product marketing copy"
  }

  if (input.contentType === "speech") {
    if (/(outline|提纲)/i.test(input.query)) return "speaking outline"
    if (/(host|主持)/i.test(input.query)) return "host script"
    return "full speech script"
  }

  if (input.contentType === "social_cn" || input.contentType === "social_global") {
    if (/(thread|串文|多段|carousel)/i.test(input.query)) {
      return `${input.targetPlatform} multi-part post`
    }
    if (/(script|脚本|口播)/i.test(input.query)) {
      return `${input.targetPlatform} script`
    }
    return `${input.targetPlatform} native post`
  }

  if (/(tutorial|教程|guide|指南)/i.test(input.query)) return "guide or tutorial"
  if (/(press release|新闻稿|announcement|发布稿)/i.test(normalized)) return "press release"
  if (/(brand story|品牌故事|thought leadership|观点文章)/i.test(normalized)) return "thought leadership piece"
  return "long-form article"
}

export function inferWriterLengthTarget(input: {
  contentType: WriterContentType
  targetPlatform: string
  outputForm: string
  query: string
}) {
  const normalized = input.query.toLowerCase()
  const explicitWordMatch = /(\d{2,5})\s*(字|words?)/i.exec(input.query)

  if (explicitWordMatch) {
    return `${explicitWordMatch[1]} ${/word/i.test(explicitWordMatch[2]) ? "words" : "字"}`
  }

  if (/(15s|15 秒)/i.test(input.query)) return "15-second script"
  if (/(30s|30 秒)/i.test(input.query)) return "30-second script"
  if (/(60s|60 秒|1 分钟)/i.test(input.query)) return "60-second script"

  switch (input.contentType) {
    case "email":
      return input.outputForm.includes("sequence") ? "3-5 short emails" : "120-220 words"
    case "newsletter":
      return input.outputForm.includes("lifecycle") ? "150-300 words" : "250-600 words"
    case "website_copy":
      return "page-section length with scannable blocks"
    case "ads":
      return "short-form variants"
    case "case_study":
      return input.outputForm.includes("summary") ? "200-500 words" : "600-1200 words"
    case "product":
      return input.outputForm.includes("documentation") ? "step-based medium length" : "300-800 words"
    case "speech":
      if (/5 分钟|5-minute/i.test(input.query)) return "5-minute speech"
      if (/10 分钟|10-minute/i.test(input.query)) return "10-minute speech"
      return "fit the requested speaking time"
    case "social_cn":
    case "social_global":
      if (/thread|多段|carousel/i.test(normalized)) return "5-10 short segments"
      if (/script|脚本|口播/i.test(input.query)) return "15-45 second script"
      return "platform-native medium length"
    case "longform":
    default:
      if (/press release|新闻稿/i.test(normalized)) return "400-800 words"
      if (/tutorial|guide|指南|教程/i.test(input.query)) return "1000-1800 words"
      return "800-1500 words"
  }
}

export function inferWriterRenderProfile(input: {
  contentType: WriterContentType
  targetPlatform: string
  outputForm: string
  query: string
}): Pick<WriterRoutingDecision, "renderPlatform" | "renderMode"> {
  const target = input.targetPlatform.toLowerCase()
  const wantsThread = /thread|多段|串文/i.test(input.outputForm) || /thread|多段|串文/i.test(input.query)

  if (target.includes("wechat")) return { renderPlatform: "wechat", renderMode: "article" }
  if (target.includes("xiaohongshu")) return { renderPlatform: "xiaohongshu", renderMode: "article" }
  if (target.includes("weibo")) return { renderPlatform: "weibo", renderMode: wantsThread ? "thread" : "article" }
  if (target.includes("douyin")) return { renderPlatform: "douyin", renderMode: "article" }
  if (target === "x") return { renderPlatform: "x", renderMode: wantsThread ? "thread" : "article" }
  if (target.includes("linkedin")) return { renderPlatform: "linkedin", renderMode: "article" }
  if (target.includes("instagram")) return { renderPlatform: "instagram", renderMode: "article" }
  if (target.includes("tiktok")) return { renderPlatform: "tiktok", renderMode: "article" }
  if (target.includes("facebook")) return { renderPlatform: "facebook", renderMode: wantsThread ? "thread" : "article" }

  if (input.contentType === "social_cn") {
    return { renderPlatform: DEFAULT_WRITER_PLATFORM, renderMode: DEFAULT_WRITER_MODE }
  }

  if (input.contentType === "social_global") {
    return { renderPlatform: "linkedin", renderMode: "article" }
  }

  return { renderPlatform: "generic", renderMode: "article" }
}

export function buildWriterRoutingDecision(input: RoutingInput): WriterRoutingDecision {
  const contentType = input.contentType || inferWriterContentType(input.query)
  const targetPlatform = compact(input.targetPlatform, inferWriterTargetPlatform(input.query, contentType))
  const outputForm = compact(
    input.outputForm,
    inferWriterOutputForm({ contentType, targetPlatform, query: input.query }),
  )
  const lengthTarget = compact(
    input.lengthTarget,
    inferWriterLengthTarget({ contentType, targetPlatform, outputForm, query: input.query }),
  )
  const renderProfile = inferWriterRenderProfile({ contentType, targetPlatform, outputForm, query: input.query })

  return {
    contentType,
    targetPlatform,
    outputForm,
    lengthTarget,
    renderPlatform: renderProfile.renderPlatform,
    renderMode: renderProfile.renderMode,
    selectedSkillId: contentType,
    selectedSkillLabel: WRITER_CONTENT_TYPE_CONFIG[contentType].label,
  }
}

export function describeWriterRoute(route: WriterRoutingDecision) {
  const render = WRITER_PLATFORM_CONFIG[route.renderPlatform]
  return `${route.selectedSkillLabel} / ${route.targetPlatform} / ${route.outputForm} / ${route.lengthTarget} / ${render.shortLabel}`
}
