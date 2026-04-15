function normalizeText(raw: unknown) {
  return typeof raw === "string" ? raw.trim() : ""
}

function hasClaudeTierFamilyToken(value: string) {
  const text = value.toLowerCase()
  if (!text.includes("claude")) return false
  return /\b(sonnet|opus|haiku)\b/.test(text) || /(sonnet|opus|haiku)/.test(text.replace(/[^a-z0-9]+/g, ""))
}

function stripClaudeReleaseSuffix(value: string) {
  if (!hasClaudeTierFamilyToken(value)) return value
  return value.replace(/([._-](?:20\d{6}|\d{8}|v\d+))+$/gi, "")
}

export function splitProviderModelId(modelId: string) {
  const normalized = normalizeText(modelId)
  if (!normalized) return null
  const slashIndex = normalized.indexOf("/")
  if (slashIndex <= 0 || slashIndex >= normalized.length - 1) return null
  const prefix = normalized.slice(0, slashIndex).trim()
  const suffix = normalized.slice(slashIndex + 1).trim()
  if (!prefix || !suffix) return null
  return { prefix, suffix }
}

export function stripProviderPrefix(modelId: string) {
  const parsed = splitProviderModelId(modelId)
  return parsed ? parsed.suffix : normalizeText(modelId)
}

export function normalizeModelDisplayId(modelId: string) {
  const normalized = normalizeText(modelId)
  if (!normalized) return ""
  const parsed = splitProviderModelId(normalized)
  if (!parsed) return stripClaudeReleaseSuffix(normalized)
  return `${parsed.prefix}/${stripClaudeReleaseSuffix(parsed.suffix)}`
}

export function modelIdFingerprint(modelId: string) {
  return normalizeText(modelId).toLowerCase().replace(/[^a-z0-9]+/g, "")
}

export function equivalentModelFingerprint(modelId: string) {
  const stripped = stripProviderPrefix(modelId)
  return modelIdFingerprint(stripClaudeReleaseSuffix(stripped))
}

export function areEquivalentModelIds(a: string, b: string) {
  const left = equivalentModelFingerprint(a)
  const right = equivalentModelFingerprint(b)
  return Boolean(left) && left === right
}

export function compareModelDisplayIdPreference(a: string, b: string) {
  const aNormalized = normalizeText(a)
  const bNormalized = normalizeText(b)
  const aHasPrefix = Boolean(splitProviderModelId(aNormalized))
  const bHasPrefix = Boolean(splitProviderModelId(bNormalized))
  if (aHasPrefix !== bHasPrefix) return aHasPrefix ? 1 : -1

  const aHasDot = aNormalized.includes(".")
  const bHasDot = bNormalized.includes(".")
  if (aHasDot !== bHasDot) return aHasDot ? 1 : -1

  const aThinking = modelIdFingerprint(aNormalized).includes("thinking")
  const bThinking = modelIdFingerprint(bNormalized).includes("thinking")
  if (aThinking !== bThinking) return aThinking ? 1 : -1

  if (aNormalized.length !== bNormalized.length) {
    return aNormalized.length - bNormalized.length
  }

  return aNormalized.localeCompare(bNormalized, "en", { sensitivity: "base" })
}

export function pickPreferredDisplayModelId(candidates: string[]) {
  const normalized = [
    ...new Set(candidates.map((item) => normalizeModelDisplayId(item)).filter(Boolean)),
  ]
  if (normalized.length === 0) return ""
  normalized.sort(compareModelDisplayIdPreference)
  return normalized[0] || ""
}

export function resolveEquivalentModelId(
  requestedModelId: string | null | undefined,
  candidates: string[],
) {
  const requested = normalizeText(requestedModelId)
  if (!requested) return null

  if (candidates.includes(requested)) return requested

  const targetFingerprint = equivalentModelFingerprint(requested)
  if (!targetFingerprint) return null

  const matched = candidates.filter(
    (candidate) => equivalentModelFingerprint(candidate) === targetFingerprint,
  )
  if (matched.length === 0) return null
  return pickPreferredDisplayModelId(matched) || null
}
