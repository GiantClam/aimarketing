import assert from "node:assert/strict"
import test from "node:test"

import { extractAiEntryArtifactsFromToolResult } from "./artifact-runtime"
import {
  buildPptTemplateRecommendationMessage,
  buildPptToolResultMessage,
  extractLatestPptExportContext,
  extractLatestPptPreviewInvalidationContext,
  extractLatestPptPreviewContext,
  extractLatestPptTemplateRecommendationContext,
  resolvePptTemplateSelectionFromUserText,
  resolveLatestPptConversationState,
  stripPptArtifactRelativeLinks,
} from "./ppt-tool-result-message"

test("ppt tool result message expands relative export links into absolute URLs", () => {
  const message = buildPptToolResultMessage({
    toolName: "export_ppt_deck",
    origin: "https://www.aimarketingsite.com",
    isZh: true,
    result: {
      previewSessionId: "preview-session-1",
      selectedVariantKey: "variant-a",
      artifactId: 118,
      title: "企业 AI 营销工作台",
      fileName: "enterprise-ai-marketing-workspace-4p.pptx",
      previewUrl: "/api/platform/artifacts/118/download",
      downloadUrl: "/api/platform/artifacts/118/download?download=1",
      workLibraryHref: "/dashboard/works",
      message: "Deck artifact generated and saved to the work library.",
    },
  })

  assert.match(message || "", /已生成 PPT 成品：/)
  assert.match(message || "", /enterprise-ai-marketing-workspace-4p\.pptx/)
  assert.match(message || "", /PPT 下载链接/)
  assert.deepEqual(extractLatestPptExportContext(message), {
    previewSessionId: "preview-session-1",
    selectedVariantKey: "variant-a",
    artifactId: 118,
  })
})

