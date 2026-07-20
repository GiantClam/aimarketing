import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "@/lib/ai-entry/mcp-tools") {
    return {
      getAiEntryMcpServerDefinitions: () => [
        {
          id: "mcp-sse-1",
          name: "Approved MCP",
          transport: "sse",
          url: "https://example.com/mcp",
          timeoutMs: 30_000,
          enabled: true,
        },
      ],
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let resolveAiEntryAgentRuntimePolicy: typeof import("./agent-runtime-policy").resolveAiEntryAgentRuntimePolicy
let resolveAiEntryMaxStepCount: typeof import("./agent-runtime-policy").resolveAiEntryMaxStepCount

test.before(async () => {
  const mod = await import("./agent-runtime-policy")
  resolveAiEntryAgentRuntimePolicy = mod.resolveAiEntryAgentRuntimePolicy
  resolveAiEntryMaxStepCount = mod.resolveAiEntryMaxStepCount
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("runtime policy allows ppt-master for general chat", () => {
  const policy = resolveAiEntryAgentRuntimePolicy({
    agentId: "general",
  })

  assert.ok(policy.allowedSkillIds.includes("ppt-master"))
  assert.ok(policy.allowedToolIds.includes("preview_ppt_deck"))
  assert.ok(policy.allowedToolIds.includes("export_ppt_deck"))
  assert.equal(policy.canCreateArtifacts, true)
})

test("runtime policy denies ppt-master for compliance-style agents", () => {
  const policy = resolveAiEntryAgentRuntimePolicy({
    agentId: "business-compliance-auditor",
  })

  assert.equal(policy.allowedSkillIds.includes("ppt-master"), false)
  assert.equal(policy.allowedToolIds.includes("preview_ppt_deck"), false)
  assert.equal(policy.allowedToolIds.includes("export_ppt_deck"), false)
  assert.equal(policy.canCreateArtifacts, false)
})

test("runtime policy routes presentation ppt agent to native Dashi skill", () => {
  const policy = resolveAiEntryAgentRuntimePolicy({
    agentId: "executive-presentation-ppt",
  })

  assert.ok(policy.allowedSkillIds.includes("dashiai-ppt"))
  assert.equal(policy.allowedToolIds.includes("preview_ppt_deck"), false)
  assert.equal(policy.allowedToolIds.includes("export_ppt_deck"), false)
  assert.deepEqual(policy.allowedMcpServerIds, [])
  assert.equal(policy.canCreateArtifacts, true)
  assert.equal(policy.maxRuntimeMs, 60 * 60 * 1000)
})

test("runtime policy keeps default runtime budget for non-ppt agents", () => {
  const policy = resolveAiEntryAgentRuntimePolicy({
    agentId: "general",
  })

  assert.equal(policy.maxRuntimeMs, 5 * 60 * 1000)
})

test("tool-enabled runs reserve a final synthesis step", () => {
  assert.equal(resolveAiEntryMaxStepCount({ maxToolCalls: 8 }, true), 9)
  assert.equal(resolveAiEntryMaxStepCount({ maxToolCalls: 1 }, true), 2)
  assert.equal(resolveAiEntryMaxStepCount({ maxToolCalls: 8 }, false), 1)
})
