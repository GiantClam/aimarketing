import assert from "node:assert/strict"
import test from "node:test"

import {
  buildPptMasterRecommendedTemplateSummaries,
  getPptMasterLibraryTemplateIds,
  isPptMasterLibraryTemplateSupported,
} from "./ppt-worker-capabilities"

test("ppt-master library template ids exclude internal style aliases", () => {
  const templateIds = getPptMasterLibraryTemplateIds()

  assert.equal(templateIds.includes("long-table"), false)
  assert.equal(templateIds.includes("playful"), false)
  assert.equal(templateIds.includes("broadside"), false)
  assert.equal(templateIds.includes("neo-grid-bold"), false)
  assert.equal(templateIds.includes("cangzhuo"), false)
  assert.equal(templateIds.includes("general-dark-tech-claude-code-auto-mode"), false)
  assert.equal(templateIds.includes("smart_red"), true)
  assert.equal(templateIds.includes("科技蓝商务"), true)
})

test("ppt-master library template support only accepts concrete template ids", () => {
  assert.equal(isPptMasterLibraryTemplateSupported("long-table"), false)
  assert.equal(isPptMasterLibraryTemplateSupported("broadside"), false)
  assert.equal(isPptMasterLibraryTemplateSupported("cangzhuo"), false)
  assert.equal(isPptMasterLibraryTemplateSupported("smart_red"), true)
})

test("ppt-master recommendations prefer smart_red for tech-company intro briefs", () => {
  const templates = buildPptMasterRecommendedTemplateSummaries({
    prompt: "写一份介绍预算智能公司和业务的 PPT，强调科技公司介绍、解决方案能力和专业但有活力的视觉表达",
    scenario: "sales-deck",
    language: "zh-CN",
    researchBrief: {
      topic: "预算智能公司介绍",
      keyFacts: ["企业 AI 业务工作台", "面向老板、销售、运营和内容团队", "产品介绍与解决方案叙事并重"],
      implications: ["需要兼顾商务表达、科技感和产品能力展示"],
    },
  })

  assert.equal(templates[0]?.templateId, "smart_red")
  assert.equal(templates.some((item) => item.templateId === "科技蓝商务"), true)
})

test("ppt-master recommendations prefer exhibit for board review briefs", () => {
  const templates = buildPptMasterRecommendedTemplateSummaries({
    prompt: "做一份董事会经营复盘与风险诊断汇报 PPT，包含财务预算、关键决策与下一步计划",
    scenario: "sales-deck",
    language: "zh-CN",
  })

  assert.equal(templates[0]?.templateId, "exhibit")
})
