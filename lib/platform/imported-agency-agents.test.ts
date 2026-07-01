import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"

import { WORKSPACE_BUSINESS_SLUGS } from "@/lib/platform/workspace-business"

const workspaceBusinessSlugSet = new Set<string>(WORKSPACE_BUSINESS_SLUGS)

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only") {
    return {}
  }
  return originalLoad.call(this, request, parent, isMain)
}

test("imported agency agents stay runnable and mapped to supported business lanes", async () => {
  const {
    listImportedAgencyAgents,
    getImportedAgencyAgentSkillSourceMap,
  } = await import("./imported-agency-agents")

  const agents = listImportedAgencyAgents("en")
  const sourceMap = getImportedAgencyAgentSkillSourceMap()

  assert.equal(agents.length, 212)
  assert.equal(new Set(agents.map((agent) => agent.agentId)).size, agents.length)
  assert.equal(Object.keys(sourceMap).length, agents.length)
  assert.ok(new Set(agents.map((agent) => agent.businessSlug)).size >= 15)
  assert.ok(agents.every((agent) => agent.businessSlug !== "game-development"))

  for (const agent of agents) {
    assert.ok(agent.agentId.startsWith("agency-"))
    assert.ok(workspaceBusinessSlugSet.has(agent.businessSlug))
    assert.ok(agent.summary.length > 20)
    assert.ok(agent.workflowSlugs.length > 0)
    assert.ok(agent.samplePrompts.length >= 3)
    assert.ok(agent.artifactKinds.length > 0)
    assert.ok(agent.nativeHref.startsWith("/dashboard/business?"))
    assert.ok(agent.proofPoints.length >= 3)
    assert.ok(
      existsSync(path.join(process.cwd(), "content/skills/agency-agents", agent.sourcePath)),
      `missing imported prompt file for ${agent.agentId}: ${agent.sourcePath}`,
    )
  }
})

test("imported agency agent names are localized for zh locale", async () => {
  const { listImportedAgencyAgents } = await import("./imported-agency-agents")

  const zhAgents = listImportedAgencyAgents("zh")
  const douyin = zhAgents.find((agent) => agent.agentId === "agency-marketing-douyin-strategist")
  const storyteller = zhAgents.find((agent) => agent.agentId === "agency-design-visual-storyteller")
  const uxArchitect = zhAgents.find((agent) => agent.agentId === "agency-design-ux-architect")

  assert.equal(douyin?.name, "抖音策略师")
  assert.equal(storyteller?.name, "视觉叙事师")
  assert.equal(uxArchitect?.name, "UX 架构师")
})
