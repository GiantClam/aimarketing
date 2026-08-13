import test from "node:test";
import assert from "node:assert/strict";
import { createMediaIdempotencyKey, normalizeMediaTask, recoverMediaJob } from "../src/index";

test("media recovery polls persisted provider tasks and never resubmits", () => {
  const record = { runId: "run", nodeId: "video", idempotencyKey: createMediaIdempotencyKey("run", "video", 1), provider: "bailian" as never, providerTaskId: "task-1", status: "interrupted" as const, submittedAt: "2026-01-01", updatedAt: "2026-01-01" };
  assert.equal(recoverMediaJob(record), "poll");
  assert.equal(createMediaIdempotencyKey("run", "video", 1), "run:video:1");
});

test("media task normalization bounds provider diagnostics", () => {
  const task = normalizeMediaTask({ providerTaskId: " task ", status: "succeeded", providerStatus: "x".repeat(500), outputs: [{ path: "a" }] });
  assert.equal(task.providerTaskId, "task"); assert.equal(task.providerStatus?.length, 160); assert.deepEqual(task.outputs, [{ path: "a" }]);
});
