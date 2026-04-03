import assert from "node:assert/strict"
import test from "node:test"

import {
  isMemoryOwnedByScope,
  parseMemoryIdParam,
  validateCreateMemoryPayload,
  validatePatchMemoryPayload,
} from "./validators"
import type { WriterMemoryItem } from "./types"

test("rejects invalid memory type in create payload", () => {
  const result = validateCreateMemoryPayload({
    agentType: "writer",
    type: "invalid",
    source: "explicit_user",
    title: "偏好",
    content: "保持专业",
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error, "invalid_memory_type")
  }
})

test("rejects empty content in create payload", () => {
  const result = validateCreateMemoryPayload({
    agentType: "writer",
    type: "feedback",
    source: "explicit_user",
    title: "偏好",
    content: "   ",
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error, "content_required")
  }
})

test("rejects illegal agentType in patch payload", () => {
  const result = validatePatchMemoryPayload({
    agentType: "sales",
    title: "new title",
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error, "invalid_agent_type")
  }
})

test("ownership guard blocks cross-user or cross-agent access", () => {
  const item: WriterMemoryItem = {
    id: 1,
    userId: 100,
    agentType: "writer",
    conversationId: null,
    type: "feedback",
    title: "偏好",
    content: "保持克制",
    confidence: 0.8,
    source: "explicit_user",
    dedupFingerprint: null,
    isDeleted: false,
    lastUsedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  assert.equal(
    isMemoryOwnedByScope(item, { userId: 101, agentType: "writer" }),
    false,
  )
  assert.equal(
    isMemoryOwnedByScope(item, { userId: 100, agentType: "image" }),
    false,
  )
  assert.equal(
    isMemoryOwnedByScope(item, { userId: 100, agentType: "writer" }),
    true,
  )
})

test("memoryId validator rejects non-positive id", () => {
  const parsed = parseMemoryIdParam("0")
  assert.equal(parsed.ok, false)
  if (!parsed.ok) {
    assert.equal(parsed.error, "invalid_memory_id")
  }
})

