import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopChatTransport, createDesktopWorkbenchClient } from "../src/workbench-client";
import { createDesktopUIMessage } from "@aimarketing/workbench-client";

test("desktop WorkbenchClient adapts conversations, workflows and file actions through Tauri", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const bridge = {
    async invoke<T>(command: string, args?: Record<string, unknown>) {
      calls.push({ command, args });
      if (command === "list_conversations") return [{ id: "c1", title: "本地会话", updated_at: "2026-08-12T00:00:00Z", message_count: 2, opencode_session_id: "session-c1", agent_id: "executive-brand" }] as T;
      if (command === "list_messages") return [{
        id: "m1",
        conversation_id: "c1",
        role: "assistant",
        content: "已完成",
        parts_json: JSON.stringify([
          { id: "part-text", type: "text", text: "已完成" },
          { id: "part-tool", type: "tool", tool: "writer", status: "completed", sequence: 2, createdAt: "2026-08-12T00:00:02Z" },
          { id: "part-artifact", type: "artifact", artifact: { id: "a1", relativePath: "artifacts/report.md", title: "报告", mimeType: "text/markdown", byteLength: 12, sha256: "hash-a" }, sequence: 3, createdAt: "2026-08-12T00:00:03Z" },
        ]),
        created_at: "2026-08-12T00:00:00Z",
      }] as T;
      if (command === "list_workflows") return [{ id: "w1", name: "内容工作流", definition_json: JSON.stringify({ schemaVersion: 2, revision: 3, definitionHash: "hash-1", nodes: [{ nodeKey: "input" }], edges: [] }), updated_at: "2026-08-12T00:00:00Z" }] as T;
      if (command === "save_workflow") return { id: String((args?.input as { id: string }).id), name: String((args?.input as { name: string }).name), definition_json: String((args?.input as { definition_json: string }).definition_json), updated_at: "2026-08-12T00:00:00Z" } as T;
      if (command === "list_artifacts") return [{ id: "a1", relative_path: "artifacts/report.md", mime_type: "text/markdown", byte_length: 12, sha256: "hash-a", created_at: "2026-08-12T00:00:00Z", available: true }] as T;
      if (command === "list_runs") return [{ id: "r1", conversation_id: "c1", status: "succeeded", model: "fixture/model", started_at: "2026-08-12T00:00:00Z", finished_at: "2026-08-12T00:01:00Z" }] as T;
      if (command === "inspect_run") return { run: { id: "r1", conversation_id: "c1", status: "succeeded", model: "fixture/model", started_at: "2026-08-12T00:00:00Z", finished_at: "2026-08-12T00:01:00Z" }, nodes: [{ node_key: "writer", status: "succeeded", output_json: "{}", updated_at: "2026-08-12T00:01:00Z" }], events: [{ sequence: 1, event_type: "done", payload_json: "{}", created_at: "2026-08-12T00:01:00Z" }], usage: [{ provider: "fixture", model: "fixture/model", input_tokens: 2, output_tokens: 3, provider_cost: 0.01, estimated_cost: null, created_at: "2026-08-12T00:01:00Z" }] } as T;
      return undefined as T;
    },
    async listen() { return () => undefined; },
  };
  const client = createDesktopWorkbenchClient(bridge, { go: () => undefined, replace: () => undefined, current: () => "/dashboard/ai" });
  assert.equal((await client.conversations.list())[0]?.title, "本地会话");
  assert.equal((await client.conversations.list())[0]?.opencodeSessionId, "session-c1");
  assert.equal((await client.conversations.list())[0]?.agentId, "executive-brand");
  const message = (await client.conversations.messages("c1"))[0];
  assert.equal(message?.content, "已完成");
  assert.equal(message?.createdAt, "2026-08-12T00:00:00Z");
  assert.equal(message?.parts?.[1]?.type, "tool");
  assert.equal(message?.parts?.[1]?.sequence, 2);
  assert.equal(message?.parts?.[2]?.type, "artifact");
  const listedWorkflow = (await client.workflows.list())[0];
  assert.equal(listedWorkflow?.title, "内容工作流");
  assert.equal(listedWorkflow?.definition.definitionHash, "hash-1");
  assert.equal(listedWorkflow?.definition.revision, 3);
  const savedWorkflow = await client.workflows.save({ id: "w2", title: "本地流程", definition: { nodes: [], edges: [] } });
  assert.equal(savedWorkflow.id, "w2");
  assert.equal(calls.at(-1)?.command, "save_workflow");
  await client.workflows.remove("w1");
  assert.equal(calls.at(-1)?.command, "remove_workflow");
  assert.equal(calls.at(-1)?.args?.workflowId, "w1");
  assert.equal((await client.artifacts.list())[0]?.relativePath, "artifacts/report.md");
  await client.artifacts.remove("a1");
  assert.equal(calls.at(-1)?.command, "remove_artifact");
  assert.equal((await client.runs.list())[0]?.model, "fixture/model");
  const detail = await client.runs.inspect("r1");
  assert.equal(detail.nodes[0]?.nodeKey, "writer");
  assert.equal(detail.usage[0]?.providerCost, 0.01);
  await client.knowledge.open("notes/cited.md");
  assert.equal(calls.at(-1)?.command, "open_vault_file");
  await client.files.open("output/report.md", "text/markdown");
  assert.equal(calls.at(-1)?.command, "open_artifact_default");
  assert.equal(calls.at(-1)?.args?.mimeType, "text/markdown");
  await client.files.reveal("output/report.md", "text/markdown");
  assert.equal(calls.at(-1)?.command, "open_artifact");
  assert.equal(calls.at(-1)?.args?.mimeType, "text/markdown");
  await client.files.openFolder?.("output/report.md", "text/markdown");
  assert.equal(calls.at(-1)?.command, "open_artifact_folder");
  await client.files.openWith?.("output/report.md", "text/markdown");
  assert.equal(calls.at(-1)?.command, "open_artifact_with");
  const started = await client.runs.start({ id: "run-1", conversationId: "c1", prompt: "生成内容", model: "provider/model" });
  assert.equal(started.id, "run-1");
  assert.equal(calls.at(-1)?.command, "create_run");
  await client.runs.start({ id: "media-run-1", conversationId: null, prompt: "生成音频", model: "audio/model" });
  assert.equal(calls.at(-1)?.command, "create_run");
  assert.equal(calls.at(-1)?.args?.conversationId, null);
  await client.runs.cancel("run-1");
  assert.equal((calls.at(-1)?.args?.message as { type?: string } | undefined)?.type, "run.cancel");
  await client.runs.emergencyStop("run-1");
  assert.equal((calls.at(-1)?.args?.message as { type?: string } | undefined)?.type, "run.emergency_stop");
});

