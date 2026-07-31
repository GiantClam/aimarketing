import assert from "node:assert/strict"
import test from "node:test"

import { getPublicSeoToolIds } from "./public-runtime-policy"
import { buildMockSeoTitlePlan, buildSeoTitleReport, getLocalizedPaidSeoCapabilities, paidSeoCapabilities, seoTitleInputSchema } from "./title-report"
import { scoreSeoTitle } from "./title-score"

test("anonymous SEO title reports use fixed input and do not expose paid tools", () => {
  const input = seoTitleInputSchema.parse({
    keyword: "AI marketing automation",
    audience: "marketing teams",
    region: "United States",
    pageType: "landing-page",
    language: "en-US",
  })
  const report = buildSeoTitleReport(buildMockSeoTitlePlan(input))

  assert.equal(report.candidates.length, 10)
  assert.equal(getPublicSeoToolIds().includes("seo_title_score"), true)
  assert.equal(getPublicSeoToolIds().some((toolId) => /dataforseo|gsc|ga4/i.test(toolId)), false)
  assert.match(report.intentHypothesis, /not.*live.*SERP/i)
  assert.equal(report.candidates.every((candidate) => candidate.ruleScore.total >= 0), true)
  assert.equal(paidSeoCapabilities.every((capability) => Boolean(capability.source) && Boolean(capability.requirement)), true)
})

test("SEO title score rewards keyword placement and flags excessive width", () => {
  const candidates = [
    "AI marketing automation: a practical guide for marketing teams",
    "Marketing teams can automate campaigns with AI",
  ]
  const keywordFirst = scoreSeoTitle({ title: candidates[0], keyword: "AI marketing automation", candidates })
  const missingKeyword = scoreSeoTitle({
    title: "A very long title that keeps adding generic words until it is much wider than a normal search result can reasonably display to readers",
    keyword: "AI marketing automation",
    candidates,
  })

  assert.equal(keywordFirst.keywordPosition, "start")
  assert.ok(keywordFirst.total > missingKeyword.total)
  assert.ok(missingKeyword.estimatedPixelWidth > 580)
})

test("fallback title reports retain the supplied page context", () => {
  const report = buildSeoTitleReport(buildMockSeoTitlePlan(seoTitleInputSchema.parse({
    keyword: "AI 营销自动化",
    audience: "增长负责人",
    region: "中国",
    pageType: "product-page",
    language: "zh-CN",
    currentTitle: "旧标题",
    valueProposition: "提升自然流量与点击率",
  })))

  assert.match(report.intentHypothesis, /产品页/)
  assert.match(report.intentHypothesis, /提升自然流量与点击率/)
  assert.match(report.candidates[0]?.rationale || "", /旧标题/)
})

test("paid SEO capability cards are localized for the Chinese tool page", () => {
  const capabilities = getLocalizedPaidSeoCapabilities("zh-CN")

  assert.deepEqual(capabilities.map((capability) => capability.title), ["实时 SERP 页面格局", "关键词需求与难度", "GSC 与 GA4 表现复盘"])
  assert.equal(capabilities[2]?.requirement, "已连接资源并完成授权")
})
