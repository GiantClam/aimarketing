import assert from "node:assert/strict"
import { test } from "node:test"

import { resolveAiEntryRuntimeDecision } from "./gateway"

const env = process.env

function withOpenCodeEnv<T>(callback: () => T) {
  const previous = { ...process.env }
  Object.assign(process.env, {
    AI_ENTRY_SAAS_OPENCODE_ENABLED: "true",
    AI_ENTRY_RUNTIME_MODE: "opencode-railway",
    AI_ENTRY_OPENCODE_BACKEND: "railway-opencode",
    AI_ENTRY_PPT_RAILWAY_ENABLED: "false",
    RAILWAY_OPENCODE_RUNTIME_URL: "https://runner.example.com",
    RAILWAY_OPENCODE_RUNTIME_TOKEN: "test-secret",
  })
  try { return callback() } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]
    Object.assign(process.env, previous)
  }
}

test("ordinary chat stays on the native AI SDK path", () => withOpenCodeEnv(() => {
  const decision = resolveAiEntryRuntimeDecision({ latestUserPrompt: "写一段产品介绍", selectedToolIds: ["web_search"] })
  assert.equal(decision.kind, "ai-sdk-native")
}))

test("business Agents require the Railway persistent runtime", () => withOpenCodeEnv(() => {
  process.env.AI_ENTRY_BUSINESS_AGENT_RAILWAY_ENABLED = "true"
  process.env.RAILWAY_OPENCODE_RUNTIME_URL = "https://opencode-runtime.example.com"
  process.env.RAILWAY_OPENCODE_RUNTIME_TOKEN = "business-token"
  const decision = resolveAiEntryRuntimeDecision({ latestUserPrompt: "制定内容计划", agentId: "business-content-growth", selectedToolIds: [] })
  assert.equal(decision.kind, "opencode-chat")
  if (decision.kind === "opencode-chat") assert.equal(decision.backend, "railway-opencode")
}))

test("editable PPT context can use Railway while ordinary chat stays native", () => withOpenCodeEnv(() => {
  process.env.AI_ENTRY_PPT_RAILWAY_ENABLED = "true"
  process.env.RAILWAY_OPENCODE_RUNTIME_URL = "https://ppt-runtime.example.com"
  process.env.RAILWAY_OPENCODE_RUNTIME_TOKEN = "ppt-token"

  const ordinary = resolveAiEntryRuntimeDecision({ latestUserPrompt: "写一段产品介绍", selectedToolIds: ["web_search"] })
  assert.equal(ordinary.kind, "ai-sdk-native")

  const ppt = resolveAiEntryRuntimeDecision({
    latestUserPrompt: "继续完善可编辑 PPT",
    agentId: "executive-ppt",
    selectedSkillIds: ["ppt-master"],
    selectedToolIds: [],
  })
  assert.equal(ppt.kind, "opencode-chat")
  if (ppt.kind === "opencode-chat") assert.equal(ppt.backend, "railway-opencode")
}))

test("editable PPT tools are owned by Railway OpenCode", () => withOpenCodeEnv(() => {
  process.env.AI_ENTRY_PPT_RAILWAY_ENABLED = "true"
  process.env.RAILWAY_OPENCODE_RUNTIME_URL = "https://ppt-runtime.example.com"
  process.env.RAILWAY_OPENCODE_RUNTIME_TOKEN = "ppt-token"
  const decision = resolveAiEntryRuntimeDecision({
    latestUserPrompt: "导出 PPT",
    agentId: "executive-ppt",
    selectedSkillIds: ["ppt-master"],
    selectedToolIds: ["preview_ppt_deck", "export_ppt_deck"],
  })
  assert.equal(decision.kind, "opencode-chat")
  if (decision.kind === "opencode-chat") assert.equal(decision.backend, "railway-opencode")
}))

test("editable PPT ignores platform PPT tool selections", () => withOpenCodeEnv(() => {
  process.env.AI_ENTRY_PPT_RAILWAY_ENABLED = "true"
  process.env.RAILWAY_OPENCODE_RUNTIME_URL = "https://ppt-runtime.example.com"
  process.env.RAILWAY_OPENCODE_RUNTIME_TOKEN = "ppt-token"
  const decision = resolveAiEntryRuntimeDecision({
    latestUserPrompt: "请补充最新市场数据并生成可编辑 PPT",
    agentId: "executive-ppt",
    selectedSkillIds: ["ppt-master"],
    selectedToolIds: ["update_ppt_brief", "recommend_ppt_templates", "preview_ppt_deck", "export_ppt_deck", "web_search"],
    enabledToolNames: ["update_ppt_brief", "recommend_ppt_templates", "preview_ppt_deck", "export_ppt_deck", "web_search"],
  })
  assert.equal(decision.kind, "opencode-chat")
  if (decision.kind === "opencode-chat") assert.equal(decision.backend, "railway-opencode")
}))