test("desktop WorkbenchClient restores UIMessage parts without projecting away metadata or media", async () => {
  const bridge = {
    async invoke<T>(command: string) {
      if (command !== "list_messages") return undefined as T;
      return [{
        id: "ui-m1",
        conversation_id: "c-ui",
        role: "assistant",
        content: "",
        parts_json: JSON.stringify([
          { type: "text", text: "流式内容", state: "done", providerMetadata: { aimarketing: { partId: "text:1", sequence: 1 } } },
          { type: "data-media", id: "media:1", data: { kind: "image", title: "封面", mimeType: "image/png", relativePath: "artifacts/cover.png" } },
        ]),
        metadata_json: JSON.stringify({ conversationId: "c-ui", runId: "run-ui", providerId: "deepseek", modelId: "deepseek-v4-flash", modelLocked: true }),
        created_at: "2026-08-26T00:00:00Z",
      }] as T;
    },
    async listen() { return () => undefined; },
  };
  const client = createDesktopWorkbenchClient(bridge, { go: () => undefined, replace: () => undefined, current: () => "/dashboard/ai" });
  const uiMessage = (await client.conversations.uiMessages("c-ui"))[0];
  assert.equal(uiMessage?.metadata?.modelId, "deepseek-v4-flash");
  assert.equal(uiMessage?.parts[1]?.type, "data-media");
  const projected = (await client.conversations.messages("c-ui"))[0];
  assert.equal(projected?.content, "流式内容");
  assert.equal(projected?.parts?.[0]?.type, "text");
});

