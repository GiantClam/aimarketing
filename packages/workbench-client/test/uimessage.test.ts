import test from "node:test";
import assert from "node:assert/strict";
import { applyWorkbenchRunEventToUIMessage, createDesktopUIMessage, createDesktopRunTransport, desktopUIMessageStorage, desktopUIMessageText, parseDesktopUIMessage, workbenchEventToUIMessageChunks, type DesktopUIMessage, type WorkbenchRunEvent } from "../src/index";

function event(input: Parameters<typeof applyWorkbenchRunEventToUIMessage>[1]) {
  return input;
}

test("creates a UIMessage with locked execution metadata", () => {
  const message = createDesktopUIMessage({ id: "assistant-1", role: "assistant", conversationId: "conversation-1", runId: "run-1", providerId: "grok", modelId: "grok-4", route: "/chat" });
  assert.equal(message.metadata?.providerId, "grok");
  assert.equal(message.metadata?.modelId, "grok-4");
  assert.equal(message.metadata?.modelLocked, true);
});

test("merges streaming text immutably and preserves sequence ordering", () => {
  const initial = createDesktopUIMessage({ id: "assistant-1", role: "assistant", conversationId: "conversation-1", runId: "run-1" });
  const first = applyWorkbenchRunEventToUIMessage(initial, event({ type: "text", delta: "hello", sequence: 1 }));
  const second = applyWorkbenchRunEventToUIMessage(first, event({ type: "text", delta: " world", sequence: 2 }));
  assert.equal(desktopUIMessageText(second), "hello world");
  assert.equal(desktopUIMessageText(initial), "");
  assert.equal(applyWorkbenchRunEventToUIMessage(second, event({ type: "text", delta: " duplicate", sequence: 2 })), second);
});

test("does not regress a completed tool on duplicate or late started events", () => {
  let message = createDesktopUIMessage({ id: "assistant-1", role: "assistant", conversationId: "conversation-1", runId: "run-1" });
  message = applyWorkbenchRunEventToUIMessage(message, event({ type: "tool_call", toolName: "search", toolCallId: "tool-1", phase: "started", input: { query: "ai" }, sequence: 1 }));
  message = applyWorkbenchRunEventToUIMessage(message, event({ type: "tool_call", toolName: "search", toolCallId: "tool-1", phase: "completed", output: ["result"], sequence: 2 }));
  const completed = message;
  const late = applyWorkbenchRunEventToUIMessage(message, event({ type: "tool_call", toolName: "search", toolCallId: "tool-1", phase: "started", input: { query: "ai" }, sequence: 3 }));
  assert.deepEqual(late.parts, completed.parts);
});

test("emits AI SDK UI message chunks for native and typed data parts", () => {
  assert.deepEqual(workbenchEventToUIMessageChunks({ type: "text", delta: "hi" }), [{ type: "text-delta", id: "text:assistant", delta: "hi" }]);
  const chunks = workbenchEventToUIMessageChunks({ type: "artifact", artifact: { id: "artifact-1", relativePath: "assets/a.png", title: "a.png", mimeType: "image/png", byteLength: 1, sha256: "hash" } });
  assert.equal(chunks[0]?.type, "data-artifact");
});

test("serializes and restores UIMessage parts and metadata without losing text", () => {
  const message = createDesktopUIMessage({ id: "assistant-1", role: "assistant", conversationId: "conversation-1", runId: "run-1", providerId: "deepseek", modelId: "deepseek-v4-flash", content: "已完成" });
  const stored = desktopUIMessageStorage(message);
  const restored = parseDesktopUIMessage({ id: message.id, role: message.role, parts: JSON.parse(stored.parts_json), metadata: JSON.parse(stored.metadata_json) });
  assert.equal(desktopUIMessageText(restored), "已完成");
  assert.equal(restored.metadata?.modelId, "deepseek-v4-flash");
});

test("adapts a run event sequence to an AI SDK readable stream", async () => {
  let listener: ((event: WorkbenchRunEvent) => void) | undefined;
  const transport = createDesktopRunTransport({
    start: async () => ({ runId: "run-1" }),
    subscribe: (_runId, onEvent) => { listener = onEvent; return () => { listener = undefined; }; },
  });
  const user = createDesktopUIMessage({ id: "user-1", role: "user", conversationId: "conversation-1", content: "hello" });
  const stream = await transport.sendMessages({ trigger: "submit-message", chatId: "conversation-1", messageId: undefined, messages: [user], abortSignal: undefined });
  const reader = stream.getReader();
  listener?.({ type: "text", delta: "hi", sequence: 1 });
  listener?.({ type: "status", status: "succeeded", sequence: 2 });
  const chunks = [];
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
  }
  assert.deepEqual(chunks, [
    { type: "start", messageId: "assistant-run-1" },
    { type: "text-start", id: "text:assistant" },
    { type: "text-delta", id: "text:assistant", delta: "hi" },
    { type: "data-status", id: "status:run", data: { status: "completed" } },
    { type: "text-end", id: "text:assistant" },
    { type: "finish", finishReason: "stop" },
  ]);
});

