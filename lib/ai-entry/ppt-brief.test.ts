import assert from "node:assert/strict"
import test from "node:test"

import {
  buildPptBriefConfirmationMessage,
  buildPptBriefClarificationMessage,
  extractLatestPptBriefConfirmationContext,
  extractPptBriefState,
  isPptBriefConfirmationReply,
  stripPptBriefConfirmationContextMarkers,
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

test("buildPptBriefConfirmationMessage presents a complete brief and persists its confirmation context", () => {
  const state = extractPptBriefState({
    userMessages: ["做一个日本近期地震的 PPT，受众是初级军事爱好者，场景是课堂讲解，目标是培训讲解，语言是中文，12页。"],
  })

  const message = buildPptBriefConfirmationMessage(state, true)
  const context = extractLatestPptBriefConfirmationContext(message)

  assert.match(message, /PPT brief 已整理/)
  assert.match(message, /受众：初级军事爱好者/)
  assert.match(message, /回复“确认 brief”/)
  assert.equal(context?.sourcePrompt, state.topic)
  assert.equal(context?.audience, "初级军事爱好者")
  assert.equal(context?.scenario, "training")
})

test("brief follow-up edits merge into the existing brief instead of becoming a new topic", () => {
  const state = extractPptBriefState({
    userMessages: [
      "做一个日本地震现状的 PPT，受众是初级军事爱好者，场景是课堂讲解，目标是培训讲解，语言是中文，12页。",
      "把页数改为 8 页",
    ],
  })

  assert.equal(state.pageCount, 8)
  assert.equal(state.audience, "初级军事爱好者")
  assert.equal(state.scenario, "training")
  assert.equal(state.language, "zh-CN")
  assert.match(state.topic || "", /日本地震现状/)
  assert.doesNotMatch(state.topic || "", /页数改为|改为 8 页/)
})

test("natural-language page-count corrections use the latest value and preserve the topic", () => {
  const state = extractPptBriefState({
    userMessages: [
      "生成一个阐述俄乌战争现状的 ppt，受众是军事爱好者，50人培训",
      "12页太多了，10页就行",
    ],
  })

  assert.equal(state.pageCount, 10)
  assert.match(state.topic || "", /俄乌战争现状/)
  assert.doesNotMatch(state.topic || "", /12页太多了|10页就行/)
})

test("natural-language page-count corrections override an earlier labeled page count", () => {
  const state = extractPptBriefState({
    userMessages: [
      "生成一个俄乌战争现状培训 PPT，受众是军事爱好者，场景是培训，目标是课堂讲解，语言是中文，页数=12",
      "12页太多了，10页就行",
    ],
  })

  assert.equal(state.pageCount, 10)
})

test("brief follow-up edits can update every editable brief field", () => {
  const state = extractPptBriefState({
    userMessages: [
      "做一个日本地震现状的 PPT，受众是初级军事爱好者，场景是课堂讲解，目标是培训讲解，语言是中文，12页。",
      "主题改为日本地震风险简报；受众改为企业管理层；目标改为战略决策同步；场景改为战略汇报；语言改为英文；页数改为 8 页；风格改为数据驱动；必须包含改为风险地图、行动建议。",
    ],
  })

  assert.equal(state.topic, "日本地震风险简报")
  assert.equal(state.audience, "企业管理层")
  assert.equal(state.goal, "战略决策同步")
  assert.equal(state.scenario, "sales-deck")
  assert.equal(state.language, "en-US")
  assert.equal(state.pageCount, 8)
  assert.equal(state.tone, "数据驱动")
  assert.deepEqual(state.mustInclude, ["风险地图", "行动建议"])
})

test("brief confirmation markers are hidden from the rendered assistant reply", () => {
  const state = extractPptBriefState({
    userMessages: ["做一个日本近期地震的 PPT，受众是初级军事爱好者，场景是课堂讲解，目标是培训讲解，语言是中文。"],
  })
  const message = buildPptBriefConfirmationMessage(state, true)

  const cleaned = stripPptBriefConfirmationContextMarkers(message)
  assert.match(cleaned, /PPT brief 已整理/)
  assert.doesNotMatch(cleaned, /ai-entry-ppt-brief-confirmation/)
})

test("isPptBriefConfirmationReply only accepts an explicit brief confirmation", () => {
  assert.equal(isPptBriefConfirmationReply("确认 brief"), true)
  assert.equal(isPptBriefConfirmationReply("brief 确认，继续"), true)
  assert.equal(isPptBriefConfirmationReply("直接生成 PPT"), false)
  assert.equal(isPptBriefConfirmationReply("确认使用第 2 个模板"), false)
})
