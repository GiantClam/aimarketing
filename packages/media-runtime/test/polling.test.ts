import test from "node:test";
import assert from "node:assert/strict";
import { runMediaJob, type CancellationPort, type MediaProviderAdapter } from "../src/index";

test("media runner persists submission then polls without resubmitting", async () => {
  let submits = 0; let polls = 0; const updates: string[] = [];
  const adapter: MediaProviderAdapter = { provider: "fake" as never, execute: async () => { submits += 1; return { providerTaskId: "task-1", status: "queued", outputs: [] }; }, query: async () => { polls += 1; return { providerTaskId: "task-1", status: polls > 1 ? "succeeded" : "running", outputs: polls > 1 ? [{ path: "out.mp4" }] : [] }; } };
  const cancellation: CancellationPort = { throwIfCancelled: () => undefined };
  const result = await runMediaJob(adapter, { provider: "fake" as never, modelId: "video", input: {} }, cancellation, { pollIntervalMs: 10, onSubmitted: (task) => { updates.push(task.providerTaskId); }, onUpdate: (task) => { updates.push(task.status); } });
  assert.equal(result.status, "succeeded"); assert.equal(submits, 1); assert.equal(polls, 2); assert.deepEqual(updates, ["task-1", "queued", "running", "succeeded"]);
});

test("media runner asks the provider to cancel a submitted task", async () => {
  const controller = new AbortController(); let cancelled = "";
  const adapter: MediaProviderAdapter = {
    provider: "fake" as never,
    execute: async () => ({ providerTaskId: "task-cancel", status: "running", outputs: [] }),
    query: async () => ({ providerTaskId: "task-cancel", status: "running", outputs: [] }),
    cancel: async (taskId, cancelPort) => { cancelPort.throwIfCancelled(); cancelled = taskId; return { providerTaskId: taskId, status: "cancelled", outputs: [] }; },
  };
  const cancellation: CancellationPort = { signal: controller.signal, throwIfCancelled: () => { if (controller.signal.aborted) throw new Error("cancelled"); } };
  const pending = runMediaJob(adapter, { provider: "fake" as never, modelId: "video", input: {} }, cancellation, { pollIntervalMs: 10 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(cancelled, "task-cancel");
});

test("media runner resumes a persisted provider task without submitting again", async () => {
  let submits = 0;
  let polls = 0;
  const adapter: MediaProviderAdapter = {
    provider: "fake" as never,
    execute: async () => { submits += 1; return { providerTaskId: "unexpected", status: "queued", outputs: [] }; },
    query: async (taskId) => { polls += 1; return { providerTaskId: taskId, status: "succeeded", outputs: [{ url: "https://example.test/result.mp4" }] }; },
  };
  const cancellation: CancellationPort = { throwIfCancelled: () => undefined };
  const result = await runMediaJob(adapter, { provider: "fake" as never, modelId: "video", input: {} }, cancellation, { pollIntervalMs: 1, initialTask: { providerTaskId: "persisted-task", status: "queued", outputs: [] } });
  assert.equal(result.providerTaskId, "persisted-task");
  assert.equal(result.status, "succeeded");
  assert.equal(submits, 0);
  assert.equal(polls, 1);
});

test("media runner surfaces a bounded polling timeout", async () => {
  const adapter: MediaProviderAdapter = {
    provider: "fake" as never,
    execute: async () => ({ providerTaskId: "task-timeout", status: "running", outputs: [] }),
    query: async () => ({ providerTaskId: "task-timeout", status: "running", outputs: [] }),
  };
  const cancellation: CancellationPort = { throwIfCancelled: () => undefined };
  await assert.rejects(
    runMediaJob(adapter, { provider: "fake" as never, modelId: "image", input: {} }, cancellation, { pollIntervalMs: 10, timeoutMs: 1000 }),
    /media_poll_timeout/,
  );
});
