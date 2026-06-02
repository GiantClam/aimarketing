import assert from "node:assert/strict"
import test from "node:test"

import { calculateAiCostEstimate, defaultAiCostInput } from "@/lib/seo/ai-cost-calculator"
import {
  getAiCostPageCopy,
  getAiToolLabel,
  getRecommendedPlanLabel,
  localizeSeoPage,
} from "@/lib/seo/i18n"
import { getSeoPage } from "@/lib/seo/pages"

test("use-case SEO pages localize to Chinese copy when locale is zh", () => {
  const page = getSeoPage("use-cases", "ai-workspace-for-marketing-teams")
  assert.ok(page)

  const localized = localizeSeoPage(page, "zh")

  assert.equal(localized.h1, "面向营销团队的 AI 工作台")
  assert.equal(localized.primaryKeyword, "面向营销团队的 AI 工作台")
  assert.equal(localized.sections[0]?.heading, "这个页面真正要解决什么")
  assert.equal(localized.relatedLinks[0]?.label, "面向 SEO 团队的 AI 工作台")
})

test("compare AI cost SEO page localizes comparison copy for zh", () => {
  const page = getSeoPage("compare", "compare-ai-tool-costs")
  assert.ok(page)

  const localized = localizeSeoPage(page, "zh")

  assert.equal(localized.h1, "对比营销团队的 AI 工具成本")
  assert.equal(localized.comparison?.firstLabel, "多个独立 AI 订阅")
  assert.equal(localized.sections[4]?.heading, "对比 AI 工具成本的决策清单")
  assert.equal(localized.faqs[0]?.question, "AI 成本节省应该成为首页主定位吗？")
})

test("English locale preserves the original SEO page object", () => {
  const page = getSeoPage("use-cases", "ai-workspace-for-seo-teams")
  assert.ok(page)

  assert.equal(localizeSeoPage(page, "en"), page)
})

test("AI cost page copy and plan labels switch between locales", () => {
  const zh = getAiCostPageCopy("zh")
  const en = getAiCostPageCopy("en")

  assert.equal(en.title, "Compare how much your marketing team spends on separate AI tools")
  assert.equal(zh.title, "对比你的营销团队在分散 AI 工具上的花费")
  assert.equal(getAiToolLabel("zh", "search"), "搜索工具用户数")
  assert.equal(getRecommendedPlanLabel("zh", "byok-workspace"), "BYOK 工作台")
})

test("AI cost estimate returns a locale-agnostic plan key", () => {
  const standard = calculateAiCostEstimate(defaultAiCostInput)
  const byok = calculateAiCostEstimate({ ...defaultAiCostInput, needsByok: true })
  const largerTeam = calculateAiCostEstimate({ ...defaultAiCostInput, teamSize: 12 })

  assert.equal(standard.recommendedPlanKey, "lifetime-basic-or-team-pro")
  assert.equal(byok.recommendedPlanKey, "byok-workspace")
  assert.equal(largerTeam.recommendedPlanKey, "team-pro")
})
