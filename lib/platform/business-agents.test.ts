import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import { getAiEntryAgentById } from "@/lib/ai-entry/agent-catalog"
import {
  getBusinessAgentConfigById,
  getLocalizedBusinessAgentConfigBySlug,
  listBusinessAgentConfigsBySlug,
  listLocalizedBusinessAgentConfigsBySlug,
  listBusinessAgentConfigs,
} from "@/lib/platform/business-agents"
import { CORE_WORKSPACE_BUSINESS_SLUGS, WORKSPACE_BUSINESS_SLUGS } from "@/lib/platform/workspace-business"

const workspaceBusinessSlugSet = new Set<string>(WORKSPACE_BUSINESS_SLUGS)

const newlyPromotedAgentIds = [
  "business-ppc-strategist",
  "business-paid-social-strategist",
  "business-ad-creative-strategist",
  "business-paid-media-auditor",
  "business-tracking-analytics-specialist",
  "business-aeo-foundations",
  "business-ai-citation-strategist",
  "business-pricing-analyst",
  "business-xiaohongshu-growth-strategist",
  "business-tiktok-growth-strategist",
  "business-wechat-content-operator",
  "business-content-growth-strategist",
]

const requiredPromptSections = [
  "## Role",
  "## When to use",
  "## Core methodology",
  "## Input needed",
  "## Output formats",
  "## Decision rules",
  "## Quality bar",
]

test("business agents cover every dashboard business entry with multiple agents, workflows, and prompts", () => {
  const agents = listBusinessAgentConfigs()

  assert.equal(agents.length, 38)
  assert.equal(new Set(agents.map((agent) => agent.agentId)).size, agents.length)

  for (const agent of agents) {
    assert.ok(agent.agentId.startsWith("business-"))
    assert.ok(agent.workflowSlugs.length > 0)
    assert.ok(agent.samplePrompts.length >= 3)
    assert.ok(agent.artifactKinds.length > 0)
    assert.ok(getBusinessAgentConfigById(agent.agentId))
    assert.ok(
      workspaceBusinessSlugSet.has(agent.businessSlug),
      `unexpected business slug: ${agent.businessSlug}`,
    )
    assert.ok(
      existsSync(path.join(process.cwd(), "content/skills/business-agents", agent.promptDocumentPath)),
      `missing prompt document for ${agent.agentId}: ${agent.promptDocumentPath}`,
    )
  }

  for (const slug of CORE_WORKSPACE_BUSINESS_SLUGS) {
    assert.ok(
      listBusinessAgentConfigsBySlug(slug).length > 0,
      `expected at least one agent for ${slug}`,
    )
  }
})

test("localized business agent lookup returns localized copy", () => {
  const zhAgent = getLocalizedBusinessAgentConfigBySlug("zh", "sales-close")
  const enAgent = getLocalizedBusinessAgentConfigBySlug("en", "sales-close")

  assert.ok(zhAgent)
  assert.ok(enAgent)
  assert.equal(zhAgent?.agentId, "business-sales-close")
  assert.equal(enAgent?.agentId, "business-sales-close")
  assert.notEqual(zhAgent?.name, enAgent?.name)
  assert.ok(zhAgent?.systemPromptSummary.includes("成交"))
  assert.ok(enAgent?.systemPromptSummary.includes("Prioritizes"))
})

test("newly promoted business agents keep executable prompt structure", () => {
  for (const agentId of newlyPromotedAgentIds) {
    const agent = getBusinessAgentConfigById(agentId)
    assert.ok(agent, `missing promoted agent config: ${agentId}`)
    assert.equal(agent.promptDocumentPath, `${agentId}.md`)
    assert.ok(agent.samplePrompts.length >= 3)
    assert.ok(agent.workflowSlugs.length > 0)
    assert.ok(agent.artifactKinds.length > 0)
    assert.ok(["content-growth", "paid-media", "finance"].includes(agent.businessSlug))
    assert.equal(getAiEntryAgentById(agentId)?.category, "business")

    const promptDocumentPath = path.join(
      process.cwd(),
      "content/skills/business-agents",
      agent.promptDocumentPath,
    )
    const promptDocument = readFileSync(promptDocumentPath, "utf8")

    for (const section of requiredPromptSections) {
      assert.ok(
        promptDocument.includes(section),
        `${agentId} prompt missing required section: ${section}`,
      )
    }
  }
})

test("each business view exposes multiple localized agents", () => {
  const leadAgents = listBusinessAgentConfigsBySlug("lead-conversion")
  const localizedLeadAgents = listLocalizedBusinessAgentConfigsBySlug("zh", "lead-conversion")
  const localizedBrandAgents = listLocalizedBusinessAgentConfigsBySlug("zh", "brand-creative")
  const localizedKnowledgeAgents = listLocalizedBusinessAgentConfigsBySlug("zh", "knowledge-assets")
  const localizedComplianceAgents = listLocalizedBusinessAgentConfigsBySlug("zh", "compliance-risk")
  const localizedTrainingAgents = listLocalizedBusinessAgentConfigsBySlug("zh", "training-enablement")
  const localizedTalentAgents = listLocalizedBusinessAgentConfigsBySlug("zh", "talent-recruiting")
  const localizedLegalAgents = listLocalizedBusinessAgentConfigsBySlug("zh", "legal-ops")

  assert.equal(leadAgents.length, 2)
  assert.equal(localizedLeadAgents.length, 2)
  assert.ok(localizedLeadAgents.some((agent) => agent.name.includes("获客")))
  assert.ok(localizedLeadAgents.some((agent) => agent.name.includes("外联")))
  assert.ok(localizedBrandAgents.some((agent) => agent.name.includes("视频")))
  assert.ok(localizedKnowledgeAgents.some((agent) => agent.name.includes("视频")))
  assert.ok(localizedComplianceAgents.some((agent) => agent.name.includes("隐私")))
  assert.ok(localizedTrainingAgents.some((agent) => agent.name.includes("培训")))
  assert.ok(localizedTalentAgents.some((agent) => agent.name.includes("招聘")))
  assert.ok(localizedLegalAgents.some((agent) => agent.name.includes("合同")))
})
