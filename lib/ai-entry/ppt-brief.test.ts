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

test("extractPptBriefState honors explicit follow-up fields and preserves the original topic", () => {
  const state = extractPptBriefState({
    userMessages: [
      "做一个克里米亚现状的ppt，10页，检索2026年最新的信息",
      "受众=初级军事爱好者；场景=战略分析；目标=课堂讲解；语言=中文。",
    ],
  })

  assert.equal(state.topic, "做一个克里米亚现状的ppt，10页，检索2026年最新的信息")
  assert.equal(state.audience, "初级军事爱好者")
  assert.equal(state.scenario, "sales-deck")
  assert.equal(state.goal, "课堂讲解")
  assert.equal(state.language, "zh-CN")
  assert.equal(state.readyForPreview, true)
})

test("extractPptBriefState prefers the latest explicit field value across turns", () => {
  const state = extractPptBriefState({
    userMessages: [
      "做一个克里米亚现状的ppt",
      "受众=管理层；场景=战略汇报；目标=高层同步；语言=中文。",
      "受众=初级军事爱好者；目标=课堂讲解。",
    ],
  })

  assert.equal(state.audience, "初级军事爱好者")
  assert.equal(state.goal, "课堂讲解")
  assert.equal(state.scenario, "sales-deck")
  assert.equal(state.language, "zh-CN")
  assert.equal(state.readyForPreview, true)
})

test("extractPptBriefState recognizes natural-language follow-up answers after clarification", () => {
  const state = extractPptBriefState({
    userMessages: [
      "做一个克里米亚现状的ppt，10页，检索2026年最新的信息",
      "受众是初级军事爱好者，场景是50人的课堂讲解",
    ],
  })

  assert.equal(state.audience, "初级军事爱好者")
  assert.equal(state.scenario, "training")
  assert.equal(state.goal, "培训讲解与统一认知")
  assert.equal(state.language, "zh-CN")
  assert.equal(state.pageCount, 10)
  assert.equal(state.readyForPreview, true)
})

test("extractPptBriefState reads comma-separated natural-language brief fields", () => {
  const state = extractPptBriefState({
    userMessages: [
      "请生成一份4页中文产品方案PPT，主题是企业AI营销工作台。受众是企业管理层，场景是产品发布，目标是产品介绍，语言是中文。",
    ],
  })

  assert.equal(state.audience, "企业管理层")
  assert.equal(state.scenario, "product-launch")
  assert.equal(state.goal, "产品介绍")
  assert.equal(state.language, "zh-CN")
  assert.equal(state.pageCount, 4)
  assert.equal(state.readyForPreview, true)
})
