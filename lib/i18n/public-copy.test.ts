import assert from "node:assert/strict"
import test from "node:test"

import { getPublicCopy } from "@/lib/i18n/public-copy"

test("public copy switches homepage and pricing labels between zh and en", () => {
  const zh = getPublicCopy("zh")
  const en = getPublicCopy("en")

  assert.equal(en.header.login, "Log in")
  assert.equal(zh.header.login, "登录")
  assert.equal(en.home.title, "One AI Marketing Workspace for Small Teams")
  assert.equal(zh.home.title, "一个面向小团队的 AI Marketing 工作台")
  assert.equal(en.pricingPage.eyebrow, "Pricing")
  assert.equal(zh.pricingPage.eyebrow, "价格")
  assert.notEqual(zh.home.description, en.home.description)
})
