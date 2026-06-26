import { randomUUID } from "node:crypto"

import {
  getConfiguredPptPreviewJobStore,
  setConfiguredPptPreviewJobStoreForTests,
  type PptPreviewJobRecord,
  type PptPreviewJobStatus,
  type PptPreviewJobStore,
} from "./job-store.js"
import type { PreviewRequest } from "./types.js"
import { runPreviewJob } from "./ppt-master-executor.js"

let runPreviewJobImpl = runPreviewJob

function mapPreviewJobStatus(job: PptPreviewJobRecord) {
  if (job.status === "completed") {
    const result = job.result as Awaited<ReturnType<typeof runPreviewJob>> | null

    return {
      jobId: job.jobId,
      status: "completed" as const,
      previewSessionId: result?.previewSessionId ?? "",
      generatedAt: result?.generatedAt ?? "",
      deck: result?.deck ?? null,
    }
  }

  if (job.status === "failed") {
    return {
      jobId: job.jobId,
      status: "failed" as const,
      message: job.errorMessage || "worker_preview_job_failed",
    }
  }

  return {
    jobId: job.jobId,
    status: job.status as Extract<PptPreviewJobStatus, "queued" | "running">,
  }
}

export async function enqueuePreviewJob(request: PreviewRequest) {
  const jobId = randomUUID()
  const store = await getConfiguredPptPreviewJobStore()

  await store.createJob({
    jobId,
    requestId: request.requestId,
  })

  void (async () => {
    try {
      await store.markRunning(jobId)
      const result = await runPreviewJobImpl(request)
      await store.completeJob(jobId, result)
    } catch (error) {
      await store.failJob(jobId, {
        code: "worker_preview_job_failed",
        message: error instanceof Error && error.message ? error.message : "worker_preview_job_failed",
      })
    }
  })()

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
