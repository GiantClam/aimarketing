type ExportPptDeckResult = {
  title?: unknown
  fileName?: unknown
  artifactId?: unknown
  workItemId?: unknown
  workLibraryHref?: unknown
  previewUrl?: unknown
  downloadUrl?: unknown
  message?: unknown
}

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
  const isZh = input.isZh !== false
  const origin = input.origin ?? null
  const previewUrl = toAbsoluteUrl(origin, result.previewUrl)
  const downloadUrl = toAbsoluteUrl(origin, result.downloadUrl)
  const workLibraryUrl = toAbsoluteUrl(origin, result.workLibraryHref)
  const fileName = normalizeOptionalText(result.fileName)
  const title = normalizeOptionalText(result.title)
  const statusLine = normalizeOptionalText(result.message)

  const lines = [
    isZh ? "已生成可交付文件：" : "Deliverable generated:",
    ...(title ? [`- ${isZh ? "标题" : "Title"}: ${title}`] : []),
    ...(fileName ? [`- ${isZh ? "文件名" : "File"}: ${fileName}`] : []),
    ...(statusLine ? [`- ${isZh ? "状态" : "Status"}: ${statusLine}`] : []),
    buildMarkdownLink(isZh ? "在线预览链接" : "Preview link", previewUrl),
    buildMarkdownLink(isZh ? "完整下载链接" : "Download link", downloadUrl),
    buildMarkdownLink(isZh ? "作品库链接" : "Work library", workLibraryUrl),
  ].filter((line): line is string => Boolean(line))

  if (lines.length <= 2) return null
  return `\n\n${lines.join("\n")}`
}
