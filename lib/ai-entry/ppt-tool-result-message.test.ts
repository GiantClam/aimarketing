import assert from "node:assert/strict"
import test from "node:test"

import { buildPptToolResultMessage } from "./ppt-tool-result-message"

test("ppt tool result message expands relative export links into absolute URLs", () => {
  const message = buildPptToolResultMessage({
    toolName: "export_ppt_deck",
    origin: "https://www.aimarketingsite.com",
    isZh: true,
    result: {
      title: "企业 AI 营销工作台",
      fileName: "enterprise-ai-marketing-workspace-4p.pptx",
      previewUrl: "/api/platform/artifacts/118/download",
      downloadUrl: "/api/platform/artifacts/118/download?download=1",
      workLibraryHref: "/dashboard/works",
      message: "Deck artifact generated and saved to the work library.",
    },
  })

  assert.equal(
    message,
    [
      "",
      "",
      "已生成可交付文件：",
      "- 标题: 企业 AI 营销工作台",
      "- 文件名: enterprise-ai-marketing-workspace-4p.pptx",
      "- 状态: Deck artifact generated and saved to the work library.",
      "- 在线预览链接: [https://www.aimarketingsite.com/api/platform/artifacts/118/download](https://www.aimarketingsite.com/api/platform/artifacts/118/download)",
      "- 完整下载链接: [https://www.aimarketingsite.com/api/platform/artifacts/118/download?download=1](https://www.aimarketingsite.com/api/platform/artifacts/118/download?download=1)",
      "- 作品库链接: [https://www.aimarketingsite.com/dashboard/works](https://www.aimarketingsite.com/dashboard/works)",
    ].join("\n"),
  )
})

test("ppt tool result message returns null for unrelated tools", () => {
  assert.equal(
    buildPptToolResultMessage({
      toolName: "web_search",
      result: { ok: true },
      origin: "https://www.aimarketingsite.com",
    }),
    null,
  )
})
