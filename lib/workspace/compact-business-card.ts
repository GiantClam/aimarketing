export type CompactCardBadgeTone = "neutral" | "success" | "warning" | "danger"

export type CompactCardBadge = {
  label: string
  tone: CompactCardBadgeTone
}

function humanizeSlug(value: string) {
  const normalized = value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!normalized) return ""

  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function buildCompactCardSummary(
  candidates: Array<string | null | undefined>,
  fallbackSlug?: string,
) {
  const summary = candidates
    .find((value) => typeof value === "string" && value.trim().length > 0)
    ?.trim()

  if (summary) return summary
  return fallbackSlug ? humanizeSlug(fallbackSlug) : ""
}

export function pickPrimaryStatusBadge(badges: CompactCardBadge[]) {
  return badges[0] ?? null
}
