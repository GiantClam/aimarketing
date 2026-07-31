import { getAiEntrySkillById, isAiEntrySkillId, type AiEntrySkillDefinition } from "@/lib/ai-entry/skill-registry"
import { isAiEntryPptAgentId } from "@/lib/ai-entry/model-policy"

type SkillRouteReason =
  | "explicit_selection"
  | "agent_default"

export type AiEntrySkillRouteDecision = {
  selectedSkillIds: string[]
  reasons: Array<{
    skillId: string
    reason: SkillRouteReason
  }>
}

function dedupeSkillIds(skillIds: string[]) {
  return [...new Set(skillIds.filter((skillId) => isAiEntrySkillId(skillId)))]
}

export function routeAiEntrySkills(input: {
  latestUserPrompt: string
  requestedAgentId?: string | null
  requestedSkillIds?: string[]
}): AiEntrySkillRouteDecision {
  const selected = new Set<string>()
  const reasons: AiEntrySkillRouteDecision["reasons"] = []
  const requestedSkillIds = dedupeSkillIds(input.requestedSkillIds ?? [])

  // Plain AI Chat is intentionally skill-free. Skill selection belongs to an
  // explicit Agent surface, so routing cannot depend on language-specific
  // keyword heuristics or a user's wording.
  if (!input.requestedAgentId?.trim()) {
    return { selectedSkillIds: [], reasons: [] }
  }

  for (const skillId of requestedSkillIds) {
    if (!selected.has(skillId)) {
      selected.add(skillId)
      reasons.push({ skillId, reason: "explicit_selection" })
    }
  }

  const defaultPptSkill = input.requestedAgentId === "executive-presentation-ppt" ? "dashiai-ppt" : "ppt-master"
  if (isAiEntryPptAgentId(input.requestedAgentId) && !selected.has(defaultPptSkill)) {
    selected.add(defaultPptSkill)
    reasons.push({ skillId: defaultPptSkill, reason: "agent_default" })
  }

  return {
    selectedSkillIds: [...selected],
    reasons,
  }
}

export function getRoutedAiEntrySkills(input: {
  latestUserPrompt: string
  requestedAgentId?: string | null
  requestedSkillIds?: string[]
}): AiEntrySkillDefinition[] {
  return routeAiEntrySkills(input).selectedSkillIds
    .map((skillId) => getAiEntrySkillById(skillId))
    .filter((skill): skill is AiEntrySkillDefinition => Boolean(skill))
}
