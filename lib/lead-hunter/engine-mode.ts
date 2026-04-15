import { hasAnyWebSearchProviderConfig } from "@/lib/skills/tools/web-search"

export type LeadHunterEngineMode = "dify" | "skill"

export function hasLeadHunterSkillSearchConfig() {
  return hasAnyWebSearchProviderConfig()
}

export function isLeadHunterSkillRuntimeAvailable() {
  // Runtime mode selection is database-driven (enterprise advisor config execution_mode).
  // Keep skill runtime always available when DB routes to skill.
  return true
}
