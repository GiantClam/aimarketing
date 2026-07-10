import { pool } from "@/lib/db"

import type { PptPreviewJobRecord, PptPreviewJobStore } from "@/infra/railway/ppt-master-worker/src/job-store"

const PLATFORM_PPT_PREVIEW_JOBS_TABLE = "AI_MARKETING_platform_ppt_preview_jobs"

type PptPreviewJobRow = {
  job_id: string
  request_id: string
  request_payload: unknown | null
  status: PptPreviewJobRecord["status"]
  lease_owner: string | null
  lease_until: Date | string | null
  heartbeat_at: Date | string | null
  attempt_count: number
  result_payload: unknown | null
  error_code: string | null
  error_message: string | null
  created_at: Date | string
  updated_at: Date | string
}

type GlobalWithEnsurePptPreviewJobTableState = typeof globalThis & {
  __aimarketingEnsurePptPreviewJobTablePromise__?: Promise<void> | null
}

const pptPreviewJobEnsureState = globalThis as GlobalWithEnsurePptPreviewJobTableState
let ensurePptPreviewJobTablePromise = pptPreviewJobEnsureState.__aimarketingEnsurePptPreviewJobTablePromise__ ?? null

function toTimestamp(value: Date | string) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

function toNullableTimestamp(value: Date | string | null) {
  return value ? toTimestamp(value) : null
}

function mapJobRow(row: PptPreviewJobRow): PptPreviewJobRecord {
  return {
    jobId: row.job_id,
    requestId: row.request_id,
    request: row.request_payload as PptPreviewJobRecord["request"],
    status: row.status,
    result: row.result_payload,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: toTimestamp(row.created_at),
    updatedAt: toTimestamp(row.updated_at),
    leaseOwner: row.lease_owner,
    leaseUntil: toNullableTimestamp(row.lease_until),
    heartbeatAt: toNullableTimestamp(row.heartbeat_at),
    attemptCount: row.attempt_count,
  }
}

const JOB_COLUMNS = `
  job_id,
  request_id,
  request_payload,
  status,
  lease_owner,
  lease_until,
  heartbeat_at,
  attempt_count,
  result_payload,
  error_code,
  error_message,
  created_at,
  updated_at
`

export async function ensurePptPreviewJobStoreTables() {
  if (!ensurePptPreviewJobTablePromise) {
    ensurePptPreviewJobTablePromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${PLATFORM_PPT_PREVIEW_JOBS_TABLE}" (
          id SERIAL PRIMARY KEY,
          job_id VARCHAR(64) NOT NULL UNIQUE,
          request_id VARCHAR(64) NOT NULL,
          request_payload JSONB,
          status VARCHAR(24) NOT NULL DEFAULT 'queued',
          lease_owner VARCHAR(160),
          lease_until TIMESTAMP,
          heartbeat_at TIMESTAMP,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          result_payload JSONB,
          error_code VARCHAR(120),
          error_message TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)

      await pool.query(`
        ALTER TABLE "${PLATFORM_PPT_PREVIEW_JOBS_TABLE}"
          ADD COLUMN IF NOT EXISTS request_payload JSONB,
          ADD COLUMN IF NOT EXISTS lease_owner VARCHAR(160),
          ADD COLUMN IF NOT EXISTS lease_until TIMESTAMP,
          ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0
      `)

      await pool.query(`
        CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_ppt_preview_jobs_status_created_idx"
        ON "${PLATFORM_PPT_PREVIEW_JOBS_TABLE}" (status, created_at DESC)
      `)
    })().catch((error) => {
      ensurePptPreviewJobTablePromise = null
      pptPreviewJobEnsureState.__aimarketingEnsurePptPreviewJobTablePromise__ = null
      throw error
    })

    pptPreviewJobEnsureState.__aimarketingEnsurePptPreviewJobTablePromise__ = ensurePptPreviewJobTablePromise
  }

  await ensurePptPreviewJobTablePromise
}

