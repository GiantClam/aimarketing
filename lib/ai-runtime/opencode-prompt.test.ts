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
  assert.match(prompt, /does not contain an explicit export confirmation/u)
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

test("editable PPT prompt only enables export after current-turn confirmation", () => {
  const prompt = buildOpenCodeSystemPrompt({
    runId: "00000000-0000-4000-8000-000000000004",
    sessionKey: "ppt-42-conversation-9",
    conversationId: "conversation-9",
    enterpriseId: 1,
    userId: 42,
    agentId: "executive-ppt",
    selectedSkillIds: ["ppt-master"],
    exportConfirmationGranted: true,
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

  assert.match(prompt, /current user turn contains an explicit export confirmation/u)
  assert.match(prompt, /continue the serial pipeline through SVG export/u)
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
  assert.match(prompt, /Do not run the Dashi PPTX\/PDF export/u)
  assert.match(prompt, /Ask the user to explicitly confirm export/u)
  assert.doesNotMatch(prompt, /native render, visual QA, and export/u)
  assert.doesNotMatch(prompt, /frontend-slides/u)
})

test("speaker PPT prompt allows Dashi export only after current-turn confirmation", () => {
  const prompt = buildOpenCodeSystemPrompt({
    runId: "00000000-0000-4000-8000-000000000006",
    sessionKey: "ppt-42-conversation-11",
    conversationId: "conversation-11",
    enterpriseId: 1,
    userId: 42,
    agentId: "executive-presentation-ppt",
    selectedSkillIds: ["dashiai-ppt"],
    systemPrompt: "Use the presentation assistant.",
    exportConfirmationGranted: true,
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

  assert.match(prompt, /current user turn explicitly confirms export/u)
  assert.match(prompt, /native render, visual QA, and export/u)
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
