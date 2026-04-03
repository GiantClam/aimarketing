import assert from "node:assert/strict"
import test from "node:test"

import { createInMemoryWriterMemoryRepository } from "./repository"
import { containsWriterMemorySecret, enforceWriterMemoryContentSafety } from "./safety"

test("blocks obvious secret patterns", () => {
  assert.equal(containsWriterMemorySecret("api_key=sk-verysecretvalue123456789"), true)
  assert.equal(containsWriterMemorySecret("保持克制语气"), false)
})

test("rejects overlong memory content", () => {
  const overlong = "a".repeat(2000)
  assert.throws(
    () => enforceWriterMemoryContentSafety(overlong),
    /writer_memory_content_too_long/,
  )
})

test("deleted memory item is not readable from list", async () => {
  const repository = createInMemoryWriterMemoryRepository()
  const created = await repository.saveWriterMemoryItem({
    userId: 88,
    agentType: "writer",
    type: "feedback",
    title: "删除验证",
    content: "会被删除",
    source: "explicit_user",
  })

  const deleted = await repository.softDeleteWriterMemoryItem({
    userId: 88,
    agentType: "writer",
    memoryId: created.id,
  })
  const items = await repository.listWriterMemories({ userId: 88, agentType: "writer" })

  assert.equal(deleted, true)
  assert.equal(items.length, 0)
})

