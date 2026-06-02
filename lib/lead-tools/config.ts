const DEFAULT_LEAD_TOOL_MODEL =
  process.env.PPTOKEN_MODEL || process.env.AI_ENTRY_PPTOKEN_MODEL || "openai/gpt-4.1-mini"
const DEFAULT_PPT_PREVIEW_MODEL = "MiniMax-M2.7-highspeed"
const DEFAULT_PPT_PREVIEW_RUNTIME = "frontend-slides-agent"
const DEFAULT_PPT_EXPORT_RUNTIME = "ppt-master-agent"

function pickFirstNonEmpty(values: Array<string | undefined>, fallback: string) {
  for (const value of values) {
    const normalized = value?.trim()
    if (normalized) return normalized
  }

  return fallback
}

export function getLeadToolPreviewModel(slug: string) {
  if (slug === "ai-ppt-preview") {
    return pickFirstNonEmpty(
      [process.env.LEAD_TOOLS_PPT_PREVIEW_MODEL, process.env.LEAD_TOOLS_PREVIEW_MODEL],
      DEFAULT_PPT_PREVIEW_MODEL,
    )
  }

  if (slug === "ai-seo-meta-generator") {
    return pickFirstNonEmpty(
      [process.env.LEAD_TOOLS_SEO_PREVIEW_MODEL, process.env.LEAD_TOOLS_PREVIEW_MODEL],
      DEFAULT_LEAD_TOOL_MODEL,
    )
  }

  return pickFirstNonEmpty([process.env.LEAD_TOOLS_PREVIEW_MODEL], DEFAULT_LEAD_TOOL_MODEL)
}

export function getLeadToolFinalModel(slug: string) {
  if (slug === "ai-ppt-preview") {
    return pickFirstNonEmpty(
      [process.env.LEAD_TOOLS_PPT_FINAL_MODEL, process.env.LEAD_TOOLS_FINAL_MODEL],
      DEFAULT_LEAD_TOOL_MODEL,
    )
  }

  if (slug === "ai-seo-meta-generator") {
    return pickFirstNonEmpty(
      [process.env.LEAD_TOOLS_SEO_FINAL_MODEL, process.env.LEAD_TOOLS_FINAL_MODEL],
      DEFAULT_LEAD_TOOL_MODEL,
    )
  }

  return pickFirstNonEmpty([process.env.LEAD_TOOLS_FINAL_MODEL], DEFAULT_LEAD_TOOL_MODEL)
}

export function getLeadToolPptPreviewRuntime(slug: string) {
  if (slug === "ai-ppt-preview") {
    return pickFirstNonEmpty(
      [process.env.LEAD_TOOLS_PPT_PREVIEW_RUNTIME, process.env.LEAD_TOOLS_PREVIEW_RUNTIME],
      DEFAULT_PPT_PREVIEW_RUNTIME,
    )
  }

  return pickFirstNonEmpty([process.env.LEAD_TOOLS_PREVIEW_RUNTIME], DEFAULT_PPT_PREVIEW_RUNTIME)
}

export function getLeadToolPptExportRuntime(slug: string) {
  if (slug === "ai-ppt-preview") {
    return pickFirstNonEmpty(
      [process.env.LEAD_TOOLS_PPT_EXPORT_RUNTIME, process.env.LEAD_TOOLS_EXPORT_RUNTIME],
      DEFAULT_PPT_EXPORT_RUNTIME,
    )
  }

  return pickFirstNonEmpty([process.env.LEAD_TOOLS_EXPORT_RUNTIME], DEFAULT_PPT_EXPORT_RUNTIME)
}

export function allowLeadToolMockFallback() {
  if (process.env.LEAD_TOOLS_ALLOW_MOCK_FALLBACK === "true") return true
  return process.env.NODE_ENV !== "production"
}
