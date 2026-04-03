import assert from "node:assert/strict"
import test from "node:test"

import { rankWriterMemories } from "./retrieval"
import type { WriterMemoryItem } from "./types"

const now = new Date("2026-04-03T10:00:00.000Z")

function createMemory(overrides: Partial<WriterMemoryItem>): WriterMemoryItem {
  return {
    id: overrides.id || 1,
    userId: overrides.userId || 1,
    agentType: overrides.agentType || "writer",
    conversationId: null,
    type: overrides.type || "feedback",
    title: overrides.title || "默认记忆",
    content: overrides.content || "默认内容",
    confidence: overrides.confidence ?? 0.5,
    source: overrides.source || "manual_edit",
    dedupFingerprint: overrides.dedupFingerprint || null,
    isDeleted: overrides.isDeleted || false,
    lastUsedAt: overrides.lastUsedAt || null,
    deletedAt: overrides.deletedAt || null,
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
  }
}

test("retrieval returns at most 5 high-relevance memories", () => {
  const fixtures = Array.from({ length: 8 }).map((_, index) =>
    createMemory({
      id: index + 1,
      title: `公众号写作偏好-${index + 1}`,
      content: "写作风格保持克制，先结论后论证",
      confidence: 0.6 + index * 0.03,
      updatedAt: new Date(now.getTime() - index * 24 * 60 * 60 * 1000),
    }),
  )

  const result = rankWriterMemories("写一篇偏克制语气的公众号文章", fixtures, {
    userId: 1,
    agentType: "writer",
    limit: 5,
    now,
  })
  assert.ok(result.length <= 5)
})

test("retrieval enforces agentType isolation", () => {
  const fixtures = [
    createMemory({
      id: 1,
      userId: 1,
      agentType: "writer",
      title: "writer memory",
      content: "语气专业克制",
    }),
    createMemory({
      id: 2,
      userId: 1,
      agentType: "growth",
      title: "growth memory",
      content: "增长黑客语气",
    }),
  ]

  const result = rankWriterMemories("专业克制语气", fixtures, {
    userId: 1,
    agentType: "writer",
    now,
  })

  assert.equal(result.length, 1)
  assert.equal(result[0]?.agentType, "writer")
  assert.notEqual(result[0]?.title, "growth memory")
})

test("retrieval prefers higher overlap and confidence", () => {
  const fixtures = [
    createMemory({
      id: 1,
      title: "语气控制",
      content: "保持克制，避免夸张修辞",
      confidence: 0.9,
      updatedAt: now,
    }),
    createMemory({
      id: 2,
      title: "图片偏好",
      content: "图片构图规则",
      confidence: 0.99,
      updatedAt: now,
    }),
  ]

  const result = rankWriterMemories("保持克制并避免夸张", fixtures, {
    userId: 1,
    agentType: "writer",
    now,
  })

  assert.equal(result[0]?.id, 1)
})

