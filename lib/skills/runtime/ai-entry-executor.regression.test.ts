import assert from "node:assert/strict"
import test from "node:test"

import {
  getAiEntryTextDeltaFromStreamPart,
  getAiEntryToolResultFromStreamPart,
} from "./ai-entry-executor"

test("streaming executor reads text from the current AI SDK text-delta field", () => {
  assert.equal(
    getAiEntryTextDeltaFromStreamPart({
      type: "text-delta",
      text: "hello",
    }),
    "hello",
  )
})

test("streaming executor keeps backwards compatibility with textDelta", () => {
  assert.equal(
    getAiEntryTextDeltaFromStreamPart({
      type: "text-delta",
      textDelta: "legacy",
    }),
    "legacy",
  )
})

test("streaming executor exposes tool output as the result payload", () => {
  const output = {
    query: "AI marketing automation 2026",
    results: [
      {
        title: "Source",
        url: "https://example.com/source",
      },
    ],
  }

  assert.deepEqual(
    getAiEntryToolResultFromStreamPart({
      type: "tool-result",
      toolName: "web_search",
      toolCallId: "tool-1",
      output,
    }),
    output,
  )
})

test("streaming executor keeps backwards compatibility with result", () => {
  const result = { ok: true }

  assert.deepEqual(
    getAiEntryToolResultFromStreamPart({
      type: "tool-result",
      result,
    }),
    result,
  )
})
