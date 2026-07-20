import { getAiEntryAgentCatalog } from "../lib/ai-entry/agent-catalog"
import { resolveAiEntryAgentRuntimePolicy } from "../lib/ai-entry/agent-runtime-policy"
import { loadExecutiveSkillForAgent } from "../lib/ai-entry/executive-skill-loader"
import { upsertSharedSkillSetBundle } from "../lib/ai-entry/shared-agent-skill-bundle-store"
import { resolveSharedSkillSetSelection } from "../lib/ai-entry/shared-agent-skill-resolver"
import { getImportedAgencyAgentSkillSourceMap } from "../lib/platform/imported-agency-agents"

function combinations(values: string[]) {
  return values.reduce<string[][]>((sets, value) => [...sets, ...sets.map((set) => [...set, value])], [[]])
}

async function main() {
  let written = 0
  let unchanged = 0
  const agentIds = new Set([
    ...getAiEntryAgentCatalog().map((agent) => agent.id),
    ...Object.keys(getImportedAgencyAgentSkillSourceMap()),
  ])
  for (const agentId of agentIds) {
    const policy = resolveAiEntryAgentRuntimePolicy({ agentId })
    const routedSkillIds = policy.allowedSkillIds.filter((skillId) => skillId === "longform-writing")
    for (const selectedSkillIds of combinations(routedSkillIds)) {
      const selection = resolveSharedSkillSetSelection({ agentId, enterpriseId: null, selectedSkillIds, allowedSkillIds: policy.allowedSkillIds })
      if (!selection) continue
      const result = await upsertSharedSkillSetBundle({ selection, agentInstructions: await loadExecutiveSkillForAgent(agentId) })
      if (!result.configured) throw new Error("shared_agent_bundle_store_not_configured")
      if (result.written) written += 1
      else unchanged += 1
    }
  }
  console.log(JSON.stringify({ event: "shared_agent_skill_bundle_sync_complete", written, unchanged }))
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