test("ppt tool result message labels html exports as html deliverables", () => {
  const message = buildPptToolResultMessage({
    toolName: "export_ppt_deck",
    origin: "https://www.aimarketingsite.com",
    isZh: true,
    result: {
      previewSessionId: "preview-session-1",
      selectedVariantKey: "variant-a",
      artifactId: 118,
      title: "企业 AI 营销工作台",
      fileName: "enterprise-ai-marketing-workspace-4p.html",
      previewUrl: "/api/platform/artifacts/118/download",
      downloadUrl: "/api/platform/artifacts/118/download?download=1",
      workLibraryHref: "/dashboard/works",
      message: "Deck artifact generated and saved to the work library.",
    },
  })

  assert.match(message || "", /已生成 HTML 成品：/)
  assert.match(message || "", /enterprise-ai-marketing-workspace-4p\.html/)
  assert.match(message || "", /HTML 下载链接/)
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

test("preview ppt tool result message includes a hidden preview context marker", () => {
  const message = buildPptToolResultMessage({
    toolName: "preview_ppt_deck",
    origin: "https://www.aimarketingsite.com",
    isZh: true,
    result: {
      ok: true,
      previewSessionId: "preview-session-1",
      title: "企业 AI 营销工作台",
      recommendedVariantKey: "variant-b",
      recommendedVariantName: "Variant B",
      selectedTemplateId: "long-table",
      recommendedTemplates: [
        { rank: 1, templateId: "long-table", templateLabel: "Long Table", styleName: "Long Table" },
        { rank: 2, templateId: "neo-grid-bold", templateLabel: "Neo Grid Bold", styleName: "Neo-Grid Bold" },
        { rank: 3, templateId: "broadside", templateLabel: "Broadside", styleName: "Broadside" },
        { rank: 4, templateId: "playful", templateLabel: "Playful", styleName: "Playful" },
      ],
      variants: [
        { key: "variant-a", name: "Variant A" },
        { key: "variant-b", name: "Variant B" },
      ],
    },
  })

  assert.match(message || "", /已生成 PPT 预览：/)
  assert.match(message || "", /默认推荐版本: Variant B \(variant-b\)/)
  assert.match(message || "", /模板推荐: 1\.Long Table/)
  assert.match(message || "", /本次已采用模板: long-table/)

  const context = extractLatestPptPreviewContext(message)
  assert.deepEqual(context, {
    previewSessionId: "preview-session-1",
    defaultVariantKey: "variant-b",
    variantKeys: ["variant-a", "variant-b"],
  })
})

test("preview ppt tool result message explains background generation when preview is queued", () => {
  const message = buildPptToolResultMessage({
    toolName: "preview_ppt_deck",
    isZh: true,
    result: {
      ok: true,
      status: "queued",
      message: "可编辑 PPT 已切换为后台生成，系统会继续轮询并在完成后回填预览结果。",
      backgroundTask: {
        taskId: "901",
      },
    },
  })

  assert.match(message || "", /已切换为后台生成：/)
  assert.match(message || "", /任务 ID: 901/)
  assert.match(message || "", /后台生成/)
})

test("template recommendation message includes a hidden template context marker", () => {
  const message = buildPptTemplateRecommendationMessage({
    title: "董事会经营复盘",
    recommendedTemplates: [
      { rank: 1, templateId: "long-table", templateLabel: "Long Table", styleName: "Long Table" },
      { rank: 2, templateId: "neo-grid-bold", templateLabel: "Neo Grid Bold", styleName: "Neo-Grid Bold" },
      { rank: 3, templateId: "broadside", templateLabel: "Broadside", styleName: "Broadside" },
      { rank: 4, templateId: "playful", templateLabel: "Playful", styleName: "Playful" },
    ],
    isZh: true,
  })

  assert.match(message || "", /已为这次需求推荐 4 个模板：/)
  assert.match(message || "", /1\. Long Table \(long-table\)/)
  assert.match(message || "", /回复模板编号或模板名称/)
  assert.deepEqual(extractLatestPptTemplateRecommendationContext(message), {
    defaultTemplateId: "long-table",
    templateIds: ["long-table", "neo-grid-bold", "broadside", "playful"],
  })
})

test("template selection can be resolved by rank or template name", () => {
  const context = {
    defaultTemplateId: "long-table",
    templateIds: ["long-table", "neo-grid-bold", "broadside", "playful"],
  }

  assert.equal(resolvePptTemplateSelectionFromUserText("用第2个模板生成", context), "neo-grid-bold")
  assert.equal(resolvePptTemplateSelectionFromUserText("改用 broadside", context), "broadside")
  assert.equal(resolvePptTemplateSelectionFromUserText("试试长桌纪要", context), "long-table")
})

test("ppt conversation state resolves preview-ready and exported phases from hidden markers", () => {
  const previewMessage = buildPptToolResultMessage({
    toolName: "preview_ppt_deck",
    result: {
      ok: true,
      previewSessionId: "preview-session-1",
      title: "企业 AI 营销工作台",
      recommendedVariantKey: "variant-b",
      variants: [
        { key: "variant-a", name: "Variant A" },
        { key: "variant-b", name: "Variant B" },
      ],
    },
  })
  const exportMessage = buildPptToolResultMessage({
    toolName: "export_ppt_deck",
    result: {
      ok: true,
      title: "企业 AI 营销工作台",
      previewSessionId: "preview-session-1",
      selectedVariantKey: "variant-b",
      artifactId: 118,
      fileName: "enterprise-ai-marketing-workspace-4p.pptx",
      previewUrl: "/api/platform/artifacts/118/download",
      downloadUrl: "/api/platform/artifacts/118/download?download=1",
      workLibraryHref: "/dashboard/works",
      message: "Deck artifact generated and saved to the work library.",
    },
  })

  assert.deepEqual(resolveLatestPptConversationState([previewMessage || ""]), {
    latestPreview: {
      previewSessionId: "preview-session-1",
      defaultVariantKey: "variant-b",
      variantKeys: ["variant-a", "variant-b"],
    },
    latestExport: null,
    phase: "preview-ready",
  })

  assert.deepEqual(resolveLatestPptConversationState([previewMessage || "", exportMessage || ""]), {
    latestPreview: {
      previewSessionId: "preview-session-1",
      defaultVariantKey: "variant-b",
      variantKeys: ["variant-a", "variant-b"],
    },
    latestExport: {
      previewSessionId: "preview-session-1",
      selectedVariantKey: "variant-b",
      artifactId: 118,
    },
    phase: "exported",
  })
})

test("export missing_preview_session emits a hidden invalidation marker and clears stale preview state", () => {
  const previewMessage = buildPptToolResultMessage({
    toolName: "preview_ppt_deck",
    result: {
      ok: true,
      previewSessionId: "preview-session-stale",
      title: "企业 AI 营销工作台",
      recommendedVariantKey: "variant-a",
      variants: [{ key: "variant-a", name: "Variant A" }],
    },
  })
  const invalidationMessage = buildPptToolResultMessage({
    toolName: "export_ppt_deck",
    result: {
      ok: false,
      previewSessionId: "preview-session-stale",
      error: {
        code: "missing_preview_session",
        message: "The PPT preview session is no longer available. Generate the preview again before export.",
      },
    },
  })

  assert.match(invalidationMessage || "", /预览已失效|preview is no longer available/i)
  assert.deepEqual(extractLatestPptPreviewInvalidationContext(invalidationMessage), {
    previewSessionId: "preview-session-stale",
  })
  assert.deepEqual(resolveLatestPptConversationState([previewMessage || "", invalidationMessage || ""]), {
    latestPreview: null,
    latestExport: null,
    phase: "preview-invalidated",
  })
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
