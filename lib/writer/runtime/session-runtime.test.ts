import assert from "node:assert/strict"
import test from "node:test"

import {
  buildWriterRecoveryContext,
  buildWriterRuntimeContext,
  deriveWriterSessionKey,
  runWriterRuntimeWithRecovery,
} from "./session-runtime"

const scope = {
  environment: "production",
  enterpriseId: 151,
  userId: 96,
  conversationId: "540",
  agentId: "writer",
} as const

test("Writer session identity is stable for one conversation and isolated by every scope component", () => {
  const first = deriveWriterSessionKey(scope)
  const second = deriveWriterSessionKey({ ...scope })

  assert.equal(first, second)
  assert.match(first, /^sess-[0-9a-f]{40}$/u)

  for (const changed of [
    { ...scope, environment: "staging" },
    { ...scope, enterpriseId: 152 },
    { ...scope, userId: 97 },
    { ...scope, conversationId: "541" },
    { ...scope, agentId: "writer-preview" },
  ]) {
    assert.notEqual(deriveWriterSessionKey(changed), first)
  }
})

test("complete active draft remains outside clipped recent turns while a revision is pending", () => {
  const beginning = "BEGINNING-OF-ACTIVE-ARTICLE"
  const ending = "END-OF-ACTIVE-ARTICLE"
  const body = `${beginning}\n${"正文段落。".repeat(20_000)}\n${ending}`
  const context = buildWriterRuntimeContext({
    currentTurn: "只调整第三节，其他内容保持不变",
    platform: "wechat",
    activeDraft: { revision: 7, title: "用户亲自写的标题", content: body, sourceUrls: [] },
    recentTurns: Array.from({ length: 30 }, (_, index) => ({
      role: index % 2 ? "assistant" as const : "user" as const,
      content: `history-${index}-${"x".repeat(2_000)}`,
    })),
    recentTurnLimit: 6,
    taskStatus: "pending",
  })

  assert.equal(context.activeDraft?.revision, 7)
  assert.equal(context.activeDraft?.content, body)
  assert.match(context.activeDraft?.content || "", new RegExp(beginning, "u"))
  assert.match(context.activeDraft?.content || "", new RegExp(ending, "u"))
  assert.equal(context.recentTurns.length, 6)
  assert.equal(context.taskStatus, "pending")
})

test("lost OpenCode session retries once with the complete durable snapshot", async () => {
  const body = `begin\n${"full draft\n".repeat(1_000)}end`
  const normal = buildWriterRuntimeContext({
    currentTurn: "继续修改",
    platform: "wechat",
    activeDraft: { revision: 3, title: "title", content: body, sourceUrls: [] },
    recentTurns: [],
    taskStatus: "running",
  })
  const recovery = buildWriterRecoveryContext(normal)
  const attempts: Array<{ recovery: boolean; content: string | null }> = []
  let charges = 0

  const result = await runWriterRuntimeWithRecovery({
    normalContext: normal,
    recoveryContext: recovery,
    invoke: async (context) => {
      attempts.push({ recovery: context.recovery, content: context.activeDraft?.content || null })
      if (attempts.length === 1) throw new Error("opencode_session_not_found")
      return "ok"
    },
    charge: async () => { charges += 1 },
  })

  assert.equal(result, "ok")
  assert.deepEqual(attempts, [
    { recovery: false, content: body },
    { recovery: true, content: body },
  ])
  assert.equal(charges, 1)
})

test("non-session runtime failures are not retried", async () => {
  const normal = buildWriterRuntimeContext({
    currentTurn: "继续修改",
    platform: "wechat",
    activeDraft: null,
    recentTurns: [],
    taskStatus: "running",
  })
  let attempts = 0

  await assert.rejects(
    runWriterRuntimeWithRecovery({
      normalContext: normal,
      recoveryContext: buildWriterRecoveryContext(normal),
      invoke: async () => {
        attempts += 1
        throw new Error("provider_rate_limited")
      },
    }),
    /provider_rate_limited/u,
  )
  assert.equal(attempts, 1)
})
