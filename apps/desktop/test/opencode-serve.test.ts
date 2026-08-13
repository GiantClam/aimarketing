import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { OpenCodeServeClient } from "../runtime/opencode-serve";

test("desktop OpenCode uses the shared synchronous serve-session contract", () => {
  const source = readFileSync(resolve(process.cwd(), "runtime/opencode-serve.ts"), "utf8");
  assert.match(source, /createOpenCodeServeSessionPayload/);
  assert.match(source, /createOpenCodeServePromptPayload/);
  assert.match(source, /openCodeServeSessionPath\(sessionId, workspacePath, "message"\)/);
  assert.match(source, /30 \* 60 \* 1000/);
  assert.match(source, /taskkill/);
  assert.match(source, /windowsHide: true/);
  assert.doesNotMatch(source, /prompt_async/);
});

test("OpenCode Serve recreates a lost persisted session and preserves streamed evidence", async () => {
  const runtimeDirectory = await mkdtemp(resolve(tmpdir(), "aimarketing-opencode-serve-"));
  const fixture = resolve(process.cwd(), "test/fixtures/fake-opencode-serve.mjs");
  const client = new OpenCodeServeClient(process.execPath, runtimeDirectory, [fixture]);
  const events: Array<{ event: string; [key: string]: unknown }> = [];
  const abortLog = resolve(runtimeDirectory, "abort.log");
  try {
    assert.deepEqual(await client.createOrResumeSession(runtimeDirectory, "retained-session", { model: "configured/model" }, { FAKE_OPENCODE_ABORT_LOG: abortLog }), { sessionId: "retained-session", recovered: false });
    const session = await client.createOrResumeSession(runtimeDirectory, "lost-session", { model: "configured/model" }, { FAKE_OPENCODE_ABORT_LOG: abortLog });
    assert.deepEqual(session, { sessionId: "recovered-session", recovered: true });
    const sessionId = session.sessionId;
    await client.prompt(sessionId, runtimeDirectory, "recovered-run", "Continue safely", { model: "configured/model" }, (event) => events.push(event));
    await new Promise<void>((resolveWait, reject) => {
      const deadline = Date.now() + 2_000;
      const timer = setInterval(() => {
        if (events.some((event) => event.event === "usage")) { clearInterval(timer); resolveWait(); }
        else if (Date.now() >= deadline) { clearInterval(timer); reject(new Error("fake_opencode_stream_timeout")); }
      }, 10);
    });
    assert.deepEqual(events.filter((event) => event.event === "text_delta").map((event) => event.delta), ["Recovered answer"]);
    assert.equal(events.some((event) => event.event === "tool_event" && event.tool === "write"), true);
    assert.equal(events.some((event) => event.event === "usage" && event.inputTokens === 11 && event.outputTokens === 7), true);
    assert.equal(events.some((event) => event.event === "done"), true);
    await client.abort(sessionId);
    assert.equal(await readFile(abortLog, "utf8"), "aborted");
    const failureEvents: Array<{ event: string; [key: string]: unknown }> = [];
    await client.prompt(sessionId, runtimeDirectory, "failed-run", "Trigger error", { model: "configured/model" }, (event) => failureEvents.push(event));
    assert.deepEqual(failureEvents.filter((event) => event.event === "runtime_error").map((event) => event.code), ["opencode_error"]);
    assert.equal(failureEvents.some((event) => event.event === "done"), false);
    const crashEvents: Array<{ event: string; [key: string]: unknown }> = [];
    await client.prompt(sessionId, runtimeDirectory, "crashed-run", "Trigger crash", { model: "configured/model" }, (event) => crashEvents.push(event));
    assert.deepEqual(crashEvents.filter((event) => event.event === "runtime_error").map((event) => event.code), ["opencode_serve_exited"]);
    assert.deepEqual(await client.createOrResumeSession(runtimeDirectory, undefined, { model: "configured/model" }, { FAKE_OPENCODE_ABORT_LOG: abortLog }), { sessionId: "recovered-session", recovered: false });
  } finally {
    await client.stop();
    await rm(runtimeDirectory, { recursive: true, force: true });
  }
});
