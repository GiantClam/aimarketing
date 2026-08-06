import assert from "node:assert/strict"
import { test } from "node:test"

import { AgentRuntimeInputTooLargeError, buildAgentRuntimeInput } from "./context-builder"

test("retains the current user request, system prompt, and attachment summaries without URLs", () => {
  const input = buildAgentRuntimeInput({
    runId: "run-1",
    conversationId: "c-1",
    enterpriseId: 1,
    userId: 2,
    agentId: "general",
    systemPrompt: "Follow the platform policy.",
    messages: [{ role: "assistant", content: "old" }, { role: "user", content: "current" }],
    attachments: [{ id: "a1", fileName: "brief.md", mimeType: "text/markdown", textSummary: "summary only" }],
  })
  assert.equal(input.systemPrompt, "Follow the platform policy.")
  assert.equal(input.messages.at(-1)?.content.includes("current"), true)
  assert.equal(input.messages.at(-1)?.content.includes("summary only"), true)
  assert.equal("downloadUrl" in input.attachments[0]!, false)
})

test("retains the provider-qualified OpenCode model hint", () => {
  const input = buildAgentRuntimeInput({
    runId: "run-model",
    conversationId: null,
    enterpriseId: null,
    userId: 1,
    agentId: null,
    modelHint: "deepseek/deepseek-v4-pro",
    systemPrompt: "system",
    messages: [{ role: "user", content: "hello" }],
  })

  assert.equal(input.modelHint, "deepseek/deepseek-v4-pro")
})

test("keeps editable PPT turns in a stable session and carries the native skill", () => {
  const input = buildAgentRuntimeInput({
    runId: "run-ppt-2",
    sessionKey: "ppt-42-conversation-7",
    conversationId: "conversation-7",
    enterpriseId: 1,
    userId: 42,
    agentId: "executive-ppt",
    selectedSkillIds: ["ppt-master"],
    systemPrompt: "Use the editable PPT assistant.",
    messages: [{ role: "user", content: "继续完善" }],
  })

  assert.equal(input.sessionKey, "ppt-42-conversation-7")
  assert.deepEqual(input.selectedSkillIds, ["ppt-master"])
})

test("keeps reconstructed conversation history in chronological order", () => {
  const input = buildAgentRuntimeInput({
    runId: "run-history-order",
    conversationId: "conversation-history-order",
    enterpriseId: 1,
    userId: 42,
    agentId: "executive-ppt",
    selectedSkillIds: ["ppt-master"],
    systemPrompt: "Use the editable PPT assistant.",
    messages: [
      { role: "user", content: "第一步" },
      { role: "assistant", content: "第二步" },
      { role: "user", content: "第三步" },
    ],
  })

  assert.deepEqual(input.messages.map((message) => message.content), ["第一步", "第二步", "第三步"])
})

test("keeps only the most recent four historical messages by default", () => {
  const input = buildAgentRuntimeInput({
    runId: "run-history-budget",
    conversationId: "conversation-history-budget",
    enterpriseId: 1,
    userId: 42,
    agentId: "general",
    systemPrompt: "system",
    messages: Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      content: `message-${index}`,
    })),
  })
  const contents = input.messages.map((message) => message.content).join("\n")
  assert.equal(contents.includes("message-0"), false)
  assert.equal(contents.includes("message-7"), true)
  assert.equal(contents.includes("message-10"), true)
  assert.equal(contents.includes("message-11"), true)
})

test("limits native Dashi artifacts to PPTX and HTML", () => {
  const input = buildAgentRuntimeInput({
    runId: "run-dashi-artifacts",
    conversationId: "conversation-dashi",
    enterpriseId: 1,
    userId: 42,
    agentId: "executive-presentation-ppt",
    selectedSkillIds: ["dashiai-ppt"],
    systemPrompt: "Use the presentation assistant.",
    messages: [{ role: "user", content: "生成演讲型 PPT" }],
  })

  assert.deepEqual(input.artifactContract.allowedExtensions, [".pptx", ".html"])
  assert.equal(input.artifactContract.maxArtifactBytes, 100 * 1024 * 1024)
  assert.equal(input.artifactContract.maxArtifactTotalBytes, 200 * 1024 * 1024)
})

