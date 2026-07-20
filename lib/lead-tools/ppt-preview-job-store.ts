import { sql } from "drizzle-orm"

import { db } from "@/lib/db"

export type LeadToolPptPreviewJobStatus = "queued" | "running" | "succeeded" | "failed"

export type LeadToolPptPreviewJobRecord = {
  id: number
  toolSlug: string
  userId: number | null
  enterpriseId: number | null
  externalJobId: string
  status: LeadToolPptPreviewJobStatus
  inputPayload: Record<string, unknown>
  normalizedResult: Record<string, unknown> | null
  errorMessage: string | null
  createdAt: Date
  updatedAt: Date
  finishedAt: Date | null
}

type PreviewJobRow = Omit<LeadToolPptPreviewJobRecord, "inputPayload" | "normalizedResult"> & {
  inputPayload: unknown
  normalizedResult: unknown
}

type GlobalWithPreviewJobEnsureState = typeof globalThis & {
  __aimarketingEnsureLeadToolPptPreviewJobsPromise__?: Promise<void> | null
}

const ensureState = globalThis as GlobalWithPreviewJobEnsureState
let ensurePromise = ensureState.__aimarketingEnsureLeadToolPptPreviewJobsPromise__ ?? null

export async function ensureLeadToolPptPreviewJobsTable() {
  if (!ensurePromise) {
    ensurePromise = db
      .execute(sql`
        CREATE TABLE IF NOT EXISTS "AI_MARKETING_lead_tool_ppt_preview_jobs" (
          id SERIAL PRIMARY KEY,
          tool_slug VARCHAR(128) NOT NULL,
          user_id INTEGER,
          enterprise_id INTEGER,
          external_job_id VARCHAR(255) NOT NULL UNIQUE,
          status VARCHAR(24) NOT NULL DEFAULT 'queued',
          input_payload JSONB NOT NULL,
          normalized_result JSONB,
          error_message TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          finished_at TIMESTAMP
        )
      `)
      .then(() => undefined)
      .catch((error) => {
        ensurePromise = null
        ensureState.__aimarketingEnsureLeadToolPptPreviewJobsPromise__ = null
        throw error
      })
    ensureState.__aimarketingEnsureLeadToolPptPreviewJobsPromise__ = ensurePromise
  }

  await ensurePromise
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeRow(row: PreviewJobRow): LeadToolPptPreviewJobRecord {
  return {
    ...row,
    status: row.status as LeadToolPptPreviewJobStatus,
    inputPayload: parseJsonObject(row.inputPayload) ?? {},
    normalizedResult: parseJsonObject(row.normalizedResult),
  }
}

function firstRow<T>(result: { rows?: unknown[] }) {
  return (result.rows?.[0] as T | undefined) ?? null
}

export async function createLeadToolPptPreviewJob(input: {
  toolSlug: string
  userId?: number | null
  enterpriseId?: number | null
  externalJobId: string
  inputPayload: Record<string, unknown>
}) {
  await ensureLeadToolPptPreviewJobsTable()

  const result = await db.execute(sql`
    INSERT INTO "AI_MARKETING_lead_tool_ppt_preview_jobs"
      (tool_slug, user_id, enterprise_id, external_job_id, status, input_payload)
    VALUES
      (${input.toolSlug}, ${input.userId ?? null}, ${input.enterpriseId ?? null}, ${input.externalJobId}, 'queued', ${JSON.stringify(input.inputPayload)}::jsonb)
    RETURNING
      id,
      tool_slug AS "toolSlug",
      user_id AS "userId",
      enterprise_id AS "enterpriseId",
      external_job_id AS "externalJobId",
      status,
      input_payload AS "inputPayload",
      normalized_result AS "normalizedResult",
      error_message AS "errorMessage",
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      finished_at AS "finishedAt"
  `)

  const row = firstRow<PreviewJobRow>(result)
  if (!row) throw new Error("lead_tool_ppt_preview_job_create_failed")
  return normalizeRow(row)
}

export async function getLeadToolPptPreviewJob(externalJobId: string) {
  await ensureLeadToolPptPreviewJobsTable()

  const result = await db.execute(sql`
    SELECT
      id,
      tool_slug AS "toolSlug",
      user_id AS "userId",
      enterprise_id AS "enterpriseId",
      external_job_id AS "externalJobId",
      status,
      input_payload AS "inputPayload",
      normalized_result AS "normalizedResult",
      error_message AS "errorMessage",
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      finished_at AS "finishedAt"
    FROM "AI_MARKETING_lead_tool_ppt_preview_jobs"
    WHERE external_job_id = ${externalJobId}
    LIMIT 1
  `)

  const row = firstRow<PreviewJobRow>(result)
  return row ? normalizeRow(row) : null
}

export async function listPendingLeadToolPptPreviewJobs(limit = 25) {
  await ensureLeadToolPptPreviewJobsTable()

  const result = await db.execute(sql`
    SELECT
      id,
      tool_slug AS "toolSlug",
      user_id AS "userId",
      enterprise_id AS "enterpriseId",
      external_job_id AS "externalJobId",
      status,
      input_payload AS "inputPayload",
      normalized_result AS "normalizedResult",
      error_message AS "errorMessage",
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      finished_at AS "finishedAt"
    FROM "AI_MARKETING_lead_tool_ppt_preview_jobs"
    WHERE status IN ('queued', 'running')
      AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    ORDER BY created_at ASC
    LIMIT ${Math.max(1, Math.min(100, limit))}
  `)

  return (result.rows as PreviewJobRow[]).map(normalizeRow)
}

export async function updateLeadToolPptPreviewJob(
  jobId: number,
  input: {
    status: LeadToolPptPreviewJobStatus
    normalizedResult?: Record<string, unknown> | null
    errorMessage?: string | null
  },
) {
  await ensureLeadToolPptPreviewJobsTable()

  const finished = input.status === "succeeded" || input.status === "failed"
  await db.execute(sql`
    UPDATE "AI_MARKETING_lead_tool_ppt_preview_jobs"
    SET
      status = ${input.status},
      normalized_result = ${input.normalizedResult === undefined ? null : JSON.stringify(input.normalizedResult)}::jsonb,
      error_message = ${input.errorMessage ?? null},
      updated_at = CURRENT_TIMESTAMP,
      finished_at = ${finished ? sql`CURRENT_TIMESTAMP` : sql`finished_at`}
    WHERE id = ${jobId}
  `)
}
