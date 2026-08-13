import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopWorkbenchClient } from "../src/workbench-client";

test("desktop WorkbenchClient adapts conversations, workflows and file actions through Tauri", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const bridge = {
    async invoke<T>(command: string, args?: Record<string, unknown>) {
      calls.push({ command, args });
      if (command === "list_conversations") return [{ id: "c1", title: "本地会话", updated_at: "2026-08-12T00:00:00Z", message_count: 2, opencode_session_id: "session-c1" }] as T;
      if (command === "list_messages") return [{ id: "m1", conversation_id: "c1", role: "user", content: "你好", created_at: "2026-08-12T00:00:00Z" }] as T;
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
  assert.equal((await client.conversations.messages("c1"))[0]?.content, "你好");
  const listedWorkflow = (await client.workflows.list())[0];
  assert.equal(listedWorkflow?.title, "内容工作流");
  assert.equal(listedWorkflow?.definition.definitionHash, "hash-1");
  assert.equal(listedWorkflow?.definition.revision, 3);
  const savedWorkflow = await client.workflows.save({ id: "w2", title: "本地流程", definition: { nodes: [], edges: [] } });
  assert.equal(savedWorkflow.id, "w2");
  assert.equal(calls.at(-1)?.command, "save_workflow");
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
  const started = await client.runs.start({ id: "run-1", conversationId: "c1", prompt: "生成内容", model: "provider/model" });
  assert.equal(started.id, "run-1");
  assert.equal(calls.at(-1)?.command, "create_run");
  await client.runs.cancel("run-1");
  assert.equal((calls.at(-1)?.args?.message as { type?: string } | undefined)?.type, "run.cancel");
  await client.runs.emergencyStop("run-1");
  assert.equal((calls.at(-1)?.args?.message as { type?: string } | undefined)?.type, "run.emergency_stop");
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
  emit({ event: "text_delta", delta: "hello" });
  emit({ event: "tool_event", tool: "writer", message: "started" });
  emit({ event: "usage", provider: "fixture", model: "fixture/model", inputTokens: 3, outputTokens: 5, costUsd: 0.02 });
  emit({ event: "runtime_error", code: "workflow_cancelled" });
  emit({ event: "done" });
  assert.deepEqual(events, [
    { type: "text", delta: "hello" },
    { type: "tool", tool: "writer", phase: "started", message: "started" },
    { type: "usage", usage: { runId: "run-stream", provider: "fixture", model: "fixture/model", inputTokens: 3, outputTokens: 5, providerCost: 0.02 } },
    { type: "status", status: "cancelled" },
    { type: "status", status: "succeeded" },
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
