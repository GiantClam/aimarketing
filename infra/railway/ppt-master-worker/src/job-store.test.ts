import assert from "node:assert/strict"
import test from "node:test"

import { createInMemoryPptPreviewJobStore } from "./job-store.js"

test("in-memory ppt preview job store tracks queued running and completed states", async () => {
  const store = createInMemoryPptPreviewJobStore()

  await store.createJob({ jobId: "job_1", requestId: "req_1" })
  await store.markRunning("job_1")
  await store.completeJob("job_1", { previewSessionId: "session_1" })

  const job = await store.getJob("job_1")
  assert.equal(job?.status, "completed")
  assert.deepEqual(job?.result, { previewSessionId: "session_1" })
  assert.equal(job?.errorCode, null)
  assert.equal(job?.errorMessage, null)
})

test("in-memory ppt preview job store preserves failure payloads", async () => {
  const store = createInMemoryPptPreviewJobStore()

  await store.createJob({ jobId: "job_failed", requestId: "req_failed" })
  await store.failJob("job_failed", {
    code: "ppt_timeout",
    message: "ppt_master_runtime_slide_timeout",
  })

  const job = await store.getJob("job_failed")
  assert.equal(job?.status, "failed")
  assert.equal(job?.errorCode, "ppt_timeout")
  assert.equal(job?.errorMessage, "ppt_master_runtime_slide_timeout")
  assert.equal(job?.result, null)
})
