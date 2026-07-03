import { getAiEntrySkillById, isAiEntrySkillId, type AiEntrySkillDefinition } from "@/lib/ai-entry/skill-registry"
import { isAiEntryPptAgentId } from "@/lib/ai-entry/model-policy"

const PPT_INTENT_PATTERN =
  /(?:\bpptx?\b|\bdeck\b|\bslide(?:s| deck)?\b|\bpresentation\b|\bpitch deck\b|\bproposal deck\b|演示文稿|幻灯片|汇报(?:材料|PPT)?|路演|提案PPT|方案汇报)/iu

const LONGFORM_WRITING_PATTERN =
  /(?:\barticle\b|\bblog\b|\bnewsletter\b|\bwhitepaper\b|\bpress release\b|\bpost\b|长文|稿件|新闻稿|白皮书|文章|专栏)/iu

type SkillRouteReason =
  | "explicit_selection"
  | "agent_default"
  | "ppt_intent"
  | "longform_writing_intent"

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
  const normalizedPrompt = input.latestUserPrompt.trim()
  const requestedSkillIds = dedupeSkillIds(input.requestedSkillIds ?? [])

  for (const skillId of requestedSkillIds) {
    if (!selected.has(skillId)) {
      selected.add(skillId)
      reasons.push({ skillId, reason: "explicit_selection" })
    }
  }

  if (isAiEntryPptAgentId(input.requestedAgentId) && !selected.has("ppt-master")) {
    selected.add("ppt-master")
    reasons.push({ skillId: "ppt-master", reason: "agent_default" })
  }

  if (normalizedPrompt && PPT_INTENT_PATTERN.test(normalizedPrompt) && !selected.has("ppt-master")) {
    selected.add("ppt-master")
    reasons.push({ skillId: "ppt-master", reason: "ppt_intent" })
  }

  if (
    normalizedPrompt &&
    LONGFORM_WRITING_PATTERN.test(normalizedPrompt) &&
    !selected.has("longform-writing")
  ) {
    selected.add("longform-writing")
    reasons.push({ skillId: "longform-writing", reason: "longform_writing_intent" })
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
