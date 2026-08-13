import assert from "node:assert/strict"
import test from "node:test"

import { runWriterSkillFirstTurn, validateWriterSkillFirstTurnResult } from "./skills"
import { buildWriterRuntimeContext } from "./runtime/session-runtime"

test.before(() => {
  process.env.WRITER_E2E_FIXTURES = "true"
})

test.after(() => {
  delete process.env.WRITER_E2E_FIXTURES
})

test("fixture first turn asks for clarification without application brief extraction", async () => {
  const result = await runWriterSkillFirstTurn({
    query: "Write a WeChat article about AI workflow design",
    platform: "wechat",
    mode: "article",
    preferredLanguage: "en",
  })

  assert.equal(result.outcome, "needs_clarification")
  assert.equal(result.turnCount, 1)
  assert.equal(result.maxTurns, 1)
  assert.deepEqual(result.missingFields, [])
  assert.equal(result.routing.selectedStyleSkillId, null)
})

test("fixture first turn returns one validated draft submission for an active draft", async () => {
  const context = buildWriterRuntimeContext({
    conversationId: "writer-first-turn-test",
    currentTurn: "Revise the active draft",
    platform: "wechat",
    activeDraft: {
      revision: 2,
      title: "Writer Fixture Draft",
      content: "Existing content",
      sourceUrls: [],
    },
    recentTurns: [{ role: "user", content: "Please revise this article" }],
    taskStatus: "ready",
  })

  const result = await runWriterSkillFirstTurn({
    query: "Revise the active draft",
    platform: "wechat",
    mode: "article",
    preferredLanguage: "en",
    writerContext: context,
  })

  assert.equal(result.outcome, "draft_ready")
  assert.equal(result.readyForGeneration, true)
  assert.equal(result.assetIntents?.filter((intent) => intent.kind === "cover").length, 1)
  assert.match(result.answer, /writer-asset:\/\/cover/u)
})

test("first-turn validation rejects duplicate structured result submissions", () => {
  assert.throws(
    () =>
      validateWriterSkillFirstTurnResult({
        platform: "wechat",
        mode: "article",
        platformLabel: "公众号",
        activeRevision: 0,
        result: {
          schemaVersion: 1,
          outcome: "needs_clarification",
          operation: "create",
          platform: "wechat",
          userMessage: "Please clarify.",
          draft: null,
          research: { requested: false, completed: false, sourceUrls: [] },
          assetIntents: [],
        },
        activatedSkillIds: ["khazix-writer"],
        resultToolCallCount: 2,
      }),
    /writer_result_submission_count_invalid/u,
  )
})
