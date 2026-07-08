import assert from "node:assert/strict"
import test from "node:test"

import { extractAiEntryArtifactsFromToolResult } from "./artifact-runtime"
import {
  buildPptTemplateRecommendationMessage,
  buildPptToolResultMessage,
  collapsePptTemplateRecommendationMessageBlocks,
  extractQueuedPptBackgroundTaskContext,
  extractLatestPptExportContext,
  extractLatestPptPreviewInvalidationContext,
  extractLatestPptPreviewContext,
  extractLatestPptTemplateRecommendationContext,
  extractPptTemplateRecommendationContexts,
  isQueuedPptBackgroundStatusMessage,
  resolvePptCatalogTemplateSelectionFromUserText,
  resolvePptTemplateSelectionFromUserText,
  resolveLatestPptConversationState,
  stripPptArtifactRelativeLinks,
  stripPptHiddenContextMarkers,
  stripPptTemplateRecommendationMessageBlocks,
  stripPptTemplateRecommendationContextMarkers,
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
  assert.doesNotMatch(message || "", /模板推荐:/)
  assert.match(message || "", /本次已采用模板: Long Table \(long-table\)/)

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
      message:
        "PPT 已切换为后台生成 SVG 预览。系统会继续轮询并在完成后回填预览结果；只有在导出下载时才会继续生成可编辑 PPTX，复杂或长页数 deck 可能需要十几分钟。",
      selectedTemplateId: "deck-china-telecom",
      recommendedTemplates: [
        {
          rank: 1,
          templateId: "deck-china-telecom",
          templateLabel: "中国电信",
          styleName: "Neo-Grid Bold",
        },
      ],
      backgroundTask: {
        taskId: "901",
      },
    },
  })

  assert.match(message || "", /已切换为后台生成：/)
  assert.match(message || "", /任务 ID: 901/)
  assert.match(message || "", /后台生成/)
  assert.match(message || "", /本次已采用模板: 中国电信 \(deck-china-telecom\)/)
  assert.equal(isQueuedPptBackgroundStatusMessage(message), true)
})

test("queued background status detector ignores real preview messages", () => {
  const message = buildPptToolResultMessage({
    toolName: "preview_ppt_deck",
    isZh: true,
    result: {
      ok: true,
      previewSessionId: "preview-session-1",
      title: "企业 AI 营销工作台",
      recommendedVariantKey: "variant-a",
      variants: [{ key: "variant-a", name: "Variant A" }],
    },
  })

  assert.equal(isQueuedPptBackgroundStatusMessage(message), false)
})

test("queued background task context can be extracted from mixed assistant prose", () => {
  const content = [
    "预览正在后台生成中，请稍候片刻 ☕",
    "",
    "已切换为后台生成：",
    "- 任务 ID: 901",
    "- 状态: 系统会持续轮询，完成后自动回填预览结果；复杂或长页数 deck 可能需要十几分钟。",
  ].join("\n")

  assert.deepEqual(extractQueuedPptBackgroundTaskContext(content), {
    taskId: "901",
    statusText: "系统会持续轮询，完成后自动回填预览结果；复杂或长页数 deck 可能需要十几分钟。",
  })
  assert.equal(isQueuedPptBackgroundStatusMessage(content), false)
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
  assert.match(message || "", /回复模板 ID 或模板名称/)
  assert.deepEqual(extractLatestPptTemplateRecommendationContext(message), {
    defaultTemplateId: "long-table",
    templateIds: ["long-table", "neo-grid-bold", "broadside", "playful"],
    templates: [
      { templateId: "long-table", labels: ["Long Table", "Long Table", "long-table"] },
      { templateId: "neo-grid-bold", labels: ["Neo Grid Bold", "Neo-Grid Bold", "neo-grid-bold"] },
      { templateId: "broadside", labels: ["Broadside", "Broadside", "broadside"] },
      { templateId: "playful", labels: ["Playful", "Playful", "playful"] },
    ],
  })
})

test("template recommendation marker can be extracted and stripped for persisted message rendering", () => {
  const message = buildPptTemplateRecommendationMessage({
    recommendedTemplates: [
      { rank: 1, templateId: "anthropic-brand", templateLabel: "Anthropic 品牌", styleName: "Long Table" },
      { rank: 2, templateId: "academic-defense", templateLabel: "学术答辩", styleName: "Attention Research" },
    ],
    isZh: true,
  })
  const content = `正文\n${message}\n结尾`

  assert.equal(extractPptTemplateRecommendationContexts(content).length, 1)
  assert.deepEqual(extractPptTemplateRecommendationContexts(content)[0]?.templateIds, [
    "anthropic-brand",
    "academic-defense",
  ])
  assert.doesNotMatch(stripPptTemplateRecommendationContextMarkers(content), /ai-entry-ppt-template-recommendations/)
  assert.match(stripPptTemplateRecommendationContextMarkers(content), /Anthropic 品牌/)
})

test("template recommendation message blocks can be removed without touching surrounding text", () => {
  const block = buildPptTemplateRecommendationMessage({
    recommendedTemplates: [
      { rank: 1, templateId: "government-blue", templateLabel: "政务蓝", styleName: "Government Blue" },
      { rank: 2, templateId: "global-ai-capital-2026", templateLabel: "全球 AI 资本 2026", styleName: "Global AI Capital" },
    ],
    isZh: true,
  })

  const content = [
    "前文说明",
    block,
    "后文结论",
  ].join("\n\n")

  assert.equal(stripPptTemplateRecommendationMessageBlocks(content), "前文说明\n\n后文结论")
})

