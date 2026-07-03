import assert from "node:assert/strict"
import test from "node:test"

import {
  buildPptBriefPromptSection,
  extractPptBriefState,
  preparePptPreviewInput,
} from "./ppt-brief"

test("extractPptBriefState infers scenario and suggested values from user messages", () => {
  const state = extractPptBriefState({
    userMessages: ["帮我做一份给客户提案的产品发布 PPT，10 页左右，风格简洁专业。"],
  })

  assert.equal(state.scenario, "sales-deck")
  assert.equal(state.language, "zh-CN")
  assert.equal(state.pageCount, 10)
  assert.match(state.suggestedValues.audience, /客户/)
})

test("extractPptBriefState treats product solution deck requests as sales-deck scenarios", () => {
  const state = extractPptBriefState({
    userMessages: ["请生成一份4页中文产品方案PPT，主题是企业AI营销工作台。受众是企业管理层。"],
  })

  assert.equal(state.scenario, "sales-deck")
  assert.equal(state.goal, "客户提案与说服")
  assert.equal(state.pageCount, 4)
})

test("buildPptBriefPromptSection includes missing fields and suggestions", () => {
  const state = extractPptBriefState({
    userMessages: ["帮我做一个 PPT"],
  })

  const section = buildPptBriefPromptSection(state)
  assert.match(section, /Missing fields to confirm/)
  assert.match(section, /suggested/)
})

test("preparePptPreviewInput blocks incomplete preview briefs", () => {
  const state = extractPptBriefState({
    userMessages: ["帮我做一个 PPT"],
  })

  const result = preparePptPreviewInput({
    rawInput: {
      prompt: "帮我做一个 PPT",
    },
    briefState: state,
  })

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.deepEqual(result.missingFields.sort(), ["audience", "scenario"])
  assert.equal(result.suggestedBrief.goal, "业务表达与结构化汇报")
})

test("preparePptPreviewInput enriches prompt once brief is complete", () => {
  const state = extractPptBriefState({
    userMessages: ["做一份给客户提案的产品发布 PPT，面向客户提案会，目标是客户提案与说服。"],
  })

  const result = preparePptPreviewInput({
    rawInput: {
      prompt: "做一份产品发布 PPT",
      audience: "客户提案会",
      goal: "客户提案与说服",
      scenario: "product-launch",
      language: "zh-CN",
      pageCount: 9,
    },
    briefState: state,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.match(result.input.prompt, /Structured brief:/)
  assert.match(result.input.prompt, /Audience: 客户提案会/)
  assert.equal(result.input.scenario, "product-launch")
})
