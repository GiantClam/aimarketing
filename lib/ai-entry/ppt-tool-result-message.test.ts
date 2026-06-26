import assert from "node:assert/strict"
import test from "node:test"

import { extractAiEntryArtifactsFromToolResult } from "./artifact-runtime"
import { buildPptToolResultMessage, stripPptArtifactRelativeLinks } from "./ppt-tool-result-message"

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
      "已生成 PPT 成品：",
      "- 标题: 企业 AI 营销工作台",
      "- 文件名: enterprise-ai-marketing-workspace-4p.pptx",
      "- 状态: Deck artifact generated and saved to the work library.",
      "- 在线预览链接: [https://www.aimarketingsite.com/api/platform/artifacts/118/download](https://www.aimarketingsite.com/api/platform/artifacts/118/download)",
      "- PPT 下载链接: [https://www.aimarketingsite.com/api/platform/artifacts/118/download?download=1](https://www.aimarketingsite.com/api/platform/artifacts/118/download?download=1)",
      "- 作品库链接: [https://www.aimarketingsite.com/dashboard/works](https://www.aimarketingsite.com/dashboard/works)",
    ].join("\n"),
  )
})

test("ppt tool result message labels html exports as html deliverables", () => {
  const message = buildPptToolResultMessage({
    toolName: "export_ppt_deck",
    origin: "https://www.aimarketingsite.com",
    isZh: true,
    result: {
      title: "企业 AI 营销工作台",
      fileName: "enterprise-ai-marketing-workspace-4p.html",
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
      "已生成 HTML 成品：",
      "- 标题: 企业 AI 营销工作台",
      "- 文件名: enterprise-ai-marketing-workspace-4p.html",
      "- 状态: Deck artifact generated and saved to the work library.",
      "- 在线打开链接: [https://www.aimarketingsite.com/api/platform/artifacts/118/download](https://www.aimarketingsite.com/api/platform/artifacts/118/download)",
      "- HTML 下载链接: [https://www.aimarketingsite.com/api/platform/artifacts/118/download?download=1](https://www.aimarketingsite.com/api/platform/artifacts/118/download?download=1)",
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

test("preview_ppt_deck does not produce artifact metadata before export", () => {
  const artifacts = extractAiEntryArtifactsFromToolResult({
    toolName: "preview_ppt_deck",
    result: {
      ok: true,
      previewSessionId: "preview-session-1",
      nextStep: "Choose a variant key, then call export_ppt_deck.",
      variants: [{ key: "variant-a", name: "Variant A" }],
    },
  })

  assert.deepEqual(artifacts, [])
})

test("export_ppt_deck produces artifact metadata for downstream artifact_created events", () => {
  const artifacts = extractAiEntryArtifactsFromToolResult({
    toolName: "export_ppt_deck",
    result: {
      ok: true,
      title: "企业 AI 营销工作台",
      fileName: "enterprise-ai-marketing-workspace-4p.pptx",
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      artifact: {
        kind: "pptx",
        title: "企业 AI 营销工作台",
        fileName: "enterprise-ai-marketing-workspace-4p.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        artifactId: 118,
        previewUrl: "/api/platform/artifacts/118/download",
        downloadUrl: "/api/platform/artifacts/118/download?download=1",
        workItemId: 9,
        toolRunId: 17,
      },
    },
  })

  assert.deepEqual(artifacts, [
    {
      kind: "pptx",
      title: "企业 AI 营销工作台",
      fileName: "enterprise-ai-marketing-workspace-4p.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      artifactId: 118,
      previewUrl: "/api/platform/artifacts/118/download",
      downloadUrl: "/api/platform/artifacts/118/download?download=1",
      workItemId: 9,
      toolRunId: 17,
    },
  ])
})

test("stripPptArtifactRelativeLinks removes raw artifact and work library relative paths", () => {
  const cleaned = stripPptArtifactRelativeLinks(`
我已经拿到4个版式预览，准备直接导出成品。
下载链接：/downloads/api/platform/artifacts/127/download?download=1

已按 Neo-Grid Bold 版式导出成品。

工作库入口：\`/dashboard/works\`
`)

  assert.equal(
    cleaned,
    [
      "我已经拿到4个版式预览，准备直接导出成品。",
      "已按 Neo-Grid Bold 版式导出成品。",
    ].join("\n\n"),
  )
})

test("stripPptArtifactRelativeLinks removes inline helper hints around download and work links", () => {
  const cleaned = stripPptArtifactRelativeLinks(`
我会优先选 Neo-Grid Bold，因为它更适合管理层汇报。/downloads 不可见时可直接使用这个完整下载链接：

\`/api/platform/artifacts/130/download?download=1\`

该文件也已保存到工作库：\`/dashboard/works\`

如果你要，我下一步可以继续补一版销售提案文案。
`)

  assert.equal(
    cleaned,
    [
      "如果你要，我下一步可以继续补一版销售提案文案。",
    ].join("\n\n"),
  )
})
