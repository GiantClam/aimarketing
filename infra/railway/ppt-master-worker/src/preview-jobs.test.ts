import assert from "node:assert/strict"
import test from "node:test"

import {
  enqueuePreviewJob,
  getPreviewJobStatus,
  recoverPreviewJobs,
  setPreviewJobDepsForTests,
  shutdownPreviewJobRecovery,
  startPreviewJobRecovery,
} from "./preview-jobs.js"
import { createInMemoryPptPreviewJobStore } from "./job-store.js"

const request = {
  requestId: "req_preview_jobs",
  prompt: "Build a deck",
  scenario: "training" as const,
  language: "zh-CN" as const,
  templateMode: "single-template" as const,
  templateId: "academic_defense",
  allowMockFallback: false,
  runtimeProfile: "railway-linux" as const,
}

test.afterEach(async () => {
  await shutdownPreviewJobRecovery(0)
  setPreviewJobDepsForTests(null)
})

test("preview jobs persist the request and complete through the lease runner", async () => {
  const store = createInMemoryPptPreviewJobStore()
  let seenRequestId = ""

  setPreviewJobDepsForTests({
    previewJobStore: store,
    runPreviewJob: async (input) => {
      seenRequestId = input.requestId
      return {
        previewSessionId: "session_preview_jobs",
        generatedAt: "2026-07-10T00:00:00.000Z",
        deck: { title: "Deck" },
      }
    },
  })

  const submitted = await enqueuePreviewJob(request)
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await getPreviewJobStatus(submitted.jobId)
    if (status?.status === "completed") break
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  const status = await getPreviewJobStatus(submitted.jobId)
  assert.equal(seenRequestId, request.requestId)
  assert.equal(status?.status, "completed")
  assert.equal(status?.attemptCount, 1)
})

test("recovery claims expired jobs and resumes their persisted request", async () => {
  const store = createInMemoryPptPreviewJobStore()
  let executions = 0

  await store.createJob({ jobId: "job_recovery", requestId: request.requestId, request })
  await store.claimJob("job_recovery", "dead-worker", 0)

  setPreviewJobDepsForTests({
    previewJobStore: store,
    runPreviewJob: async () => {
      executions += 1
      return {
        previewSessionId: "session_recovered",
        generatedAt: "2026-07-10T00:00:00.000Z",
        deck: { title: "Recovered deck" },
      }
    },
  })

  await recoverPreviewJobs()
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await getPreviewJobStatus("job_recovery")
    if (status?.status === "completed") break
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  const status = await getPreviewJobStatus("job_recovery")
  assert.equal(executions, 1)
  assert.equal(status?.status, "completed")
  assert.equal(status?.attemptCount, 2)
})

test("shutdown releases active leases for another worker", async () => {
  const store = createInMemoryPptPreviewJobStore()
  let resolveExecution = () => {}

  setPreviewJobDepsForTests({
    previewJobStore: store,
    runPreviewJob: () =>
      new Promise((resolve) => {
        resolveExecution = () =>
          resolve({
            previewSessionId: "session_shutdown",
            generatedAt: "2026-07-10T00:00:00.000Z",
            deck: { title: "Shutdown deck" },
          })
      }),
  })

  const submitted = await enqueuePreviewJob(request)
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const job = await store.getJob(submitted.jobId)
    if (job?.status === "running") break
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  await shutdownPreviewJobRecovery(0)
  assert.equal((await store.getJob(submitted.jobId))?.status, "queued")
  resolveExecution()
})

test("preview jobs time out and only start one render at the default concurrency", async () => {
  const store = createInMemoryPptPreviewJobStore()
  const previousTimeout = process.env.PPT_WORKER_PREVIEW_JOB_TIMEOUT_MS
  const previousConcurrency = process.env.PPT_WORKER_PREVIEW_MAX_CONCURRENCY
  let executions = 0

  try {
    process.env.PPT_WORKER_PREVIEW_JOB_TIMEOUT_MS = "20"
    process.env.PPT_WORKER_PREVIEW_MAX_CONCURRENCY = "1"

    await startPreviewJobRecovery()

    setPreviewJobDepsForTests({
      previewJobStore: store,
      runPreviewJob: async () => {
        executions += 1
        await new Promise(() => {})
        throw new Error("unreachable")
      },
    })

    const first = await enqueuePreviewJob(request)
    const second = await enqueuePreviewJob({ ...request, requestId: "req_preview_jobs_second" })
    await new Promise((resolve) => setTimeout(resolve, 5))

    assert.equal(executions, 1)
    assert.equal((await getPreviewJobStatus(second.jobId))?.status, "queued")

    await new Promise((resolve) => setTimeout(resolve, 30))

    assert.equal((await getPreviewJobStatus(first.jobId))?.status, "failed")
    assert.equal((await getPreviewJobStatus(first.jobId) as { message?: string } | null)?.message, "ppt_worker_preview_job_timeout")
    assert.equal(executions, 2)

    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal((await getPreviewJobStatus(second.jobId))?.status, "failed")
  } finally {
    if (previousTimeout === undefined) delete process.env.PPT_WORKER_PREVIEW_JOB_TIMEOUT_MS
    else process.env.PPT_WORKER_PREVIEW_JOB_TIMEOUT_MS = previousTimeout

    if (previousConcurrency === undefined) delete process.env.PPT_WORKER_PREVIEW_MAX_CONCURRENCY
    else process.env.PPT_WORKER_PREVIEW_MAX_CONCURRENCY = previousConcurrency
  }
})

