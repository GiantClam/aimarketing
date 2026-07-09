import { pool } from "@/lib/db"

import type { PptPreviewJobRecord, PptPreviewJobStore } from "@/infra/railway/ppt-master-worker/src/job-store"

const PLATFORM_PPT_PREVIEW_JOBS_TABLE = "AI_MARKETING_platform_ppt_preview_jobs"

type PptPreviewJobRow = {
  job_id: string
  request_id: string
  status: PptPreviewJobRecord["status"]
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

function mapJobRow(row: PptPreviewJobRow): PptPreviewJobRecord {
  return {
    jobId: row.job_id,
    requestId: row.request_id,
    status: row.status,
    result: row.result_payload,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: toTimestamp(row.created_at),
    updatedAt: toTimestamp(row.updated_at),
  }
}

export async function ensurePptPreviewJobStoreTables() {
  if (!ensurePptPreviewJobTablePromise) {
    ensurePptPreviewJobTablePromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${PLATFORM_PPT_PREVIEW_JOBS_TABLE}" (
          id SERIAL PRIMARY KEY,
          job_id VARCHAR(64) NOT NULL UNIQUE,
          request_id VARCHAR(64) NOT NULL,
          status VARCHAR(24) NOT NULL DEFAULT 'queued',
          result_payload JSONB,
          error_code VARCHAR(120),
          error_message TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
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
            status
          )
          VALUES ($1, $2, 'queued')
          RETURNING
            job_id,
            request_id,
            status,
            result_payload,
            error_code,
            error_message,
            created_at,
            updated_at
        `,
        [input.jobId, input.requestId],
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
          SELECT
            job_id,
            request_id,
            status,
            result_payload,
            error_code,
            error_message,
            created_at,
            updated_at
          FROM "${PLATFORM_PPT_PREVIEW_JOBS_TABLE}"
          WHERE job_id = $1
          LIMIT 1
        `,
        [jobId],
      )

      const row = result.rows[0]
      return row ? mapJobRow(row) : null
    },
    async markRunning(jobId) {
      await ensurePptPreviewJobStoreTables()

      await pool.query(
        `
          UPDATE "${PLATFORM_PPT_PREVIEW_JOBS_TABLE}"
          SET status = 'running', updated_at = CURRENT_TIMESTAMP
          WHERE job_id = $1
        `,
        [jobId],
      )
    },
    async completeJob(jobId, result) {
      await ensurePptPreviewJobStoreTables()

      await pool.query(
        `
          UPDATE "${PLATFORM_PPT_PREVIEW_JOBS_TABLE}"
          SET
            status = 'completed',
            result_payload = $2::jsonb,
            error_code = NULL,
            error_message = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE job_id = $1
        `,
        [jobId, JSON.stringify(result ?? null)],
      )
    },
    async failJob(jobId, error) {
      await ensurePptPreviewJobStoreTables()

      await pool.query(
        `
          UPDATE "${PLATFORM_PPT_PREVIEW_JOBS_TABLE}"
          SET
            status = 'failed',
            result_payload = NULL,
            error_code = $2,
            error_message = $3,
            updated_at = CURRENT_TIMESTAMP
          WHERE job_id = $1
        `,
        [jobId, error.code, error.message],
      )
    },
  }
}

export async function getPptPreviewJobByRequestId(requestId: string) {
  const normalizedRequestId = requestId.trim()
  if (!normalizedRequestId) return null

  await ensurePptPreviewJobStoreTables()
  const result = await pool.query<PptPreviewJobRow>(
    `
      SELECT
        job_id,
        request_id,
        status,
        result_payload,
        error_code,
        error_message,
        created_at,
        updated_at
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