test("desktop ChatTransport forwards the locked config model and persists the UIMessage user turn", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const started: string[] = [];
  const bridge = {
    async invoke<T>(command: string, args?: Record<string, unknown>) { calls.push({ command, args }); return undefined as T; },
    async listen() { return () => undefined; },
  };
  const workbenchClient = { runs: { subscribe: () => () => undefined } } as never;
  const transport = createDesktopChatTransport(bridge, workbenchClient, {
    resolveSessionId: async () => "session-c1",
    resolveProvider: () => ({ id: "deepseek", model: "deepseek-v4-flash" }),
    onRunStarted: (runId) => started.push(runId),
  });
  const message = createDesktopUIMessage({ id: "ui-user-1", role: "user", conversationId: "c1", content: "你好", providerId: "deepseek", modelId: "deepseek-v4-flash" });
  await transport.sendMessages({ trigger: "submit-message", chatId: "c1", messageId: undefined, messages: [message], abortSignal: undefined });
  assert.deepEqual(calls.map((call) => call.command), ["create_run", "append_message", "host_start", "host_send"]);
  assert.equal((calls[0]?.args as { model?: string }).model, "deepseek-v4-flash");
  const persisted = calls[1]?.args?.input as { metadata_json?: string };
  assert.match(String(persisted.metadata_json), /deepseek-v4-flash/);
  assert.equal(started.length, 1);
});

test("desktop ChatTransport lets the config/session adapter materialize a draft conversation before prompting", async () => {
  const calls: string[] = [];
  const bridge = {
    async invoke<T>(command: string) { calls.push(command); return undefined as T; },
    async listen() { return () => undefined; },
  };
  let ensured: { chatId: string; sessionId: string; model?: string } | undefined;
  const workbenchClient = { runs: { subscribe: () => () => undefined } } as never;
  const transport = createDesktopChatTransport(bridge, workbenchClient, {
    resolveSessionId: async (chatId) => chatId,
    resolveProvider: () => ({ id: "deepseek", model: "deepseek-v4-flash" }),
    ensureSession: async ({ chatId, sessionId, message }) => {
      ensured = { chatId, sessionId, model: message.metadata?.modelId };
      return "session-materialized";
    },
  });
  const message = createDesktopUIMessage({ id: "draft-user-1", role: "user", conversationId: "draft-chat-1", content: "首轮消息", providerId: "deepseek", modelId: "deepseek-v4-flash" });
  await transport.sendMessages({ trigger: "submit-message", chatId: "draft-chat-1", messageId: undefined, messages: [message], abortSignal: undefined });
  assert.deepEqual(ensured, { chatId: "draft-chat-1", sessionId: "draft-chat-1", model: "deepseek-v4-flash" });
  assert.deepEqual(calls, ["create_run", "append_message", "host_start", "host_send"]);
});

