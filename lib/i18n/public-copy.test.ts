import assert from "node:assert/strict"
import test from "node:test"

import { getPublicCopy } from "@/lib/i18n/public-copy"

test("public copy switches homepage and pricing labels between zh and en", () => {
  const zh = getPublicCopy("zh")
  const en = getPublicCopy("en")

  assert.equal(en.header.login, "Log in")
  assert.equal(zh.header.login, "登录")
  assert.equal(en.footer.systemFooterLabel, "System Footer")
  assert.equal(zh.footer.systemFooterLabel, "系统页脚")
  assert.equal(en.header.navItems.find((item) => item.key === "solutions")?.href, "/en/use-cases/ai-workspace-for-marketing-teams")
  assert.equal(en.header.navItems.find((item) => item.key === "pricing")?.href, "/en/pricing")
  assert.equal(zh.header.navItems.find((item) => item.key === "calculator")?.href, "/zh/compare/compare-ai-tool-costs")
  assert.equal(zh.header.brandOpsReady, "品牌运营就绪")
  assert.equal(en.home.title, "One workspace for multiple AI models")
  assert.equal(zh.home.title, "一个工作台，接入多个 AI 模型")
  assert.equal(en.home.systemLabel, "AI Marketing System")
  assert.equal(zh.home.openDetailLabel, "查看详情")
  assert.equal(en.pricingPage.matrixLabel, "Pricing Matrix")
  assert.equal(zh.pricingPage.sharedWorkspaceLabel, "共享工作台")
  assert.equal(
    en.home.supportingCopy,
    "Built for marketers, SEO operators, indie founders, and small teams that want less tool switching and more output.",
  )
  assert.equal(en.pricingPage.eyebrow, "Pricing")
  assert.equal(zh.pricingPage.eyebrow, "价格")
  assert.equal(en.home.audienceCards.length, 4)
  assert.notEqual(zh.home.description, en.home.description)
})
