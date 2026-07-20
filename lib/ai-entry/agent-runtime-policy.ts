import { getAiEntryMcpServerDefinitions } from "@/lib/ai-entry/mcp-tools"

export type AiEntryAgentRuntimePolicy = {
  agentId: string
  allowedSkillIds: string[]
  allowedToolIds: string[]
  allowedMcpServerIds: string[]
  maxToolCalls: number
  maxRuntimeMs: number
  canCreateArtifacts: boolean
  approvalRequiredToolIds: string[]
}

const DEFAULT_AGENT_RUNTIME_MS = 5 * 60 * 1000
const PPT_AGENT_RUNTIME_MS = 60 * 60 * 1000

function getApprovedMcpServerIds() {
  return getAiEntryMcpServerDefinitions()
    .filter((server) => server.enabled)
    .map((server) => server.id)
}

function buildDefaultPolicy(agentId: string): AiEntryAgentRuntimePolicy {
  return {
    agentId,
    allowedSkillIds: ["executive-consulting", "longform-writing", "ppt-master"],
    allowedToolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck", "update_ppt_brief", "recommend_ppt_templates"],
    allowedMcpServerIds: getApprovedMcpServerIds(),
    maxToolCalls: 8,
    maxRuntimeMs: DEFAULT_AGENT_RUNTIME_MS,
    canCreateArtifacts: true,
    approvalRequiredToolIds: [],
  }
}

function isRestrictedComplianceAgent(agentId: string) {
  return /(legal|compliance)/iu.test(agentId)
}

function isArtifactHeavyBusinessAgent(agentId: string) {
  return /(brand|campaign|creative|content|sales-close|outreach|lead-conversion)/iu.test(agentId)
}

export function resolveAiEntryAgentRuntimePolicy(input: {
  agentId?: string | null
}): AiEntryAgentRuntimePolicy {
  const effectiveAgentId = input.agentId?.trim() || "general"
  const policy = buildDefaultPolicy(effectiveAgentId)

  if (
    effectiveAgentId === "executive-ppt" ||
    effectiveAgentId === "executive-presentation-ppt"
  ) {
    const isConversationalPresentation = effectiveAgentId === "executive-presentation-ppt"
    return {
      ...policy,
      allowedSkillIds: isConversationalPresentation ? ["dashiai-ppt", "executive-consulting"] : ["ppt-master", "executive-consulting"],
      allowedToolIds: isConversationalPresentation ? [] : ["web_search", "preview_ppt_deck", "export_ppt_deck", "update_ppt_brief", "recommend_ppt_templates"],
      allowedMcpServerIds: isConversationalPresentation ? [] : policy.allowedMcpServerIds,
      maxRuntimeMs: PPT_AGENT_RUNTIME_MS,
      canCreateArtifacts: true,
    }
  }

  if (isRestrictedComplianceAgent(effectiveAgentId)) {
    return {
      ...policy,
      allowedSkillIds: ["executive-consulting", "longform-writing"],
      allowedToolIds: ["web_search"],
      canCreateArtifacts: false,
    }
  }

  if (effectiveAgentId.startsWith("business-") && !isArtifactHeavyBusinessAgent(effectiveAgentId)) {
    return {
      ...policy,
      allowedSkillIds: ["executive-consulting", "longform-writing"],
      allowedToolIds: ["web_search"],
      canCreateArtifacts: false,
    }
  }

  return policy
}

export function filterAllowedAiEntrySkillIds(skillIds: string[], policy: AiEntryAgentRuntimePolicy) {
  const allowed = new Set(policy.allowedSkillIds)
  return skillIds.filter((skillId) => allowed.has(skillId))
}

/** Reserve one model step for the final synthesis after tool results. */
export function resolveAiEntryMaxStepCount(
  policy: Pick<AiEntryAgentRuntimePolicy, "maxToolCalls">,
  hasTools: boolean,
) {
  return hasTools ? Math.max(1, policy.maxToolCalls + 1) : 1
}
