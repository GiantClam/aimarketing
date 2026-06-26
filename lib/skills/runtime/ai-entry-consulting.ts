import { filterAllowedAiEntrySkillIds, resolveAiEntryAgentRuntimePolicy, type AiEntryAgentRuntimePolicy } from "@/lib/ai-entry/agent-runtime-policy"
import { buildAiEntrySkillInstruction, getAiEntrySkillsByIds, type AiEntrySkillDefinition } from "@/lib/ai-entry/skill-registry"
import {
  isExecutiveConsultingAgent,
  loadExecutiveSkillForAgent,
} from "@/lib/ai-entry/executive-skill-loader"
import { routeExecutiveAgentByPrompt } from "@/lib/ai-entry/executive-agent-router"
import { routeAiEntrySkills, type AiEntrySkillRouteDecision } from "@/lib/ai-entry/skill-router"

type AiEntryConsultingPreparationInput = {
  latestUserPrompt: string
  requestedAgentId: string | null
  lockModelToConsultingModel: boolean
  skillsEnabled: boolean
  enabledSkillIds: string[]
}

export type AiEntryConsultingPreparationResult = {
  effectiveAgentId: string | null
  routeDecision: ReturnType<typeof routeExecutiveAgentByPrompt> | null
  skillRouteDecision: AiEntrySkillRouteDecision | null
  selectedSkills: AiEntrySkillDefinition[]
  selectedSkillIds: string[]
  runtimePolicy: AiEntryAgentRuntimePolicy
  resolvedInstruction: string
}

export async function prepareAiEntryConsultingRuntime(
  input: AiEntryConsultingPreparationInput,
): Promise<AiEntryConsultingPreparationResult> {
  let effectiveAgentId = input.requestedAgentId
  let routeDecision: ReturnType<typeof routeExecutiveAgentByPrompt> | null = null
  if (!effectiveAgentId && input.lockModelToConsultingModel) {
    routeDecision = routeExecutiveAgentByPrompt(input.latestUserPrompt)
    effectiveAgentId = routeDecision.agentId
  }

  let resolvedInstruction = ""
  if (effectiveAgentId && isExecutiveConsultingAgent(effectiveAgentId)) {
    const skillContent = await loadExecutiveSkillForAgent(effectiveAgentId)
    if (skillContent.trim()) {
      resolvedInstruction = `# Skill Documents\n\n${skillContent.trim()}`
    }
  }

  const runtimePolicy = resolveAiEntryAgentRuntimePolicy({
    agentId: effectiveAgentId,
  })
  const skillRouteDecision = input.skillsEnabled
    ? routeAiEntrySkills({
        latestUserPrompt: input.latestUserPrompt,
        requestedAgentId: effectiveAgentId,
        requestedSkillIds: input.enabledSkillIds,
      })
    : null
  const selectedSkillIds = filterAllowedAiEntrySkillIds(
    skillRouteDecision?.selectedSkillIds ?? [],
    runtimePolicy,
  )
  const selectedSkills = getAiEntrySkillsByIds(selectedSkillIds)
  const skillInstruction = buildAiEntrySkillInstruction(selectedSkillIds)
  const mergedInstruction = [resolvedInstruction, skillInstruction]
    .map((section) => section.trim())
    .filter(Boolean)
    .join("\n\n")

  return {
    effectiveAgentId,
    routeDecision,
    skillRouteDecision,
    selectedSkills,
    selectedSkillIds,
    runtimePolicy,
    resolvedInstruction: mergedInstruction,
  }
}
