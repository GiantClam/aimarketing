import assert from "node:assert/strict"
import test from "node:test"

import { createInMemoryWriterMemoryRepository } from "./repository"

test("upsert soul profile keeps unique scope and updates in place", async () => {
  const repository = createInMemoryWriterMemoryRepository()

  const first = await repository.updateWriterSoulProfile(7, "writer", {
    tone: "克制",
    sentenceStyle: "短句",
    confidence: 0.8,
    version: "v1",
  })
  const second = await repository.updateWriterSoulProfile(7, "writer", {
    tone: "专业",
    confidence: 0.9,
  })

  assert.equal(first.id, second.id)
  assert.equal(second.tone, "专业")
  assert.equal(second.sentenceStyle, "短句")
  assert.equal(repository.__store.soulProfiles.length, 1)
})

test("list memory filters by user + agentType + type", async () => {
  const repository = createInMemoryWriterMemoryRepository()

  await repository.saveWriterMemoryItem({
    userId: 42,
    agentType: "writer",
    type: "feedback",
    title: "语气偏好",
    content: "保持克制",
    source: "explicit_user",
  })
  await repository.saveWriterMemoryItem({
    userId: 42,
    agentType: "writer",
    type: "project",
    title: "项目背景",
    content: "面向 B2B 工业客户",
    source: "manual_edit",
  })
  await repository.saveWriterMemoryItem({
    userId: 42,
    agentType: "image",
    type: "feedback",
    title: "视觉偏好",
    content: "偏蓝灰色",
    source: "explicit_user",
  })

  const result = await repository.listWriterMemories({
    userId: 42,
    agentType: "writer",
    type: "feedback",
    limit: 20,
  })

  assert.equal(result.length, 1)
  assert.equal(result[0]?.title, "语气偏好")
  assert.equal(result[0]?.agentType, "writer")
})

test("soft delete memory removes item from list and writes delete event", async () => {
  const repository = createInMemoryWriterMemoryRepository()
  const item = await repository.saveWriterMemoryItem({
    userId: 11,
    agentType: "writer",
    type: "feedback",
    title: "删除测试",
    content: "这条会被删除",
    source: "explicit_user",
  })

  const deleted = await repository.softDeleteWriterMemoryItem({
    userId: 11,
    agentType: "writer",
    memoryId: item.id,
  })
  const listed = await repository.listWriterMemories({ userId: 11, agentType: "writer" })

  assert.equal(deleted, true)
  assert.equal(listed.length, 0)
  assert.equal(repository.__store.events.at(-1)?.eventType, "memory_delete")
})

test("append memory event stores audit event payload", async () => {
  const repository = createInMemoryWriterMemoryRepository()
  await repository.appendWriterMemoryEvent({
    userId: 1,
    agentType: "writer",
    eventType: "memory_upsert",
    payload: { trigger: "manual" },
  })

  assert.equal(repository.__store.events.length, 1)
  assert.deepEqual(repository.__store.events[0]?.payload, { trigger: "manual" })
})

test("dedup window updates existing row and explicit source wins over implicit", async () => {
  const repository = createInMemoryWriterMemoryRepository()

  const explicit = await repository.saveWriterMemoryItem({
    userId: 99,
    agentType: "writer",
    type: "feedback",
    title: "偏好",
    content: "优先明确结论",
    source: "explicit_user",
  })

  const implicitAttempt = await repository.saveWriterMemoryItem({
    userId: 99,
    agentType: "writer",
    type: "feedback",
    title: "偏好",
    content: "可尝试更多修辞",
    source: "implicit_extraction",
  })

  assert.equal(explicit.id, implicitAttempt.id)
  assert.equal(implicitAttempt.content, "优先明确结论")
  assert.equal(repository.__store.memoryItems.length, 1)
})

