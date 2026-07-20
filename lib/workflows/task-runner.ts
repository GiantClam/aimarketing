import { and, desc, eq, inArray } from "drizzle-orm"

import { db } from "@/lib/db"
import { platformTaskRuns } from "@/lib/db/schema"
import { getUserAuthPayload } from "@/lib/enterprise/server"
import { getPlatformTaskRun, appendPlatformRunEvent } from "@/lib/platform/task-run-store"
import { updatePlatformWorkflowRun } from "@/lib/platform/workflow-runner"
import type { WorkflowNodeInputBundle } from "@/lib/workflows/node-executors"
import { executeWorkflowRetryJob, executeWorkflowRunJob } from "@/lib/workflows/run-job"
import {
  cloneNormalizedResult,
  isWorkflowRunStale,
  parseWorkflowRetryRequest,
  shouldEvictActiveWorkflowRunTracker,
  stripWorkflowRetryRequest,
  type RecoverableWorkflowRun,
} from "@/lib/workflows/task-runner-helpers"
import {
  cancelQueuedWorkflowNodeExecutions,
  failRunningWorkflowNodeExecutions,
  getWorkflowRunDetail,
  type WorkflowRunDetail,
} from "@/lib/workflows/store"

type WorkflowRunnerSummary = {
  considered: number
  started: number
  alreadyRunning: number
  staleFailed: number
  skipped: number
}


const workflowRunnerState = globalThis as typeof globalThis & {
  __workflowRunPromises__?: Map<number, Promise<void>>
}

const activeWorkflowRuns = workflowRunnerState.__workflowRunPromises__ ?? new Map<number, Promise<void>>()
workflowRunnerState.__workflowRunPromises__ = activeWorkflowRuns

const WORKFLOW_RUN_HEARTBEAT_MS = Math.max(
  5_000,
  Math.min(60_000, Number.parseInt(process.env.WORKFLOW_RUN_HEARTBEAT_MS || "", 10) || 10_000),
)
const DEFAULT_WORKFLOW_STALE_RUNNING_MS = 30 * 60_000
const MAX_WORKFLOW_STALE_RUNNING_MS = 12 * 60 * 60_000
const configuredWorkflowStaleMs = Number.parseInt(process.env.WORKFLOW_STALE_RUNNING_MS || "", 10)
const configuredCapabilityTimeoutMs = Number.parseInt(process.env.WORKFLOW_CAPABILITY_TIMEOUT_MS || "", 10)
const configuredVideoTimeoutMs = Number.parseInt(process.env.WORKFLOW_VIDEO_CAPABILITY_TIMEOUT_MS || "", 10)
const WORKFLOW_STALE_RUNNING_MS = Math.max(
  WORKFLOW_RUN_HEARTBEAT_MS * 2,
  Math.min(
    MAX_WORKFLOW_STALE_RUNNING_MS,
    configuredWorkflowStaleMs ||
      Math.max(configuredCapabilityTimeoutMs || 0, configuredVideoTimeoutMs || 0, DEFAULT_WORKFLOW_STALE_RUNNING_MS),
  ),
)

function buildSeedInputFromRunInputPayload(inputPayload: Record<string, unknown> | null | undefined): Partial<WorkflowNodeInputBundle> | undefined {
  const prompt = typeof inputPayload?.prompt === "string" ? inputPayload.prompt.trim() : ""
  if (!prompt) return undefined
  return {
    text: [prompt],
  }
}

function buildExistingNodeStates(detail: WorkflowRunDetail) {
  return Object.fromEntries(
    detail.nodeExecutions.map((execution) => [
      execution.nodeKey,
      {
        nodeKey: execution.nodeKey,
        status: execution.status as "queued" | "running" | "succeeded" | "failed" | "cancelled",
        attemptCount: 1,
        output: (execution.outputPayload as Record<string, unknown> | null) ?? {},
        startedAt: execution.startedAt ?? null,
        finishedAt: execution.finishedAt ?? null,
        providerId: execution.providerId ?? null,
        modelId: execution.modelId ?? null,
        taskRunId: execution.taskRunId ?? null,
        creditsConsumed: execution.creditsConsumed ?? 0,
        errorMessage: null,
        metadata: null,
      },
    ]),
  )
}

async function touchWorkflowRun(runId: number) {
  await db
    .update(platformTaskRuns)
    .set({
      updatedAt: new Date(),
    })
    .where(and(eq(platformTaskRuns.id, runId), eq(platformTaskRuns.status, "running")))
}

