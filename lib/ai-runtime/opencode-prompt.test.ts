import assert from "node:assert/strict"
import test from "node:test"

import { buildOpenCodeSystemPrompt, buildOpenCodeUserPrompt } from "./opencode-prompt"

test("editable PPT prompt delegates generation to the native ppt-master skill", () => {
  const prompt = buildOpenCodeSystemPrompt({
    runId: "00000000-0000-4000-8000-000000000001",
    sessionKey: "ppt-42-conversation-7",
    conversationId: "conversation-7",
    enterpriseId: 1,
    userId: 42,
    agentId: "executive-ppt",
    selectedSkillIds: ["ppt-master"],
    systemPrompt: "Use the PPT assistant.",
    messages: [{ role: "user", content: "生成一个 PPT" }],
    attachments: [],
    modelHint: "pptoken/gpt-5.4",
    artifactContext: [],
    workflowContext: null,
    artifactContract: {
      manifestPath: "artifact-manifest.json",
      artifactDir: "artifacts",
      maxArtifacts: 8,
      maxArtifactBytes: 2_000_000,
      maxArtifactTotalBytes: 4_000_000,
      allowedExtensions: [".pptx"],
    },
    policy: {
      allowPlatformTools: false,
      allowTools: false,
      allowMcp: false,
      allowSkillInstall: false,
      allowNetwork: true,
    },
  })

  assert.match(prompt, /native ppt-master skill/u)
  assert.match(prompt, /workspace\/ppt-master/u)
  assert.match(prompt, /exactly one deck from exactly one selected template and exactly one narrative variant/u)
  assert.match(prompt, /never use auto-4/u)
  assert.match(prompt, /let that Skill plus the native OpenCode session history interpret the current turn/u)
  assert.doesNotMatch(prompt, /Treat it as confirmation for every blocking gate/u)
  assert.match(prompt, /00000000-0000-4000-8000-000000000001/u)
})

test("production prompt separates system instructions from the current user message", () => {
  const input = {
    runId: "00000000-0000-4000-8000-000000000005",
    sessionKey: "ppt-42-conversation-10",
    conversationId: "conversation-10",
    enterpriseId: 1,
    userId: 42,
    agentId: "general",
    systemPrompt: "System policy",
    messages: [
      { role: "assistant" as const, content: "Historical answer" },
      { role: "user" as const, content: "Current user request" },
    ],
    attachments: [],
    artifactContext: [],
    workflowContext: null,
    artifactContract: {
      manifestPath: "artifact-manifest.json" as const,
      artifactDir: "artifacts" as const,
      maxArtifacts: 8,
      maxArtifactBytes: 2_000_000,
      maxArtifactTotalBytes: 4_000_000,
      allowedExtensions: [".txt"],
    },
    policy: { allowPlatformTools: false as const, allowTools: false as const, allowMcp: false as const, allowSkillInstall: false as const, allowNetwork: true },
  }

  const systemPrompt = buildOpenCodeSystemPrompt(input)
  const userPrompt = buildOpenCodeUserPrompt(input)
  assert.match(systemPrompt, /Application system instruction:\nSystem policy/u)
  assert.doesNotMatch(systemPrompt, /Historical answer/u)
  assert.doesNotMatch(systemPrompt, /Current user request/u)
  assert.equal(userPrompt, "Current user request")
})

