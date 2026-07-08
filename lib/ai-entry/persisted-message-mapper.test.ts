import assert from "node:assert/strict"
import test from "node:test"

import { buildPptToolResultMessage } from "@/lib/ai-entry/ppt-tool-result-message"

import { mapPersistedAiEntryMessages } from "./persisted-message-mapper"

test("mapPersistedAiEntryMessages sorts persisted messages by createdAt ascending", () => {
  const mapped = mapPersistedAiEntryMessages([
    { id: "assistant-2", role: "assistant", content: "second", created_at: 20 },
    { id: "user-1", role: "user", content: "first", created_at: 10 },
    { id: "assistant-3", role: "assistant", content: "third", created_at: 30 },
  ])

  assert.deepEqual(
    mapped.map((message) => message.id),
    ["user-1", "assistant-2", "assistant-3"],
  )
})

test("mapPersistedAiEntryMessages drops stale failed background messages before a later preview", () => {
  const previewMessage = buildPptToolResultMessage({
    toolName: "preview_ppt_deck",
    isZh: true,
    result: {
      ok: true,
      previewSessionId: "preview-123",
      recommendedVariantKey: "v1",
      variants: [{ key: "v1", name: "Variant 1" }],
    },
  })

  const mapped = mapPersistedAiEntryMessages([
    { id: "preview", role: "assistant", content: previewMessage || "", created_at: 30 },
    { id: "failed", role: "assistant", content: "可编辑 PPT 后台生成失败：network timeout", created_at: 20 },
    { id: "user", role: "user", content: "帮我做一份融资路演", created_at: 10 },
  ])

  assert.deepEqual(
    mapped.map((message) => message.id),
    ["user", "preview"],
  )
})
