import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveAiEntryCompletedConversationMessages,
  resolveAiEntryBootstrapMessages,
  resolveAiEntryRestoredMessages,
  shouldShowAiEntryConversationRestore,
} from "./message-restore"

type TestMessage = {
  role: "user" | "assistant"
  content: string
  parts?: unknown[]
}

test("keeps pending messages when persisted history is still empty", () => {
  const pending: TestMessage[] = [
    { role: "user", content: "hello" },
    { role: "assistant", content: "draft reply" },
  ]

  assert.deepEqual(
    resolveAiEntryRestoredMessages({
      pendingMessages: pending,
      persistedMessages: [],
    }),
    pending,
  )
})

test("bootstraps pending messages for a routed conversation before persisted history loads", () => {
  const pending: TestMessage[] = [
    { role: "user", content: "生成一份季度复盘" },
    { role: "assistant", content: "正在整理结构..." },
  ]

  assert.deepEqual(
    resolveAiEntryBootstrapMessages({
      conversationId: "386",
      pendingMessages: pending,
    }),
    pending,
  )

  assert.equal(
    shouldShowAiEntryConversationRestore({
      isConversationLoading: true,
      messages: pending,
    }),
    false,
  )
})

test("shows restore state only when loading conversation has no meaningful messages yet", () => {
  assert.equal(
    shouldShowAiEntryConversationRestore({
      isConversationLoading: true,
      messages: [],
    }),
    true,
  )

  assert.equal(
    shouldShowAiEntryConversationRestore({
      isConversationLoading: false,
      messages: [],
    }),
    false,
  )
})

test("keeps pending messages when persisted history has fewer meaningful messages", () => {
  const pending: TestMessage[] = [
    { role: "user", content: "hello" },
    { role: "assistant", content: "draft reply" },
  ]
  const persisted: TestMessage[] = [{ role: "user", content: "hello" }]

  assert.deepEqual(
    resolveAiEntryRestoredMessages({
      pendingMessages: pending,
      persistedMessages: persisted,
    }),
    pending,
  )
})

test("uses persisted messages once history has caught up", () => {
  const pending: TestMessage[] = [
    { role: "user", content: "hello" },
    { role: "assistant", content: "draft reply" },
  ]
  const persisted: TestMessage[] = [
    { role: "user", content: "hello" },
    { role: "assistant", content: "final reply" },
  ]

  assert.deepEqual(
    resolveAiEntryRestoredMessages({
      pendingMessages: pending,
      persistedMessages: persisted,
    }),
    persisted,
  )
})

test("prefers persisted messages once the server has a completed assistant reply", () => {
  const pending: TestMessage[] = [
    { role: "user", content: "继续" },
    { role: "assistant", content: "正在生成中..." },
    { role: "user", content: "继续" },
  ]
  const persisted: TestMessage[] = [
    { role: "user", content: "继续" },
    { role: "assistant", content: "预览已生成，请确认导出。" },
  ]

  assert.deepEqual(
    resolveAiEntryRestoredMessages({
      pendingMessages: pending,
      persistedMessages: persisted,
    }),
    persisted,
  )
})

test("keeps pending assistant drafts with running parts until the server has persisted an assistant reply", () => {
  const pending: TestMessage[] = [
    { role: "user", content: "导出 Playful" },
    {
      role: "assistant",
      content: "",
      parts: [
        {
          type: "task-progress",
          status: "running",
          steps: [
            { type: "tool:export", status: "failed", at: 1 },
            { type: "tool:preview", status: "running", at: 2 },
          ],
        },
      ],
    },
  ]
  const persisted: TestMessage[] = [{ role: "user", content: "导出 Playful" }]

  assert.deepEqual(
    resolveAiEntryRestoredMessages({
      pendingMessages: pending,
      persistedMessages: persisted,
    }),
    pending,
  )
})

test("prefers persisted full history after background task completion when current messages are partial", () => {
  const current: TestMessage[] = [
    { role: "assistant", content: "已生成 PPT 预览。" },
  ]
  const persisted: TestMessage[] = [
    { role: "user", content: "做一个克里米亚现状的ppt" },
    { role: "assistant", content: "已提交生成预览版，当前状态是后台排队生成中。" },
    { role: "assistant", content: "已生成 PPT 预览。" },
  ]

  assert.deepEqual(
    resolveAiEntryCompletedConversationMessages({
      currentMessages: current,
      persistedMessages: persisted,
    }),
    persisted,
  )
})

test("appends background assistant completion when refreshed history has not caught up yet", () => {
  const current: TestMessage[] = [
    { role: "user", content: "生成预览" },
    { role: "assistant", content: "后台生成中..." },
  ]
  const persisted: TestMessage[] = [
    { role: "user", content: "生成预览" },
    { role: "assistant", content: "后台生成中..." },
  ]
  const backgroundAssistantMessage: TestMessage = {
    role: "assistant",
    content: "已生成 PPT 预览。\n<!-- ai-entry-ppt-preview-context:{\"previewSessionId\":\"preview-401\",\"defaultVariantKey\":\"variant-a\",\"variantKeys\":[\"variant-a\"]} -->",
  }

  assert.deepEqual(
    resolveAiEntryCompletedConversationMessages({
      currentMessages: current,
      persistedMessages: persisted,
      backgroundAssistantMessage,
    }),
    [...persisted, backgroundAssistantMessage],
  )
})

test("does not duplicate background assistant completion when refreshed history already includes it", () => {
  const backgroundAssistantMessage: TestMessage = {
    role: "assistant",
    content: "已生成 PPT 预览。\n<!-- ai-entry-ppt-preview-context:{\"previewSessionId\":\"preview-401\",\"defaultVariantKey\":\"variant-a\",\"variantKeys\":[\"variant-a\"]} -->",
  }
  const persisted: TestMessage[] = [
    { role: "user", content: "生成预览" },
    backgroundAssistantMessage,
  ]

  assert.deepEqual(
    resolveAiEntryCompletedConversationMessages({
      currentMessages: [],
      persistedMessages: persisted,
      backgroundAssistantMessage,
    }),
    persisted,
  )
})
