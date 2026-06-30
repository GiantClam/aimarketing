import { eq } from "drizzle-orm"

import {
  finalizeReservedCredits,
  releaseReservedCredits,
  type BillingReservation,
} from "@/lib/billing/runtime"
import { db } from "@/lib/db"
import { platformTaskRuns } from "@/lib/db/schema"
import {
  getPlatformTaskRun,
  type HydratedPlatformTaskRun,
  type PlatformTaskRunRecord,
} from "@/lib/platform/task-run-store"

type VideoBillingStatus = "pending" | "finalized" | "released"

export type PendingVideoBillingInput = {
  reservation: BillingReservation | null
  estimate: {
    featureKey: string
    credits: number
    provider?: string | null
    model?: string | null
    officialCostUsd?: number | null
    costBasisUsd?: number | null
    metadata?: Record<string, unknown> | null
  }
}

export type PersistedVideoBillingState = {
  status: VideoBillingStatus
  featureId: string
  featureKey: string
  userId: number
  enterpriseId: number | null
  provider: string | null
  model: string | null
  credits: number
  officialCostUsd: number | null
  costBasisUsd: number | null
  usagePayload: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  reservation: BillingReservation
  settledAt?: string | null
  ledgerId?: number | null
  failureReason?: string | null
}

type VideoBillingPatchDeps = {
  getRun?: (runId: number) => Promise<HydratedPlatformTaskRun | null>
  patchNormalizedResult?: (runId: number, normalizedResult: Record<string, unknown>) => Promise<void>
  finalize?: typeof finalizeReservedCredits
  release?: typeof releaseReservedCredits
  now?: () => Date
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function normalizePersistedBilling(value: unknown): PersistedVideoBillingState | null {
  const record = asRecord(value)
  const reservation = asRecord(record.reservation)
  const creditAccountId = Number(reservation.creditAccountId)
  const amount = Number(reservation.amount)
  const reserveIdempotencyKey =
    typeof reservation.reserveIdempotencyKey === "string" ? reservation.reserveIdempotencyKey : ""

  if (!creditAccountId || !amount || !reserveIdempotencyKey) return null
  if (record.status !== "pending" && record.status !== "finalized" && record.status !== "released") return null

  return {
    status: record.status,
    featureId: typeof record.featureId === "string" ? record.featureId : "text-to-video",
    featureKey: typeof record.featureKey === "string" ? record.featureKey : "video_generation",
    userId: Number(record.userId || 0),
    enterpriseId: typeof record.enterpriseId === "number" ? record.enterpriseId : null,
    provider: typeof record.provider === "string" ? record.provider : null,
    model: typeof record.model === "string" ? record.model : null,
    credits: Math.max(1, Math.ceil(Number(record.credits || amount))),
    officialCostUsd: typeof record.officialCostUsd === "number" ? record.officialCostUsd : null,
    costBasisUsd: typeof record.costBasisUsd === "number" ? record.costBasisUsd : null,
    usagePayload: asRecord(record.usagePayload),
    metadata: asRecord(record.metadata),
    reservation: {
      creditAccountId,
      reserveIdempotencyKey,
      amount,
    },
    settledAt: typeof record.settledAt === "string" ? record.settledAt : null,
    ledgerId: typeof record.ledgerId === "number" ? record.ledgerId : null,
    failureReason: typeof record.failureReason === "string" ? record.failureReason : null,
  }
}

async function patchRunNormalizedResult(runId: number, normalizedResult: Record<string, unknown>) {
  await db
    .update(platformTaskRuns)
    .set({
      normalizedResult,
      updatedAt: new Date(),
    })
    .where(eq(platformTaskRuns.id, runId))
}

function readLedgerId(value: unknown) {
  const record = asRecord(value)
  return typeof record.id === "number" ? record.id : null
}

function buildTerminalIdempotencyKey(run: Pick<PlatformTaskRunRecord, "id" | "userId">, billing: PersistedVideoBillingState, action: "debit" | "release") {
  return `video-generation:${run.userId}:${run.id}:${billing.reservation.reserveIdempotencyKey}:${action}`
}

export async function attachPendingVideoBillingToRun(input: {
  runId: number | null | undefined
  currentUser: { id: number; enterpriseId: number | null }
  featureId: string
  billing: PendingVideoBillingInput | null
  provider?: string | null
  model?: string | null
  metadata?: Record<string, unknown> | null
}, deps: VideoBillingPatchDeps = {}) {
  if (!input.runId || !input.billing?.reservation) return null

  const getRun = deps.getRun ?? getPlatformTaskRun
  const patch = deps.patchNormalizedResult ?? patchRunNormalizedResult
  const run = await getRun(input.runId)
  if (!run) return null

  const normalizedResult = asRecord(run.normalizedResult)
  const existing = normalizePersistedBilling(normalizedResult.billing)
  if (existing?.status === "finalized" || existing?.status === "released") return existing

  const nextBilling: PersistedVideoBillingState = {
    status: "pending",
    featureId: input.featureId,
    featureKey: input.billing.estimate.featureKey,
    userId: input.currentUser.id,
    enterpriseId: input.currentUser.enterpriseId,
    provider: input.provider || input.billing.estimate.provider || null,
    model: input.model || input.billing.estimate.model || null,
    credits: input.billing.estimate.credits,
    officialCostUsd: input.billing.estimate.officialCostUsd ?? null,
    costBasisUsd: input.billing.estimate.costBasisUsd ?? null,
    usagePayload: input.billing.estimate.metadata || null,
    metadata: input.metadata || null,
    reservation: input.billing.reservation,
    settledAt: null,
    ledgerId: null,
    failureReason: null,
  }

  await patch(input.runId, {
    ...normalizedResult,
    billing: nextBilling,
  })

  return nextBilling
}

export async function settleVideoBillingForRun(
  run: Pick<HydratedPlatformTaskRun, "id" | "userId" | "enterpriseId" | "status" | "normalizedResult">,
  deps: VideoBillingPatchDeps = {},
) {
  if (run.status !== "succeeded" && run.status !== "failed" && run.status !== "cancelled") return null

  const normalizedResult = asRecord(run.normalizedResult)
  const billing = normalizePersistedBilling(normalizedResult.billing)
  if (!billing || billing.status !== "pending") return billing

  const now = deps.now ?? (() => new Date())
  const patch = deps.patchNormalizedResult ?? patchRunNormalizedResult
  const finishedAt = now().toISOString()

  if (run.status === "succeeded") {
    const finalize = deps.finalize ?? finalizeReservedCredits
    const ledger = await finalize({
      reservation: billing.reservation,
      userId: run.userId,
      enterpriseId: run.enterpriseId,
      actualAmount: billing.credits,
      idempotencyKey: buildTerminalIdempotencyKey(run, billing, "debit"),
      provider: billing.provider,
      model: billing.model,
      officialCostUsd: billing.officialCostUsd,
      costBasisUsd: billing.costBasisUsd,
      usagePayload: billing.usagePayload,
      metadata: {
        ...(billing.metadata || {}),
        runId: run.id,
        featureId: billing.featureId,
      },
    })
    const nextBilling: PersistedVideoBillingState = {
      ...billing,
      status: "finalized",
      settledAt: finishedAt,
      ledgerId: readLedgerId(ledger),
    }
    await patch(run.id, {
      ...normalizedResult,
      billing: nextBilling,
    })
    return nextBilling
  }

  const release = deps.release ?? releaseReservedCredits
  const ledger = await release({
    reservation: billing.reservation,
    userId: run.userId,
    enterpriseId: run.enterpriseId,
    idempotencyKey: buildTerminalIdempotencyKey(run, billing, "release"),
    reason: run.status === "cancelled" ? "video_task_cancelled" : "video_task_failed",
  })
  const nextBilling: PersistedVideoBillingState = {
    ...billing,
    status: "released",
    settledAt: finishedAt,
    ledgerId: readLedgerId(ledger),
    failureReason: run.status,
  }
  await patch(run.id, {
    ...normalizedResult,
    billing: nextBilling,
  })
  return nextBilling
}

export async function settleVideoBillingForRunId(runId: number | null | undefined, deps: VideoBillingPatchDeps = {}) {
  if (!runId) return null
  const getRun = deps.getRun ?? getPlatformTaskRun
  const run = await getRun(runId)
  if (!run) return null
  return settleVideoBillingForRun(run, deps)
}