test("heartbeat retries transient database termination without losing the lease", async () => {
  const store = createInMemoryPptPreviewJobStore()
  const previousLease = process.env.PPT_WORKER_JOB_LEASE_MS
  const previousInterval = process.env.PPT_WORKER_JOB_HEARTBEAT_INTERVAL_MS
  const previousAttempts = process.env.PPT_WORKER_JOB_HEARTBEAT_RETRY_ATTEMPTS
  const previousDelay = process.env.PPT_WORKER_JOB_HEARTBEAT_RETRY_DELAY_MS
  let heartbeatCalls = 0
  let resolveExecution: (value: { previewSessionId: string; generatedAt: string; deck: { title: string } }) => void = () => {}

  try {
    // The production interval is 15s. Use a 2s lease in this test so the
    // heartbeat timer can exercise the retry path without a long test run.
    process.env.PPT_WORKER_JOB_LEASE_MS = "2000"
    process.env.PPT_WORKER_JOB_HEARTBEAT_INTERVAL_MS = "1000"
    process.env.PPT_WORKER_JOB_HEARTBEAT_RETRY_ATTEMPTS = "2"
    process.env.PPT_WORKER_JOB_HEARTBEAT_RETRY_DELAY_MS = "1"

    const originalHeartbeat = store.heartbeatJob.bind(store)
    const resilientStore = {
      ...store,
      heartbeatJob: async (jobId: string, workerId: string, leaseMs: number) => {
        heartbeatCalls += 1
        if (heartbeatCalls === 1) {
          throw new Error("terminating connection due to administrator command")
        }
        return originalHeartbeat(jobId, workerId, leaseMs)
      },
    }

    setPreviewJobDepsForTests({
      previewJobStore: resilientStore,
      runPreviewJob: () =>
        new Promise((resolve) => {
          resolveExecution = resolve
        }),
    })
    await startPreviewJobRecovery()

    const submitted = await enqueuePreviewJob(request)
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if ((await getPreviewJobStatus(submitted.jobId))?.status === "running") break
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    for (let attempt = 0; attempt < 150 && heartbeatCalls < 2; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    assert.equal(heartbeatCalls, 2)
    assert.equal((await getPreviewJobStatus(submitted.jobId))?.status, "running")

    resolveExecution({
      previewSessionId: "session_heartbeat_retry",
      generatedAt: "2026-07-10T00:00:00.000Z",
      deck: { title: "Heartbeat retry deck" },
    })
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if ((await getPreviewJobStatus(submitted.jobId))?.status === "completed") break
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    assert.equal((await getPreviewJobStatus(submitted.jobId))?.status, "completed")
  } finally {
    if (previousLease === undefined) delete process.env.PPT_WORKER_JOB_LEASE_MS
    else process.env.PPT_WORKER_JOB_LEASE_MS = previousLease

    if (previousInterval === undefined) delete process.env.PPT_WORKER_JOB_HEARTBEAT_INTERVAL_MS
    else process.env.PPT_WORKER_JOB_HEARTBEAT_INTERVAL_MS = previousInterval

    if (previousAttempts === undefined) delete process.env.PPT_WORKER_JOB_HEARTBEAT_RETRY_ATTEMPTS
    else process.env.PPT_WORKER_JOB_HEARTBEAT_RETRY_ATTEMPTS = previousAttempts

    if (previousDelay === undefined) delete process.env.PPT_WORKER_JOB_HEARTBEAT_RETRY_DELAY_MS
    else process.env.PPT_WORKER_JOB_HEARTBEAT_RETRY_DELAY_MS = previousDelay
  }
})
