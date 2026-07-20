import { createHash, randomUUID } from "node:crypto"

import { prepareCloudflareSession } from "../lib/ai-entry/runtime/cloudflare-session-client"
import type { SharedSkillSetSelection } from "../lib/ai-runtime/contracts"

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`missing_${name.toLowerCase()}`)
  return value
}

async function main() {
  const parsedEnterpriseId = Number.parseInt(required("SHARED_AGENT_SMOKE_ENTERPRISE_ID"), 10)
  if (!Number.isInteger(parsedEnterpriseId) || parsedEnterpriseId < 0) throw new Error("invalid_shared_agent_smoke_enterprise_id")
  // Zero explicitly exercises the global built-in Agent scope. Positive
  // values exercise an enterprise-scoped custom or built-in Agent bundle.
  const enterpriseId = parsedEnterpriseId > 0 ? parsedEnterpriseId : null
  const selection: SharedSkillSetSelection = {
    runtimeKind: "shared-agent",
    agentId: required("SHARED_AGENT_SMOKE_AGENT_ID"),
    skills: required("SHARED_AGENT_SMOKE_SKILL_IDS").split(",").map((id, position) => ({ id: id.trim(), position })).filter((skill) => skill.id),
    skillSetId: required("SHARED_AGENT_SMOKE_SKILL_SET_ID"),
    bundleKey: required("SHARED_AGENT_SMOKE_BUNDLE_KEY"),
  }
  if (selection.skills.length === 0) throw new Error("shared_agent_smoke_skills_empty")
  const configuredSessionKey = process.env.SHARED_AGENT_SMOKE_SESSION_KEY?.trim()
  const sessionKey = configuredSessionKey || `sess-${createHash("sha256").update(`${Date.now()}:${randomUUID()}`).digest("hex").slice(0, 40)}`
  const userId = Number.parseInt(required("SHARED_AGENT_SMOKE_USER_ID"), 10)
  const provider = {
    providerId: "deepseek" as const,
    modelId: required("SHARED_AGENT_SMOKE_PROVIDER_MODEL"),
    baseUrl: required("SHARED_AGENT_SMOKE_PROVIDER_BASE_URL"),
    apiKey: required("SHARED_AGENT_SMOKE_PROVIDER_API_KEY"),
  }
  const buildRequest = () => {
    const runId = randomUUID()
    return {
      runId,
      sessionKey,
      deadlineMs: 3_600_000 as const,
      input: {
        protocolVersion: 2 as const,
        runId,
        sessionKey,
        functionId: selection.agentId,
        conversationId: "shared-agent-smoke",
        enterpriseId,
        userId,
        agentId: selection.agentId,
        selectedSkillIds: selection.skills.map((skill) => skill.id),
        selectedMcpServerIds: [],
        attachmentObjects: [],
        checkpoint: null,
        sharedSkillSetSelection: selection,
        systemPrompt: "Prepare shared-agent runtime only. Do not call a model.",
        messages: [{ role: "user" as const, content: "Prepare only." }],
        attachments: [], artifactContext: [], workflowContext: null,
        artifactContract: { manifestPath: "artifact-manifest.json" as const, artifactDir: "artifacts" as const, maxArtifacts: 1, maxArtifactBytes: 1, maxArtifactTotalBytes: 1, allowedExtensions: [".md"] },
        policy: { allowPlatformTools: false as const, allowTools: false as const, allowMcp: false as const, allowSkillInstall: false as const, allowNetwork: false },
      },
      provider,
    }
  }
  const prepares: Array<{ prepareMs: number; cacheHit: boolean; r2Read: boolean }> = []
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const startedAt = Date.now()
    const result = await prepareCloudflareSession(buildRequest())
    const sharedSkillSet = result.sharedSkillSet
    if (!sharedSkillSet) throw new Error("shared_agent_smoke_missing_cache_metadata")
    prepares.push({ prepareMs: Date.now() - startedAt, ...sharedSkillSet })
  }
  if (prepares[1].cacheHit !== true || prepares[1].r2Read !== false) {
    throw new Error("shared_agent_smoke_second_prepare_not_cache_hit")
  }
  console.log(JSON.stringify({
    event: "shared_agent_runtime_smoke_complete",
    sessionKey,
    agentId: selection.agentId,
    skillSetId: selection.skillSetId,
    generatedSessionKey: !configuredSessionKey,
    prepares,
    expectation: "The first prepare is the cold/miss observation; the second must be an active-session cache hit with no R2 read.",
  }))
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
