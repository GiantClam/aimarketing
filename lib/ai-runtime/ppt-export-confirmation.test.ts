import assert from "node:assert/strict"
import test from "node:test"

import {
  isExplicitPptExportConfirmation,
  isPptxExportAuthorized,
  shouldRunNativePptxExportFallback,
} from "./ppt-export-confirmation"

test("generic PPT requests do not grant export confirmation", () => {
  assert.equal(isExplicitPptExportConfirmation("需要写一个中国经济 2026 年上半年的分析 ppt"), false)
  assert.equal(isExplicitPptExportConfirmation("直接生成一份 PPT"), false)
  assert.equal(isExplicitPptExportConfirmation("请先给我预览，不要导出"), false)
})

test("explicit Chinese and English approvals grant export confirmation", () => {
  assert.equal(isExplicitPptExportConfirmation("确认，继续执行生成与质量检查。"), true)
  assert.equal(isExplicitPptExportConfirmation("确认导出 PPTX"), true)
  assert.equal(isExplicitPptExportConfirmation("Yes, go ahead and export it."), true)
})

test("PPTX publication requires confirmation for both PPT assistants", () => {
  const unconfirmed = { agentId: "executive-ppt", selectedSkillIds: ["ppt-master"], exportConfirmationGranted: false }
  const confirmed = { ...unconfirmed, exportConfirmationGranted: true }
  const unconfirmedDashi = { agentId: "executive-presentation-ppt", selectedSkillIds: ["dashiai-ppt"], exportConfirmationGranted: false }
  const confirmedDashi = { ...unconfirmedDashi, exportConfirmationGranted: true }

  assert.equal(shouldRunNativePptxExportFallback(unconfirmed), false)
  assert.equal(shouldRunNativePptxExportFallback(confirmed), true)
  assert.equal(isPptxExportAuthorized(unconfirmed), false)
  assert.equal(isPptxExportAuthorized(confirmed), true)
  assert.equal(isPptxExportAuthorized(unconfirmedDashi), false)
  assert.equal(isPptxExportAuthorized(confirmedDashi), true)
})
