import assert from "node:assert/strict"
import test from "node:test"

import { createInMemoryPptPreviewJobStore } from "./job-store.js"

const request = {
  requestId: "req_1",
  prompt: "Build deck",
  scenario: "sales-deck" as const,
  language: "zh-CN" as const,
  templateMode: "single-template" as const,
  templateId: "academic_defense",
  allowMockFallback: false,
  runtimeProfile: "railway-linux" as const,
}

test("in-memory ppt preview job store tracks lease heartbeats and completion ownership", async () => {
  const store = createInMemoryPptPreviewJobStore()

  await store.createJob({ jobId: "job_1", requestId: "req_1", request })
  const claimed = await store.claimJob("job_1", "worker_1", 1000)
  assert.equal(claimed?.leaseOwner, "worker_1")
  assert.deepEqual(claimed?.request, request)
  assert.equal(await store.heartbeatJob("job_1", "worker_1", 1000), true)
  assert.equal(await store.completeJob("job_1", "worker_2", { previewSessionId: "wrong" }), false)
  assert.equal(await store.completeJob("job_1", "worker_1", { previewSessionId: "session_1" }), true)

  const job = await store.getJob("job_1")
  assert.equal(job?.status, "completed")
  assert.deepEqual(job?.result, { previewSessionId: "session_1" })
  assert.equal(job?.errorCode, null)
  assert.equal(job?.errorMessage, null)
})

test("in-memory ppt preview job store preserves failure payloads", async () => {
  const store = createInMemoryPptPreviewJobStore()

  await store.createJob({ jobId: "job_failed", requestId: "req_failed", request: { ...request, requestId: "req_failed" } })
  await store.claimJob("job_failed", "worker_1", 1000)
  await store.failJob("job_failed", "worker_1", {
    code: "ppt_timeout",
    message: "ppt_master_runtime_slide_timeout",
  })

  const job = await store.getJob("job_failed")
  assert.equal(job?.status, "failed")
  assert.equal(job?.errorCode, "ppt_timeout")
  assert.equal(job?.errorMessage, "ppt_master_runtime_slide_timeout")
  assert.equal(job?.result, null)
})

test("expired leases are recoverable by a new worker", async () => {
  const store = createInMemoryPptPreviewJobStore()

  await store.createJob({ jobId: "job_recover", requestId: "req_recover", request })
  await store.claimJob("job_recover", "worker_1", 0)

  const recoverable = await store.listRecoverableJobs()
  assert.equal(recoverable.length, 1)
  assert.equal(recoverable[0]?.jobId, "job_recover")

  const reclaimed = await store.claimJob("job_recover", "worker_2", 1000)
  assert.equal(reclaimed?.leaseOwner, "worker_2")
  assert.equal(await store.heartbeatJob("job_recover", "worker_1", 1000), false)
})