export function createPostgresPptPreviewJobStore(): PptPreviewJobStore {
  return {
    async createJob(input) {
      await ensurePptPreviewJobStoreTables()

      const result = await pool.query<PptPreviewJobRow>(
        `
          INSERT INTO "${PLATFORM_PPT_PREVIEW_JOBS_TABLE}" (
            job_id,
            request_id,
            request_payload,
            status
          )
          VALUES ($1, $2, $3::jsonb, 'queued')
          RETURNING ${JOB_COLUMNS}
        `,
        [input.jobId, input.requestId, JSON.stringify(input.request)],
      )

      const row = result.rows[0]
      if (!row) {
        throw new Error("ppt_worker_job_store_create_failed")
      }

      return mapJobRow(row)
    },
    async getJob(jobId) {
      await ensurePptPreviewJobStoreTables()

      const result = await pool.query<PptPreviewJobRow>(
        `
          SELECT ${JOB_COLUMNS}
          FROM "${PLATFORM_PPT_PREVIEW_JOBS_TABLE}"
          WHERE job_id = $1
          LIMIT 1
        `,
        [jobId],
      )

      const row = result.rows[0]
      return row ? mapJobRow(row) : null
    },
    async listRecoverableJobs(limit = 20) {
      await ensurePptPreviewJobStoreTables()

      const result = await pool.query<PptPreviewJobRow>(
        `
          SELECT ${JOB_COLUMNS}
          FROM "${PLATFORM_PPT_PREVIEW_JOBS_TABLE}"
          WHERE status = 'queued'
             OR (status = 'running' AND (lease_until IS NULL OR lease_until <= CURRENT_TIMESTAMP))
          ORDER BY created_at ASC
          LIMIT $1
        `,
        [limit],
      )

      return result.rows.map(mapJobRow)
    },
    async claimJob(jobId, workerId, leaseMs) {
      await ensurePptPreviewJobStoreTables()

      const result = await pool.query<PptPreviewJobRow>(
        `
          UPDATE "${PLATFORM_PPT_PREVIEW_JOBS_TABLE}"
          SET
            status = 'running',
            lease_owner = $2,
            lease_until = CURRENT_TIMESTAMP + ($3 * INTERVAL '1 millisecond'),
            heartbeat_at = CURRENT_TIMESTAMP,
            attempt_count = attempt_count + 1,
            updated_at = CURRENT_TIMESTAMP
          WHERE job_id = $1
            AND (
              status = 'queued'
              OR (status = 'running' AND (lease_until IS NULL OR lease_until <= CURRENT_TIMESTAMP))
            )
          RETURNING ${JOB_COLUMNS}
        `,
        [jobId, workerId, leaseMs],
      )

      return result.rows[0] ? mapJobRow(result.rows[0]) : null
    },
    async heartbeatJob(jobId, workerId, leaseMs) {
      await ensurePptPreviewJobStoreTables()

      const result = await pool.query(
        `
          UPDATE "${PLATFORM_PPT_PREVIEW_JOBS_TABLE}"
          SET
            lease_until = CURRENT_TIMESTAMP + ($3 * INTERVAL '1 millisecond'),
            heartbeat_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE job_id = $1
            AND status = 'running'
            AND lease_owner = $2
        `,
        [jobId, workerId, leaseMs],
      )

      return result.rowCount === 1
    },
    async releaseLease(jobId, workerId) {
      await ensurePptPreviewJobStoreTables()

      const result = await pool.query(
        `
          UPDATE "${PLATFORM_PPT_PREVIEW_JOBS_TABLE}"
          SET
            status = 'queued',
            lease_owner = NULL,
            lease_until = NULL,
            heartbeat_at = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE job_id = $1
            AND status = 'running'
            AND lease_owner = $2
        `,
        [jobId, workerId],
      )

      return result.rowCount === 1
    },
    async completeJob(jobId, workerId, resultPayload) {
      await ensurePptPreviewJobStoreTables()

      const result = await pool.query(
        `
          UPDATE "${PLATFORM_PPT_PREVIEW_JOBS_TABLE}"
          SET
            status = 'completed',
            result_payload = $3::jsonb,
            lease_owner = NULL,
            lease_until = NULL,
            heartbeat_at = NULL,
            error_code = NULL,
            error_message = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE job_id = $1
            AND status = 'running'
            AND lease_owner = $2
        `,
        [jobId, workerId, JSON.stringify(resultPayload ?? null)],
      )

      return result.rowCount === 1
    },
    async failJob(jobId, workerId, error) {
      await ensurePptPreviewJobStoreTables()

      const result = await pool.query(
        `
          UPDATE "${PLATFORM_PPT_PREVIEW_JOBS_TABLE}"
          SET
            status = 'failed',
            result_payload = NULL,
            lease_owner = NULL,
            lease_until = NULL,
            heartbeat_at = NULL,
            error_code = $3,
            error_message = $4,
            updated_at = CURRENT_TIMESTAMP
          WHERE job_id = $1
            AND status = 'running'
            AND lease_owner = $2
        `,
        [jobId, workerId, error.code, error.message],
      )

      return result.rowCount === 1
    },
  }
}

export async function getPptPreviewJobByRequestId(requestId: string) {
  const normalizedRequestId = requestId.trim()
  if (!normalizedRequestId) return null

  await ensurePptPreviewJobStoreTables()
  const result = await pool.query<PptPreviewJobRow>(
    `
      SELECT ${JOB_COLUMNS}
      FROM "${PLATFORM_PPT_PREVIEW_JOBS_TABLE}"
      WHERE request_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [normalizedRequestId],
  )

  const row = result.rows[0]
  return row ? mapJobRow(row) : null
}
