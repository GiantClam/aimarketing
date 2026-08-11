import assert from "node:assert/strict"
import test from "node:test"

import { readLegacySse, type LegacySseTerminalState } from "./legacy-sse"

function responseFromChunks(chunks: string[]) {
  return new Response(new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    },
  }))
}

async function collect(response: Response, state: LegacySseTerminalState) {
  const payloads = []
  for await (const payload of readLegacySse(response, state)) payloads.push(payload)
  return payloads
}

test("legacy SSE parser handles frames split across network chunks", async () => {
  const state: LegacySseTerminalState = { terminal: null }
  const payloads = await collect(
    responseFromChunks([
      'data: {"event":"message","answer":"hel',
      'lo"}\n\ndata: {"event":"message_end"}\n\n',
    ]),
    state,
  )

  assert.deepEqual(payloads, [
    { event: "message", answer: "hello" },
    { event: "message_end" },
  ])
  assert.equal(state.terminal, "success")
})

test("legacy SSE parser rejects a stream that closes without a terminal event", async () => {
  const state: LegacySseTerminalState = { terminal: null }

  await assert.rejects(
    collect(responseFromChunks(['data: {"event":"message","answer":"partial"}\n\n']), state),
    /ai_entry_stream_incomplete/,
  )
})

test("legacy SSE parser rejects malformed JSON instead of marking it complete", async () => {
  const state: LegacySseTerminalState = { terminal: null }

  await assert.rejects(
    collect(responseFromChunks(["data: {not-json}\n\ndata: {\"event\":\"message_end\"}\n\n"]), state),
    /ai_entry_stream_invalid_frame/,
  )
})
