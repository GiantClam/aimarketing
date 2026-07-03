type ExportPptDeckResult = {
  ok?: unknown
  previewSessionId?: unknown
  selectedVariantKey?: unknown
  title?: unknown
  fileName?: unknown
  artifactId?: unknown
  workItemId?: unknown
  workLibraryHref?: unknown
  previewUrl?: unknown
  downloadUrl?: unknown
  message?: unknown
  error?: unknown
}

type PreviewPptDeckResult = {
  ok?: unknown
  previewSessionId?: unknown
  title?: unknown
  variants?: unknown
  recommendedVariantKey?: unknown
  recommendedVariantName?: unknown
  recommendedTemplates?: unknown
  selectedTemplateId?: unknown
}

export type PptPreviewContext = {
  previewSessionId: string
  defaultVariantKey: string | null
  variantKeys: string[]
}

export type PptExportContext = {
  previewSessionId: string
  selectedVariantKey: string | null
  artifactId: number | null
}

export type PptPreviewInvalidationContext = {
  previewSessionId: string
}

export type PptTemplateRecommendationContext = {
  defaultTemplateId: string | null
  templateIds: string[]
}

export type PptConversationState = {
  latestPreview: PptPreviewContext | null
  latestExport: PptExportContext | null
  phase: "idle" | "preview-ready" | "preview-invalidated" | "exported"
}

const PPT_PREVIEW_CONTEXT_PREFIX = "<!-- ai-entry-ppt-preview-context:"
const PPT_EXPORT_CONTEXT_PREFIX = "<!-- ai-entry-ppt-export-context:"
const PPT_PREVIEW_INVALIDATION_CONTEXT_PREFIX = "<!-- ai-entry-ppt-preview-invalidated:"
const PPT_TEMPLATE_RECOMMENDATION_CONTEXT_PREFIX = "<!-- ai-entry-ppt-template-recommendations:"
const PPT_PREVIEW_CONTEXT_SUFFIX = "-->"

type ArtifactDeliverableKind = "html" | "pptx" | "generic"

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function toAbsoluteUrl(origin: string | null | undefined, value: unknown) {
  const normalized = normalizeOptionalText(value)
  if (!normalized) return null
  if (/^https?:\/\//i.test(normalized)) return normalized
  if (!origin) return normalized

  try {
    return new URL(normalized, origin).toString()
  } catch {
    return normalized
  }
}

function buildMarkdownLink(label: string, href: string | null) {
  if (!href) return null
  return `- ${label}: [${href}](${href})`
}

function buildPptPreviewContextMarker(context: PptPreviewContext) {
  return `${PPT_PREVIEW_CONTEXT_PREFIX}${JSON.stringify(context)} ${PPT_PREVIEW_CONTEXT_SUFFIX}`
}

function buildPptExportContextMarker(context: PptExportContext) {
  return `${PPT_EXPORT_CONTEXT_PREFIX}${JSON.stringify(context)} ${PPT_PREVIEW_CONTEXT_SUFFIX}`
}

function buildPptPreviewInvalidationContextMarker(context: PptPreviewInvalidationContext) {
  return `${PPT_PREVIEW_INVALIDATION_CONTEXT_PREFIX}${JSON.stringify(context)} ${PPT_PREVIEW_CONTEXT_SUFFIX}`
}

function buildPptTemplateRecommendationContextMarker(context: PptTemplateRecommendationContext) {
  return `${PPT_TEMPLATE_RECOMMENDATION_CONTEXT_PREFIX}${JSON.stringify(context)} ${PPT_PREVIEW_CONTEXT_SUFFIX}`
}

function parsePreviewVariants(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((variant) => {
          if (!variant || typeof variant !== "object") return null
          const key = normalizeOptionalText((variant as { key?: unknown }).key)
          const name = normalizeOptionalText((variant as { name?: unknown }).name)
          return key ? { key, name } : null
        })
        .filter((variant): variant is { key: string; name: string | null } => Boolean(variant))
    : []
}

function parseRecommendedTemplates(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => {
          if (!item || typeof item !== "object") return null
          const rank = typeof (item as { rank?: unknown }).rank === "number" ? (item as { rank?: number }).rank ?? null : null
          const templateId = normalizeOptionalText((item as { templateId?: unknown }).templateId)
          const templateLabel = normalizeOptionalText((item as { templateLabel?: unknown }).templateLabel)
          const styleName = normalizeOptionalText((item as { styleName?: unknown }).styleName)
          if (!templateId) return null
          return {
            rank,
            templateId,
            templateLabel,
            styleName,
          }
        })
        .filter((item): item is { rank: number | null; templateId: string; templateLabel: string | null; styleName: string | null } => Boolean(item))
    : []
}

