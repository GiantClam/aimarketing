import assert from "node:assert/strict"
import test from "node:test"

import { convertToModelMessages } from "ai"

import {
  createAiEntryUIMessageFromParts,
  getAiEntryUIMessageTurnId,
  mergeAiEntryUIMessageDuplicates,
  uiMessagesToLegacyChatMessages,
} from "./ui-message"

test("keeps one stable turn id across the user and assistant UI messages", () => {
  assert.equal(getAiEntryUIMessageTurnId({ metadata: { turnId: "turn-42" } } as never), "turn-42")
  assert.equal(getAiEntryUIMessageTurnId({ metadata: { turnId: "  " } } as never), null)
})

test("merges duplicate UI messages by id and preserves richer parts", () => {
  const merged = mergeAiEntryUIMessageDuplicates([
    {
      id: "assistant-1",
      role: "assistant",
      metadata: { createdAt: 10 },
      parts: [{ type: "text", text: "已完成", state: "done" }],
    },
    {
      id: "assistant-1",
      role: "assistant",
      metadata: { finishReason: "stop" },
      parts: [{
        type: "data-artifact",
        id: "artifact-1",
        data: {
          artifactType: "pptx",
          artifactId: 1,
          title: "方案演示",
          fileName: "deck.pptx",
          previewUrl: null,
          downloadUrl: null,
          workHref: null,
          status: "created",
        },
      }],
    },
  ])

  assert.equal(merged.length, 1)
  assert.equal(merged[0]?.metadata?.createdAt, 10)
  assert.equal(merged[0]?.metadata?.finishReason, "stop")
  assert.deepEqual(merged[0]?.parts.map((part) => part.type), ["text", "data-artifact"])
})

test("does not duplicate text when the same UI message arrives again", () => {
  const merged = mergeAiEntryUIMessageDuplicates([
    { id: "assistant-2", role: "assistant", parts: [{ type: "text", text: "回答", state: "done" }] },
    { id: "assistant-2", role: "assistant", parts: [{ type: "text", text: "回答", state: "done" }] },
  ])

  assert.equal(merged.length, 1)
  assert.equal(merged[0]?.parts[0]?.type, "text")
  assert.equal((merged[0]?.parts[0] as { text?: string })?.text, "回答")
})

test("merges assistant messages from the same turn even when persistence assigned different ids", () => {
  const merged = mergeAiEntryUIMessageDuplicates([
    {
      id: "assistant-placeholder",
      role: "assistant",
      metadata: { turnId: "turn-43" },
      parts: [{ type: "text", text: "任务已提交", state: "done" }],
    },
    {
      id: "assistant-final",
      role: "assistant",
      metadata: { turnId: "turn-43" },
      parts: [{ type: "text", text: "任务已完成", state: "done" }],
    },
  ])

  assert.equal(merged.length, 1)
  assert.equal((merged[0]?.parts[0] as { text?: string })?.text, "任务已完成")
})

test("merges consecutive legacy assistant rows without turn ids", () => {
  const merged = mergeAiEntryUIMessageDuplicates([
    {
      id: "assistant-process",
      role: "assistant",
      parts: [
        { type: "text", text: "任务已提交", state: "done" },
        { type: "data-task-run", id: "task-1", data: { status: "running" } as never },
      ],
    },
    {
      id: "assistant-artifact",
      role: "assistant",
      parts: [
        { type: "text", text: "PPTX 已生成", state: "done" },
        { type: "data-artifact", id: "artifact-1", data: { artifactType: "pptx" } as never },
      ],
    },
  ])

  assert.equal(merged.length, 1)
  assert.equal((merged[0]?.parts[0] as { text?: string })?.text, "任务已提交\n\nPPTX 已生成")
  assert.deepEqual(merged[0]?.parts.map((part) => part.type), ["text", "data-task-run", "data-artifact"])
})

test("merges assistant rows by persisted idempotency key", () => {
  const merged = mergeAiEntryUIMessageDuplicates([
    {
      id: "assistant-process",
      role: "assistant",
      metadata: { idempotencyKey: "ui:turn-44:assistant" },
      parts: [{ type: "text", text: "任务已提交", state: "done" }],
    },
    {
      id: "assistant-artifact",
      role: "assistant",
      metadata: { idempotencyKey: "ui:turn-44:assistant" },
      parts: [{ type: "data-artifact", id: "artifact-44", data: { artifactType: "pptx" } as never }],
    },
  ])

  assert.equal(merged.length, 1)
  assert.equal(merged[0]?.parts.some((part) => part.type === "data-artifact"), true)
})

test("merges adjacent assistant rows even when legacy turn ids conflict", () => {
  const merged = mergeAiEntryUIMessageDuplicates([
    { id: "assistant-a", role: "assistant", metadata: { turnId: "turn-a" }, parts: [{ type: "text", text: "A", state: "done" }] },
    { id: "assistant-b", role: "assistant", metadata: { turnId: "turn-b" }, parts: [{ type: "text", text: "B", state: "done" }] },
  ])

  assert.equal(merged.length, 1)
  assert.equal((merged[0]?.parts[0] as { text?: string })?.text, "A\n\nB")
})

test("UIMessage preserves final text and process/artifact data parts", () => {
  const message = createAiEntryUIMessageFromParts({
    id: "assistant-1",
    role: "assistant",
    text: "最终结论",
    parts: [
      { type: "reasoning", id: "reasoning-1", text: "先分析", status: "done" },
      {
        type: "artifact",
        id: "artifact-1",
        artifactType: "pptx",
        artifactId: 7,
        title: "方案演示",
        fileName: "方案演示.pptx",
        previewUrl: null,
        downloadUrl: null,
        workHref: null,
        status: "created",
      },
      { type: "text", id: "text-1", text: "最终结论" },
    ],
  })

  assert.equal(message.parts.filter((part) => part.type === "text")[0]?.text, "最终结论")
  assert.equal(message.parts.some((part) => part.type === "data-artifact"), true)
  assert.equal(message.parts.some((part) => part.type === "reasoning"), true)
})

test("UIMessage file parts are forwarded to the legacy attachment contract", () => {
  const message = {
    id: "user-1",
    role: "user" as const,
    parts: [
      { type: "text" as const, text: "分析这个文件", state: "done" as const },
      { type: "file" as const, url: "data:text/plain;base64,SGk=", mediaType: "text/plain", filename: "brief.txt" },
    ],
  }

  const [legacy] = uiMessagesToLegacyChatMessages([message])
  assert.equal(legacy?.content, "分析这个文件")
  assert.deepEqual(legacy?.attachments, [{
    name: "brief.txt",
    mediaType: "text/plain",
    dataUrl: "data:text/plain;base64,SGk=",
    size: 0,
  }])
})

test("AI SDK converts UIMessage data parts into model messages without leaking process traces", async () => {
  const message = {
    id: "assistant-2",
    role: "assistant" as const,
    parts: [
      { type: "text" as const, text: "回答", state: "done" as const },
      { type: "data-runtime-status" as const, id: "runtime-2", data: { status: "completed" as const, stage: "provider_selected" } },
    ],
  }

  const modelMessages = await convertToModelMessages(
    [{ role: message.role, parts: message.parts }],
    { convertDataPart: () => undefined },
  )

  assert.deepEqual(modelMessages, [{ role: "assistant", content: [{ type: "text", text: "回答" }] }])
})
