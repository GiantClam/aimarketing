import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopWorkbenchClient } from "../src/workbench-client";

test("desktop WorkbenchClient adapts conversations and file actions through Tauri", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const bridge = {
    async invoke<T>(command: string, args?: Record<string, unknown>) {
      calls.push({ command, args });
      if (command === "list_conversations") return [{ id: "c1", title: "本地会话", updated_at: "2026-08-12T00:00:00Z", message_count: 2 }] as T;
      if (command === "list_messages") return [{ id: "m1", conversation_id: "c1", role: "user", content: "你好", created_at: "2026-08-12T00:00:00Z" }] as T;
      return undefined as T;
    },
    async listen() { return () => undefined; },
  };
  const client = createDesktopWorkbenchClient(bridge, { go: () => undefined, replace: () => undefined, current: () => "/dashboard/ai" });
  assert.equal((await client.conversations.list())[0]?.title, "本地会话");
  assert.equal((await client.conversations.messages("c1"))[0]?.content, "你好");
  await client.files.open("output/report.md", "text/markdown");
  assert.equal(calls.at(-1)?.command, "open_artifact_default");
  assert.equal(calls.at(-1)?.args?.mimeType, "text/markdown");
  await client.files.reveal("output/report.md", "text/markdown");
  assert.equal(calls.at(-1)?.command, "open_artifact");
  assert.equal(calls.at(-1)?.args?.mimeType, "text/markdown");
});
