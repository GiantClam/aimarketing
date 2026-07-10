import assert from "node:assert/strict"
import test from "node:test"

import {
  enqueuePreviewJob,
  getPreviewJobStatus,
  recoverPreviewJobs,
  setPreviewJobDepsForTests,
  shutdownPreviewJobRecovery,
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
