export type PptPreviewJobStatus = "queued" | "running" | "completed" | "failed"

export type PptPreviewJobRecord = {
  jobId: string
  requestId: string
  status: PptPreviewJobStatus
  createdAt: number
  updatedAt: number
  result: unknown | null
  errorCode: string | null
  errorMessage: string | null
}

export interface PptPreviewJobStore {
  createJob(input: { jobId: string; requestId: string }): Promise<PptPreviewJobRecord>
  getJob(jobId: string): Promise<PptPreviewJobRecord | null>
  markRunning(jobId: string): Promise<void>
  completeJob(jobId: string, result: unknown): Promise<void>
  failJob(jobId: string, error: { code: string; message: string }): Promise<void>
  clearForTests?(): Promise<void> | void
}

function buildBaseRecord(input: {
  jobId: string
  requestId: string
  status?: PptPreviewJobStatus
  createdAt?: number
  updatedAt?: number
  result?: unknown | null
  errorCode?: string | null
  errorMessage?: string | null
}): PptPreviewJobRecord {
  const now = Date.now()

  return {
    jobId: input.jobId,
    requestId: input.requestId,
    status: input.status ?? "queued",
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
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
    async markRunning(jobId) {
      const current = jobs.get(jobId)
      if (!current) return
      jobs.set(jobId, {
        ...current,
        status: "running",
        updatedAt: Date.now(),
      })
    },
    async completeJob(jobId, result) {
      const current = jobs.get(jobId)
      if (!current) return
      jobs.set(jobId, {
        ...current,
        status: "completed",
        result,
        errorCode: null,
        errorMessage: null,
        updatedAt: Date.now(),
      })
    },
    async failJob(jobId, error) {
      const current = jobs.get(jobId)
      if (!current) return
      jobs.set(jobId, {
        ...current,
        status: "failed",
        result: null,
        errorCode: error.code,
        errorMessage: error.message,
        updatedAt: Date.now(),
      })
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
