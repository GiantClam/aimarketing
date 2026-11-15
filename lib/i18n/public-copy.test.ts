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
  assert.equal(zh.header.navItems.find((item) => item.key === "resources")?.href, "/zh/resources")
  assert.equal(zh.header.brandOpsReady, "品牌运营就绪")
  assert.equal(en.home.title, "AI Workspace for Marketing Teams")
  assert.equal(zh.home.title, "面向营销团队的 AI 工作台")
  assert.equal(en.home.systemLabel, "Marketing workspace")
  assert.equal(zh.home.openDetailLabel, "查看详情")
  assert.equal(en.pricingPage.matrixLabel, "Pricing Matrix")
  assert.equal(zh.pricingPage.sharedWorkspaceLabel, "共享工作台")
  assert.equal(
    en.home.supportingCopy,
    "From the same brief, teams can research, write, create visuals, and review the next marketing asset with less context switching.",
  )
  assert.equal(en.pricingPage.eyebrow, "Pricing")
  assert.equal(zh.pricingPage.eyebrow, "价格")
  assert.equal(en.home.audienceCards.length, 4)
  assert.notEqual(zh.home.description, en.home.description)
})
