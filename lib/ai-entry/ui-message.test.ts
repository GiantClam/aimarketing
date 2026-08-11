import assert from "node:assert/strict"
import test from "node:test"

import { convertToModelMessages } from "ai"

import {
  createAiEntryUIMessageFromParts,
  uiMessagesToLegacyChatMessages,
} from "./ui-message"

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