test("ordinary fixed PPT tools stay on native runtime", () => withOpenCodeEnv(() => {
  const decision = resolveAiEntryRuntimeDecision({ latestUserPrompt: "导出 PPT", selectedToolIds: ["preview_ppt_deck"] })
  assert.equal(decision.kind, "native-tool")
}))

test("workflow business Agents stay platform-owned", () => withOpenCodeEnv(() => {
  process.env.AI_ENTRY_BUSINESS_AGENT_RAILWAY_ENABLED = "true"
  process.env.RAILWAY_OPENCODE_RUNTIME_URL = "https://opencode-runtime.example.com"
  process.env.RAILWAY_OPENCODE_RUNTIME_TOKEN = "business-token"
  const decision = resolveAiEntryRuntimeDecision({
    latestUserPrompt: "生成 SEO 复用 brief",
    agentId: "business-seo-repurpose",
    executionContext: "workflow",
    selectedToolIds: [],
  })
  assert.equal(decision.kind, "native-tool")
}))

test("speaker PPT stays fully OpenCode-owned even when prompt asks for current research", () => withOpenCodeEnv(() => {
  process.env.AI_ENTRY_RUNTIME_MODE = "opencode-cloudflare-sandbox"
  process.env.AI_ENTRY_OPENCODE_BACKEND = "cloudflare-sandbox-exec"
  process.env.CLOUDFLARE_OPENCODE_RUNNER_URL = "https://cloudflare-runner.example.com"
  process.env.CLOUDFLARE_OPENCODE_RUNNER_HMAC_SECRET = "cloudflare-secret"
  const decision = resolveAiEntryRuntimeDecision({
    latestUserPrompt: "请搜索最新客服 AI 趋势并生成演讲型 PPT",
    agentId: "executive-presentation-ppt",
    selectedSkillIds: ["dashiai-ppt"],
    selectedToolIds: [],
  })
  assert.equal(decision.kind, "opencode-chat")
}))

test("speaker PPT uses OpenCode with the Dashi skill in Cloudflare", () => withOpenCodeEnv(() => {
  process.env.AI_ENTRY_RUNTIME_MODE = "opencode-cloudflare-sandbox"
  process.env.AI_ENTRY_OPENCODE_BACKEND = "cloudflare-sandbox-exec"
  process.env.CLOUDFLARE_OPENCODE_RUNNER_URL = "https://cloudflare-runner.example.com"
  process.env.CLOUDFLARE_OPENCODE_RUNNER_HMAC_SECRET = "cloudflare-secret"
  const decision = resolveAiEntryRuntimeDecision({
    latestUserPrompt: "生成一份课堂讲解型 PPT",
    agentId: "executive-presentation-ppt",
    selectedSkillIds: ["dashiai-ppt"],
    selectedToolIds: [],
  })
  assert.equal(decision.kind, "opencode-chat")
  if (decision.kind === "opencode-chat") assert.equal(decision.backend, "cloudflare-opencode-session")
}))

test("workflow continuation stays platform-owned", () => withOpenCodeEnv(() => {
  const decision = resolveAiEntryRuntimeDecision({ latestUserPrompt: "继续", selectedToolIds: [], workflowContext: {
    workflowRunId: 12,
    workflowKey: "demo",
    status: "waiting_for_input",
    currentStepKey: "approve",
    latestStepSummaries: [],
    artifactIds: [],
    allowedUserActions: ["approve"],
  } })
  assert.equal(decision.kind, "workflow-continuation")
}))

test("missing runner configuration falls back to native", () => {
  const previous = { ...process.env }
  delete process.env.AI_ENTRY_SAAS_OPENCODE_ENABLED
  delete process.env.CLOUDFLARE_OPENCODE_RUNNER_URL
  delete process.env.CLOUDFLARE_OPENCODE_RUNNER_HMAC_SECRET
  try {
    assert.equal(resolveAiEntryRuntimeDecision({ latestUserPrompt: "hello", selectedToolIds: [] }).kind, "ai-sdk-native")
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]
    Object.assign(process.env, previous)
  }
})

void env
