import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildOpenCodeCommand,
  createOpenCodeEventParser,
  createOpenCodeServeEventState,
  createOpenCodeServePromptPayload,
  createOpenCodeServeSessionPayload,
  normalizeOpenCodeServeEvent,
  openCodeServeSessionPath,
  readOpenCodeServeSessionId,
} from "../src/opencode";

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

test("parses reasoning from the line-oriented OpenCode stream separately from text", () => {
  const parser = createOpenCodeEventParser("run-reasoning-line");
  const events = parser.push('{"type":"reasoning","part":{"text":"planning"}}\n{"type":"text","part":{"text":"你好"}}\n').concat(parser.finish());
  assert.deepEqual(events.map((event) => event.event), ["reasoning_delta", "text_delta", "done"]);
  assert.equal(events[0]?.event === "reasoning_delta" ? events[0].delta : "", "planning");
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
  assert.equal(userMessage.messageId, "message-user");
  assert.equal(userMessage.messageRole, "user");
  assert.deepEqual(ignoredUserPart.events, []);
  assert.equal(initial.messageId, "message-assistant");
  assert.deepEqual(initial.events, [{ event: "text_delta", delta: "你好", runId: "run-3" }]);
  assert.deepEqual(updated.events, [{ event: "text_delta", delta: "，世界", runId: "run-3" }]);
  assert.deepEqual(tool.events, [{ event: "tool_event", tool: "shell", toolCallId: "tool-1", phase: "completed", message: "done", runId: "run-3" }]);
  assert.deepEqual(usage.events, [{ event: "usage", inputTokens: 3, outputTokens: 5, costUsd: 0.01, runId: "run-3" }]);
  assert.deepEqual(failure.terminalError, { code: "opencode_error", message: "broken", retryable: true });
});

test("normalizes OpenCode message.part.delta streaming text", () => {
  const state = createOpenCodeServeEventState();
  normalizeOpenCodeServeEvent("run-delta", {
    payload: { type: "message.updated", properties: { sessionID: "session-delta", info: { id: "assistant-delta", role: "assistant" } } },
  }, state);
  const first = normalizeOpenCodeServeEvent("run-delta", {
    payload: { type: "message.part.delta", properties: { sessionID: "session-delta", messageID: "assistant-delta", partID: "part-delta", field: "text", delta: "桌面端" } },
  }, state);
  const second = normalizeOpenCodeServeEvent("run-delta", {
    payload: { type: "message.part.delta", properties: { sessionID: "session-delta", messageID: "assistant-delta", partID: "part-delta", field: "text", delta: "响应" } },
  }, state);
  assert.deepEqual(first.events, [{ event: "text_delta", delta: "桌面端", runId: "run-delta" }]);
  assert.deepEqual(second.events, [{ event: "text_delta", delta: "响应", runId: "run-delta" }]);
});

test("keeps OpenCode reasoning deltas out of assistant text while preserving them as process events", () => {
  const state = createOpenCodeServeEventState();
  normalizeOpenCodeServeEvent("run-reasoning", {
    payload: { type: "message.updated", properties: { sessionID: "session-reasoning", info: { id: "assistant-reasoning", role: "assistant" } } },
  }, state);
  const reasoning = normalizeOpenCodeServeEvent("run-reasoning", {
    payload: { type: "message.part.delta", properties: { sessionID: "session-reasoning", messageID: "assistant-reasoning", partID: "part-reasoning", field: "reasoning", delta: "**Preparing concise Chinese greeting response**" } },
  }, state);
  const text = normalizeOpenCodeServeEvent("run-reasoning", {
    payload: { type: "message.part.delta", properties: { sessionID: "session-reasoning", messageID: "assistant-reasoning", partID: "part-text", field: "text", delta: "你好" } },
  }, state);
  assert.deepEqual(reasoning.events, [{ event: "reasoning_delta", delta: "**Preparing concise Chinese greeting response**", runId: "run-reasoning" }]);
  assert.deepEqual(text.events, [{ event: "text_delta", delta: "你好", runId: "run-reasoning" }]);
  const updatedReasoning = normalizeOpenCodeServeEvent("run-reasoning", {
    payload: { type: "message.part.updated", properties: { sessionID: "session-reasoning", part: { id: "part-updated-reasoning", messageID: "assistant-reasoning", type: "reasoning", text: "先判断用户语言" } } },
  }, state);
  assert.deepEqual(updatedReasoning.events, [{ event: "reasoning_delta", delta: "先判断用户语言", runId: "run-reasoning" }]);
});

test("normalizes camel-case and nested OpenCode serve session identifiers", () => {
  const state = createOpenCodeServeEventState();
  const camelCase = normalizeOpenCodeServeEvent("run-4", {
    payload: { type: "message.updated", properties: { sessionId: "session-camel", info: { id: "assistant", role: "assistant" } } },
  }, state);
  const nested = normalizeOpenCodeServeEvent("run-4", {
    payload: { type: "message.part.updated", properties: { info: { sessionId: "session-nested" }, part: { id: "part", messageID: "assistant", type: "text", text: "visible" } } },
  }, state);
  assert.equal(camelCase.sessionId, "session-camel");
  assert.equal(camelCase.messageId, "assistant");
  assert.equal(camelCase.messageRole, "assistant");
  assert.equal(nested.sessionId, "session-nested");
  assert.equal(nested.messageId, "assistant");
  assert.deepEqual(nested.events, [{ event: "text_delta", delta: "visible", runId: "run-4" }]);
});

test("builds identical OpenCode serve session and prompt requests for every host", () => {
  assert.equal(openCodeServeSessionPath("session / 中文", "C:\\Vault 中文", "message"), "/session/session%20%2F%20%E4%B8%AD%E6%96%87/message?directory=C%3A%5CVault%20%E4%B8%AD%E6%96%87");
  assert.deepEqual(createOpenCodeServeSessionPayload({
    title: "AI Marketing Desktop",
    providerId: "ollama",
    modelId: "qwen3:8b",
    metadata: { source: "desktop" },
  }), {
    title: "AI Marketing Desktop",
  });
  assert.deepEqual(createOpenCodeServePromptPayload({
    providerId: "ollama",
    modelId: "qwen3:8b",
    prompt: "你好",
    systemPrompt: "system",
    variant: "high",
  }), {
    agent: "build",
    model: { providerID: "ollama", modelID: "qwen3:8b" },
    variant: "high",
    system: "system",
    parts: [{ type: "text", text: "你好" }],
  });
  assert.equal(readOpenCodeServeSessionId({ data: { id: "session-1" } }), "session-1");
  assert.equal(readOpenCodeServeSessionId({ id: "" }), "");
});
