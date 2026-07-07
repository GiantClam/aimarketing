import assert from "node:assert/strict"
import test from "node:test"

import {
  buildPptBriefClarificationMessage,
  extractPptBriefState,
} from "./ppt-brief"

test("extractPptBriefState recognizes strategic briefing style follow-up prompts", () => {
  const state = extractPptBriefState({
    userMessages: [
      "做一个克里米亚现状的ppt",
      "给管理层看的战略分析汇报，10页，检索2026年最新的信息",
    ],
  })

  assert.equal(state.audience, "管理层汇报")
  assert.equal(state.scenario, "sales-deck")
  assert.equal(state.language, "zh-CN")
  assert.equal(state.pageCount, 10)
  assert.equal(state.readyForPreview, true)
})

test("buildPptBriefClarificationMessage asks targeted follow-up questions for missing fields", () => {
  const state = extractPptBriefState({
    userMessages: ["做一个克里米亚现状的ppt，10页，检索2026年最新的信息"],
  })

  const message = buildPptBriefClarificationMessage(state, true)

  assert.match(message, /还不能进入 PPT 预览/)
  assert.match(message, /这份 PPT 主要给谁看/)
  assert.match(message, /这次更接近哪种场景/)
  assert.match(message, /我收到后会继续追问，直到 brief 完整再进入预览/)
})