test("desktop WorkbenchClient streams text, tool, usage, cancellation and terminal events", async () => {
  let listener: ((payload: { raw: string }) => void) | undefined;
  const bridge = {
    async invoke<T>() { return undefined as T; },
    async listen<T>(_event: string, callback: (payload: T) => void) {
      listener = callback as unknown as (payload: { raw: string }) => void;
      return () => { listener = undefined; };
    },
  };
  const client = createDesktopWorkbenchClient(bridge, { go: () => undefined, replace: () => undefined, current: () => "/dashboard/ai" });
  const events: Array<Record<string, unknown>> = [];
  const dispose = client.runs.subscribe("run-stream", (event) => events.push(event as unknown as Record<string, unknown>));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(listener);
  const emit = (event: Record<string, unknown>) => {
    const body = JSON.stringify({ version: 1, requestId: "request-1", ok: true, data: { event: { runId: "run-stream", ...event } } });
    listener?.({ raw: `${Buffer.byteLength(body, "utf8")}:${body}` });
  };
  listener?.({ raw: "not-a-frame" });
  emit({ event: "text_delta", delta: "hello", sequence: 1, createdAt: "2026-08-12T00:00:01Z" });
  emit({ event: "reasoning_delta", delta: "planning", sequence: 2, createdAt: "2026-08-12T00:00:02Z" });
  emit({ event: "tool_event", tool: "writer", phase: "completed", message: "finished", sequence: 3, createdAt: "2026-08-12T00:00:03Z" });
  emit({ event: "artifact", artifact: { id: "a1", relativePath: "artifacts/report.md", title: "报告", mimeType: "text/markdown", byteLength: 12, sha256: "hash-a" }, sequence: 4, createdAt: "2026-08-12T00:00:04Z" });
  emit({ event: "usage", provider: "fixture", model: "fixture/model", inputTokens: 3, outputTokens: 5, costUsd: 0.02, sequence: 5, createdAt: "2026-08-12T00:00:05Z" });
  emit({ event: "runtime_error", code: "workflow_cancelled", sequence: 6, createdAt: "2026-08-12T00:00:06Z" });
  emit({ event: "done", sequence: 7, createdAt: "2026-08-12T00:00:07Z" });
  assert.deepEqual(events, [
    { type: "text", delta: "hello", sequence: 1, createdAt: "2026-08-12T00:00:01Z" },
    { type: "reasoning", delta: "planning", sequence: 2, createdAt: "2026-08-12T00:00:02Z" },
    { type: "tool", tool: "writer", phase: "completed", message: "finished", sequence: 3, createdAt: "2026-08-12T00:00:03Z" },
    { type: "artifact", artifact: { id: "a1", relativePath: "artifacts/report.md", title: "报告", mimeType: "text/markdown", byteLength: 12, sha256: "hash-a" }, sequence: 4, createdAt: "2026-08-12T00:00:04Z" },
    { type: "usage", usage: { runId: "run-stream", provider: "fixture", model: "fixture/model", inputTokens: 3, outputTokens: 5, providerCost: 0.02 }, sequence: 5, createdAt: "2026-08-12T00:00:05Z" },
    { type: "status", status: "cancelled", sequence: 6, createdAt: "2026-08-12T00:00:06Z" },
    { type: "status", status: "succeeded", sequence: 7, createdAt: "2026-08-12T00:00:07Z" },
  ]);
  dispose();
  assert.equal(listener, undefined);
});

test("desktop WorkbenchClient routes Obsidian index and search through host RPC", async () => {
  let listener: ((payload: { raw: string }) => void) | undefined;
  const calls: string[] = [];
  const bridge = {
    async invoke<T>(command: string, args?: Record<string, unknown>) {
      calls.push(command);
      if (command === "host_send") {
        const message = args?.message as { requestId: string; type: string };
        const data = message.type === "knowledge.index"
          ? { generation: 2, documents: 3, chunks: 8, indexPath: "vault/.index", semantic: true, embeddingModel: "local-hash-384-v1", embeddingDimension: 384, watcher: "active" }
          : { indexPath: "vault/.index", query: "增长", results: [{ chunkId: "chunk-1", documentPath: "AI Marketing/增长.md", heading: "指标", excerpt: "转化率", score: 0.9, lineStart: 4, lineEnd: 5 }] };
        const body = JSON.stringify({ version: 1, requestId: message.requestId, ok: true, data });
        queueMicrotask(() => listener?.({ raw: `${Buffer.byteLength(body, "utf8")}:${body}` }));
      }
      return undefined as T;
    },
    async listen<T>(_event: string, callback: (payload: T) => void) {
      listener = callback as unknown as (payload: { raw: string }) => void;
      return () => { listener = undefined; };
    },
  };
  const client = createDesktopWorkbenchClient(bridge, { go: () => undefined, replace: () => undefined, current: () => "/dashboard/knowledge-base" });
  const index = await client.knowledge.index({ vaultPath: "vault", indexPath: "vault/.index", embedding: { mode: "local", model: "local-hash-384-v1" } });
  assert.equal(index.documents, 3);
  const results = await client.knowledge.search({ indexPath: "vault/.index", query: "增长", limit: 8, embedding: { mode: "local", model: "local-hash-384-v1" } });
  assert.equal(results[0]?.documentPath, "AI Marketing/增长.md");
  assert.deepEqual(calls, ["host_start", "host_send", "host_start", "host_send"]);
  assert.equal(listener, undefined);
});
