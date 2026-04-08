import test from "node:test"
import assert from "node:assert/strict"

import type { CoreMessage } from "ai"

import {
  detectExplicitReplyLanguageFromPrompt,
  resolveForcedReplyLanguage,
} from "./language-policy"

test("detect explicit reply language from user prompt", () => {
  assert.equal(detectExplicitReplyLanguageFromPrompt("请用英文回复"), "en")
  assert.equal(detectExplicitReplyLanguageFromPrompt("Please answer in English"), "en")
  assert.equal(detectExplicitReplyLanguageFromPrompt("后续请用中文回复"), "zh")
  assert.equal(detectExplicitReplyLanguageFromPrompt("Please respond in Chinese"), "zh")
  assert.equal(detectExplicitReplyLanguageFromPrompt("介绍一下你自己"), null)
})

test("forced language persists until an explicit switch", () => {
  const messages: CoreMessage[] = [
    { role: "user", content: "请用英文回复" },
    { role: "assistant", content: "Sure, I will reply in English." },
    { role: "user", content: "你能介绍一下我们的产品吗？" },
  ]

  assert.equal(resolveForcedReplyLanguage(messages), "en")
})

test("latest explicit language instruction overrides previous one", () => {
  const messages: CoreMessage[] = [
    { role: "user", content: "Please answer in English." },
    { role: "assistant", content: "Sure." },
    { role: "user", content: "后续请用中文回复" },
  ]

  assert.equal(resolveForcedReplyLanguage(messages), "zh")
})

