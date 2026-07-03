import {
  AI_ENTRY_CONSULTING_ENTRY_MODE,
  isConsultingAdvisorEntryMode,
} from "@/lib/ai-entry/model-policy"

type ResolveAiEntrySidebarEntryStateInput = {
  entryHref?: string
  activeAgentId?: string | null
  currentAgentId?: string | null
  currentEntryMode?: string | null
}

type ResolveAiEntrySidebarEntryStateResult = {
  basePath: string
  entryMode: string | null
  entryAgentId: string | null
  effectiveAgentId: string | null
  hrefSuffix: string
  cacheKeySuffix: string
  isMatchedAgent: boolean
}

function normalizeText(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : ""
  return normalized || null
}

export function resolveAiEntrySidebarEntryState(
  input: ResolveAiEntrySidebarEntryStateInput,
): ResolveAiEntrySidebarEntryStateResult {
  const [entryPath, entryQuery = ""] = (input.entryHref || "/dashboard/ai").split("?")
  const basePath = entryPath || "/dashboard/ai"
  const entryQueryParams = new URLSearchParams(entryQuery)
  const entryModeRaw = normalizeText(entryQueryParams.get("entry"))
  const entryAgentId = normalizeText(entryQueryParams.get("agent"))
  const currentAgentId = normalizeText(input.currentAgentId)
  const activeAgentId = normalizeText(input.activeAgentId)
  const isConsultingEntry = isConsultingAdvisorEntryMode(entryModeRaw)
  const currentIsConsultingEntry = isConsultingAdvisorEntryMode(input.currentEntryMode)
  const entryMode = isConsultingEntry ? AI_ENTRY_CONSULTING_ENTRY_MODE : null
  const effectiveAgentId = entryAgentId
  const targetAgentId = activeAgentId || entryAgentId
  const isPlainChatEntry = !entryMode && !targetAgentId
  const matchesConsultingMode = currentIsConsultingEntry === isConsultingEntry

  const hrefQueryParams = new URLSearchParams(entryQuery)
  if (effectiveAgentId) {
    hrefQueryParams.set("agent", effectiveAgentId)
  } else {
    hrefQueryParams.delete("agent")
  }

  const scopeCacheKeySuffix = entryMode || "chat"
  const cacheKeySuffix = effectiveAgentId
    ? `${scopeCacheKeySuffix}:${effectiveAgentId}`
    : scopeCacheKeySuffix
  const hrefSuffix = hrefQueryParams.toString() ? `?${hrefQueryParams.toString()}` : ""

  let isMatchedAgent = false
  if (isPlainChatEntry) {
    isMatchedAgent = !currentAgentId && !currentIsConsultingEntry
  } else if (targetAgentId) {
    isMatchedAgent = currentAgentId === targetAgentId && matchesConsultingMode
  } else if (entryMode) {
    isMatchedAgent = !currentAgentId && currentIsConsultingEntry
  }

  return {
    basePath,
    entryMode,
    entryAgentId,
    effectiveAgentId,
    hrefSuffix,
    cacheKeySuffix,
    isMatchedAgent,
  }
}
