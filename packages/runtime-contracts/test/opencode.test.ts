import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOpenCodeCommand, createOpenCodeEventParser, createOpenCodeServeEventState, normalizeOpenCodeServeEvent } from "../src/opencode";

test("builds an explicit OpenCode model command", () => {
  assert.deepEqual(buildOpenCodeCommand({ modelHint: "gpt-5.4" }), {
    command: "opencode",
    args: ["run", "--format", "json", "--model", "pptoken/gpt-5.4"],
  });
});

test("parses UTF-8 fragmented text, tool, and usage events", () => {
  const parser = createOpenCodeEventParser("run-1");
  const chunks = [
    '{"type":"text","part":{"text":"你好"}}\n{"type":"tool_use","part":{"tool":"bash"',
    ',"state":{"status":"completed","title":"完成"}}}\n{"type":"step_finish","part":{"tokens":{"input":3,"output":5},"cost":0.01}}\n',
  ];
  const events = chunks.flatMap((chunk) => parser.push(chunk)).concat(parser.finish());
  assert.deepEqual(events.map((event) => event.event), ["text_delta", "tool_event", "usage", "done"]);
  assert.equal(events[0]?.event === "text_delta" ? events[0].delta : "", "你好");
});

test("keeps unknown events bounded and does not throw", () => {
  const parser = createOpenCodeEventParser("run-2");
  const events = parser.push('{"type":"future_event","payload":"x"}\n').concat(parser.finish());
  assert.equal(events[0]?.event, "runtime_warning");
  assert.equal(events.at(-1)?.event, "done");
});

test("normalizes OpenCode serve SSE payloads once for desktop and Railway hosts", () => {
  const state = createOpenCodeServeEventState();
  const userMessage = normalizeOpenCodeServeEvent("run-3", {
    payload: { type: "message.updated", properties: { sessionID: "session-3", info: { id: "message-user", role: "user" } } },
  }, state);
  const ignoredUserPart = normalizeOpenCodeServeEvent("run-3", {
    payload: { type: "message.part.updated", properties: { sessionID: "session-3", part: { id: "part-user", messageID: "message-user", type: "text", text: "do not echo" } } },
  }, state);
  const initial = normalizeOpenCodeServeEvent("run-3", {
    payload: { type: "message.part.updated", properties: { sessionID: "session-3", part: { id: "part-assistant", messageID: "message-assistant", type: "text", text: "你好" } } },
  }, state);
  const updated = normalizeOpenCodeServeEvent("run-3", {
    payload: { type: "message.part.updated", properties: { sessionID: "session-3", part: { id: "part-assistant", messageID: "message-assistant", type: "text", text: "你好，世界" } } },
  }, state);
  const tool = normalizeOpenCodeServeEvent("run-3", {
    payload: { type: "message.part.updated", properties: { sessionID: "session-3", part: { id: "tool-1", type: "tool", tool: "shell", state: { status: "completed", title: "done" } } } },
  }, state);
  const usage = normalizeOpenCodeServeEvent("run-3", {
    payload: { type: "message.part.updated", properties: { sessionID: "session-3", part: { type: "step_finish", tokens: { input: 3, output: 5 }, cost: 0.01 } } },
  }, state);
  const failure = normalizeOpenCodeServeEvent("run-3", {
    payload: { type: "session.error", properties: { sessionID: "session-3", error: { message: "broken" } } },
  }, state);
  assert.equal(userMessage.sessionId, "session-3");
  assert.deepEqual(ignoredUserPart.events, []);
  assert.deepEqual(initial.events, [{ event: "text_delta", delta: "你好", runId: "run-3" }]);
  assert.deepEqual(updated.events, [{ event: "text_delta", delta: "，世界", runId: "run-3" }]);
  assert.deepEqual(tool.events, [{ event: "tool_event", tool: "shell", toolCallId: "tool-1", phase: "completed", message: "done", runId: "run-3" }]);
  assert.deepEqual(usage.events, [{ event: "usage", inputTokens: 3, outputTokens: 5, costUsd: 0.01, runId: "run-3" }]);
  assert.deepEqual(failure.terminalError, { code: "opencode_error", message: "broken", retryable: true });
});
