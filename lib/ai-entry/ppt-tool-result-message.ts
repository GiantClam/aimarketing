import { stripResearchBriefContextMarkers } from "@/lib/ai-entry/research-brief-context"
import { stripPptBriefConfirmationContextMarkers } from "@/lib/ai-entry/ppt-brief"

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

export type QueuedPptBackgroundTaskContext = {
  taskId: string
  statusText: string | null
}

export type PptTemplateRecommendationContext = {
  defaultTemplateId: string | null
  templateIds: string[]
  templates?: Array<{
    templateId: string
    labels: string[]
  }>
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
const PPT_TEMPLATE_RECOMMENDATION_BLOCK_PATTERN =
  /(?:^|\n)(?:已为这次需求推荐 4 个模板：|Recommended 4 templates for this request:)\n[\s\S]*?<!-- ai-entry-ppt-template-recommendations:[\s\S]*?-->(?=\n|$)/gu

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

export function isQueuedPptBackgroundStatusMessage(content: string | null | undefined) {
  const normalized = stripPptHiddenContextMarkers(content).trim()
  if (!normalized) return false

  const zhLines = normalized.split("\n").map((line) => line.trim()).filter(Boolean)
  if (
    zhLines[0] === "已切换为后台生成：" &&
    zhLines.some((line) => line.startsWith("- 任务 ID:")) &&
    zhLines.some((line) => line.startsWith("- 状态:"))
  ) {
    return true
  }

  const enLines = normalized.split("\n").map((line) => line.trim()).filter(Boolean)
  return (
    enLines[0] === "Moved to background generation:" &&
    enLines.some((line) => line.startsWith("- Task ID:")) &&
    enLines.some((line) => line.startsWith("- Status:"))
  )
}

export function isFailedPptBackgroundStatusMessage(content: string | null | undefined) {
  const normalized = stripPptHiddenContextMarkers(content).trim()
  if (!normalized) return false

  return (
    normalized.startsWith("可编辑 PPT 后台生成失败：") ||
    normalized.startsWith("Editable PPT background generation failed:") ||
    normalized.startsWith("Background PPT generation failed:")
  )
}

export function extractQueuedPptBackgroundTaskContext(
  content: string | null | undefined,
): QueuedPptBackgroundTaskContext | null {
  const normalized = stripPptHiddenContextMarkers(content)
  if (!normalized.trim()) return null

  const zhMatch = normalized.match(
    /(?:^|\n)已切换为后台生成：\s*\n- 任务 ID:\s*([^\n]+)\n- 状态:\s*([^\n]*)/u,
  )
  if (zhMatch) {
    const taskId = zhMatch[1]?.trim()
    const statusText = zhMatch[2]?.trim() || null
    if (taskId) {
      return {
        taskId,
        statusText,
      }
    }
  }

  const enMatch = normalized.match(
    /(?:^|\n)Moved to background generation:\s*\n- Task ID:\s*([^\n]+)\n- Status:\s*([^\n]*)/u,
  )
  if (!enMatch) return null

  const taskId = enMatch[1]?.trim()
  const statusText = enMatch[2]?.trim() || null
  if (!taskId) return null

  return {
    taskId,
    statusText,
  }
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

function normalizeTemplateLabels(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => normalizeOptionalText(item))
        .filter((item): item is string => Boolean(item))
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

  const templates = Array.isArray(parsed.templates)
    ? parsed.templates
        .map((item) => {
          const templateId = normalizeOptionalText((item as { templateId?: unknown } | null)?.templateId)
          if (!templateId || !templateIds.includes(templateId)) return null
          return {
            templateId,
            labels: normalizeTemplateLabels((item as { labels?: unknown }).labels),
          }
        })
        .filter((item): item is { templateId: string; labels: string[] } => Boolean(item))
    : undefined

  return {
    defaultTemplateId:
      typeof parsed.defaultTemplateId === "string" && parsed.defaultTemplateId.trim()
        ? parsed.defaultTemplateId.trim()
        : templateIds[0] ?? null,
    templateIds,
    ...(templates && templates.length > 0 ? { templates } : {}),
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

export function buildPptTemplateSelectionPromptSection(
  context: PptTemplateRecommendationContext,
  isZh = true,
) {
  const candidates = context.templateIds
    .map((templateId, index) => {
      const labels = context.templates?.find((item) => item.templateId === templateId)?.labels ?? []
      return `- ${index + 1}. ${labels[0] || templateId}${labels[1] ? ` / ${labels[1]}` : ""} (${templateId})`
    })
    .join("\n")

  return [
    "## Editable PPT template selection",
    isZh
      ? "本轮用户正在选择可编辑 PPT 模板。请结合对话语义理解用户指向的候选模板，例如序号、名称、风格描述或指代词；不要用字符串匹配猜测。"
      : "The user is selecting an editable PPT template in this turn. Resolve the user's meaning from the conversation, including a rank, name, style description, or reference; do not guess by string matching.",
    isZh
      ? "如果选择明确，调用 preview_ppt_deck，并把候选列表中的精确 templateId 传入，同时设置 templateMode=single-template。不得发明 ID，不得使用 auto-4。"
      : "If the selection is clear, call preview_ppt_deck with the exact templateId from the candidate list and templateMode=single-template. Never invent an ID or use auto-4.",
    isZh
      ? "如果选择不明确，不要生成 PPT；先用一句简短问题澄清，并列出相关候选。"
      : "If the selection is ambiguous, do not generate the deck; ask one concise clarification question with the relevant candidates.",
    "Candidate templates:",
    candidates,
  ].join("\n")
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
    templates: recommendedTemplates.map((item) => ({
      templateId: item.templateId,
      labels: [item.templateLabel, item.styleName, item.templateId].filter((label): label is string =>
        Boolean(label && label.trim()),
      ),
    })),
  })
  const lines = [
    isZh ? "已为这次需求推荐 4 个模板：" : "Recommended 4 templates for this request:",
    ...(input.title ? [`- ${isZh ? "标题" : "Title"}: ${input.title}`] : []),
    ...recommendedTemplates.map((item) => {
      const label = item.templateLabel || item.styleName || item.templateId
      return `- ${item.rank ?? "?"}. ${label} (${item.templateId})`
    }),
    isZh
      ? "- 下一步: 直接回复模板 ID 或模板名称，我会按你选的模板生成可编辑 PPT 预览。"
      : "- Next step: reply with a template ID or template name and I will generate the editable PPT preview with that template.",
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

export function stripPptTemplateRecommendationMessageBlocks(content: string | null | undefined) {
  const normalized = typeof content === "string" ? content : ""
  if (!normalized.trim()) return normalized

  return normalized
    .replace(PPT_TEMPLATE_RECOMMENDATION_BLOCK_PATTERN, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function collapsePptTemplateRecommendationMessageBlocks(content: string | null | undefined) {
  const normalized = typeof content === "string" ? content : ""
  if (!normalized.trim()) return normalized

  const blocks = [...normalized.matchAll(PPT_TEMPLATE_RECOMMENDATION_BLOCK_PATTERN)]
    .map((match) => match[0]?.trim())
    .filter((block): block is string => Boolean(block))

  if (blocks.length <= 1) return normalized

  return [
    stripPptTemplateRecommendationMessageBlocks(normalized),
    blocks.at(-1) || "",
  ]
    .filter(Boolean)
    .join("\n\n")
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
  if (input.toolName === "update_ppt_brief" && input.result && typeof input.result === "object") {
    const result = input.result as { ok?: unknown; message?: unknown; error?: { message?: unknown } }
    if (result.ok === false) {
      return normalizeOptionalText(result.error?.message)
        ? `\n\n${normalizeOptionalText(result.error?.message)}`
        : null
    }
    const message = normalizeOptionalText(result.message)
    return message ? `\n\n${message}` : null
  }

  if (input.toolName === "preview_ppt_deck" && input.result && typeof input.result === "object") {
    const result = input.result as PreviewPptDeckResult
    const isZh = input.isZh !== false
    if (result.ok === false) {
      const recommendedTemplates = parseRecommendedTemplates(
        (result as { recommendedTemplates?: unknown }).recommendedTemplates,
      )
      if (recommendedTemplates.length > 0) {
        return buildPptTemplateRecommendationMessage({
          title: normalizeOptionalText((result as { title?: unknown }).title),
          recommendedTemplates,
          selectedTemplateId: null,
          isZh,
        })
      }
      return null
    }
    const backgroundStatus = normalizeOptionalText((result as { status?: unknown }).status)
    const backgroundTaskId = normalizeOptionalText(
      (result as { backgroundTask?: { taskId?: unknown } }).backgroundTask?.taskId,
    )
    const queuedMessage = normalizeOptionalText((result as { message?: unknown }).message)
    const queuedRecommendedTemplates = parseRecommendedTemplates(
      (result as { recommendedTemplates?: unknown }).recommendedTemplates,
    )
    const queuedSelectedTemplateId = normalizeOptionalText(
      (result as { selectedTemplateId?: unknown }).selectedTemplateId,
    )
    if (backgroundStatus === "queued" && backgroundTaskId) {
      const selectedTemplateSummary =
        queuedSelectedTemplateId
          ? queuedRecommendedTemplates.find((item) => item.templateId === queuedSelectedTemplateId)
          : null
      const lines = [
        isZh ? "已切换为后台生成：" : "Moved to background generation:",
        `- ${isZh ? "任务 ID" : "Task ID"}: ${backgroundTaskId}`,
        `- ${isZh ? "状态" : "Status"}: ${queuedMessage || (isZh ? "系统会持续轮询，完成后自动回填预览结果。" : "The system will keep polling and fill the preview result back in when it completes.")}`,
        ...(queuedSelectedTemplateId
          ? [
              `- ${isZh ? "本次已采用模板" : "Selected template for this run"}: ${
                selectedTemplateSummary?.templateLabel ||
                selectedTemplateSummary?.styleName ||
                queuedSelectedTemplateId
              } (${queuedSelectedTemplateId})`,
            ]
          : []),
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
    const selectedTemplateSummary =
      selectedTemplateId
        ? recommendedTemplates.find((item) => item.templateId === selectedTemplateId) ?? null
        : null
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
      ...(recommendedTemplates.length > 0 && !selectedTemplateId
        ? [
            `- ${isZh ? "模板推荐" : "Template recommendations"}: ${recommendedTemplates
              .map((item) => `${item.rank ?? "?"}.${item.templateLabel || item.styleName || item.templateId}`)
              .join(" / ")}`,
          ]
        : []),
      ...(selectedTemplateId
        ? [
            `- ${isZh ? "本次已采用模板" : "Selected template for this run"}: ${
              selectedTemplateSummary?.templateLabel ||
              selectedTemplateSummary?.styleName ||
              selectedTemplateId
            } (${selectedTemplateId})`,
          ]
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
  const contexts = extractMarkers(content, prefix, parse)
  return contexts[contexts.length - 1] ?? null
}

function extractMarkers<T>(
  content: string | null | undefined,
  prefix: string,
  parse: (value: unknown) => T | null,
) {
  const normalized = typeof content === "string" ? content : ""
  if (!normalized) return []

  const contexts: T[] = []
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
      const parsed = parse(JSON.parse(rawPayload || "{}"))
      if (parsed) contexts.push(parsed)
    } catch {
      continue
    }
  }

  return contexts
}

function stripMarkers(content: string | null | undefined, prefix: string) {
  const normalized = typeof content === "string" ? content : ""
  if (!normalized) return ""

  let output = ""
  let searchIndex = 0
  let didStrip = false

  while (searchIndex < normalized.length) {
    const start = normalized.indexOf(prefix, searchIndex)
    if (start < 0) {
      output += normalized.slice(searchIndex)
      break
    }
    output += normalized.slice(searchIndex, start)
    const jsonStart = start + prefix.length
    const end = normalized.indexOf(PPT_PREVIEW_CONTEXT_SUFFIX, jsonStart)
    if (end < 0) {
      output += normalized.slice(start)
      break
    }
    didStrip = true
    searchIndex = end + PPT_PREVIEW_CONTEXT_SUFFIX.length
  }

  return didStrip ? output.replace(/\n{3,}/g, "\n\n").trim() : normalized
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

export function extractPptTemplateRecommendationContexts(
  content: string | null | undefined,
): PptTemplateRecommendationContext[] {
  return extractMarkers(
    content,
    PPT_TEMPLATE_RECOMMENDATION_CONTEXT_PREFIX,
    normalizePptTemplateRecommendationContext,
  )
}

export function stripPptTemplateRecommendationContextMarkers(content: string | null | undefined) {
  return stripMarkers(content, PPT_TEMPLATE_RECOMMENDATION_CONTEXT_PREFIX)
}

export function stripPptHiddenContextMarkers(content: string | null | undefined) {
  return stripPptBriefConfirmationContextMarkers(stripResearchBriefContextMarkers([
    PPT_PREVIEW_CONTEXT_PREFIX,
    PPT_EXPORT_CONTEXT_PREFIX,
    PPT_PREVIEW_INVALIDATION_CONTEXT_PREFIX,
    PPT_TEMPLATE_RECOMMENDATION_CONTEXT_PREFIX,
  ].reduce((current, prefix) => stripMarkers(current, prefix), content ?? "")))
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
