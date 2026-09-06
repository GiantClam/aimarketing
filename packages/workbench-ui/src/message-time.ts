export function formatWorkbenchMessageTimestamp(value: string, locale: "zh" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  // No timeZone option is intentional: Intl uses the desktop/browser's local
  // time zone, so persisted UTC timestamps are rendered for the current user.
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function workbenchMessageTimestampLabel(locale: "zh" | "en") {
  return locale === "zh" ? "创建时间（本地时区）" : "Created (local time zone)";
}
