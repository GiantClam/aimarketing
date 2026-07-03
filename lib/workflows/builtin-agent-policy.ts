const WORKFLOW_EXCLUDED_BUILTIN_AGENT_IDS = new Set([
  "executive-ppt",
  "executive-presentation-ppt",
])

export function isWorkflowBuiltinAgentSelectable(agentId: string | null | undefined) {
  return typeof agentId === "string" && agentId.trim().length > 0 && !WORKFLOW_EXCLUDED_BUILTIN_AGENT_IDS.has(agentId)
}