async function listRecoverableWorkflowRuns(limit: number) {
  return db
    .select({
      id: platformTaskRuns.id,
      userId: platformTaskRuns.userId,
      enterpriseId: platformTaskRuns.enterpriseId,
      status: platformTaskRuns.status,
      createdAt: platformTaskRuns.createdAt,
      updatedAt: platformTaskRuns.updatedAt,
      normalizedResult: platformTaskRuns.normalizedResult,
    })
    .from(platformTaskRuns)
    .where(
      and(
        eq(platformTaskRuns.kind, "workflow"),
        eq(platformTaskRuns.itemType, "workflow"),
        inArray(platformTaskRuns.status, ["queued", "running", "cancel_requested"]),
      ),
    )
    .orderBy(desc(platformTaskRuns.createdAt), desc(platformTaskRuns.id))
    .limit(limit)
}

async function claimQueuedWorkflowRun(runId: number, normalizedResult: Record<string, unknown> | null) {
  const [row] = await db
    .update(platformTaskRuns)
    .set({
      status: "running",
      startedAt: new Date(),
      finishedAt: null,
      normalizedResult,
      updatedAt: new Date(),
    })
    .where(and(eq(platformTaskRuns.id, runId), eq(platformTaskRuns.status, "queued")))
    .returning({
      id: platformTaskRuns.id,
    })

  if (!row) return false

  await appendPlatformRunEvent(runId, {
    level: "info",
    message: "workflow_runner_claimed",
  })
  return true
}

async function markWorkflowRunStaleFailed(run: RecoverableWorkflowRun) {
  const normalizedResult = cloneNormalizedResult(run.normalizedResult) ?? {}
  normalizedResult.workflowStatus = "failed"
  normalizedResult.staleFailure = {
    reason: "workflow_run_stale",
    failedAt: new Date().toISOString(),
  }

  await failRunningWorkflowNodeExecutions(run.id)
  await cancelQueuedWorkflowNodeExecutions(run.id)
  await updatePlatformWorkflowRun({
    runId: run.id,
    patch: {
      status: "failed",
      expectedStatus: ["running"],
      finishedAt: new Date(),
      normalizedResult,
    },
    event: {
      level: "error",
      message: "workflow_run_stale_failed",
      payload: {
        staleAfterMs: WORKFLOW_STALE_RUNNING_MS,
      },
    },
  })
}

function executeTrackedWorkflowRun(runId: number, requestOrigin: string) {
  const existing = activeWorkflowRuns.get(runId)
  if (existing) {
    return existing
  }

  const job = (async () => {
    const hydratedRun = await getPlatformTaskRun(runId)
    if (!hydratedRun) return

    const detail = await getWorkflowRunDetail(runId, hydratedRun.enterpriseId)
    if (!detail) {
      await updatePlatformWorkflowRun({
        runId,
        patch: {
          status: "failed",
          expectedStatus: ["queued", "running"],
          finishedAt: new Date(),
        },
        event: {
          level: "error",
          message: "workflow_run_detail_missing",
        },
      }).catch(() => {})
      return
    }

    const currentUser = await getUserAuthPayload(hydratedRun.userId)
    if (!currentUser || currentUser.enterpriseId !== detail.workflow.enterpriseId) {
      await updatePlatformWorkflowRun({
        runId,
        patch: {
          status: "failed",
          expectedStatus: ["queued", "running"],
          finishedAt: new Date(),
          normalizedResult: {
            ...(cloneNormalizedResult(hydratedRun.normalizedResult) ?? {}),
            workflowStatus: "failed",
          },
        },
        event: {
          level: "error",
          message: "workflow_runner_user_unavailable",
        },
      }).catch(() => {})
      return
    }

    const pendingRetry = parseWorkflowRetryRequest(hydratedRun.normalizedResult)
    const previousNormalizedResult = stripWorkflowRetryRequest(hydratedRun.normalizedResult)
    const seedInput = buildSeedInputFromRunInputPayload(hydratedRun.inputPayload)
    const heartbeatTimer = setInterval(() => {
      void touchWorkflowRun(runId).catch(() => {})
    }, WORKFLOW_RUN_HEARTBEAT_MS)

    try {
      if (pendingRetry?.mode === "iteration") {
        await executeWorkflowRunJob({
          runId,
          workflow: detail.workflow,
          currentUser,
          seedInput,
          iterationRetry: {
            iterationKey: pendingRetry.iterationKey!,
            attemptNumber: pendingRetry.attemptNumber,
          },
          locale: "zh",
          requestOrigin,
        })
        return
      }

      if (pendingRetry) {
        await executeWorkflowRetryJob({
          runId,
          workflow: detail.workflow,
          currentUser,
          seedInput,
          existingNodeStates: buildExistingNodeStates(detail),
          mode: pendingRetry.mode,
          nodeKey: pendingRetry.nodeKey,
          previousNormalizedResult,
          locale: "zh",
          requestOrigin,
        })
        return
      }

      await executeWorkflowRunJob({
        runId,
        workflow: detail.workflow,
        currentUser,
        seedInput,
        locale: "zh",
        requestOrigin,
      })
    } finally {
      clearInterval(heartbeatTimer)
    }
  })().finally(() => {
    activeWorkflowRuns.delete(runId)
  })

  activeWorkflowRuns.set(runId, job)
  return job
}

