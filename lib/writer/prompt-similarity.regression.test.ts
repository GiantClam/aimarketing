import assert from "node:assert/strict"
import test from "node:test"

import {
  calculateWriterPromptSimilarity,
  ensureWriterPromptDiversity,
  extractWriterPromptFocus,
} from "./prompt-similarity"

test("writer prompt similarity is 1 for identical prompts", () => {
  const prompt = "Section focus: 选题策略. Section summary: 提升内容效率. Visual style: editorial."
  assert.equal(calculateWriterPromptSimilarity(prompt, prompt), 1)
})

test("writer prompt focus extraction keeps section-specific content", () => {
  const prompt =
    "WeChat Official Account inline editorial image. Section focus: 选题策略. Section summary: 通过数据复盘建立机制. Visual style: professional."
  const focus = extractWriterPromptFocus(prompt)
  assert.match(focus, /选题策略/)
  assert.match(focus, /数据复盘/)
})

test("writer prompt diversity rewrites overly similar prompts", () => {
  const basePrompt =
    "WeChat Official Account inline editorial image. Section focus: 选题策略. Section summary: 通过数据复盘建立机制. Visual style: professional."

  const diversified = ensureWriterPromptDiversity({
    assetId: "inline-2",
    prompt: basePrompt,
    existing: [{ assetId: "inline-1", focus: extractWriterPromptFocus(basePrompt) }],
    maxAttempts: 3,
    similarityMax: 0.7,
  })

  assert.ok(diversified.attempt >= 2)
  assert.match(diversified.prompt, /Unique prompt key:/)
})
