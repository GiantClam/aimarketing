import { randomUUID } from "node:crypto"
import { hostname } from "node:os"

import {
  getConfiguredPptPreviewJobStore,
  setConfiguredPptPreviewJobStoreForTests,
  type PptPreviewJobRecord,
  type PptPreviewJobStatus,
  type PptPreviewJobStore,
} from "./job-store.js"
import type { PreviewRequest } from "./types.js"
import { runPreviewJob } from "./ppt-master-executor.js"

const DEFAULT_LEASE_MS = 5 * 60 * 1000
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000
const DEFAULT_HEARTBEAT_RETRY_ATTEMPTS = 3
const DEFAULT_HEARTBEAT_RETRY_DELAY_MS = 1_000
const DEFAULT_RECOVERY_INTERVAL_MS = 20_000
const DEFAULT_RECOVERY_BATCH_SIZE = 8
const DEFAULT_SHUTDOWN_GRACE_MS = 10_000
// PPT generation can spend several minutes in provider/model rendering and
// SVG materialization. Keep the safety timeout aligned with the Railway
// deployment contract instead of failing long decks at the old 18-minute
// default.
const DEFAULT_PREVIEW_JOB_TIMEOUT_MS = 60 * 60 * 1000
const DEFAULT_PREVIEW_MAX_CONCURRENCY = 1

const workerId = `${hostname()}-${process.pid}-${randomUUID()}`

let runPreviewJobImpl = runPreviewJob
let schedulerStarted = false
let shuttingDown = false
let recoveryTimer: NodeJS.Timeout | null = null
const activeJobs = new Map<string, Promise<void>>()
const scheduledJobIds = new Set<string>()

function readPositiveInt(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name]?.trim() || "", 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function getLeaseMs() {
  return readPositiveInt("PPT_WORKER_JOB_LEASE_MS", DEFAULT_LEASE_MS)
}

function getHeartbeatIntervalMs() {
  return Math.min(
    readPositiveInt("PPT_WORKER_JOB_HEARTBEAT_INTERVAL_MS", DEFAULT_HEARTBEAT_INTERVAL_MS),
    Math.max(1000, getLeaseMs() - 1000),
  )
}

function getHeartbeatRetryAttempts() {
  return readPositiveInt("PPT_WORKER_JOB_HEARTBEAT_RETRY_ATTEMPTS", DEFAULT_HEARTBEAT_RETRY_ATTEMPTS)
}