test("template recommendation message blocks collapse to the latest generated block", () => {
  const olderBlock = buildPptTemplateRecommendationMessage({
    recommendedTemplates: [
      { rank: 1, templateId: "government-blue", templateLabel: "政务蓝", styleName: "Government Blue" },
      { rank: 2, templateId: "ai-ops", templateLabel: "AI 运维", styleName: "AI Ops" },
    ],
    isZh: true,
  })
  const newerBlock = buildPptTemplateRecommendationMessage({
    recommendedTemplates: [
      { rank: 1, templateId: "government-blue", templateLabel: "政务蓝", styleName: "Government Blue" },
      { rank: 2, templateId: "cangzhuo", templateLabel: "苍桌纪要", styleName: "Cangzhuo" },
    ],
    isZh: true,
  })

  const content = [
    "前文说明",
    olderBlock,
    newerBlock,
  ].join("\n\n")
  const collapsed = collapsePptTemplateRecommendationMessageBlocks(content)

  assert.equal((collapsed.match(/已为这次需求推荐 4 个模板：/g) || []).length, 1)
  assert.match(collapsed, /苍桌纪要 \(cangzhuo\)/)
  assert.doesNotMatch(collapsed, /AI 运维 \(ai-ops\)/)
})

test("hidden ppt context markers are stripped before markdown rendering", () => {
  const content = [
    "正文开始",
    '<!-- ai-entry-ppt-preview-context:{"previewSessionId":"ps1","defaultVariantKey":"v1","variantKeys":["v1"]} -->',
    '<!-- ai-entry-ppt-export-context:{"previewSessionId":"ps1","selectedVariantKey":"v1","artifactId":12} -->',
    '<!-- ai-entry-ppt-preview-invalidated:{"previewSessionId":"ps1"} -->',
    '<!-- ai-entry-ppt-template-recommendations:{"defaultTemplateId":"government-blue","templateIds":["government-blue"],"templates":[{"templateId":"government-blue","labels":["政务蓝","government-blue"]}]} -->',
    '<!-- ai-entry-research-brief:{"topic":"Crimea current status military posture 2025 2026","keyFacts":["Crimea remains strategically important."],"rawSummary":"Topic: Crimea current status military posture 2025 2026"} -->',
    "正文结束",
  ].join("\n")

  const cleaned = stripPptHiddenContextMarkers(content)
  assert.equal(cleaned.includes("ai-entry-ppt-"), false)
  assert.equal(cleaned.includes("ai-entry-research-brief"), false)
  assert.match(cleaned, /正文开始/)
  assert.match(cleaned, /正文结束/)
})

test("template selection resolves explicit template ids and labels from recommendation context", () => {
  const context = {
    defaultTemplateId: "long-table",
    templateIds: ["long-table", "neo-grid-bold", "broadside", "playful"],
    templates: [
      { templateId: "long-table", labels: ["长桌纪要", "Long Table", "long-table"] },
      { templateId: "neo-grid-bold", labels: ["新网格粗体", "Neo Grid Bold", "neo-grid-bold"] },
      { templateId: "broadside", labels: ["告示海报", "Broadside", "broadside"] },
      { templateId: "playful", labels: ["轻快玩味", "Playful", "playful"] },
    ],
  }

  assert.equal(resolvePptTemplateSelectionFromUserText("用 neo-grid-bold 模板生成", context), "neo-grid-bold")
  assert.equal(resolvePptTemplateSelectionFromUserText("改用 broadside", context), "broadside")
  assert.equal(resolvePptTemplateSelectionFromUserText("试试长桌纪要", context), "long-table")
  assert.equal(resolvePptTemplateSelectionFromUserText("选择新网格粗体", context), "neo-grid-bold")
  assert.equal(resolvePptTemplateSelectionFromUserText("用第一个模板生成", context), "long-table")
  assert.equal(resolvePptTemplateSelectionFromUserText("用第2个模板生成", context), "neo-grid-bold")
})

test("template selection can resolve explicit catalog template names without a recommendation context", () => {
  assert.equal(resolvePptCatalogTemplateSelectionFromUserText("用 swiss-grid 模板生成"), "swiss-grid")
  assert.equal(resolvePptCatalogTemplateSelectionFromUserText("改成瑞士网格"), "swiss-grid")
  assert.equal(resolvePptCatalogTemplateSelectionFromUserText("确认 academic-defense"), "academic-defense")
  assert.equal(resolvePptCatalogTemplateSelectionFromUserText("使用学术答辩"), "academic-defense")
})

test("preview failure with recommended templates produces selectable template context", () => {
  const message = buildPptToolResultMessage({
    toolName: "preview_ppt_deck",
    isZh: true,
    result: {
      ok: false,
      error: {
        code: "ppt_template_selection_required",
        message: "Select one recommended template before generating the editable PPT preview.",
      },
      recommendedTemplates: [
        {
          rank: 1,
          templateId: "general-dark-tech-claude-code-auto-mode",
          templateLabel: "暗色科技",
          styleName: "General Dark Tech",
        },
        {
          rank: 2,
          templateId: "swiss-grid",
          templateLabel: "瑞士网格",
          styleName: "Swiss Grid",
        },
      ],
    },
  })

  assert.match(message || "", /暗色科技 \(general-dark-tech-claude-code-auto-mode\)/)
  const context = extractLatestPptTemplateRecommendationContext(message)
  assert.equal(
    resolvePptTemplateSelectionFromUserText("选择暗色科技", context),
    "general-dark-tech-claude-code-auto-mode",
  )
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
