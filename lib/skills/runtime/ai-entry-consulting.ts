import type { ToolSet } from "ai"

import {
  getAiEntryMcpServerUrls,
  loadAiEntryMcpTools,
  selectAiEntryTools,
} from "@/lib/ai-entry/mcp-tools"
import {
  isExecutiveConsultingAgent,
  loadExecutiveSkillForAgent,
} from "@/lib/ai-entry/executive-skill-loader"
import { routeExecutiveAgentByPrompt } from "@/lib/ai-entry/executive-agent-router"

type AiEntryConsultingPreparationInput = {
  latestUserPrompt: string
  requestedAgentId: string | null
  lockModelToSonnet46: boolean
  skillsEnabled: boolean
  enabledToolNames: string[]
}

export type AiEntryConsultingPreparationResult = {
  effectiveAgentId: string | null
  routeDecision: ReturnType<typeof routeExecutiveAgentByPrompt> | null
  resolvedInstruction: string
  selectedTools: ToolSet
  selectedToolIds: string[]
  closeTools: (() => Promise<void>) | null
  toolLoadWarning: string | null
}

export async function prepareAiEntryConsultingRuntime(
  input: AiEntryConsultingPreparationInput,
): Promise<AiEntryConsultingPreparationResult> {
  let effectiveAgentId = input.requestedAgentId
  let routeDecision: ReturnType<typeof routeExecutiveAgentByPrompt> | null = null
  if (!effectiveAgentId && input.lockModelToSonnet46) {
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

  let selectedTools = {} as ToolSet
  let selectedToolIds: string[] = []
  let closeTools: (() => Promise<void>) | null = null
  let toolLoadWarning: string | null = null

  if (input.skillsEnabled) {
    const urls = getAiEntryMcpServerUrls()
    if (urls.length > 0) {
      try {
        const loaded = await loadAiEntryMcpTools(urls)
        closeTools = loaded.close
        const loadedTools =
          loaded.tools && typeof loaded.tools === "object"
            ? loaded.tools
            : ({} as ToolSet)
        selectedTools =
          input.enabledToolNames.length > 0
            ? selectAiEntryTools(loadedTools, input.enabledToolNames)
            : loadedTools
        selectedToolIds = Object.keys((selectedTools || {}) as Record<string, unknown>)
      } catch (error) {
        selectedTools = {} as ToolSet
        selectedToolIds = []
        toolLoadWarning = error instanceof Error ? error.message : String(error)
      }
    }
  }

  return {
    effectiveAgentId,
    routeDecision,
    resolvedInstruction,
    selectedTools,
    selectedToolIds,
    closeTools,
    toolLoadWarning,
  }
}
