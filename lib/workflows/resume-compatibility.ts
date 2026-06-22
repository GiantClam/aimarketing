type WorkflowResumeComparableNode = {
  nodeKey: string
  type: string
  config?: unknown
}

type WorkflowResumeComparableEdge = {
  sourceNodeKey: string
  targetNodeKey: string
  inputName?: string | null
}

type WorkflowResumeComparableDefinition = {
  nodes: WorkflowResumeComparableNode[]
  edges: WorkflowResumeComparableEdge[]
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return "null"
  if (typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(",")}]`

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`).join(",")}}`
}

function buildWorkflowResumeCompatibilitySignature(workflow: WorkflowResumeComparableDefinition) {
  const nodes = [...workflow.nodes]
    .map((node) => ({
      nodeKey: node.nodeKey,
      type: node.type,
      config: node.config ?? null,
    }))
    .sort((left, right) => left.nodeKey.localeCompare(right.nodeKey))

  const edges = [...workflow.edges]
    .map((edge) => ({
      sourceNodeKey: edge.sourceNodeKey,
      targetNodeKey: edge.targetNodeKey,
      inputName: edge.inputName ?? null,
    }))
    .sort((left, right) => {
      const leftSignature = `${left.sourceNodeKey}:${left.targetNodeKey}:${left.inputName ?? ""}`
      const rightSignature = `${right.sourceNodeKey}:${right.targetNodeKey}:${right.inputName ?? ""}`
      return leftSignature.localeCompare(rightSignature)
    })

  return stableSerialize({
    nodes,
    edges,
  })
}

export function isWorkflowResumeCompatible(
  currentWorkflow: WorkflowResumeComparableDefinition,
  latestRunWorkflow: WorkflowResumeComparableDefinition,
) {
  return (
    buildWorkflowResumeCompatibilitySignature(currentWorkflow) ===
    buildWorkflowResumeCompatibilitySignature(latestRunWorkflow)
  )
}
