export const AI_ENTRY_CONSULTING_ENTRY_MODE = "consulting-advisor"
export const AI_ENTRY_CONSULTING_SPEED_MODEL_HINT = "claude-sonnet-4.5"
export const AI_ENTRY_CONSULTING_QUALITY_MODEL_HINT = "claude-sonnet-4.6"
export const AI_ENTRY_SONNET_46_MODEL_HINT = AI_ENTRY_CONSULTING_QUALITY_MODEL_HINT
export const AI_ENTRY_CONSULTING_DEFAULT_EXECUTIVE_AGENT_ID = "executive-diagnostic"

export type AiEntryConsultingModelMode = "speed" | "quality"

type ModelCandidate = {
  id?: string | null
  name?: string | null
  aliases?: string[] | null
  runtimeId?: string | null
  canonicalId?: string | null
}

export function normalizeModelFingerprint(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function isThinkingModelFingerprint(fingerprint: string) {
  return fingerprint.includes("thinking")
}

function buildModelCandidateText(item: ModelCandidate) {
  return [
    item.id,
    item.name,
    item.runtimeId,
    item.canonicalId,
    ...(Array.isArray(item.aliases) ? item.aliases : []),
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ")
}

function isModelHintMatch(item: ModelCandidate, modelHint: string) {
  const hintFingerprint = normalizeModelFingerprint(modelHint)
  const candidateFingerprint = normalizeModelFingerprint(buildModelCandidateText(item))
  return candidateFingerprint.includes(hintFingerprint)
}

function pickModelByHint(models: ModelCandidate[], modelHint: string) {
  const candidates = models
    .map((item) => {
      const id = normalizeText(item.id)
      if (!id || !isModelHintMatch(item, modelHint)) return null
      const fingerprint = normalizeModelFingerprint(buildModelCandidateText(item))
      return {
        id,
        hasProviderPrefix: id.includes("/"),
        hasDotSeparator: id.includes("."),
        prefersBaseVariant: !isThinkingModelFingerprint(fingerprint),
      }
    })
    .filter(
      (item): item is {
        id: string
        hasProviderPrefix: boolean
        hasDotSeparator: boolean
        prefersBaseVariant: boolean
      } => Boolean(item),
    )

  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    if (a.prefersBaseVariant !== b.prefersBaseVariant) {
      return a.prefersBaseVariant ? -1 : 1
    }
    if (a.hasProviderPrefix !== b.hasProviderPrefix) {
      return a.hasProviderPrefix ? 1 : -1
    }
    if (a.hasDotSeparator !== b.hasDotSeparator) {
      return a.hasDotSeparator ? 1 : -1
    }
    if (a.id.length !== b.id.length) return a.id.length - b.id.length
    return a.id.localeCompare(b.id, "en", { sensitivity: "base" })
  })

  return candidates[0]?.id || null
}

export function resolveConsultingModelMode(input?: {
  requestedMode?: unknown
}): AiEntryConsultingModelMode {
  const requestedMode = normalizeText(input?.requestedMode).toLowerCase()
  if (requestedMode === "quality" || requestedMode === "deep") return "quality"
  if (requestedMode === "speed" || requestedMode === "fast") return "speed"

  const envMode = normalizeText(process.env.AI_ENTRY_CONSULTING_MODEL_MODE).toLowerCase()
  if (envMode === "quality" || envMode === "deep") return "quality"
  return "speed"
}

export function getConsultingModelHint(mode: AiEntryConsultingModelMode) {
  if (mode === "quality") {
    return (
      normalizeText(process.env.AI_ENTRY_CONSULTING_QUALITY_MODEL) ||
      normalizeText(process.env.AI_ENTRY_CONSULTING_MODEL) ||
      AI_ENTRY_CONSULTING_QUALITY_MODEL_HINT
    )
  }
  return (
    normalizeText(process.env.AI_ENTRY_CONSULTING_SPEED_MODEL) ||
    normalizeText(process.env.AI_ENTRY_CONSULTING_MODEL) ||
    AI_ENTRY_CONSULTING_SPEED_MODEL_HINT
  )
}

export function pickConsultingModelId(
  models: ModelCandidate[],
  mode: AiEntryConsultingModelMode = "speed",
) {
  return pickModelByHint(models, getConsultingModelHint(mode))
}

export function pickSonnet46ModelId(models: ModelCandidate[]) {
  return pickModelByHint(models, AI_ENTRY_CONSULTING_QUALITY_MODEL_HINT)
}

export function isConsultingAdvisorEntryMode(value: unknown) {
  return (
    typeof value === "string" &&
    value.trim().toLowerCase() === AI_ENTRY_CONSULTING_ENTRY_MODE
  )
}

export function shouldLockConsultingAdvisorModel(input: {
  entryMode?: unknown
  agentId?: string | null
}) {
  return isConsultingAdvisorEntryMode(input.entryMode)
}