test("Railway prompt supplies ordered conversation history to OpenCode", () => {
  const input = {
    runId: "run-history",
    conversationId: "conversation-history",
    enterpriseId: 1,
    userId: 42,
    agentId: "executive-ppt",
    selectedSkillIds: ["ppt-master"],
    systemPrompt: "Use the editable PPT assistant.",
    messages: [
      { role: "user" as const, content: "生成一份董事会汇报 PPT" },
      { role: "assistant" as const, content: "预览已生成，请确认是否导出。" },
      { role: "user" as const, content: "确认，请继续完成导出" },
    ],
    attachments: [],
    artifactContext: [],
    workflowContext: null,
    artifactContract: { manifestPath: "artifact-manifest.json" as const, artifactDir: "artifacts" as const, maxArtifacts: 8, maxArtifactBytes: 2_000_000, maxArtifactTotalBytes: 4_000_000, allowedExtensions: [".pptx"] },
    policy: { allowPlatformTools: false as const, allowTools: false as const, allowMcp: false as const, allowSkillInstall: false as const, allowNetwork: true },
  }

  const prompt = buildOpenCodeUserPrompt(input, { includeConversationHistory: true })
  assert.ok(prompt.indexOf("生成一份董事会汇报 PPT") < prompt.indexOf("预览已生成，请确认是否导出。"))
  assert.ok(prompt.indexOf("预览已生成，请确认是否导出。") < prompt.indexOf("确认，请继续完成导出"))
  assert.match(prompt, /\[Conversation history provided by the application\]/u)
  assert.match(prompt, /\[Current user turn\]/u)
})

test("editable PPT prompt delegates export approval to the native Skill", () => {
  const prompt = buildOpenCodeSystemPrompt({
    runId: "00000000-0000-4000-8000-000000000004",
    sessionKey: "ppt-42-conversation-9",
    conversationId: "conversation-9",
    enterpriseId: 1,
    userId: 42,
    agentId: "executive-ppt",
    selectedSkillIds: ["ppt-master"],
    systemPrompt: "Use the editable PPT assistant.",
    messages: [{ role: "user", content: "确认导出 PPTX" }],
    attachments: [],
    modelHint: "pptoken/gpt-5.4",
    artifactContext: [],
    workflowContext: null,
    artifactContract: {
      manifestPath: "artifact-manifest.json",
      artifactDir: "artifacts",
      maxArtifacts: 8,
      maxArtifactBytes: 2_000_000,
      maxArtifactTotalBytes: 4_000_000,
      allowedExtensions: [".pptx"],
    },
    policy: {
      allowPlatformTools: false,
      allowTools: false,
      allowMcp: false,
      allowSkillInstall: false,
      allowNetwork: true,
    },
  })

  assert.match(prompt, /Do not use an application boolean, regex, or synthetic confirmation marker/u)
  assert.match(prompt, /When the Skill determines that the current user turn provides the required export approval/u)
})

test("Railway ppt-master prompt restores and writes only a lightweight project snapshot", () => {
  const prompt = buildOpenCodeSystemPrompt({
    runId: "00000000-0000-4000-8000-000000000007",
    conversationId: "conversation-snapshot",
    enterpriseId: 1,
    userId: 42,
    agentId: "executive-ppt",
    selectedSkillIds: ["ppt-master"],
    projectSnapshot: { schemaVersion: 1, projectKind: "ppt-master", state: { title: "Plan" } },
    systemPrompt: "Use the editable PPT assistant.",
    messages: [{ role: "user", content: "继续完善" }],
    attachments: [],
    artifactContext: [],
    workflowContext: null,
    artifactContract: { manifestPath: "artifact-manifest.json", artifactDir: "artifacts", maxArtifacts: 8, maxArtifactBytes: 2_000_000, maxArtifactTotalBytes: 4_000_000, allowedExtensions: [".pptx"] },
    policy: { allowPlatformTools: false, allowTools: false, allowMcp: false, allowSkillInstall: false, allowNetwork: true },
  })

  assert.match(prompt, /temporary run directory/u)
  assert.match(prompt, /\.runtime\/project-snapshot\.json/u)
  assert.match(prompt, /write \.\/project-state\.json/u)
  assert.match(prompt, /Never include SVG, PPTX, images, base64, logs, caches/u)
})

