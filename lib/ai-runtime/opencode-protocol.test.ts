import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

import { buildOpenCodeCommand, createOpenCodeEventParser } from "./opencode-protocol"

const fixtureInput = {
  modelHint: null,
} as const

test("builds the pinned OpenCode command without shell interpolation", () => {
  assert.deepEqual(buildOpenCodeCommand(fixtureInput), {
    command: "opencode",
    args: ["run", "--format", "json"],
  })
})

test("qualifies the editable PPT MiniMax fallback model", () => {
  assert.deepEqual(buildOpenCodeCommand({ modelHint: "MiniMax-M2.7-highspeed" }), {
    command: "opencode",
    args: ["run", "--format", "json", "--model", "minimax/MiniMax-M2.7-highspeed"],
  })
})

test("qualifies the default editable PPT Grok model through PPToken", () => {
  assert.deepEqual(buildOpenCodeCommand({ modelHint: "grok-4.5" }), {
    command: "opencode",
    args: ["run", "--format", "json", "--model", "pptoken/grok-4.5"],
  })
})

test("parses real-shaped NDJSON incrementally and emits one terminal done", async () => {
  const fixture = await readFile(new URL("./fixtures/opencode-1.17.18-success.ndjson", import.meta.url), "utf8")
  const parser = createOpenCodeEventParser("run-1")
  const midpoint = Math.floor(fixture.length / 2)
  const events = [...parser.push(fixture.slice(0, midpoint)), ...parser.push(fixture.slice(midpoint)), ...parser.finish(), ...parser.finish()]

  assert.ok(events.some((event) => event.event === "text_delta" && event.delta === "fixture-ok"))
  assert.ok(events.some((event) => event.event === "tool_event" && event.tool === "read" && event.phase === "completed"))
  assert.ok(events.some((event) => event.event === "usage" && event.outputTokens === 4))
  assert.equal(events.filter((event) => event.event === "done").length, 1)
})

test("does not expose tool arguments or stderr in normalized events", () => {
  const parser = createOpenCodeEventParser("run-2")
  const events = parser.push('{"type":"tool_use","part":{"tool":"bad tool","state":{"status":"started"},"input":{"secret":"do-not-leak"}}}\n')
  assert.deepEqual(events, [{ event: "tool_event", tool: "bad_tool", phase: "started", runId: "run-2" }])
})

test("turns the third malformed line into a fatal parse error", () => {
  const parser = createOpenCodeEventParser("run-3")
  const events = parser.push("not-json\nnope\ninvalid\n")
  assert.equal(events.at(-1)?.event, "runtime_error")
  assert.equal((events.at(-1) as { code?: string } | undefined)?.code, "fatal_parse_error")
  assert.equal(parser.finish().some((event) => event.event === "done"), false)
})
