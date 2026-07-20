import { createHash } from "node:crypto"

import type { SharedSkillSetSelection } from "@/lib/ai-runtime/contracts"
import { getAiEntrySkillsByIds, isAiEntrySkillId } from "@/lib/ai-entry/skill-registry"
import { parseCustomAgentRuntimeId } from "@/lib/platform/custom-agent-runtime-id"

const DEDICATED_AGENT_IDS = new Set(["executive-ppt", "executive-presentation-ppt"])
const DEDICATED_SKILL_IDS = new Set(["ppt-master", "dashiai-ppt"])
const DEFAULT_SHARED_SKILL_ID = "executive-consulting"

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function stableSkillSetId(skillIds: string[]) {
  return createHash("sha256")
    .update(JSON.stringify([...skillIds].sort()))
    .digest("hex")
    .slice(0, 40)
}

function isSharedAgent(agentId: string) {
  return agentId.startsWith("agency-") ||
    agentId.startsWith("business-") ||
    parseCustomAgentRuntimeId(agentId) !== null
}

function customBindingSkillIds(bindings: Record<string, unknown> | null | undefined) {
  if (!bindings) return []
  const values: unknown[] = [bindings.enabledSkillIds, bindings.skillIds, bindings.skills]
  const fromLists = values.flatMap((value) => Array.isArray(value) ? value : [])
  const fromBooleanMap = Object.entries(bindings)
    .filter(([key, value]) => value === true && isAiEntrySkillId(key))
    .map(([key]) => key)
  return [...fromLists, ...fromBooleanMap]
    .map(normalizedText)
    .filter((skillId) => isAiEntrySkillId(skillId))
}

export function resolveSharedSkillSetSelection(input: {
  agentId: string | null | undefined
  enterpriseId: number | null | undefined
  selectedSkillIds: string[]
  allowedSkillIds?: string[]
  customSkillBindings?: Record<string, unknown> | null
}): SharedSkillSetSelection | null {
  const agentId = normalizedText(input.agentId)
  if (!agentId || !isSharedAgent(agentId) || DEDICATED_AGENT_IDS.has(agentId)) return null

  const isCustomAgent = parseCustomAgentRuntimeId(agentId) !== null
  const boundCustomSkills = customBindingSkillIds(input.customSkillBindings)
  // A custom Agent's existing skillBindings are its only authority. Built-in
  // shared agents retain the consulting base skill plus routed skills.
  const candidates = isCustomAgent
    ? boundCustomSkills
    : [DEFAULT_SHARED_SKILL_ID, ...input.selectedSkillIds]
  const allowed = new Set(input.allowedSkillIds || [])
  const skillIds = [...new Set(candidates)]
    .filter((skillId) => isAiEntrySkillId(skillId))
    .filter((skillId) => !DEDICATED_SKILL_IDS.has(skillId))
    .filter((skillId) => allowed.size === 0 || allowed.has(skillId))
    .filter((skillId) => !isCustomAgent || boundCustomSkills.includes(skillId))
    .filter((skillId) => getAiEntrySkillsByIds([skillId]).length === 1)

  if (skillIds.length === 0) return null
  const skillSetId = stableSkillSetId(skillIds)
  const enterpriseScope = typeof input.enterpriseId === "number" && input.enterpriseId > 0
    ? `enterprise-${input.enterpriseId}`
    : "global"
  const safeAgentId = agentId.replace(/[^a-zA-Z0-9:_-]/g, "-")
  return {
    runtimeKind: "shared-agent",
    agentId,
    skills: skillIds.map((id, position) => ({ id, position })),
    skillSetId,
    bundleKey: `shared-agent-skillsets/${enterpriseScope}/${safeAgentId}/${skillSetId}.json`,
  }
}

export function isSharedAgentSkillSelection(value: SharedSkillSetSelection | null | undefined) {
  return Boolean(value && value.runtimeKind === "shared-agent" && !DEDICATED_AGENT_IDS.has(value.agentId))
}
