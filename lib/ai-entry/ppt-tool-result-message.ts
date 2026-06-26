type ExportPptDeckResult = {
  ok?: unknown
  title?: unknown
  fileName?: unknown
  artifactId?: unknown
  workItemId?: unknown
  workLibraryHref?: unknown
  previewUrl?: unknown
  downloadUrl?: unknown
  message?: unknown
}

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
  if (input.toolName !== "export_ppt_deck" || !input.result || typeof input.result !== "object") {
    return null
  }

  const result = input.result as ExportPptDeckResult
  if (result.ok === false) return null
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
  ].filter((line): line is string => Boolean(line))

  if (lines.length <= 2) return null
  return `\n\n${lines.join("\n")}`
}