test("speaker PPT prompt delegates the complete conversation to native Dashi", () => {
  const prompt = buildOpenCodeSystemPrompt({
    runId: "00000000-0000-4000-8000-000000000002",
    sessionKey: "ppt-42-conversation-8",
    conversationId: "conversation-8",
    enterpriseId: 1,
    userId: 42,
    agentId: "executive-presentation-ppt",
    selectedSkillIds: ["dashiai-ppt"],
    systemPrompt: "Use the presentation assistant.",
    messages: [{ role: "user", content: "生成演讲型 PPT" }],
    attachments: [],
    modelHint: "pptoken/gpt-5.4",
    artifactContext: [],
    workflowContext: null,
    artifactContract: {
      manifestPath: "artifact-manifest.json",
      artifactDir: "artifacts",
      maxArtifacts: 8,
      maxArtifactBytes: 2_000_000,
      maxArtifactTotalBytes: 4_000_000,
      allowedExtensions: [".pptx"],
    },
    policy: { allowPlatformTools: false, allowTools: false, allowMcp: false, allowSkillInstall: false, allowNetwork: true },
  })

  assert.match(prompt, /\/opt\/dashiai-ppt\/SKILL\.md/u)
  assert.match(prompt, /Do not use the legacy brief collector/u)
  assert.match(prompt, /System execution permissions for shell, write, edit, skill/u)
  assert.match(prompt, /Never choose a default for a user decision/u)
  assert.match(prompt, /Do not invoke the question tool/u)
  assert.match(prompt, /Use the native Dashi skill and the OpenCode session history to interpret the current turn/u)
  assert.match(prompt, /If export approval is missing, stop after the preview and ask the user/u)
  assert.match(prompt, /application boolean, regex, or synthetic confirmation marker/u)
  assert.doesNotMatch(prompt, /frontend-slides/u)
})

test("speaker PPT prompt delegates export approval to the native Dashi Skill", () => {
  const prompt = buildOpenCodeSystemPrompt({
    runId: "00000000-0000-4000-8000-000000000006",
    sessionKey: "ppt-42-conversation-11",
    conversationId: "conversation-11",
    enterpriseId: 1,
    userId: 42,
    agentId: "executive-presentation-ppt",
    selectedSkillIds: ["dashiai-ppt"],
    systemPrompt: "Use the presentation assistant.",
    messages: [{ role: "user", content: "确认导出 PPTX" }],
    attachments: [],
    modelHint: "pptoken/grok-4.5",
    artifactContext: [],
    workflowContext: null,
    artifactContract: {
      manifestPath: "artifact-manifest.json",
      artifactDir: "artifacts",
      maxArtifacts: 8,
      maxArtifactBytes: 2_000_000,
      maxArtifactTotalBytes: 4_000_000,
      allowedExtensions: [".pptx"],
    },
    policy: { allowPlatformTools: false, allowTools: false, allowMcp: false, allowSkillInstall: false, allowNetwork: true },
  })

  assert.match(prompt, /Use the native Dashi skill and the OpenCode session history to interpret the current turn/u)
  assert.match(prompt, /If the Skill's workflow has the required brief and the current user turn explicitly requests or confirms export/u)
})

test("speaker PPT keeps system and oversized user messages separate", () => {
  const input: Parameters<typeof buildOpenCodeSystemPrompt>[0] = {
    runId: "00000000-0000-4000-8000-000000000003",
    sessionKey: "sess-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    conversationId: "conversation-large",
    enterpriseId: 1,
    userId: 42,
    agentId: "executive-presentation-ppt",
    selectedSkillIds: ["dashiai-ppt"],
    systemPrompt: "S".repeat(100_000),
    messages: [{ role: "user" as const, content: "U".repeat(100_000) }],
    attachments: [],
    modelHint: "pptoken/grok-4.5",
    artifactContext: [],
    workflowContext: null,
    artifactContract: { manifestPath: "artifact-manifest.json", artifactDir: "artifacts", maxArtifacts: 8, maxArtifactBytes: 2_000_000, maxArtifactTotalBytes: 4_000_000, allowedExtensions: [".pptx"] },
    policy: { allowPlatformTools: false, allowTools: false, allowMcp: false, allowSkillInstall: false, allowNetwork: true },
  }
  const systemPrompt = buildOpenCodeSystemPrompt(input)
  const userPrompt = buildOpenCodeUserPrompt(input)

  assert.ok(systemPrompt.length < 40_000)
  assert.doesNotMatch(systemPrompt, /U{100}/u)
  assert.ok(userPrompt.length < 33_000)
  assert.match(userPrompt, /context clipped for provider request size/u)
})