async function handleWorkflowRun(runId: number, requestOrigin: string, waitForCompletion: boolean): Promise<WorkflowRunnerSummary> {
  const hydratedRun = await getPlatformTaskRun(runId)
  if (
    !hydratedRun ||
    hydratedRun.kind !== "workflow" ||
    hydratedRun.itemType !== "workflow" ||
    (hydratedRun.status !== "queued" && hydratedRun.status !== "running" && hydratedRun.status !== "cancel_requested")
  ) {
    return { considered: 1, started: 0, alreadyRunning: 0, staleFailed: 0, skipped: 1 }
  }

  const run: RecoverableWorkflowRun = {
    id: hydratedRun.id,
    userId: hydratedRun.userId,
    enterpriseId: hydratedRun.enterpriseId,
    status: hydratedRun.status,
    createdAt: hydratedRun.createdAt,
    updatedAt: hydratedRun.updatedAt,
    normalizedResult: hydratedRun.normalizedResult,
  }

  if (
    shouldEvictActiveWorkflowRunTracker({
      run,
      hasActiveTracker: activeWorkflowRuns.has(runId),
      staleAfterMs: WORKFLOW_STALE_RUNNING_MS,
    })
  ) {
    activeWorkflowRuns.delete(runId)
  }

  if (run.status === "running" || run.status === "cancel_requested") {
    if (activeWorkflowRuns.has(runId)) {
      return { considered: 1, started: 0, alreadyRunning: 1, staleFailed: 0, skipped: 0 }
    }
    if (isWorkflowRunStale(run, WORKFLOW_STALE_RUNNING_MS)) {
      await markWorkflowRunStaleFailed(run)
      return { considered: 1, started: 0, alreadyRunning: 0, staleFailed: 1, skipped: 0 }
    }
    const job = executeTrackedWorkflowRun(runId, requestOrigin)
    if (waitForCompletion && job) {
      await job
    }
    return { considered: 1, started: 1, alreadyRunning: 0, staleFailed: 0, skipped: 0 }
  }

  const claimed = await claimQueuedWorkflowRun(runId, cloneNormalizedResult(run.normalizedResult))
  if (!claimed) {
    return { considered: 1, started: 0, alreadyRunning: 0, staleFailed: 0, skipped: 1 }
  }

  const job = executeTrackedWorkflowRun(runId, requestOrigin)
  if (waitForCompletion && job) {
    await job
  }

  return { considered: 1, started: 1, alreadyRunning: 0, staleFailed: 0, skipped: 0 }
}

export async function runWorkflowTaskRecoveryPass(input: {
  runId?: number
  limit?: number
  requestOrigin: string
  waitForCompletion?: boolean
}): Promise<WorkflowRunnerSummary> {
  const waitForCompletion = input.waitForCompletion === true
  if (input.runId) {
    return handleWorkflowRun(input.runId, input.requestOrigin, waitForCompletion)
  }

  const limit = Math.max(1, Math.min(20, input.limit ?? 5))
  const runs = await listRecoverableWorkflowRuns(limit)
  const summary: WorkflowRunnerSummary = {
    considered: 0,
    started: 0,
    alreadyRunning: 0,
    staleFailed: 0,
    skipped: 0,
  }

  for (const run of runs) {
    const result = await handleWorkflowRun(run.id, input.requestOrigin, waitForCompletion)
    summary.considered += result.considered
    summary.started += result.started
    summary.alreadyRunning += result.alreadyRunning
    summary.staleFailed += result.staleFailed
    summary.skipped += result.skipped
  }

  return summary
}
