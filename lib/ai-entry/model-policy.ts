export const AI_ENTRY_CONSULTING_AGENT_ID = "general"
export const AI_ENTRY_CONSULTING_ENTRY_MODE = "consulting-advisor"
export const AI_ENTRY_SONNET_46_MODEL_HINT = "sonnet-4.6"

export function normalizeModelFingerprint(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

export function pickSonnet46ModelId(
  models: Array<{ id?: string | null; name?: string | null }>,
) {
  const candidates = models
    .map((item) => {
      const id = typeof item?.id === "string" ? item.id.trim() : ""
      if (!id) return null
      const name = typeof item?.name === "string" ? item.name.trim() : ""
      const fingerprint = normalizeModelFingerprint(`${id} ${name}`)
      const isSonnet46 =
        fingerprint.includes("sonnet46") ||
        fingerprint.includes("claudesonnet46") ||
        fingerprint.includes("claudesonnet460")
      if (!isSonnet46) return null

      const prefersBaseVariant = !fingerprint.includes("thinking")
      return {
        id,
        hasProviderPrefix: id.includes("/"),
        hasDotSeparator: id.includes("."),
        prefersBaseVariant,
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
    if (a.hasProviderPrefix !== b.hasProviderPrefix) {
      return a.hasProviderPrefix ? 1 : -1
    }
    if (a.hasDotSeparator !== b.hasDotSeparator) {
      return a.hasDotSeparator ? 1 : -1
    }
    if (a.prefersBaseVariant !== b.prefersBaseVariant) {
      return a.prefersBaseVariant ? -1 : 1
    }
    if (a.id.length !== b.id.length) return a.id.length - b.id.length
    return a.id.localeCompare(b.id, "en", { sensitivity: "base" })
  })

  return candidates[0]?.id || null
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
