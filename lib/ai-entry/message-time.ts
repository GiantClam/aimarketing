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

export type RelativeMessageTime =
  | { kind: "just-now"; timestampMs: number | null }
  | { kind: "minutes" | "hours" | "days"; count: number; timestampMs: number }
  | { kind: "yesterday"; timestampMs: number }
  | { kind: "date"; timestampMs: number }

export function getRelativeMessageTime(timestamp: number | undefined, now = Date.now()): RelativeMessageTime {
  const timestampMs = normalizeTimestampMs(timestamp)
  if (!timestampMs) return { kind: "just-now", timestampMs: null }

  const elapsedMs = Math.max(0, now - timestampMs)
  const elapsedMinutes = Math.floor(elapsedMs / 60_000)
  if (elapsedMinutes < 1) return { kind: "just-now", timestampMs }
  if (elapsedMinutes < 60) return { kind: "minutes", count: elapsedMinutes, timestampMs }

  const elapsedHours = Math.floor(elapsedMs / 3_600_000)
  if (elapsedHours < 24) return { kind: "hours", count: elapsedHours, timestampMs }

  const elapsedDays = Math.floor(elapsedMs / 86_400_000)
  if (elapsedDays === 1) return { kind: "yesterday", timestampMs }
  if (elapsedDays < 7) return { kind: "days", count: elapsedDays, timestampMs }
  return { kind: "date", timestampMs }
}

function formatDate(
  timestampMs: number,
  locale: "zh" | "en",
  timeZone: string | null,
  includeTime: boolean,
) {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }
  if (timeZone) options.timeZone = timeZone
  const formatterLocale = locale === "zh" ? "zh-CN" : "en-US"
  try {
    return new Intl.DateTimeFormat(formatterLocale, options).format(new Date(timestampMs))
  } catch {
    delete options.timeZone
    return new Intl.DateTimeFormat(formatterLocale, options).format(new Date(timestampMs))
  }
}

export function formatMessageDate(timestamp: number | undefined, locale: "zh" | "en", timeZone: string | null) {
  const timestampMs = normalizeTimestampMs(timestamp)
  return timestampMs ? formatDate(timestampMs, locale, timeZone, false) : locale === "zh" ? "未知时间" : "Unknown time"
}

export function formatMessageDateTime(timestamp: number | undefined, locale: "zh" | "en", timeZone: string | null) {
  const timestampMs = normalizeTimestampMs(timestamp)
  return timestampMs ? formatDate(timestampMs, locale, timeZone, true) : ""
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
