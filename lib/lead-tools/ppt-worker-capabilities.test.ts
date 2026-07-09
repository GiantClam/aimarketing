import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import {
  buildPptMasterRecommendedTemplateSummaries,
  getPptMasterLibraryTemplateIds,
  getPptWorkerSupportedTemplateIds,
  isPptMasterLibraryTemplateSupported,
  resetPptWorkerCapabilitiesCachesForTests,
} from "./ppt-worker-capabilities"

test("ppt-master template manifest keeps worker ids available without runtime repo indexes", () => {
  const originalCwd = process.cwd()
  const originalRepoDir = process.env.PPT_MASTER_REPO_DIR
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ppt-worker-capabilities-"))

  try {
    process.chdir(tempDir)
    process.env.PPT_MASTER_REPO_DIR = path.join(tempDir, "missing-ppt-master")
    resetPptWorkerCapabilitiesCachesForTests()

    const templateIds = getPptWorkerSupportedTemplateIds()
    const templates = buildPptMasterRecommendedTemplateSummaries({
      prompt: "Generate an executive sales deck for an enterprise AI business workspace and agent platform.",
      scenario: "sales-deck",
      language: "zh-CN",
      pageCount: 4,
    })

    assert.equal(templateIds.length > 0, true)
    assert.equal(templateIds.includes("ppt169_building_effective_agents"), true)
    assert.equal(templateIds.includes("ppt169_global_ai_capital_2026"), true)
    assert.equal(templates.length > 0, true)
    assert.equal(typeof templates[0]?.templateId, "string")
  } finally {
    process.chdir(originalCwd)
    if (originalRepoDir === undefined) {
      delete process.env.PPT_MASTER_REPO_DIR
    } else {
      process.env.PPT_MASTER_REPO_DIR = originalRepoDir
    }
    resetPptWorkerCapabilitiesCachesForTests()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test("ppt-master library template ids exclude internal style aliases", () => {
  const templateIds = getPptMasterLibraryTemplateIds()

  assert.equal(templateIds.includes("long-table"), false)
  assert.equal(templateIds.includes("playful"), false)
  assert.equal(templateIds.includes("broadside"), false)
  assert.equal(templateIds.includes("neo-grid-bold"), false)
  assert.equal(templateIds.includes("cangzhuo"), false)
  assert.equal(templateIds.includes("general-dark-tech-claude-code-auto-mode"), false)
  assert.equal(templateIds.includes("smart_red"), false)
  assert.equal(templateIds.includes("科技蓝商务"), false)
  assert.equal(templateIds.includes("anthropic"), true)
  assert.equal(templateIds.includes("中国电信"), true)
  assert.equal(templateIds.includes("ppt169_general_dark_tech_claude_code_auto_mode"), true)
})

test("ppt-master library template support only accepts concrete template ids", () => {
  assert.equal(isPptMasterLibraryTemplateSupported("long-table"), false)
  assert.equal(isPptMasterLibraryTemplateSupported("broadside"), false)
  assert.equal(isPptMasterLibraryTemplateSupported("cangzhuo"), false)
  assert.equal(isPptMasterLibraryTemplateSupported("smart_red"), false)
  assert.equal(isPptMasterLibraryTemplateSupported("anthropic"), true)
  assert.equal(isPptMasterLibraryTemplateSupported("ppt169_general_dark_tech_claude_code_auto_mode"), true)
})

test("ppt-master recommendations prefer ai_ops for tech-company intro briefs while keeping official examples available", () => {
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

  assert.equal(templates[0]?.templateId, "ai_ops")
  assert.equal(templates.some((item) => item.templateId === "ppt169_general_dark_tech_claude_code_auto_mode"), true)
})

test("ppt-master recommendations prefer the official AI-capital example for board review briefs", () => {
  const templates = buildPptMasterRecommendedTemplateSummaries({
    prompt: "做一份董事会经营复盘与风险诊断汇报 PPT，包含财务预算、关键决策与下一步计划",
    scenario: "sales-deck",
    language: "zh-CN",
  })

  assert.equal(templates[0]?.templateId, "ppt169_global_ai_capital_2026")
})
