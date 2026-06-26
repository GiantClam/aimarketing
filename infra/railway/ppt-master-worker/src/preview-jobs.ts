import { randomUUID } from "node:crypto"

import type { PreviewRequest } from "./types.js"
import { runPreviewJob } from "./ppt-master-executor.js"

type PreviewJobStatus = "queued" | "running" | "completed" | "failed"

type PreviewJobState =
  | {
      jobId: string
      requestId: string
      status: "queued" | "running"
      createdAt: number
      updatedAt: number
    }
  | {
      jobId: string
      requestId: string
      status: "completed"
      createdAt: number
      updatedAt: number
      result: Awaited<ReturnType<typeof runPreviewJob>>
    }
  | {
      jobId: string
      requestId: string
      status: "failed"
      createdAt: number
      updatedAt: number
      message: string
    }

type GlobalWithPreviewJobs = typeof globalThis & {
  __pptMasterWorkerPreviewJobsV1__?: Map<string, PreviewJobState>
}

const PREVIEW_JOB_TTL_MS = 1000 * 60 * 30

let runPreviewJobImpl = runPreviewJob

function getPreviewJobStore() {
  const globalScope = globalThis as GlobalWithPreviewJobs
  if (!globalScope.__pptMasterWorkerPreviewJobsV1__) {
    globalScope.__pptMasterWorkerPreviewJobsV1__ = new Map()
  }

  return globalScope.__pptMasterWorkerPreviewJobsV1__
}

function pruneExpiredJobs() {
  const now = Date.now()
  const store = getPreviewJobStore()

  for (const [jobId, job] of store.entries()) {
    if (now - job.updatedAt > PREVIEW_JOB_TTL_MS) {
      store.delete(jobId)
    }
  }
}

export async function enqueuePreviewJob(request: PreviewRequest) {
  pruneExpiredJobs()
  const jobId = randomUUID()
  const now = Date.now()
  const store = getPreviewJobStore()

  store.set(jobId, {
    jobId,
    requestId: request.requestId,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  })

  void (async () => {
    store.set(jobId, {
      jobId,
      requestId: request.requestId,
      status: "running",
      createdAt: now,
      updatedAt: Date.now(),
    })

    try {
      const result = await runPreviewJobImpl(request)
      store.set(jobId, {
        jobId,
        requestId: request.requestId,
        status: "completed",
        createdAt: now,
        updatedAt: Date.now(),
        result,
      })
    } catch (error) {
      store.set(jobId, {
        jobId,
        requestId: request.requestId,
        status: "failed",
        createdAt: now,
        updatedAt: Date.now(),
        message: error instanceof Error && error.message ? error.message : "worker_preview_job_failed",
      })
    }
  })()

  return {
    jobId,
    status: "queued" as const,
  }
}

export function getPreviewJobStatus(jobId: string) {
  pruneExpiredJobs()
  const job = getPreviewJobStore().get(jobId)
  if (!job) return null

  if (job.status === "completed") {
    return {
      jobId,
      status: "completed" as const,
      previewSessionId: job.result.previewSessionId,
      generatedAt: job.result.generatedAt,
      deck: job.result.deck,
    }
  }

  if (job.status === "failed") {
    return {
      jobId,
      status: "failed" as const,
      message: job.message,
    }
  }

  return {
    jobId,
    status: job.status as Extract<PreviewJobStatus, "queued" | "running">,
  }
}

export function setPreviewJobDepsForTests(
  deps:
    | {
        runPreviewJob?: typeof runPreviewJob
      }
    | null,
) {
  runPreviewJobImpl = deps?.runPreviewJob ?? runPreviewJob
  getPreviewJobStore().clear()
}
