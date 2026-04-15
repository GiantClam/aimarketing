import { hasAnyWebSearchProviderConfig } from "@/lib/skills/tools/web-search"

export type LeadHunterEngineMode = "dify" | "skill"

function normalizeEngineMode(raw: string | null | undefined): LeadHunterEngineMode {
  const text = (raw || "").trim().toLowerCase()
  if (text === "skill") return "skill"
  return "dify"
}

export function resolveLeadHunterEngineMode(): LeadHunterEngineMode {
  return normalizeEngineMode(process.env.LEAD_HUNTER_ENGINE || process.env.LEAD_HUNTER_EXECUTION_ENGINE)
}

export function isLeadHunterSkillEngineEnabled() {
  return resolveLeadHunterEngineMode() === "skill"
}

export function hasLeadHunterSkillSearchConfig() {
  return hasAnyWebSearchProviderConfig()
}

export function isLeadHunterSkillRuntimeAvailable() {
  // Runtime availability is provider-key based. Enterprise execution mode is database-driven.
  return hasLeadHunterSkillSearchConfig()
}