function getHeartbeatRetryDelayMs() {
  return readPositiveInt("PPT_WORKER_JOB_HEARTBEAT_RETRY_DELAY_MS", DEFAULT_HEARTBEAT_RETRY_DELAY_MS)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function heartbeatJobWithRetry(
  store: PptPreviewJobStore,
  jobId: string,
  workerId: string,
  leaseMs: number,
) {
  let lastError: unknown

  for (let attempt = 1; attempt <= getHeartbeatRetryAttempts(); attempt += 1) {
    try {
      return await store.heartbeatJob(jobId, workerId, leaseMs)
    } catch (error) {
      lastError = error
      if (attempt === getHeartbeatRetryAttempts()) break
      await sleep(getHeartbeatRetryDelayMs() * attempt)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function getRecoveryIntervalMs() {
  return readPositiveInt("PPT_WORKER_JOB_RECOVERY_INTERVAL_MS", DEFAULT_RECOVERY_INTERVAL_MS)
}

function getRecoveryBatchSize() {
  return readPositiveInt("PPT_WORKER_JOB_RECOVERY_BATCH_SIZE", DEFAULT_RECOVERY_BATCH_SIZE)
}

function getShutdownGraceMs() {
  return readPositiveInt("PPT_WORKER_JOB_SHUTDOWN_GRACE_MS", DEFAULT_SHUTDOWN_GRACE_MS)
}

function getPreviewJobTimeoutMs() {
  return readPositiveInt("PPT_WORKER_PREVIEW_JOB_TIMEOUT_MS", DEFAULT_PREVIEW_JOB_TIMEOUT_MS)
}

function getPreviewMaxConcurrency() {
  return readPositiveInt("PPT_WORKER_PREVIEW_MAX_CONCURRENCY", DEFAULT_PREVIEW_MAX_CONCURRENCY)
}

async function runPreviewJobWithTimeout(request: PreviewRequest) {
  let timeoutId: NodeJS.Timeout | null = null

  try {
    return await Promise.race([
      runPreviewJobImpl(request),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error("ppt_worker_preview_job_timeout")), getPreviewJobTimeoutMs())
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function toIsoTimestamp(value: number | null) {
  return value === null ? undefined : new Date(value).toISOString()
}

function mapPreviewJobStatus(job: PptPreviewJobRecord) {
  const observability = {
    updatedAt: new Date(job.updatedAt).toISOString(),
    heartbeatAt: toIsoTimestamp(job.heartbeatAt),
    leaseUntil: toIsoTimestamp(job.leaseUntil),
    attemptCount: job.attemptCount,
  }

  if (job.status === "completed") {
    const result = job.result as Awaited<ReturnType<typeof runPreviewJob>> | null

    return {
      jobId: job.jobId,
      status: "completed" as const,
      previewSessionId: result?.previewSessionId ?? "",
      generatedAt: result?.generatedAt ?? "",
      deck: result?.deck ?? null,
      ...observability,
    }
  }

  if (job.status === "failed") {
    return {
      jobId: job.jobId,
      status: "failed" as const,
      message: job.errorMessage || "worker_preview_job_failed",
      ...observability,
    }
  }

  return {
    jobId: job.jobId,
    status: job.status as Extract<PptPreviewJobStatus, "queued" | "running">,
    ...observability,
  }
}

async function executeClaimedPreviewJob(jobId: string) {
  if (shuttingDown) return

  const store = await getConfiguredPptPreviewJobStore()
  const claimedJob = await store.claimJob(jobId, workerId, getLeaseMs())
  if (!claimedJob) return

  const execution = (async () => {
    let heartbeatInFlight = false
    const heartbeatTimer = setInterval(() => {
      if (heartbeatInFlight) return
      heartbeatInFlight = true
      void heartbeatJobWithRetry(store, jobId, workerId, getLeaseMs())
        .then((renewed) => {
          if (!renewed) {
            console.warn("ppt-worker.preview.lease-lost", { jobId, workerId })
          }
        })
        .catch((error) => {
          console.warn("ppt-worker.preview.heartbeat-failed", {
            jobId,
            workerId,
            message: error instanceof Error ? error.message : String(error),
          })
        })
        .finally(() => {
          heartbeatInFlight = false
        })
    }, getHeartbeatIntervalMs())

    try {
      if (!claimedJob.request) {
        throw new Error("ppt_worker_job_request_missing")
      }

      const result = await runPreviewJobWithTimeout(claimedJob.request)
      const completed = await store.completeJob(jobId, workerId, result)
      if (!completed) {
        console.warn("ppt-worker.preview.complete-skipped", { jobId, workerId })
      }
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "worker_preview_job_failed"
      const failed = await store.failJob(jobId, workerId, {
        code: "worker_preview_job_failed",
        message,
      })
      if (!failed) {
        console.warn("ppt-worker.preview.fail-skipped", { jobId, workerId, message })
      }
    } finally {
      clearInterval(heartbeatTimer)
    }
  })()

  activeJobs.set(jobId, execution)
  try {
    await execution
  } finally {
    activeJobs.delete(jobId)
  }
}

function schedulePreviewJob(jobId: string) {
  if (shuttingDown || scheduledJobIds.has(jobId) || scheduledJobIds.size >= getPreviewMaxConcurrency()) {
    return false
  }

  scheduledJobIds.add(jobId)
  void executeClaimedPreviewJob(jobId)
    .catch((error) => {
      console.error("ppt-worker.preview.execution-failed", {
        jobId,
        message: error instanceof Error ? error.message : String(error),
      })
    })
    .finally(() => {
      scheduledJobIds.delete(jobId)
      if (!shuttingDown) {
        void recoverPreviewJobs().catch((error) => {
          console.error("ppt-worker.preview.recovery-failed", {
            jobId,
            message: error instanceof Error ? error.message : String(error),
          })
        })
      }
    })

  return true
}

export async function recoverPreviewJobs() {
  if (shuttingDown) return

  const store = await getConfiguredPptPreviewJobStore()
  const recoverableJobs = await store.listRecoverableJobs(getRecoveryBatchSize())
  for (const job of recoverableJobs) {
    if (!schedulePreviewJob(job.jobId)) break
  }
}

export async function startPreviewJobRecovery() {
  if (schedulerStarted) return

  shuttingDown = false
  schedulerStarted = true
  recoveryTimer = setInterval(() => {
    void recoverPreviewJobs().catch((error) => {
      console.error("ppt-worker.preview.recovery-scan-failed", {
        message: error instanceof Error ? error.message : String(error),
      })
    })
  }, getRecoveryIntervalMs())
  await recoverPreviewJobs().catch((error) => {
    console.error("ppt-worker.preview.startup-recovery-scan-failed", {
      message: error instanceof Error ? error.message : String(error),
    })
  })
}

export async function shutdownPreviewJobRecovery(graceMs = getShutdownGraceMs()) {
  if (!schedulerStarted && activeJobs.size === 0 && scheduledJobIds.size === 0) return

  shuttingDown = true
  if (recoveryTimer) {
    clearInterval(recoveryTimer)
    recoveryTimer = null
  }

  const activeJobIds = [...activeJobs.keys()]
  const activeRuns = [...activeJobs.values()]
  if (activeRuns.length > 0) {
    await Promise.race([
      Promise.allSettled(activeRuns),
      new Promise<void>((resolve) => setTimeout(resolve, graceMs)),
    ])
  }

  try {
    const store = await getConfiguredPptPreviewJobStore()
    await Promise.all(activeJobIds.map((jobId) => store.releaseLease(jobId, workerId)))
  } catch (error) {
    console.error("ppt-worker.preview.shutdown-release-failed", {
      message: error instanceof Error ? error.message : String(error),
    })
  }
  schedulerStarted = false
}

export async function enqueuePreviewJob(request: PreviewRequest) {
  const jobId = randomUUID()
  const store = await getConfiguredPptPreviewJobStore()

  await store.createJob({
    jobId,
    requestId: request.requestId,
    request,
  })

  schedulePreviewJob(jobId)

  return {
    jobId,
    status: "queued" as const,
  }
}

export async function getPreviewJobStatus(jobId: string) {
  const store = await getConfiguredPptPreviewJobStore()
  const job = await store.getJob(jobId)
  if (!job) return null

  return mapPreviewJobStatus(job)
}

export function setPreviewJobDepsForTests(
  deps:
    | {
        runPreviewJob?: typeof runPreviewJob
        previewJobStore?: PptPreviewJobStore
      }
    | null,
) {
  runPreviewJobImpl = deps?.runPreviewJob ?? runPreviewJob
  setConfiguredPptPreviewJobStoreForTests(deps?.previewJobStore ?? null)
}