test("replays every UIMessage part family into stable native or typed chunks", () => {
  const events: WorkbenchRunEvent[] = [
    { type: "text", delta: "正文" },
    { type: "reasoning", delta: "推理" },
    { type: "tool_call", toolName: "search", toolCallId: "tool-1", phase: "started", input: { query: "AI" } },
    { type: "tool_call", toolName: "search", toolCallId: "tool-1", phase: "completed", output: { count: 1 } },
    { type: "source", source: { id: "source-1", title: "文档", href: "https://example.com" } },
    { type: "attachment", attachment: { id: "file-1", name: "brief.pdf", mediaType: "application/pdf", status: "ready" } },
    { type: "media", media: { artifactId: "media-1", kind: "image", title: "封面", mimeType: "image/png", relativePath: "artifacts/cover.png", previewable: true } },
    { type: "artifact", artifact: { id: "artifact-1", relativePath: "artifacts/a.png", title: "封面", mimeType: "image/png", byteLength: 1, sha256: "hash" } },
  ];
  const chunks = events.flatMap(workbenchEventToUIMessageChunks);
  assert.deepEqual(chunks.map((chunk) => chunk.type), [
    "text-delta",
    "reasoning-delta",
    "tool-input-available",
    "tool-output-available",
    "source-url",
    "data-attachment",
    "data-media",
    "data-artifact",
  ]);
  assert.equal(chunks[2]?.type === "tool-input-available" && chunks[2].toolCallId, "tool-1");
  assert.equal(chunks[4]?.type === "source-url" && chunks[4].sourceId, "source-1");
  assert.equal(chunks[6]?.type === "data-media" && chunks[6].data.kind, "image");
  assert.equal(chunks[7]?.type === "data-artifact" && chunks[7].data.mimeType, "image/png");
});

test("reconstructs the same rich UIMessage after event replay and persistence", () => {
  const events: WorkbenchRunEvent[] = [
    { type: "text", delta: "结果", sequence: 1, createdAt: "2026-08-26T00:00:01Z" },
    { type: "reasoning", delta: "已分析", sequence: 2, createdAt: "2026-08-26T00:00:02Z" },
    { type: "tool_call", toolName: "writer", toolCallId: "tool-1", phase: "started", input: { topic: "AI" }, sequence: 3 },
    { type: "tool_call", toolName: "writer", toolCallId: "tool-1", phase: "completed", output: { path: "artifacts/result.md" }, sequence: 4 },
    { type: "source", source: { id: "source-1", title: "资料", href: "https://example.com" }, sequence: 5 },
    { type: "attachment", attachment: { id: "file-1", name: "brief.pdf", mediaType: "application/pdf", status: "ready" }, sequence: 6 },
    { type: "media", media: { artifactId: "media-1", kind: "image", title: "封面", mimeType: "image/png", relativePath: "artifacts/cover.png" }, sequence: 7 },
    { type: "artifact", artifact: { id: "artifact-1", relativePath: "artifacts/result.md", title: "结果", mimeType: "text/markdown", byteLength: 8, sha256: "hash" }, sequence: 8 },
    { type: "status", status: "succeeded", sequence: 9 },
  ];
  const initial = createDesktopUIMessage({ id: "assistant-replay", role: "assistant", conversationId: "conversation-replay", runId: "run-replay", providerId: "deepseek", modelId: "deepseek-v4-flash" });
  const replayed = events.reduce(applyWorkbenchRunEventToUIMessage, initial);
  const stored = desktopUIMessageStorage(replayed);
  const restored = parseDesktopUIMessage({ id: replayed.id, role: replayed.role, parts: JSON.parse(stored.parts_json), metadata: JSON.parse(stored.metadata_json) });
  assert.deepEqual(JSON.parse(JSON.stringify(restored.parts)), JSON.parse(JSON.stringify(replayed.parts)));
  assert.equal(restored.metadata?.lastSequence, 9);
  assert.equal(restored.metadata?.runStatus, "completed");
});