test("passes the lightweight ppt-master project snapshot to the runtime", () => {
  const snapshot = { schemaVersion: 1 as const, projectKind: "ppt-master" as const, state: { title: "Plan", slideCount: 4 } }
  const input = buildAgentRuntimeInput({
    runId: "run-ppt-snapshot",
    conversationId: "conversation-7",
    enterpriseId: 1,
    userId: 42,
    agentId: "executive-ppt",
    selectedSkillIds: ["ppt-master"],
    systemPrompt: "Use the editable PPT assistant.",
    messages: [{ role: "user", content: "继续完善" }],
    projectSnapshot: snapshot,
  })

  assert.deepEqual(input.projectSnapshot, snapshot)
})

test("preserves Writer phase and explicit zero artifact limits", () => {
  const input = buildAgentRuntimeInput({
    runId: "run-writer-contract",
    conversationId: "writer-contract",
    enterpriseId: null,
    userId: 2,
    agentId: "writer",
    writerPhase: "draft",
    selectedSkillIds: ["writer-orchestrator"],
    systemPrompt: "system",
    messages: [{ role: "user", content: "draft" }],
    profileLimits: { maxArtifacts: 0, maxArtifactBytes: 0, maxArtifactTotalBytes: 0 },
  })
  assert.equal(input.writerPhase, "draft")
  assert.equal(input.artifactContract.maxArtifacts, 0)
  assert.equal(input.artifactContract.maxArtifactBytes, 0)
  assert.equal(input.artifactContract.maxArtifactTotalBytes, 0)
})

test("rejects durable Writer context for unrelated agents", () => {
  assert.throws(() => buildAgentRuntimeInput({
    runId: "run-writer-context-mismatch",
    conversationId: "conversation-1",
    enterpriseId: null,
    userId: 2,
    agentId: "general",
    systemPrompt: "system",
    messages: [{ role: "user", content: "hello" }],
    writerContext: { contextHash: "hash" } as never,
  }), /writer_context_agent_mismatch/)
})

test("keeps the outer runtime hash compatible across Writer context revisions", () => {
  const build = (writerContext: unknown) => buildAgentRuntimeInput({
    runId: "run-writer-context-hash",
    conversationId: "writer-context-hash",
    enterpriseId: null,
    userId: 2,
    agentId: "writer",
    writerPhase: "draft",
    systemPrompt: "system",
    messages: [{ role: "user", content: "continue the article" }],
    writerContext: writerContext as never,
  })

  assert.equal(
    build({ contextHash: "writer-context-v1" }).contextHash,
    build({ contextHash: "writer-context-v2" }).contextHash,
  )
})

test("bounds context and keeps the newest artifact summaries first", () => {
  const input = buildAgentRuntimeInput({
    runId: "run-2",
    conversationId: "c-2",
    enterpriseId: 1,
    userId: 2,
    agentId: "general",
    systemPrompt: "system",
    messages: Array.from({ length: 30 }, (_, index) => ({ role: index % 2 ? "assistant" as const : "user" as const, content: `message-${index}` })),
    artifactContext: Array.from({ length: 10 }, (_, index) => ({ artifactId: index + 1, title: `artifact-${index}`, kind: "markdown", summary: "summary" })),
    maxContextChars: 1_200,
  })
  assert.ok(JSON.stringify(input).length <= 1_400)
  assert.equal(input.messages.at(-1)?.content.includes("message-28"), true)
  assert.equal(input.artifactContext.length <= 10, true)
})

test("rejects a current user message that cannot fit the context boundary", () => {
  assert.throws(() => buildAgentRuntimeInput({
    runId: "run-3",
    conversationId: null,
    enterpriseId: null,
    userId: 2,
    agentId: null,
    systemPrompt: "system",
    messages: [{ role: "user", content: "x".repeat(2_000) }],
    maxContextChars: 100,
  }), (error: unknown) => error instanceof AgentRuntimeInputTooLargeError)
})
