import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { EventAccumulator, SseDecoder, classifyEvent } from "./protocol.ts"

type Fixture = {
  name: string
  event: unknown
  expectedKind: string
}

const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures/protocol-events.json", import.meta.url), "utf8"),
) as Fixture[]

test("classifies required OpenCode event fixtures without dropping unknown events", () => {
  const accumulator = new EventAccumulator("session_fixture")

  for (const fixture of fixtures) {
    const classified = classifyEvent(fixture.event)
    assert.equal(classified.kind, fixture.expectedKind, fixture.name)
    accumulator.accept(fixture.event)
  }

  const summary = accumulator.summary()
  assert.equal(summary.textEvents, 1)
  assert.deepEqual(summary.toolPhases, ["started", "completed", "failed"])
  assert.equal(summary.usageEvents, 1)
  assert.equal(summary.terminalEvents, 1)
  assert.deepEqual(summary.unknownEventTypes, ["future.protocol.event"])
})

test("decodes fragmented UTF-8 SSE frames and multiline data", () => {
  const decoder = new SseDecoder()
  const encoder = new TextEncoder()
  const source = [
    ": connected\r\n",
    "event: message\r\n",
    "data: {\"type\":\"message.part.updated\",\r\n",
    "data: \"properties\":{\"delta\":\"你好\"}}\r\n\r\n",
  ].join("")
  const bytes = encoder.encode(source)
  const splitInsideChinese = bytes.findIndex((value, index) => value >= 0xe0 && bytes[index + 1] >= 0x80) + 1

  assert.deepEqual(decoder.push(bytes.subarray(0, splitInsideChinese)), [])
  const decoded = decoder.push(bytes.subarray(splitInsideChinese))
  assert.equal(decoded.length, 1)
  assert.equal(decoded[0]?.event, "message")
  assert.match(decoded[0]?.data ?? "", /你好/u)
  assert.deepEqual(decoder.finish(), [])
})

test("ignores comments and reports malformed JSON as an unknown event", () => {
  const decoder = new SseDecoder()
  const frames = decoder.push(new TextEncoder().encode(": heartbeat\n\ndata: not-json\n\n"))

  assert.equal(frames.length, 1)
  assert.equal(classifyEvent(frames[0]?.data).kind, "unknown")
})
