import assert from "node:assert/strict"
import test from "node:test"

import {
  deriveWriterImplicitMemoryItems,
  persistWriterImplicitMemoryFromTurn,
  shouldExtractWriterImplicitMemory,
} from "./extractor"

test("needs_clarification should not trigger implicit extraction", () => {
  const shouldExtract = shouldExtractWriterImplicitMemory({
    enabled: true,
    outcome: "needs_clarification",
    explicitWritePerformed: false,
  })
  assert.equal(shouldExtract, false)
})

test("draft_ready can trigger implicit extraction when signals exist", () => {
  const items = deriveWriterImplicitMemoryItems({
    enabled: true,
    query: "以后都保持克制语气，不要再夸张",
    answer: "ok",
    userId: 1,
    agentType: "writer",
    conversationId: 9,
    outcome: "draft_ready",
  })
  assert.equal(items.length, 1)
  assert.equal(items[0]?.agentType, "writer")
  assert.equal(items[0]?.source, "implicit_extraction")
})

test("explicit write in same turn skips implicit extraction", () => {
  const items = deriveWriterImplicitMemoryItems({
    enabled: true,
    query: "记住：语气克制",
    answer: "ok",
    userId: 1,
    agentType: "writer",
    conversationId: 9,
    outcome: "draft_ready",
    explicitWritePerformed: true,
  })
  assert.equal(items.length, 0)
})

test("persist helper writes extracted items with current agentType only", async () => {
  const writes: Array<{ agentType: string; content: string }> = []
  const result = await persistWriterImplicitMemoryFromTurn(
    {
      enabled: true,
      query: "记住这个偏好：保持正式风格",
      answer: "ok",
      userId: 7,
      agentType: "brand-strategy",
      conversationId: 99,
      outcome: "draft_ready",
    },
    async (item) => {
      writes.push({ agentType: item.agentType, content: item.content })
    },
  )

  assert.equal(result.skipped, false)
  assert.equal(result.persisted, 1)
  assert.deepEqual(writes, [
    {
      agentType: "brand-strategy",
      content: "记住这个偏好：保持正式风格",
    },
  ])
})
