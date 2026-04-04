export type WriterProgressLocale = "zh" | "en"

export const WRITER_PROGRESS_EVENT_LIMIT = 40

export const WRITER_PROGRESS_PHASE_ORDER = [
  "analyze_request",
  "brief_extracting",
  "memory_lookup",
  "research_plan",
  "fetch_url",
  "get_content",
  "research",
  "thinking",
  "writing",
] as const

export type WriterProgressPhaseType = (typeof WRITER_PROGRESS_PHASE_ORDER)[number]

export type WriterProgressEventType = "request_submitted" | "draft_ready" | WriterProgressPhaseType

export const WRITER_PROGRESS_LABELS: Record<WriterProgressEventType, { zh: string; en: string }> = {
  request_submitted: { zh: "\u8bf7\u6c42\u5df2\u63d0\u4ea4", en: "Request submitted" },
  analyze_request: { zh: "\u5206\u6790\u9700\u6c42", en: "Analyzing request" },
  brief_extracting: { zh: "\u63d0\u53d6\u5199\u4f5c\u7b80\u62a5", en: "Extracting brief" },
  memory_lookup: { zh: "\u52a0\u8f7d\u504f\u597d\u8bb0\u5fc6", en: "Loading memory" },
  research_plan: { zh: "\u89c4\u5212\u68c0\u7d22\u7b56\u7565", en: "Planning retrieval strategy" },
  fetch_url: { zh: "\u6293\u53d6\u6765\u6e90\u94fe\u63a5", en: "Fetching source URLs" },
  get_content: { zh: "\u63d0\u53d6\u6765\u6e90\u5185\u5bb9", en: "Extracting source content" },
  research: { zh: "\u7814\u7a76\u4fe1\u606f\u6574\u5408", en: "Synthesizing research" },
  thinking: { zh: "\u63a8\u7406\u4e0e\u89c4\u5212", en: "Reasoning" },
  writing: { zh: "\u5199\u4f5c\u6210\u7a3f", en: "Writing draft" },
  draft_ready: { zh: "\u8349\u7a3f\u5df2\u5c31\u7eea", en: "Draft ready" },
}

export function resolveWriterProgressLocale(locale: string): WriterProgressLocale {
  return locale === "zh" ? "zh" : "en"
}

export function buildWriterProgressLabelMap(taskLocale: WriterProgressLocale) {
  return Object.fromEntries(
    Object.entries(WRITER_PROGRESS_LABELS).map(([type, labels]) => [type, labels[taskLocale]]),
  ) as Record<string, string>
}

export function localizeWriterProgressDetail(detail: string | undefined, taskLocale: WriterProgressLocale) {
  if (!detail) return undefined
  if (taskLocale !== "zh") return detail

  return detail
    .replace(/^Seed URLs:\s*/i, "\u79cd\u5b50 URL\uff1a")
    .replace(/^Discovered URLs:\s*/i, "\u5df2\u53d1\u73b0 URL\uff1a")
    .replace(/^Pages extracted:\s*/i, "\u5df2\u63d0\u53d6\u9875\u9762\uff1a")
    .replace(/^Matched memories:\s*/i, "\u547d\u4e2d\u8bb0\u5fc6\uff1a")
    .replace(/^Strategy:\s*/i, "\u7b56\u7565\uff1a")
    .replace(/^Status:\s*/i, "\u72b6\u6001\uff1a")
    .replace(
      "Request can be completed without external retrieval",
      "\u672c\u6b21\u8bf7\u6c42\u65e0\u9700\u5916\u90e8\u68c0\u7d22",
    )
}
