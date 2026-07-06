import assert from "node:assert/strict"
import test from "node:test"

import {
  resolvePptPreviewDisplayTitle,
  resolvePptPreviewVariantDisplayLabel,
} from "./ppt-preview-display"

test("preview display title strips the structured brief payload", () => {
  const title = resolvePptPreviewDisplayTitle(
    [
      "请生成一份 4 页中文可编辑 PPT，主题是“企业 AI 营销工作台”。",
      "Structured brief:",
      "Audience: 管理层汇报",
      "Goal: 20分钟内部汇报",
    ].join(" "),
    "zh-CN",
  )

  assert.equal(title, "企业 AI 营销工作台")
})

test("preview variant display label prefers template label before style name", () => {
  const label = resolvePptPreviewVariantDisplayLabel(
    { language: "zh-CN" },
    {
      key: "swiss-grid-executive-brief",
      templateId: "swiss-grid",
      name: "Neo-Grid Bold",
    },
  )

  assert.equal(label, "瑞士网格 / Neo-Grid Bold")
})
