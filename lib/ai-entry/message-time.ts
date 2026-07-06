export function resolveBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

export function normalizeTimestampMs(timestamp: number | undefined) {
  if (!timestamp || !Number.isFinite(timestamp)) return null
  return timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000
}

export function formatMessageTime(
  timestamp: number | undefined,
  locale: "zh" | "en",
  timeZone: string | null,
) {
  if (!timestamp) return locale === "zh" ? "刚刚" : "Just now"
  const timestampMs = normalizeTimestampMs(timestamp)
  if (!timestampMs) return locale === "zh" ? "刚刚" : "Just now"
  const date = new Date(timestampMs)
  if (Number.isNaN(date.getTime())) return locale === "zh" ? "刚刚" : "Just now"
  const options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
  }
  if (timeZone) {
    options.timeZone = timeZone
  }
  try {
    return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", options).format(date)
  } catch {
    return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  }
}
