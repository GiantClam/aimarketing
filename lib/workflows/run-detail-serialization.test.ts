import assert from "node:assert/strict"
import test from "node:test"

import { serializeWorkflowRunDetail } from "@/lib/workflows/run-detail-serialization"

function buildDetail(extra: Record<string, unknown> = {}) {
  const now = new Date("2026-07-17T00:00:00.000Z")
  return {
    run: {
      id: 11,
      enterpriseId: 7,
      userId: 3,
      kind: "workflow",
      itemType: "workflow",
      itemSlug: "demo",
      externalRunId: null,
      externalSystem: null,
      status: "succeeded",
      inputPayload: null,
      normalizedResult: null,
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
      events: [],
      artifacts: [],
      workItems: [],
      knowledgeSaveJobs: [],
    },
    workflow: {
      id: 1,
      enterpriseId: 7,
      ownerUserId: 3,
      title: "Demo",
      slug: "demo",
      status: "live",
      triggerType: "manual",
      description: null,
      metadata: null,
      createdAt: now,
      updatedAt: now,
      nodes: [],
      edges: [],
    },
    nodeExecutions: [],
    ...extra,
  } as never
}

test("legacy run detail keeps its original shape when M3 records are absent", () => {
  const serialized = serializeWorkflowRunDetail(buildDetail())
  assert.ok(serialized)
  assert.equal("snapshot" in serialized, false)
  assert.equal("iterations" in serialized, false)
  assert.equal("attempts" in serialized, false)
})

test("run detail serializes snapshot, iteration progress, warnings, and attempt retries", () => {
  const serialized = serializeWorkflowRunDetail(
    buildDetail({
      snapshot: {
        taskRunId: 11,
        workflowId: 1,
        revisionId: 4,
        schemaVersion: 2,
        definitionHash: "a".repeat(64),
        definition: { schemaVersion: 2 },
        requestId: "00000000-0000-4000-8000-000000000011",
        cancelRequestedAt: new Date("2026-07-17T00:01:00.000Z"),
        createdAt: new Date("2026-07-17T00:00:00.000Z"),
      },
      iterations: [
        {
          id: 21,
          runId: 11,
          scopeNodeKey: "foreach-1",
          iterationKey: "asset-a",
          iterationIndex: 0,
          status: "failed",
          inputPayload: { assetId: "a" },
          outputPayload: null,
          creditsReserved: 2,
          creditsConsumed: 1,
          startedAt: new Date("2026-07-17T00:01:00.000Z"),
          finishedAt: new Date("2026-07-17T00:02:00.000Z"),
          createdAt: new Date("2026-07-17T00:01:00.000Z"),
          updatedAt: new Date("2026-07-17T00:02:00.000Z"),
          warnings: ["provider returned a partial result", 42],
        },
      ],
      attempts: [
        {
          id: 31,
          nodeExecutionId: 41,
          iterationId: 21,
          scopeKey: "asset-a",
          attemptNumber: 2,
          status: "failed",
          idempotencyKey: "internal-secret-idempotency-key",
          providerId: "openai_compatible",
          modelId: "gpt-image-1",
          providerRequestId: "request-1",
          providerTaskId: "task-1",
          inputPayload: { prompt: "demo" },
          outputPayload: null,
          errorCode: "provider_submit_failed",
          errorMessage: "temporary error",
          creditsReserved: 2,
          creditsConsumed: 1,
          submittedAt: null,
          startedAt: new Date("2026-07-17T00:01:00.000Z"),
          finishedAt: new Date("2026-07-17T00:02:00.000Z"),
          createdAt: new Date("2026-07-17T00:01:00.000Z"),
          updatedAt: new Date("2026-07-17T00:02:00.000Z"),
          warnings: ["retryable", ""],
        },
      ],
    }),
  )

  assert.ok(serialized)
  assert.equal(serialized.snapshot?.revisionId, 4)
  assert.equal(serialized.snapshot?.cancelRequestedAt, "2026-07-17T00:01:00.000Z")
  assert.deepEqual(serialized.iterations?.[0]?.warnings, ["provider returned a partial result"])
  assert.equal(serialized.iterations?.[0]?.iterationIndex, 0)
  assert.equal(serialized.iterations?.[0]?.startedAt, "2026-07-17T00:01:00.000Z")
  assert.equal(serialized.attempts?.[0]?.attemptNumber, 2)
  assert.deepEqual(serialized.attempts?.[0]?.warnings, ["retryable"])
  assert.equal(serialized.attempts?.[0]?.providerTaskId, "task-1")
  assert.equal("idempotencyKey" in (serialized.attempts?.[0] ?? {}), false)
})
