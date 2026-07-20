import assert from "node:assert/strict"
import { test } from "node:test"

import { runOpenCode } from "./opencode"
import { buildRuntimeConfig } from "./opencode-runtime-config"
import { providerRuntimeKey } from "./opencode-provider"

test("normalizes platform provider IDs into valid OpenCode config keys", () => {
  assert.deepEqual(providerRuntimeKey("enterprise-openai-compatible"), {
    configKey: "enterprise_openai_compatible",
    envKey: "ENTERPRISE_OPENAI_COMPATIBLE_API_KEY",
  })
})

test("uses the normalized provider key for the session model selection", async () => {
  const input = {
    runId: "11111111-1111-4111-8111-111111111111",
    conversationId: null,
    enterpriseId: null,
    userId: 1,
    agentId: null,
    systemPrompt: "system",
    messages: [{ role: "user" as const, content: "hello" }],
    attachments: [],
    artifactContext: [],
    workflowContext: null,
    artifactContract: { manifestPath: "artifact-manifest.json" as const, artifactDir: "artifacts" as const, maxArtifacts: 8, maxArtifactBytes: 100, maxArtifactTotalBytes: 100, allowedExtensions: [".md"] },
    policy: { allowPlatformTools: false as const, allowTools: false as const, allowMcp: false as const, allowSkillInstall: false as const, allowNetwork: false },
  }
  const config = buildRuntimeConfig(input as never, {
    providerId: "enterprise-openai-compatible",
    modelId: "deepseek-v4-pro",
    baseUrl: "https://api.deepseek.com",
    apiKey: "deepseek-test-key",
  }) as { provider?: Record<string, unknown> }
  assert.ok(config.provider?.enterprise_openai_compatible)
  assert.equal(config.provider?.["enterprise-openai-compatible"], undefined)
})

test("shared Agent runtime grants only governed read and Skill capabilities", () => {
  const input = {
    runId: "11111111-1111-4111-8111-111111111111",
    protocolVersion: 2 as const,
    sessionKey: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    functionId: "business-content-growth",
    conversationId: "1",
    enterpriseId: 1,
    userId: 1,
    agentId: "business-content-growth",
    selectedSkillIds: ["executive-consulting"],
    selectedMcpServerIds: [],
    attachmentObjects: [],
    checkpoint: null,
    sharedSkillSetSelection: {
      runtimeKind: "shared-agent" as const,
      agentId: "business-content-growth",
      skills: [{ id: "executive-consulting", position: 0 }],
      skillSetId: "a".repeat(40),
      bundleKey: "shared-agent-skillsets/enterprise-1/business-content-growth/skills.json",
    },
    systemPrompt: "system",
    messages: [{ role: "user" as const, content: "hello" }],
    attachments: [],
    artifactContext: [],
    workflowContext: null,
    artifactContract: { manifestPath: "artifact-manifest.json" as const, artifactDir: "artifacts" as const, maxArtifacts: 8, maxArtifactBytes: 100, maxArtifactTotalBytes: 100, allowedExtensions: [".md"] },
    policy: { allowPlatformTools: false as const, allowTools: false as const, allowMcp: false as const, allowSkillInstall: false as const, allowNetwork: false },
  }
  const config = buildRuntimeConfig(input, {
    providerId: "deepseek",
    modelId: "deepseek-v4-pro",
    baseUrl: "https://api.example.com/v1",
    apiKey: "test-deepseek-key",
  })
  const permission = config.permission as Record<string, unknown>
  assert.equal(permission.bash, "deny")
  assert.equal(permission.edit, "deny")
  assert.equal(permission.external_directory, "deny")
  assert.equal(permission.skill, "allow")
  assert.equal(permission.webfetch, "deny")
  assert.deepEqual((config as { tools?: unknown }).tools, { read: true, glob: true, grep: true, list: true, skill: true })
})

