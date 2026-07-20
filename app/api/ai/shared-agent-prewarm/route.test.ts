import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as { _load: (request: string, parent: unknown, isMain: boolean) => unknown }
const originalLoad = nodeModule._load

let ensureConversationCalls = 0
let prepareCalls = 0
let bundleCalls = 0

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "next/server") return { NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status || 200 }) } }
  if (request === "@/lib/auth/guards") return { requireSessionUser: async () => ({ user: { id: 7, enterpriseId: 3, enterpriseRole: "admin", enterpriseStatus: "active" } }) }
  if (request === "@/lib/ai-entry/agent-catalog") return { isAiEntryAgentId: (value: unknown) => value === "business-content-growth" }
  if (request === "@/lib/ai-entry/agent-runtime-policy") return { resolveAiEntryAgentRuntimePolicy: () => ({ allowedSkillIds: ["executive-consulting", "longform-writing"] }) }
  if (request === "@/lib/ai-entry/executive-skill-loader") return { loadExecutiveSkillForAgent: async () => "Business agent instructions." }
  if (request === "@/lib/ai-entry/repository") return {
    ensureAiEntryConversation: async () => {
      ensureConversationCalls += 1
      return { id: "88" }
    },
  }
  if (request === "@/lib/ai-entry/runtime/context-builder") return { buildAgentRuntimeInput: (input: Record<string, unknown>) => input }
  if (request === "@/lib/ai-entry/runtime/profile-store") return {
    isAiEntrySharedAgentRuntimeEnabled: () => true,
    isBusinessAgentId: () => false,
    isAiEntryOpenCodePrewarmEnabled: () => true,
    resolveBusinessAgentRailwayRuntimeProfile: () => ({ enabled: false, backend: "railway-opencode", sessionEnabled: false, runnerUrl: null, maxArtifacts: 8, maxArtifactBytes: 100, maxArtifactTotalBytes: 100 }),
    resolveDefaultAgentRuntimeProfile: () => ({ enabled: true, backend: "cloudflare-opencode-session", sessionEnabled: true, runnerUrl: "https://runner.example.com", maxArtifacts: 8, maxArtifactBytes: 100, maxArtifactTotalBytes: 100 }),
  }
  if (request === "@/lib/ai-entry/runtime/cloudflare-session-client") return { prepareCloudflareSession: async () => { prepareCalls += 1; return { prepared: true } } }
  if (request === "@/lib/ai-entry/provider-routing") return { getConfiguredAiEntryProviders: () => [{ id: "deepseek", apiKey: "key", baseURL: "https://deepseek.example.com/v1", model: "deepseek-chat" }] }
  if (request === "@/lib/ai-entry/shared-agent-skill-resolver") return {
    resolveSharedSkillSetSelection: () => ({ runtimeKind: "shared-agent", agentId: "business-content-growth", skills: [{ id: "executive-consulting", position: 0 }], skillSetId: "a".repeat(40), bundleKey: "shared-agent-skillsets/enterprise-3/business-content-growth/a.json" }),
  }
  if (request === "@/lib/ai-entry/shared-agent-skill-bundle-store") return { upsertSharedSkillSetBundle: async () => { bundleCalls += 1; return { configured: true } } }
  if (request === "@/lib/ai-runtime/session-key") return { buildAgentRuntimeSessionKey: async () => "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
  if (request === "@/lib/platform/enterprise-runtime-config") return { getEnterpriseTextRuntimeProviderConfigsForUser: async () => null }
  if (request === "@/lib/platform/custom-agents") return { getCustomAgentForUser: async () => null }
  if (request === "@/lib/platform/custom-agent-runtime-id") return { parseCustomAgentRuntimeId: () => null }
  return originalLoad(request, parent, isMain)
}

test("shared Agent prewarm creates an empty session conversation without invoking a model or writing messages", async () => {
  ensureConversationCalls = 0
  prepareCalls = 0
  bundleCalls = 0
  const route = await import("./route")
  const response = await route.POST({ json: async () => ({ agentId: "business-content-growth", conversationScope: "chat" }) } as never) as unknown as { status: number; body: { prewarmed?: boolean; conversationId?: string } }
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { prewarmed: true, session_ready: true, conversationId: "88" })
  assert.equal(ensureConversationCalls, 1)
  assert.equal(bundleCalls, 1)
  assert.equal(prepareCalls, 1)
})
