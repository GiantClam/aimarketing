import type { PreviewRequest } from "./types.js"

export type PptPreviewJobStatus = "queued" | "running" | "completed" | "failed"

export type PptPreviewJobRecord = {
  jobId: string
  requestId: string
  request: PreviewRequest | null
  status: PptPreviewJobStatus
  createdAt: number
  updatedAt: number
  leaseOwner: string | null
  leaseUntil: number | null
  heartbeatAt: number | null
  attemptCount: number
  result: unknown | null
  errorCode: string | null
  errorMessage: string | null
}

export interface PptPreviewJobStore {
  createJob(input: { jobId: string; requestId: string; request: PreviewRequest }): Promise<PptPreviewJobRecord>
  getJob(jobId: string): Promise<PptPreviewJobRecord | null>
  listRecoverableJobs(limit?: number): Promise<PptPreviewJobRecord[]>
  claimJob(jobId: string, workerId: string, leaseMs: number): Promise<PptPreviewJobRecord | null>
  heartbeatJob(jobId: string, workerId: string, leaseMs: number): Promise<boolean>
  releaseLease(jobId: string, workerId: string): Promise<boolean>
  completeJob(jobId: string, workerId: string, result: unknown): Promise<boolean>
  failJob(jobId: string, workerId: string, error: { code: string; message: string }): Promise<boolean>
  clearForTests?(): Promise<void> | void
}

function buildBaseRecord(input: {
  jobId: string
  requestId: string
  request?: PreviewRequest | null
  status?: PptPreviewJobStatus
  createdAt?: number
  updatedAt?: number
  leaseOwner?: string | null
  leaseUntil?: number | null
  heartbeatAt?: number | null
  attemptCount?: number
  result?: unknown | null
  errorCode?: string | null
  errorMessage?: string | null
}): PptPreviewJobRecord {
  const now = Date.now()

  return {
    jobId: input.jobId,
    requestId: input.requestId,
    request: input.request ?? null,
    status: input.status ?? "queued",
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    leaseOwner: input.leaseOwner ?? null,
    leaseUntil: input.leaseUntil ?? null,
    heartbeatAt: input.heartbeatAt ?? null,
    attemptCount: input.attemptCount ?? 0,
    result: input.result ?? null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
  }
}

export function createInMemoryPptPreviewJobStore(): PptPreviewJobStore {
  const jobs = new Map<string, PptPreviewJobRecord>()

  return {
    async createJob(input) {
      const record = buildBaseRecord(input)
      jobs.set(record.jobId, record)
      return record
    },
    async getJob(jobId) {
      return jobs.get(jobId) ?? null
    },
    async listRecoverableJobs(limit = 20) {
      const now = Date.now()
      return [...jobs.values()]
        .filter((job) => job.status === "queued" || (job.status === "running" && (!job.leaseUntil || job.leaseUntil <= now)))
        .sort((left, right) => left.createdAt - right.createdAt)
        .slice(0, limit)
    },
    async claimJob(jobId, workerId, leaseMs) {
      const current = jobs.get(jobId)
      const now = Date.now()
      if (!current || (current.status !== "queued" && !(current.status === "running" && (!current.leaseUntil || current.leaseUntil <= now)))) {
        return null
      }
      const claimed = {
        ...current,
        status: "running",
        updatedAt: now,
        leaseOwner: workerId,
        leaseUntil: now + leaseMs,
        heartbeatAt: now,
        attemptCount: current.attemptCount + 1,
      } satisfies PptPreviewJobRecord
      jobs.set(jobId, claimed)
      return claimed
    },
    async heartbeatJob(jobId, workerId, leaseMs) {
      const current = jobs.get(jobId)
      const now = Date.now()
      if (!current || current.status !== "running" || current.leaseOwner !== workerId) return false
      jobs.set(jobId, {
        ...current,
        updatedAt: now,
        leaseUntil: now + leaseMs,
        heartbeatAt: now,
      })
      return true
    },
    async releaseLease(jobId, workerId) {
      const current = jobs.get(jobId)
      if (!current || current.leaseOwner !== workerId) return false
      jobs.set(jobId, {
        ...current,
        status: "queued",
        leaseOwner: null,
        leaseUntil: null,
        heartbeatAt: null,
        updatedAt: Date.now(),
      })
      return true
    },
    async completeJob(jobId, workerId, result) {
      const current = jobs.get(jobId)
      if (!current || current.leaseOwner !== workerId) return false
      jobs.set(jobId, {
        ...current,
        status: "completed",
        result,
        leaseOwner: null,
        leaseUntil: null,
        heartbeatAt: null,
        errorCode: null,
        errorMessage: null,
        updatedAt: Date.now(),
      })
      return true
    },
    async failJob(jobId, workerId, error) {
      const current = jobs.get(jobId)
      if (!current || current.leaseOwner !== workerId) return false
      jobs.set(jobId, {
        ...current,
        status: "failed",
        result: null,
        leaseOwner: null,
        leaseUntil: null,
        heartbeatAt: null,
        errorCode: error.code,
        errorMessage: error.message,
        updatedAt: Date.now(),
      })
      return true
    },
    async clearForTests() {
      jobs.clear()
    },
  }
}

function hasDatabaseConfig() {
  return Boolean(
    process.env.AI_MARKETING_DB_POSTGRES_URL?.trim() ||
      process.env.AI_MARKETING_DB_POSTGRES_URL_NON_POOLING?.trim() ||
      process.env.DATABASE_URL?.trim() ||
      process.env.DATABASE_URL_UNPOOLED?.trim(),
  )
}

export function resolvePptPreviewJobStoreMode() {
  const explicit = process.env.PPT_WORKER_PREVIEW_JOB_STORE?.trim().toLowerCase()
  if (explicit === "memory" || explicit === "postgres") {
    return explicit
  }

  if (process.env.NODE_ENV === "test") {
    return "memory" as const
  }

  if (process.env.RAILWAY_ENVIRONMENT?.trim()) {
    return "postgres" as const
  }

  if (hasDatabaseConfig()) {
    return "postgres" as const
  }

  return "memory" as const
}

let configuredStorePromise: Promise<PptPreviewJobStore> | null = null
let testStoreOverride: PptPreviewJobStore | null = process.env.NODE_ENV === "test" ? createInMemoryPptPreviewJobStore() : null

async function createConfiguredPptPreviewJobStore() {
  const mode = resolvePptPreviewJobStoreMode()
  if (mode === "memory") {
    return createInMemoryPptPreviewJobStore()
  }

  if (!hasDatabaseConfig()) {
    throw new Error("ppt_worker_job_store_db_unavailable")
  }

  const { createPostgresPptPreviewJobStore } = await import("@/lib/platform/ppt-job-store")
  return createPostgresPptPreviewJobStore()
}

export async function getConfiguredPptPreviewJobStore() {
  if (testStoreOverride) {
    return testStoreOverride
  }

  if (!configuredStorePromise) {
    configuredStorePromise = createConfiguredPptPreviewJobStore().catch((error) => {
      configuredStorePromise = null
      throw error
    })
  }

  return configuredStorePromise
}

export function setConfiguredPptPreviewJobStoreForTests(store: PptPreviewJobStore | null) {
  configuredStorePromise = null

  if (process.env.NODE_ENV === "test") {
    testStoreOverride = store ?? createInMemoryPptPreviewJobStore()
    return
  }

  testStoreOverride = store
}
