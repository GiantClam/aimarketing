export type EnterpriseKnowledgeGovernanceDataset = {
  id: number
  name: string
  category: string
  bindings: Array<{
    id: number
    targetType: "ai_entry" | "writer" | "advisor_external_knowledge"
    enabled?: boolean
  }>
}

export type SharedKnowledgeTargetSummary = {
  aiEntryDatasets: EnterpriseKnowledgeGovernanceDataset[]
  writerDatasets: EnterpriseKnowledgeGovernanceDataset[]
  advisorDatasets: EnterpriseKnowledgeGovernanceDataset[]
}

export function summarizeSharedKnowledgeTargets(
  datasets: EnterpriseKnowledgeGovernanceDataset[],
): SharedKnowledgeTargetSummary {
  const aiEntryDatasets: EnterpriseKnowledgeGovernanceDataset[] = []
  const writerDatasets: EnterpriseKnowledgeGovernanceDataset[] = []
  const advisorDatasets: EnterpriseKnowledgeGovernanceDataset[] = []

  for (const dataset of datasets) {
    const enabledTargets = new Set(
      dataset.bindings
        .filter((binding) => binding.enabled !== false)
        .map((binding) => binding.targetType),
    )

    if (enabledTargets.has("ai_entry")) aiEntryDatasets.push(dataset)
    if (enabledTargets.has("writer")) writerDatasets.push(dataset)
    if (enabledTargets.has("advisor_external_knowledge")) advisorDatasets.push(dataset)
  }

  const sortByName = (left: EnterpriseKnowledgeGovernanceDataset, right: EnterpriseKnowledgeGovernanceDataset) =>
    left.name.localeCompare(right.name)

  aiEntryDatasets.sort(sortByName)
  writerDatasets.sort(sortByName)
  advisorDatasets.sort(sortByName)

  return {
    aiEntryDatasets,
    writerDatasets,
    advisorDatasets,
  }
}
