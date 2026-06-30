import assert from "node:assert/strict"
import test from "node:test"

import {
  attachPendingVideoBillingToRun,
  settleVideoBillingForRun,
  type PersistedVideoBillingState,
} from "@/lib/platform/video-billing-settlement"

function buildPendingBilling() {
  return {
    reservation: {
      creditAccountId: 12,
      reserveIdempotencyKey: "reserve-video-1",
      amount: 480,
    },
    estimate: {
      featureKey: "video_generation",
      credits: 480,
      provider: "minimax",
      model: "minimax:video:text-to-video:MiniMax-Hailuo-2.3",
      officialCostUsd: 0.48,
      costBasisUsd: 0.24,
      metadata: {
        durationSeconds: 6,
        resolution: "768P",
      },
    },
  }
}

test("attachPendingVideoBillingToRun stores pending reservation on normalized result", async () => {
  let patched: Record<string, unknown> | null = null

  const billing = await attachPendingVideoBillingToRun(
    {
      runId: 41,
      currentUser: {
        id: 7,
        enterpriseId: 11,
      },
      featureId: "text-to-video",
      billing: buildPendingBilling(),
      provider: "minimax",
      model: "minimax:video:text-to-video:MiniMax-Hailuo-2.3",
      metadata: {
        taskId: "provider-task-1",
      },
    },
    {
      getRun: async () =>
        ({
          id: 41,
          userId: 7,
          enterpriseId: 11,
          status: "running",
          normalizedResult: {
            provider: "minimax",
            status: "RUNNING",
          },
        }) as any,
      patchNormalizedResult: async (_runId, normalizedResult) => {
        patched = normalizedResult
      },
    },
  )

  const patchedResult = patched as Record<string, unknown> | null
  assert.equal(billing?.status, "pending")
  assert.equal((patchedResult?.billing as PersistedVideoBillingState | undefined)?.credits, 480)
  assert.equal((patchedResult?.billing as PersistedVideoBillingState | undefined)?.metadata?.taskId, "provider-task-1")
  assert.equal(patchedResult?.provider, "minimax")
})

test("settleVideoBillingForRun finalizes pending billing for succeeded video tasks", async () => {
  let finalizeCall: Record<string, unknown> | null = null
  let patched: Record<string, unknown> | null = null
  const pending = await attachPendingVideoBillingToRun(
    {
      runId: 41,
      currentUser: { id: 7, enterpriseId: 11 },
      featureId: "text-to-video",
      billing: buildPendingBilling(),
      provider: "minimax",
      model: "minimax:video:text-to-video:MiniMax-Hailuo-2.3",
    },
    {
      getRun: async () =>
        ({
          id: 41,
          userId: 7,
          enterpriseId: 11,
          status: "running",
          normalizedResult: {},
        }) as any,
      patchNormalizedResult: async () => {},
    },
  )

  const settled = await settleVideoBillingForRun(
    {
      id: 41,
      userId: 7,
      enterpriseId: 11,
      status: "succeeded",
      normalizedResult: {
        billing: pending,
      },
    } as any,
    {
      now: () => new Date("2026-06-29T00:00:00.000Z"),
      finalize: async (input) => {
        finalizeCall = input as unknown as Record<string, unknown>
        return { id: 99 }
      },
      patchNormalizedResult: async (_runId, normalizedResult) => {
        patched = normalizedResult
      },
    },
  )

  const finalizeResult = finalizeCall as Record<string, unknown> | null
  const patchedResult = patched as Record<string, unknown> | null
  assert.equal(settled?.status, "finalized")
  assert.equal(finalizeResult?.actualAmount, 480)
  assert.equal(finalizeResult?.idempotencyKey, "video-generation:7:41:reserve-video-1:debit")
  assert.equal((patchedResult?.billing as PersistedVideoBillingState | undefined)?.ledgerId, 99)
})

test("settleVideoBillingForRun releases pending billing for failed video tasks", async () => {
  let releaseCall: Record<string, unknown> | null = null
  let patched: Record<string, unknown> | null = null
  const pending = await attachPendingVideoBillingToRun(
    {
      runId: 42,
      currentUser: { id: 7, enterpriseId: 11 },
      featureId: "image-to-video",
      billing: buildPendingBilling(),
      provider: "minimax",
      model: "minimax:video:image-to-video:MiniMax-Hailuo-2.3",
    },
    {
      getRun: async () =>
        ({
          id: 42,
          userId: 7,
          enterpriseId: 11,
          status: "running",
          normalizedResult: {},
        }) as any,
      patchNormalizedResult: async () => {},
    },
  )

  const settled = await settleVideoBillingForRun(
    {
      id: 42,
      userId: 7,
      enterpriseId: 11,
      status: "failed",
      normalizedResult: {
        billing: pending,
      },
    } as any,
    {
      now: () => new Date("2026-06-29T00:00:00.000Z"),
      release: async (input) => {
        releaseCall = input as unknown as Record<string, unknown>
        return { id: 100 }
      },
      patchNormalizedResult: async (_runId, normalizedResult) => {
        patched = normalizedResult
      },
    },
  )

  const releaseResult = releaseCall as Record<string, unknown> | null
  const patchedResult = patched as Record<string, unknown> | null
  assert.equal(settled?.status, "released")
  assert.equal(releaseResult?.reason, "video_task_failed")
  assert.equal(releaseResult?.idempotencyKey, "video-generation:7:42:reserve-video-1:release")
  assert.equal((patchedResult?.billing as PersistedVideoBillingState | undefined)?.failureReason, "failed")
})