function normalizePptTemplateRecommendationContext(value: unknown): PptTemplateRecommendationContext | null {
  const parsed = value as PptTemplateRecommendationContext
  if (!parsed || !Array.isArray(parsed.templateIds)) {
    return null
  }

  const templateIds = parsed.templateIds
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())

  if (templateIds.length === 0) {
    return null
  }

  return {
    defaultTemplateId:
      typeof parsed.defaultTemplateId === "string" && parsed.defaultTemplateId.trim()
        ? parsed.defaultTemplateId.trim()
        : templateIds[0] ?? null,
    templateIds,
  }
}

export function extractLatestPptTemplateRecommendationContext(
  content: string | null | undefined,
): PptTemplateRecommendationContext | null {
  return extractLatestMarker(
    content,
    PPT_TEMPLATE_RECOMMENDATION_CONTEXT_PREFIX,
    normalizePptTemplateRecommendationContext,
  )
}

export function resolvePptTemplateSelectionFromUserText(
  userText: string | null | undefined,
  context: PptTemplateRecommendationContext | null | undefined,
) {
  const normalized = normalizeOptionalText(userText)?.toLowerCase() ?? ""
  if (!normalized) return null

  const explicitTemplatePatterns: Array<{ templateId: string; patterns: RegExp[] }> = [
    {
      templateId: "long-table",
      patterns: [/\blong[\s-]?table\b/u, /长桌纪要/u, /长桌/u],
    },
    {
      templateId: "playful",
      patterns: [/\bplayful\b/u, /轻快玩味/u, /轻快/u],
    },
    {
      templateId: "broadside",
      patterns: [/\bbroadside\b/u, /告示海报/u, /海报/u],
    },
    {
      templateId: "neo-grid-bold",
      patterns: [/\bneo[\s-]?grid(?:\s+bold)?\b/u, /新网格粗体/u, /网格粗体/u],
    },
  ]

  for (const item of explicitTemplatePatterns) {
    if (item.patterns.some((pattern) => pattern.test(normalized))) {
      return item.templateId
    }
  }

  const ordinalMap: Array<{ pattern: RegExp; rank: number }> = [
    { pattern: /(?:第\s*1\s*(?:个|号|款|种|版|模板)?|template\s*1|option\s*1|#1|\bfirst\b)/u, rank: 1 },
    { pattern: /(?:第\s*2\s*(?:个|号|款|种|版|模板)?|template\s*2|option\s*2|#2|\bsecond\b)/u, rank: 2 },
    { pattern: /(?:第\s*3\s*(?:个|号|款|种|版|模板)?|template\s*3|option\s*3|#3|\bthird\b)/u, rank: 3 },
    { pattern: /(?:第\s*4\s*(?:个|号|款|种|版|模板)?|template\s*4|option\s*4|#4|\bfourth\b)/u, rank: 4 },
  ]

  for (const item of ordinalMap) {
    if (item.pattern.test(normalized)) {
      return context?.templateIds[item.rank - 1] ?? null
    }
  }

  return null
}

export function buildPptTemplateRecommendationMessage(input: {
  title?: string | null
  recommendedTemplates: unknown
  selectedTemplateId?: string | null
  isZh?: boolean
}) {
  const recommendedTemplates = parseRecommendedTemplates(input.recommendedTemplates)
  if (!recommendedTemplates.length) return null
  const isZh = input.isZh !== false
  const selectedTemplateId = normalizeOptionalText(input.selectedTemplateId)
  const context = buildPptTemplateRecommendationContextMarker({
    defaultTemplateId: selectedTemplateId ?? recommendedTemplates[0]?.templateId ?? null,
    templateIds: recommendedTemplates.map((item) => item.templateId),
  })
  const lines = [
    isZh ? "已为这次需求推荐 4 个模板：" : "Recommended 4 templates for this request:",
    ...(input.title ? [`- ${isZh ? "标题" : "Title"}: ${input.title}`] : []),
    ...recommendedTemplates.map((item) => {
      const label = item.templateLabel || item.styleName || item.templateId
      return `- ${item.rank ?? "?"}. ${label} (${item.templateId})`
    }),
    isZh
      ? "- 下一步: 直接回复模板编号或模板名称，我会按你选的模板生成可编辑 PPT 预览。"
      : "- Next step: reply with a template number or template name and I will generate the editable PPT preview with that template.",
    context,
  ]

  return `\n\n${lines.join("\n")}`
}

export function stripPptArtifactRelativeLinks(content: string) {
  if (!content.trim()) return content

  return content
    .replace(/(?:^|\n)[^\n]*\/(?:downloads\/)?api\/platform\/artifacts\/\d+\/download(?:\?download=1)?[^\n]*(?=\n|$)/g, "\n")
    .replace(/(?:^|\n)[^\n]*\/downloads[^\n]*(?:完整下载链接|download link)[^\n]*(?=\n|$)/gi, "\n")
    .replace(/(?:^|\n)[^\n]*`\/dashboard\/works`[^\n]*(?=\n|$)/g, "\n")
    .replace(/(?:^|\n)[^\n]*\/dashboard\/works[^\n]*(?=\n|$)/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function inferDeliverableKind(fileName: string | null): ArtifactDeliverableKind {
  if (!fileName) return "generic"
  const normalized = fileName.trim().toLowerCase()
  if (normalized.endsWith(".html") || normalized.endsWith(".htm")) return "html"
  if (normalized.endsWith(".pptx") || normalized.endsWith(".ppt")) return "pptx"
  return "generic"
}

function getDeliverableCopy(kind: ArtifactDeliverableKind, isZh: boolean) {
  if (kind === "html") {
    return {
      heading: isZh ? "已生成 HTML 成品：" : "HTML deliverable generated:",
      previewLabel: isZh ? "在线打开链接" : "Open link",
      downloadLabel: isZh ? "HTML 下载链接" : "HTML download link",
    }
  }

  if (kind === "pptx") {
    return {
      heading: isZh ? "已生成 PPT 成品：" : "PPT deliverable generated:",
      previewLabel: isZh ? "在线预览链接" : "Preview link",
      downloadLabel: isZh ? "PPT 下载链接" : "PPT download link",
    }
  }

  return {
    heading: isZh ? "已生成可交付文件：" : "Deliverable generated:",
    previewLabel: isZh ? "在线预览链接" : "Preview link",
    downloadLabel: isZh ? "完整下载链接" : "Download link",
  }
}

export function buildPptToolResultMessage(input: {
  toolName: string
  result: unknown
  origin?: string | null
  isZh?: boolean
}) {
  if (input.toolName === "preview_ppt_deck" && input.result && typeof input.result === "object") {
    const result = input.result as PreviewPptDeckResult
    if (result.ok === false) return null
    const isZh = input.isZh !== false
    const backgroundStatus = normalizeOptionalText((result as { status?: unknown }).status)
    const backgroundTaskId = normalizeOptionalText(
      (result as { backgroundTask?: { taskId?: unknown } }).backgroundTask?.taskId,
    )
    const queuedMessage = normalizeOptionalText((result as { message?: unknown }).message)
    if (backgroundStatus === "queued" && backgroundTaskId) {
      const lines = [
        isZh ? "已切换为后台生成：" : "Moved to background generation:",
        `- ${isZh ? "任务 ID" : "Task ID"}: ${backgroundTaskId}`,
        `- ${isZh ? "状态" : "Status"}: ${queuedMessage || (isZh ? "系统会持续轮询，完成后自动回填预览结果。" : "The system will keep polling and fill the preview result back in when it completes.")}`,
      ]
      return `\n\n${lines.join("\n")}`
    }
    const previewSessionId = normalizeOptionalText(result.previewSessionId)
    const title = normalizeOptionalText(result.title)
    const variants = parsePreviewVariants(result.variants)
    const recommendedVariantKey = normalizeOptionalText(result.recommendedVariantKey)
    const recommendedVariantName = normalizeOptionalText(result.recommendedVariantName)
    const recommendedTemplates = parseRecommendedTemplates(result.recommendedTemplates)
    const selectedTemplateId = normalizeOptionalText(result.selectedTemplateId)
    if (!previewSessionId || variants.length === 0) return null

    const defaultVariant =
      variants.find((variant) => variant.key === recommendedVariantKey) ||
      (recommendedVariantKey
        ? {
            key: recommendedVariantKey,
            name: recommendedVariantName,
          }
        : null) ||
      variants[0] ||
      null
    const context = buildPptPreviewContextMarker({
      previewSessionId,
      defaultVariantKey: defaultVariant?.key ?? null,
      variantKeys: variants.map((variant) => variant.key),
    })

    const lines = [
      isZh ? "已生成 PPT 预览：" : "PPT preview generated:",
      ...(title ? [`- ${isZh ? "标题" : "Title"}: ${title}`] : []),
      `- ${isZh ? "预览方案数" : "Variant count"}: ${variants.length}`,
      ...(defaultVariant
        ? [
            `- ${isZh ? "默认推荐版本" : "Default recommended variant"}: ${defaultVariant.name || defaultVariant.key} (${defaultVariant.key})`,
          ]
        : []),
      isZh
        ? "- 下一步: 回复“确认导出”即可导出当前推荐版本；若要换版本或改内容，请直接说明。"
        : '- Next step: Reply with "confirm export" to export the recommended variant, or describe any changes first.',
      ...(recommendedTemplates.length > 0
        ? [
            `- ${isZh ? "模板推荐" : "Template recommendations"}: ${recommendedTemplates
              .map((item) => `${item.rank ?? "?"}.${item.templateLabel || item.styleName || item.templateId}`)
              .join(" / ")}`,
          ]
        : []),
      ...(selectedTemplateId
        ? [`- ${isZh ? "本次已采用模板" : "Selected template for this run"}: ${selectedTemplateId}`]
        : []),
      context,
    ]

    return `\n\n${lines.join("\n")}`
  }

  if (input.toolName !== "export_ppt_deck" || !input.result || typeof input.result !== "object") {
    return null
  }

  const result = input.result as ExportPptDeckResult
  if (result.ok === false) {
    const previewSessionId = normalizeOptionalText(result.previewSessionId)
    const errorRecord = result.error && typeof result.error === "object" ? (result.error as { code?: unknown; message?: unknown }) : null
    const errorCode = normalizeOptionalText(errorRecord?.code)
    const errorMessage = normalizeOptionalText(errorRecord?.message)

    if (errorCode === "missing_preview_session" && previewSessionId) {
      const isZh = input.isZh !== false
      const lines = [
        isZh ? "当前 PPT 预览已失效：" : "The PPT preview is no longer available:",
        `- ${isZh ? "状态" : "Status"}: ${errorMessage || (isZh ? "请先重新生成预览，再继续导出。" : "Generate a fresh preview before export.")}`,
        buildPptPreviewInvalidationContextMarker({
          previewSessionId,
        }),
      ]

      return `\n\n${lines.join("\n")}`
    }

    return null
  }
  const isZh = input.isZh !== false
  const origin = input.origin ?? null
  const previewUrl = toAbsoluteUrl(origin, result.previewUrl)
  const downloadUrl = toAbsoluteUrl(origin, result.downloadUrl)
  const workLibraryUrl = toAbsoluteUrl(origin, result.workLibraryHref)
  const fileName = normalizeOptionalText(result.fileName)
  const title = normalizeOptionalText(result.title)
  const statusLine = normalizeOptionalText(result.message)
  const deliverableKind = inferDeliverableKind(fileName)
  const copy = getDeliverableCopy(deliverableKind, isZh)

  const lines = [
    copy.heading,
    ...(title ? [`- ${isZh ? "标题" : "Title"}: ${title}`] : []),
    ...(fileName ? [`- ${isZh ? "文件名" : "File"}: ${fileName}`] : []),
    ...(statusLine ? [`- ${isZh ? "状态" : "Status"}: ${statusLine}`] : []),
    buildMarkdownLink(copy.previewLabel, previewUrl),
    buildMarkdownLink(copy.downloadLabel, downloadUrl),
    buildMarkdownLink(isZh ? "作品库链接" : "Work library", workLibraryUrl),
    buildPptExportContextMarker({
      previewSessionId: normalizeOptionalText(result.previewSessionId) || "",
      selectedVariantKey: normalizeOptionalText((result as { selectedVariantKey?: unknown }).selectedVariantKey),
      artifactId: typeof result.artifactId === "number" ? result.artifactId : null,
    }),
  ].filter((line): line is string => Boolean(line))

  if (lines.length <= 2) return null
  return `\n\n${lines.join("\n")}`
}

function extractLatestMarker<T>(
  content: string | null | undefined,
  prefix: string,
  parse: (value: unknown) => T | null,
) {
  const normalized = typeof content === "string" ? content : ""
  if (!normalized) return null

  let lastContext: T | null = null
  let searchIndex = 0

  while (searchIndex < normalized.length) {
    const start = normalized.indexOf(prefix, searchIndex)
    if (start < 0) break
    const jsonStart = start + prefix.length
    const end = normalized.indexOf(PPT_PREVIEW_CONTEXT_SUFFIX, jsonStart)
    if (end < 0) break
    const rawPayload = normalized.slice(jsonStart, end).trim()
    searchIndex = end + PPT_PREVIEW_CONTEXT_SUFFIX.length

    try {
      lastContext = parse(JSON.parse(rawPayload || "{}")) ?? lastContext
    } catch {
      continue
    }
  }

  return lastContext
}

function normalizePptPreviewContext(value: unknown): PptPreviewContext | null {
  const parsed = value as PptPreviewContext
  if (
    !parsed ||
    typeof parsed.previewSessionId !== "string" ||
    !parsed.previewSessionId.trim() ||
    !Array.isArray(parsed.variantKeys)
  ) {
    return null
  }

  return {
    previewSessionId: parsed.previewSessionId.trim(),
    defaultVariantKey:
      typeof parsed.defaultVariantKey === "string" && parsed.defaultVariantKey.trim()
        ? parsed.defaultVariantKey.trim()
        : null,
    variantKeys: parsed.variantKeys
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim()),
  }
}

function normalizePptExportContext(value: unknown): PptExportContext | null {
  const parsed = value as PptExportContext
  if (!parsed || typeof parsed.previewSessionId !== "string" || !parsed.previewSessionId.trim()) {
    return null
  }

  return {
    previewSessionId: parsed.previewSessionId.trim(),
    selectedVariantKey:
      typeof parsed.selectedVariantKey === "string" && parsed.selectedVariantKey.trim()
        ? parsed.selectedVariantKey.trim()
        : null,
    artifactId: typeof parsed.artifactId === "number" ? parsed.artifactId : null,
  }
}

function normalizePptPreviewInvalidationContext(value: unknown): PptPreviewInvalidationContext | null {
  const parsed = value as PptPreviewInvalidationContext
  if (!parsed || typeof parsed.previewSessionId !== "string" || !parsed.previewSessionId.trim()) {
    return null
  }

  return {
    previewSessionId: parsed.previewSessionId.trim(),
  }
}

export function extractLatestPptPreviewContext(content: string | null | undefined): PptPreviewContext | null {
  return extractLatestMarker(content, PPT_PREVIEW_CONTEXT_PREFIX, normalizePptPreviewContext)
}

export function extractLatestPptExportContext(content: string | null | undefined): PptExportContext | null {
  return extractLatestMarker(content, PPT_EXPORT_CONTEXT_PREFIX, normalizePptExportContext)
}

export function extractLatestPptPreviewInvalidationContext(
  content: string | null | undefined,
): PptPreviewInvalidationContext | null {
  return extractLatestMarker(
    content,
    PPT_PREVIEW_INVALIDATION_CONTEXT_PREFIX,
    normalizePptPreviewInvalidationContext,
  )
}

export function resolveLatestPptConversationState(messageContents: string[] | undefined): PptConversationState {
  let latestPreview: PptPreviewContext | null = null
  let latestExport: PptExportContext | null = null
  let latestInvalidation: PptPreviewInvalidationContext | null = null
  let latestPreviewIndex = -1
  let latestExportIndex = -1
  let latestInvalidationIndex = -1

  for (const [index, content] of (messageContents || []).entries()) {
    const preview = extractLatestPptPreviewContext(content)
    if (preview) {
      latestPreview = preview
      latestPreviewIndex = index
    }
    const exported = extractLatestPptExportContext(content)
    if (exported) {
      latestExport = exported
      latestExportIndex = index
    }
    const invalidation = extractLatestPptPreviewInvalidationContext(content)
    if (invalidation) {
      latestInvalidation = invalidation
      latestInvalidationIndex = index
    }
  }

  if (
    latestPreview &&
    latestInvalidation &&
    latestInvalidationIndex > latestPreviewIndex &&
    latestInvalidation.previewSessionId === latestPreview.previewSessionId
  ) {
    return {
      latestPreview: null,
      latestExport:
        latestExport && latestExport.previewSessionId !== latestInvalidation.previewSessionId
          ? latestExport
          : null,
      phase: "preview-invalidated",
    }
  }

  if (!latestPreview) {
    return {
      latestPreview: null,
      latestExport,
      phase: "idle",
    }
  }

  if (latestExport && latestExportIndex > latestPreviewIndex) {
    return {
      latestPreview,
      latestExport,
      phase: "exported",
    }
  }

  return {
    latestPreview,
    latestExport,
    phase: "preview-ready",
  }
}
