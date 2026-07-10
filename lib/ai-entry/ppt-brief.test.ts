import assert from "node:assert/strict"
import test from "node:test"

import {
  buildPptBriefClarificationMessage,
  buildPptBriefConfirmationMessage,
  buildPptBriefConversationPromptSection,
  createPptBriefState,
  extractLatestPptBriefConfirmationContext,
  extractPptBriefState,
  stripPptBriefConfirmationContextMarkers,
} from "./ppt-brief"

test("raw user text is not interpreted into brief fields by code", () => {
  const state = extractPptBriefState({
    userMessages: ["做一个培训 PPT，受众是管理层，场景是产品发布，8 页"],
  })

  assert.equal(state.topic, "做一个培训 PPT，受众是管理层，场景是产品发布，8 页")
  assert.equal(state.audience, null)
  assert.equal(state.goal, null)
  assert.equal(state.scenario, null)
  assert.equal(state.language, null)
  assert.equal(state.pageCount, null)
  assert.equal(state.readyForPreview, false)
})

test("structured brief state computes only schema completeness and defaults", () => {
  const state = createPptBriefState({
    topic: "企业 AI 工作台",
    audience: "企业管理层",
    goal: "决策同步",
    scenario: "product-launch",
    language: "zh-CN",
    pageCount: 8,
    tone: "专业",
    mustInclude: ["产品能力"],
  })

  assert.equal(state.readyForPreview, true)
  assert.deepEqual(state.missingFields, [])
  assert.equal(state.suggestedValues.pageCount, 8)
})

test("clarification prompt is generated from structured missing fields", () => {
  const state = extractPptBriefState({ userMessages: ["做一个 PPT"] })
  const message = buildPptBriefClarificationMessage(state, true)

  assert.match(message, /还不能进入 PPT 预览/)
  assert.match(message, /这份 PPT 主要给谁看/)
  assert.match(message, /这次更接近哪种场景/)
})

test("brief confirmation markers persist only validated structured state", () => {
  const state = createPptBriefState({
    topic: "企业 AI 工作台",
    audience: "企业管理层",
    goal: "产品介绍",
    scenario: "product-launch",
    language: "zh-CN",
    pageCount: 8,
    tone: "专业",
    mustInclude: ["产品能力"],
  })
  const message = buildPptBriefConfirmationMessage(state, true)
  const context = extractLatestPptBriefConfirmationContext(message)

  assert.match(message, /PPT brief 已整理/)
  assert.equal(context?.audience, "企业管理层")
  assert.equal(context?.scenario, "product-launch")
  assert.equal(context?.pageCount, 8)
  assert.doesNotMatch(stripPptBriefConfirmationContextMarkers(message), /ai-entry-ppt-brief-confirmation/)
})

test("brief prompt delegates semantic interpretation to the LLM", () => {
  const prompt = buildPptBriefConversationPromptSection()

  assert.match(prompt, /update_ppt_brief/)
  assert.match(prompt, /Do not infer fields with keywords, regex, or fixed phrase lists/u)
})