test("uses the signed provider key only for its matching OpenCode provider", async () => {
  const input = {
    runId: "11111111-1111-4111-8111-111111111111",
    conversationId: null,
    enterpriseId: null,
    userId: 1,
    agentId: "business-content-growth",
    systemPrompt: "system",
    messages: [{ role: "user" as const, content: "hello" }],
    attachments: [],
    artifactContext: [],
    workflowContext: null,
    artifactContract: { manifestPath: "artifact-manifest.json" as const, artifactDir: "artifacts" as const, maxArtifacts: 8, maxArtifactBytes: 100, maxArtifactTotalBytes: 100, allowedExtensions: [".md"] },
    policy: { allowPlatformTools: false as const, allowTools: false as const, allowMcp: false as const, allowSkillInstall: false as const, allowNetwork: false },
  }
  let commandEnv: Record<string, unknown> | undefined
  const sandbox = {
    async writeFile() {},
    async exec(_command: string, options: Record<string, unknown>) {
      commandEnv = options.env as Record<string, unknown>
      return { success: true, exitCode: 0 }
    },
  }
  for await (const _event of runOpenCode(sandbox, "/workspace/runs/11111111-1111-4111-8111-111111111111", input, undefined, 1000, {
    providerId: "deepseek",
    modelId: "deepseek-v4-pro",
    baseUrl: "https://deepseek.example/v1",
    apiKey: "deepseek-test-key",
  })) { /* consume completion */ }
  assert.equal(commandEnv?.DEEPSEEK_API_KEY, "deepseek-test-key")
  assert.equal(commandEnv?.PPTOKEN_API_KEY, undefined)
  const config = JSON.parse(String(commandEnv?.OPENCODE_CONFIG_CONTENT)) as { provider: { deepseek: { options: { baseURL: string } } } }
  assert.equal(config.provider.deepseek.options.baseURL, "https://deepseek.example/v1")
})

test("routes Grok through the signed PPToken provider", async () => {
  const config = buildRuntimeConfig({
    agentId: "executive-ppt",
    policy: { allowNetwork: true },
    sharedSkillSetSelection: null,
  } as never, {
    providerId: "pptoken",
    modelId: "grok-4.5",
    baseUrl: "https://pptoken.example/api/v1",
    apiKey: "pptoken-test-key",
  }) as { provider?: Record<string, { options?: { baseURL?: string; apiKey?: string }; models?: Record<string, unknown> }> }
  assert.equal(config.provider?.pptoken?.options?.baseURL, "https://pptoken.example/api/v1")
  assert.equal(config.provider?.pptoken?.options?.apiKey, "{env:PPTOKEN_API_KEY}")
  assert.ok(config.provider?.pptoken?.models?.["grok-4.5"])
})

test("forwards stdout before command completion and keeps stderr out of events", async () => {
  const input = {
    runId: "11111111-1111-4111-8111-111111111111",
    conversationId: null,
    enterpriseId: null,
    userId: 1,
    agentId: null,
    systemPrompt: "system",
    messages: [{ role: "user" as const, content: "hello" }],
    attachments: [],
    artifactContext: [],
    workflowContext: null,
    artifactContract: { manifestPath: "artifact-manifest.json" as const, artifactDir: "artifacts" as const, maxArtifacts: 8, maxArtifactBytes: 100, maxArtifactTotalBytes: 100, allowedExtensions: [".md"] },
    policy: { allowPlatformTools: false as const, allowTools: false as const, allowMcp: false as const, allowSkillInstall: false as const, allowNetwork: true },
  }
  let completed = false
  let scriptContent = ""
  const sandbox = {
    async writeFile(_path: string, content: string) { scriptContent = content },
    async exec(_command: string, options: Record<string, unknown>) {
      const onOutput = options.onOutput as (stream: "stdout" | "stderr", data: string) => void
      onOutput("stdout", '{"type":"text","part":{"text":"hello"}}\n')
      onOutput("stderr", "secret stderr")
      await new Promise((resolve) => setTimeout(resolve, 5))
      completed = true
      return { success: true, exitCode: 0 }
    },
  }
  const events = []
  for await (const event of runOpenCode(sandbox, "/workspace/runs/11111111-1111-4111-8111-111111111111", input, undefined, 1000, {
    providerId: "deepseek",
    modelId: "deepseek-v4-pro",
    baseUrl: "https://deepseek.example/v1",
    apiKey: "deepseek-test-key",
  })) {
    events.push(event)
  }
  assert.equal(events.some((event) => event.event === "text_delta"), true)
  assert.equal(events.at(-1)?.event, "done")
  assert.match(scriptContent, /cat -- .*prompt\.md/)
  assert.doesNotMatch(scriptContent, /> .*prompt\.md/)
})
