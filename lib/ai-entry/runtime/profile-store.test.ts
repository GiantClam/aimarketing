import assert from "node:assert/strict"
import { test } from "node:test"

import { isAiEntryOpenCodeContextEnabled, isAiEntryOpenCodePrewarmEnabled, isAiEntrySharedAgentPrewarmEnabled, isAiEntrySharedAgentRuntimeEnabled, resolveBusinessAgentRailwayRuntimeProfile, resolveDashiPptCloudflareRuntimeProfile, resolveDefaultAgentRuntimeProfile, resolveEditablePptRailwayRuntimeProfile } from "./profile-store"

test("resolves the Dashi PPT Cloudflare session runtime", () => {
  const profile = resolveDashiPptCloudflareRuntimeProfile({
    AI_ENTRY_SAAS_OPENCODE_ENABLED: "true",
    AI_ENTRY_RUNTIME_MODE: "opencode-cloudflare-sandbox",
    AI_ENTRY_OPENCODE_BACKEND: "cloudflare-sandbox-exec",
    CLOUDFLARE_OPENCODE_RUNNER_URL: "https://runner.example.com/",
    CLOUDFLARE_OPENCODE_RUNNER_HMAC_SECRET: "secret",
  })
  assert.equal(profile.provider, "opencode")
  assert.equal(profile.backend, "cloudflare-opencode-session")
  assert.equal(profile.deploymentMode, "saas-cloudflare-sandbox")
  assert.equal(profile.enabled, true)
  assert.equal(profile.sessionEnabled, true)
  assert.equal(profile.timeoutMs, 3_600_000)
})

test("missing runner URL cannot select a broken OpenCode path", () => {
  const profile = resolveDefaultAgentRuntimeProfile({
    AI_ENTRY_SAAS_OPENCODE_ENABLED: "true",
    CLOUDFLARE_OPENCODE_RUNNER_HMAC_SECRET: "secret",
  })
  assert.equal(profile.enabled, false)
  assert.equal(profile.provider, "ai-sdk-native")
  assert.equal(profile.backend, "native")
})

test("resolves the Railway OpenCode runtime without Cloudflare dependencies", () => {
  const profile = resolveDefaultAgentRuntimeProfile({
    AI_ENTRY_SAAS_OPENCODE_ENABLED: "true",
    AI_ENTRY_RUNTIME_MODE: "opencode-railway",
    AI_ENTRY_OPENCODE_BACKEND: "railway-opencode",
    RAILWAY_OPENCODE_RUNTIME_URL: "https://opencode-runtime.example.com/",
    RAILWAY_OPENCODE_RUNTIME_TOKEN: "token",
  })
  assert.equal(profile.provider, "opencode")
  assert.equal(profile.backend, "railway-opencode")
  assert.equal(profile.deploymentMode, "saas-railway")
  assert.equal(profile.runnerUrl, "https://opencode-runtime.example.com")
})

test("keeps Railway opt-in scoped to the editable PPT profile", () => {
  const profile = resolveEditablePptRailwayRuntimeProfile({
    AI_ENTRY_SAAS_OPENCODE_ENABLED: "true",
    AI_ENTRY_PPT_RAILWAY_ENABLED: "true",
    RAILWAY_OPENCODE_RUNTIME_URL: "https://ppt-runtime.example.com/",
    RAILWAY_OPENCODE_RUNTIME_TOKEN: "token",
  })
  assert.equal(profile.provider, "opencode")
  assert.equal(profile.backend, "railway-opencode")
  assert.equal(profile.deploymentMode, "saas-railway")
})

test("resolves the Railway profile for every business Agent", () => {
  const profile = resolveBusinessAgentRailwayRuntimeProfile({
    AI_ENTRY_SAAS_OPENCODE_ENABLED: "true",
    RAILWAY_OPENCODE_RUNTIME_URL: "https://opencode-runtime.example.com/",
    RAILWAY_OPENCODE_RUNTIME_TOKEN: "token",
  })
  assert.equal(profile.enabled, true)
  assert.equal(profile.backend, "railway-opencode")
  assert.equal(profile.sessionEnabled, true)
})

test("shared Agent runtime stays disabled by default and honors its allowlist", () => {
  assert.equal(isAiEntrySharedAgentRuntimeEnabled("business-content-growth", {}), false)
  const env = { AI_ENTRY_SHARED_AGENT_RUNTIME_ENABLED: "true", AI_ENTRY_SHARED_AGENT_ALLOWLIST: "business-content-growth,executive-growth" }
  assert.equal(isAiEntrySharedAgentRuntimeEnabled("business-content-growth", env), true)
  assert.equal(isAiEntrySharedAgentRuntimeEnabled("executive-ppt", env), false)
})

test("business-prefix shared scope includes all business Agents only", () => {
  const env = {
    AI_ENTRY_SHARED_AGENT_RUNTIME_ENABLED: "true",
    AI_ENTRY_SHARED_AGENT_SCOPE: "business-prefix",
  }
  assert.equal(isAiEntrySharedAgentRuntimeEnabled("business-content-growth", env), true)
  assert.equal(isAiEntrySharedAgentRuntimeEnabled("business-brand-creative", env), true)
  assert.equal(isAiEntrySharedAgentRuntimeEnabled("executive-growth", env), false)
})

test("shared Agent session preparation is independently disabled by default", () => {
  assert.equal(isAiEntrySharedAgentPrewarmEnabled({}), false)
  assert.equal(isAiEntrySharedAgentPrewarmEnabled({ SHARED_AGENT_PREWARM_ENABLED: "true" }), true)
})

test("general OpenCode session prewarm is enabled by default and can be disabled", () => {
  assert.equal(isAiEntryOpenCodePrewarmEnabled({}), true)
  assert.equal(isAiEntryOpenCodePrewarmEnabled({ AI_ENTRY_OPENCODE_PREWARM_ENABLED: "false" }), false)
})

test("blank optional context flag preserves the enabled default", () => {
  assert.equal(isAiEntryOpenCodeContextEnabled({ AI_ENTRY_OPENCODE_CONTEXT_ENABLED: "" }), true)
  assert.equal(isAiEntryOpenCodeContextEnabled({ AI_ENTRY_OPENCODE_CONTEXT_ENABLED: "false" }), false)
})
