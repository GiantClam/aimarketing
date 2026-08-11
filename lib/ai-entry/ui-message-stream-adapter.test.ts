import assert from "node:assert/strict"
import test from "node:test"

import {
  createAiEntryUIStreamAdapterState,
  writeLegacyEventToAiEntryUIStream,
} from "./ui-message-stream-adapter"

function createWriter() {
  const chunks: unknown[] = []
  return {
    chunks,
    writer: { write(chunk: unknown) { chunks.push(chunk) } },
  }
}

test("legacy SSE events become ordered UIMessage text, process, and artifact chunks", () => {
  const { writer, chunks } = createWriter()
  const state = createAiEntryUIStreamAdapterState("assistant-1")

  writeLegacyEventToAiEntryUIStream(writer as never, { event: "reasoning", answer: "分析中" }, state)
  writeLegacyEventToAiEntryUIStream(writer as never, { event: "tool_call_start", data: { toolName: "web_search", toolCallId: "tool-1", args: { query: "market" } } }, state)
  writeLegacyEventToAiEntryUIStream(writer as never, { event: "message", answer: "最终答案" }, state)
  writeLegacyEventToAiEntryUIStream(writer as never, { event: "artifact_created", artifact: { artifactId: 7, kind: "pptx", title: "产物" } }, state)
  writeLegacyEventToAiEntryUIStream(writer as never, { event: "message_end" }, state)

  assert.deepEqual(chunks.map((chunk) => (chunk as { type: string }).type), [
    "reasoning-start",
    "reasoning-delta",
    "tool-input-start",
    "tool-input-available",
    "text-start",
    "text-delta",
    "data-artifact",
    "text-end",
    "reasoning-end",
  ])
  assert.equal((chunks[5] as { delta: string }).delta, "最终答案")
  assert.equal((chunks[6] as { data: { title: string } }).data.title, "产物")
})
