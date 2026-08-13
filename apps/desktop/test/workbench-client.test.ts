import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopWorkbenchClient } from "../src/workbench-client";

test("desktop WorkbenchClient adapts conversations, workflows and file actions through Tauri", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const bridge = {
    async invoke<T>(command: string, args?: Record<string, unknown>) {
      calls.push({ command, args });
      if (command === "list_conversations") return [{ id: "c1", title: "本地会话", updated_at: "2026-08-12T00:00:00Z", message_count: 2 }] as T;
      if (command === "list_messages") return [{ id: "m1", conversation_id: "c1", role: "user", content: "你好", created_at: "2026-08-12T00:00:00Z" }] as T;
      if (command === "list_workflows") return [{ id: "w1", name: "内容工作流", definition_json: JSON.stringify({ schemaVersion: 2, revision: 3, definitionHash: "hash-1", nodes: [{ nodeKey: "input" }], edges: [] }), updated_at: "2026-08-12T00:00:00Z" }] as T;
      if (command === "save_workflow") return { id: String((args?.input as { id: string }).id), name: String((args?.input as { name: string }).name), definition_json: String((args?.input as { definition_json: string }).definition_json), updated_at: "2026-08-12T00:00:00Z" } as T;
      return undefined as T;
    },
    async listen() { return () => undefined; },
  };
  const client = createDesktopWorkbenchClient(bridge, { go: () => undefined, replace: () => undefined, current: () => "/dashboard/ai" });
  assert.equal((await client.conversations.list())[0]?.title, "本地会话");
  assert.equal((await client.conversations.messages("c1"))[0]?.content, "你好");
  const listedWorkflow = (await client.workflows.list())[0];
  assert.equal(listedWorkflow?.title, "内容工作流");
  assert.equal(listedWorkflow?.definition.definitionHash, "hash-1");
  assert.equal(listedWorkflow?.definition.revision, 3);
  const savedWorkflow = await client.workflows.save({ id: "w2", title: "本地流程", definition: { nodes: [], edges: [] } });
  assert.equal(savedWorkflow.id, "w2");
  assert.equal(calls.at(-1)?.command, "save_workflow");
  await client.files.open("output/report.md", "text/markdown");
  assert.equal(calls.at(-1)?.command, "open_artifact_default");
  assert.equal(calls.at(-1)?.args?.mimeType, "text/markdown");
  await client.files.reveal("output/report.md", "text/markdown");
  assert.equal(calls.at(-1)?.command, "open_artifact");
  assert.equal(calls.at(-1)?.args?.mimeType, "text/markdown");
});
