import assert from "node:assert/strict"
import test from "node:test"

import { isIdentityPrompt, normalizeAiEntryIdentity } from "@/lib/ai-entry/identity"

test("普通问候不会被默认改写成自我介绍", () => {
  const result = normalizeAiEntryIdentity("你好，很高兴见到你。", "你好", "zh")

  assert.equal(result, "你好，很高兴见到你。")
})

test("身份询问时会返回统一身份说明", () => {
  const result = normalizeAiEntryIdentity("你好", "你是谁？", "zh")

  assert.equal(result, "我是通用咨询顾问助手，专注于策略、增长、运营与执行优化等业务问题。")
})

test("仅明确身份询问才命中身份检测", () => {
  assert.equal(isIdentityPrompt("你是谁？"), true)
  assert.equal(isIdentityPrompt("介绍一下你自己"), true)
  assert.equal(isIdentityPrompt("你好"), false)
  assert.equal(isIdentityPrompt("帮我看下这个方案"), false)
})
