import assert from "node:assert/strict"
import test from "node:test"

import { normalizeAiEntryIdentity } from "./identity"

test("plain chat identity stays generic when no Agent is selected", () => {
  const answer = normalizeAiEntryIdentity(
    "我是企业咨询顾问，专注于策略和增长。",
    "你是谁？",
    "zh",
  )

  assert.match(answer, /通用 AI 助手/u)
  assert.match(answer, /没有加载任何 Agent/u)
  assert.doesNotMatch(answer, /企业咨询顾问/u)
})

test("selected Agent identity remains scoped to the selected Agent", () => {
  const answer = normalizeAiEntryIdentity(
    "我叫 Kiro，主要专注于软件开发和技术方面的帮助。",
    "你是谁？",
    "zh",
    "executive-growth",
  )

  assert.match(answer, /当前选中的企业 Agent/u)
  assert.doesNotMatch(answer, /Kiro/u)
})
