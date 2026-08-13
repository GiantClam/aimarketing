import test from "node:test";
import assert from "node:assert/strict";
import { OpenCodeSessionClient, type OpenCodeSessionTransport } from "../src/index";

test("session client keeps conversation/session mapping on a host transport", async () => {
  const calls: string[] = [];
  const transport: OpenCodeSessionTransport = {
    request: async (method) => { calls.push(method); return method === "session.create" ? { conversationId: "c", sessionId: "s", workspacePath: "p" } : { runId: "r" }; },
    subscribe: (_runId, onEvent) => { onEvent({ event: "done", runId: "r" }); return () => undefined; },
  };
  const client = new OpenCodeSessionClient(transport);
  const session = await client.create("c", "p");
  const run = await client.prompt(session, "你好");
  assert.equal(run.runId, "r"); assert.deepEqual(calls, ["session.create", "session.prompt"]);
});
