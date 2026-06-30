import type { EnterpriseWorkflowPreset } from "@/lib/workflows/presets"

export function cloneEnterpriseWorkflowPreset(preset: EnterpriseWorkflowPreset): EnterpriseWorkflowPreset {
  return {
    ...preset,
    channelTargets: [...preset.channelTargets],
    reviewRules: [...preset.reviewRules],
    bannedTerms: [...preset.bannedTerms],
    allowedKnowledgeDatasetIds: [...preset.allowedKnowledgeDatasetIds],
  }
}

export function applyEnterpriseWorkflowPresetDraft(
  presets: EnterpriseWorkflowPreset[],
  draft: EnterpriseWorkflowPreset,
) {
  const nextDraft = cloneEnterpriseWorkflowPreset(draft)
  const currentIndex = presets.findIndex((preset) => preset.id === draft.id)
  if (currentIndex < 0) {
    return [...presets, nextDraft]
  }

  return presets.map((preset, index) => (index === currentIndex ? nextDraft : preset))
}
