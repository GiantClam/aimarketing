const KNOWN_MOJIBAKE_MAP: Record<string, string> = {
  "浣撻獙浼佷笟": "体验企业",
  "浣撻獙鐢ㄦ埛": "体验用户",
  "娴ｆ捇鐛欓悽銊﹀煕": "体验用户",
}

export function normalizeDisplayText(value: string | null | undefined) {
  if (value == null) return value ?? null

  const trimmed = value.trim()
  if (!trimmed) return trimmed

  return KNOWN_MOJIBAKE_MAP[trimmed] ?? trimmed
}
