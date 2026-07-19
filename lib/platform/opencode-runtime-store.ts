import { sql } from "drizzle-orm"

import { db } from "@/lib/db"

export type OpenCodeRuntimeRunStatus = "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled" | "timed_out"

export type OpenCodeRuntimeRunRecord = {
  id: number
  taskRunId: number
  runtimeRunId: string
  sessionKey: string
  conversationId: string | null
  agentId: string | null
  functionId: string | null
  backend: string
  status: OpenCodeRuntimeRunStatus
  dispatchKey: string | null
  workflowInstanceId: string | null
  opencodeSessionId: string | null
  sandboxId: string | null
  workspaceBackup: Record<string, unknown> | null
  attempt: number
  maxAttempts: number
  deadlineAt: Date
  leaseOwner: string | null
  leaseExpiresAt: Date | null
  billingPayload: Record<string, unknown> | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  createdAt: Date
  updatedAt: Date
  finishedAt: Date | null
}

export type OpenCodeRuntimeCheckpointRecord = {
  id: number
  runtimeRunId: string
  sequence: number
  stage: string
  backupHandle: Record<string, unknown> | null
  resumePayload: Record<string, unknown>
  artifactIds: number[]
  createdAt: Date
}

export type RailwayOpenCodeRuntimeEvent = {
  sequence: number
  event: Record<string, unknown>
  createdAt: Date
}

export type RailwayOpenCodeRuntimeState = {
  runtimeRunId: string
  status: OpenCodeRuntimeRunStatus
  events: RailwayOpenCodeRuntimeEvent[]
  nextSequence: number
  error: string | null
  updatedAt: Date
}

type DbResult = { rows?: unknown[] }

function firstRow<T>(result: DbResult) {
  return (result.rows?.[0] as T | undefined) ?? null
}

function jsonb(value: Record<string, unknown> | number[] | null | undefined) {
  return value === undefined || value === null ? null : JSON.stringify(value)
}

export function isRuntimeRunTerminal(status: OpenCodeRuntimeRunStatus) {
  return status === "succeeded" || status === "failed" || status === "cancelled" || status === "timed_out"
}

export function canClaimRuntimeRun(input: {
  status: OpenCodeRuntimeRunStatus
  leaseOwner: string | null
  leaseExpiresAt: Date | null
  attempt: number
  maxAttempts: number
  owner: string
  now: Date
}) {
  if (isRuntimeRunTerminal(input.status) || input.attempt >= input.maxAttempts) return false
  if (input.status === "queued") return true
  if (input.leaseOwner === input.owner) return true
  return input.status === "running" && Boolean(input.leaseExpiresAt && input.leaseExpiresAt <= input.now)
}

export async function ensureOpenCodeRuntimeTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "AI_MARKETING_platform_opencode_runtime_runs" (
      id BIGSERIAL PRIMARY KEY,
      task_run_id INTEGER NOT NULL UNIQUE REFERENCES "AI_MARKETING_platform_task_runs"(id) ON DELETE CASCADE,
      runtime_run_id UUID NOT NULL UNIQUE,
      session_key VARCHAR(64) NOT NULL,
      conversation_id VARCHAR(128),
      agent_id VARCHAR(128),
      function_id VARCHAR(64),
      backend VARCHAR(40) NOT NULL DEFAULT 'cloudflare-opencode-session',
      status VARCHAR(24) NOT NULL DEFAULT 'queued',
      dispatch_key TEXT,
      workflow_instance_id VARCHAR(128),
      opencode_session_id VARCHAR(128),
      sandbox_id VARCHAR(128),
      workspace_backup JSONB,
      attempt INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      deadline_at TIMESTAMPTZ NOT NULL,
      lease_owner VARCHAR(128),
      lease_expires_at TIMESTAMPTZ,
      billing_payload JSONB,
      last_error_code VARCHAR(128),
      last_error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    )
  `)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "AI_MARKETING_platform_opencode_runtime_checkpoints" (
      id BIGSERIAL PRIMARY KEY,
      runtime_run_id UUID NOT NULL REFERENCES "AI_MARKETING_platform_opencode_runtime_runs"(runtime_run_id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      stage VARCHAR(128) NOT NULL,
      backup_handle JSONB,
      resume_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      artifact_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(runtime_run_id, sequence)
    )
  `)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "AI_MARKETING_platform_railway_opencode_runtime_states" (
      runtime_run_id UUID PRIMARY KEY,
      status VARCHAR(24) NOT NULL DEFAULT 'queued',
      events JSONB NOT NULL DEFAULT '[]'::jsonb,
      next_sequence INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "AI_MARKETING_platform_railway_opencode_runtime_events" (
      id BIGSERIAL PRIMARY KEY,
      runtime_run_id UUID NOT NULL REFERENCES "AI_MARKETING_platform_railway_opencode_runtime_states"(runtime_run_id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      event JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(runtime_run_id, sequence)
    )
  `)
}

function asEvent(value: unknown): RailwayOpenCodeRuntimeEvent | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (typeof record.sequence !== "number" || !Number.isInteger(record.sequence) || !record.event || typeof record.event !== "object") return null
  return {
    sequence: record.sequence,
    event: record.event as Record<string, unknown>,
    createdAt: record.createdAt instanceof Date ? record.createdAt : new Date(typeof record.createdAt === "string" ? record.createdAt : Date.now()),
  }
}

function mapRailwayState(row: Record<string, unknown> | null): RailwayOpenCodeRuntimeState | null {
  if (!row || typeof row.runtimeRunId !== "string") return null
  const events = Array.isArray(row.events) ? row.events.map(asEvent).filter((event): event is RailwayOpenCodeRuntimeEvent => Boolean(event)) : []
  return {
    runtimeRunId: row.runtimeRunId,
    status: typeof row.status === "string" ? row.status as OpenCodeRuntimeRunStatus : "queued",
    events,
    nextSequence: typeof row.nextSequence === "number" ? row.nextSequence : events.length,
    error: typeof row.error === "string" ? row.error : null,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(typeof row.updatedAt === "string" ? row.updatedAt : Date.now()),
  }
}

export async function ensureRailwayOpenCodeRuntimeState(runtimeRunId: string, status: OpenCodeRuntimeRunStatus = "queued") {
  await ensureOpenCodeRuntimeTables()
  await db.execute(sql`
    INSERT INTO "AI_MARKETING_platform_railway_opencode_runtime_states" (runtime_run_id, status)
    VALUES (${runtimeRunId}::uuid, ${status})
    ON CONFLICT (runtime_run_id) DO NOTHING
  `)
}

export async function appendRailwayOpenCodeRuntimeEvent(input: {
  runtimeRunId: string
  event: Record<string, unknown>
  status?: OpenCodeRuntimeRunStatus
  error?: string | null
}) {
  await ensureRailwayOpenCodeRuntimeState(input.runtimeRunId, input.status || "running")
  return db.transaction(async (tx) => {
    const current = await tx.execute(sql`
      SELECT next_sequence AS "nextSequence"
      FROM "AI_MARKETING_platform_railway_opencode_runtime_states"
      WHERE runtime_run_id = ${input.runtimeRunId}::uuid
      FOR UPDATE
    `)
    const sequence = Number(firstRow<{ nextSequence?: number }>(current)?.nextSequence || 0)
    await tx.execute(sql`
      INSERT INTO "AI_MARKETING_platform_railway_opencode_runtime_events" (runtime_run_id, sequence, event)
      VALUES (${input.runtimeRunId}::uuid, ${sequence}, ${JSON.stringify(input.event)}::jsonb)
    `)
    const result = await tx.execute(sql`
      UPDATE "AI_MARKETING_platform_railway_opencode_runtime_states"
      SET
        next_sequence = ${sequence + 1},
        status = CASE
          WHEN status IN ('succeeded', 'failed', 'cancelled', 'timed_out') THEN status
          ELSE COALESCE(${input.status || null}, status)
        END,
        error = CASE WHEN CAST(${input.error === undefined ? null : input.error} AS TEXT) IS NULL THEN error ELSE CAST(${input.error ?? null} AS TEXT) END,
        updated_at = CURRENT_TIMESTAMP
      WHERE runtime_run_id = ${input.runtimeRunId}::uuid
      RETURNING runtime_run_id AS "runtimeRunId", status, events, next_sequence AS "nextSequence", error, updated_at AS "updatedAt"
    `)
    return mapRailwayState(firstRow<Record<string, unknown>>(result))
  })
}

export async function updateRailwayOpenCodeRuntimeState(runtimeRunId: string, input: { status?: OpenCodeRuntimeRunStatus; error?: string | null }) {
  await ensureRailwayOpenCodeRuntimeState(runtimeRunId, input.status || "running")
  const result = await db.execute(sql`
    UPDATE "AI_MARKETING_platform_railway_opencode_runtime_states"
    SET status = CASE
      WHEN status IN ('succeeded', 'failed', 'cancelled', 'timed_out') THEN status
      ELSE COALESCE(${input.status || null}, status)
    END, error = CASE WHEN CAST(${input.error === undefined ? null : input.error} AS TEXT) IS NULL THEN error ELSE CAST(${input.error ?? null} AS TEXT) END, updated_at = CURRENT_TIMESTAMP
    WHERE runtime_run_id = ${runtimeRunId}::uuid
    RETURNING runtime_run_id AS "runtimeRunId", status, events, next_sequence AS "nextSequence", error, updated_at AS "updatedAt"
  `)
  return mapRailwayState(firstRow<Record<string, unknown>>(result))
}

export async function getRailwayOpenCodeRuntimeState(runtimeRunId: string, after = 0) {
  await ensureOpenCodeRuntimeTables()
  const result = await db.execute(sql`
    SELECT runtime_run_id AS "runtimeRunId", status, events, next_sequence AS "nextSequence", error, updated_at AS "updatedAt"
    FROM "AI_MARKETING_platform_railway_opencode_runtime_states"
    WHERE runtime_run_id = ${runtimeRunId}::uuid
    LIMIT 1
  `)
  const state = mapRailwayState(firstRow<Record<string, unknown>>(result))
  if (!state) return null
  const eventResult = await db.execute(sql`
    SELECT sequence, event, created_at AS "createdAt"
    FROM "AI_MARKETING_platform_railway_opencode_runtime_events"
    WHERE runtime_run_id = ${runtimeRunId}::uuid AND sequence >= ${Math.max(0, after)}
    ORDER BY sequence ASC
  `)
  const events = (eventResult.rows || []).map((row) => asEvent(row)).filter((event): event is RailwayOpenCodeRuntimeEvent => Boolean(event))
  return { ...state, events }
}

export async function createOpenCodeRuntimeRun(input: {
  taskRunId: number
  runtimeRunId: string
  sessionKey: string
  backend?: string
  conversationId?: string | null
  agentId?: string | null
  functionId?: string | null
  deadlineAt: Date
  maxAttempts?: number
  billingPayload?: Record<string, unknown> | null
}) {
  await ensureOpenCodeRuntimeTables()
  const result = await db.execute(sql`
    INSERT INTO "AI_MARKETING_platform_opencode_runtime_runs"
      (task_run_id, runtime_run_id, session_key, backend, conversation_id, agent_id, function_id, deadline_at, max_attempts, billing_payload)
    VALUES
      (${input.taskRunId}, ${input.runtimeRunId}::uuid, ${input.sessionKey}, ${input.backend ?? "railway-opencode"}, ${input.conversationId ?? null}, ${input.agentId ?? null}, ${input.functionId ?? null}, ${input.deadlineAt}, ${input.maxAttempts ?? 3}, ${jsonb(input.billingPayload)}::jsonb)
    ON CONFLICT (runtime_run_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
    RETURNING
      id,
      task_run_id AS "taskRunId",
      runtime_run_id AS "runtimeRunId",
      session_key AS "sessionKey",
      conversation_id AS "conversationId",
      agent_id AS "agentId",
      function_id AS "functionId",
      backend,
      status,
      dispatch_key AS "dispatchKey",
      workflow_instance_id AS "workflowInstanceId",
      opencode_session_id AS "opencodeSessionId",
      sandbox_id AS "sandboxId",
      workspace_backup AS "workspaceBackup",
      attempt,
      max_attempts AS "maxAttempts",
      deadline_at AS "deadlineAt",
      lease_owner AS "leaseOwner",
      lease_expires_at AS "leaseExpiresAt",
      billing_payload AS "billingPayload",
      last_error_code AS "lastErrorCode",
      last_error_message AS "lastErrorMessage",
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      finished_at AS "finishedAt"
  `)
  const row = firstRow<OpenCodeRuntimeRunRecord>(result)
  if (!row) throw new Error("opencode_runtime_run_create_failed")
  return row
}

export async function claimOpenCodeRuntimeRun(runtimeRunId: string, owner: string, leaseMs: number) {
  await ensureOpenCodeRuntimeTables()
  const result = await db.execute(sql`
    UPDATE "AI_MARKETING_platform_opencode_runtime_runs"
    SET
      status = 'running',
      attempt = attempt + CASE WHEN lease_owner = ${owner} THEN 0 ELSE 1 END,
      lease_owner = ${owner},
      lease_expires_at = CURRENT_TIMESTAMP + (${Math.max(1_000, leaseMs)} * INTERVAL '1 millisecond'),
      updated_at = CURRENT_TIMESTAMP
    WHERE runtime_run_id = ${runtimeRunId}::uuid
      AND attempt < max_attempts
      AND deadline_at > CURRENT_TIMESTAMP
      AND (
        status = 'queued'
        OR lease_owner = ${owner}
        OR (status = 'running' AND lease_expires_at < CURRENT_TIMESTAMP)
      )
    RETURNING
      id,
      task_run_id AS "taskRunId",
      runtime_run_id AS "runtimeRunId",
      session_key AS "sessionKey",
      conversation_id AS "conversationId",
      agent_id AS "agentId",
      function_id AS "functionId",
      backend,
      status,
      dispatch_key AS "dispatchKey",
      workflow_instance_id AS "workflowInstanceId",
      opencode_session_id AS "opencodeSessionId",
      sandbox_id AS "sandboxId",
      workspace_backup AS "workspaceBackup",
      attempt,
      max_attempts AS "maxAttempts",
      deadline_at AS "deadlineAt",
      lease_owner AS "leaseOwner",
      lease_expires_at AS "leaseExpiresAt",
      billing_payload AS "billingPayload",
      last_error_code AS "lastErrorCode",
      last_error_message AS "lastErrorMessage",
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      finished_at AS "finishedAt"
  `)
  return firstRow<OpenCodeRuntimeRunRecord>(result)
}

export async function updateOpenCodeRuntimeRun(runtimeRunId: string, input: {
  status?: OpenCodeRuntimeRunStatus
  dispatchKey?: string | null
  workflowInstanceId?: string | null
  opencodeSessionId?: string | null
  sandboxId?: string | null
  workspaceBackup?: Record<string, unknown> | null
  billingPayload?: Record<string, unknown> | null
  lastErrorCode?: string | null
  lastErrorMessage?: string | null
  finishedAt?: Date | null
  clearLease?: boolean
}) {
  await ensureOpenCodeRuntimeTables()
  await db.execute(sql`
    UPDATE "AI_MARKETING_platform_opencode_runtime_runs"
    SET
      status = COALESCE(${input.status ?? null}, status),
      dispatch_key = COALESCE(${input.dispatchKey === undefined ? null : input.dispatchKey}, dispatch_key),
      workflow_instance_id = COALESCE(${input.workflowInstanceId === undefined ? null : input.workflowInstanceId}, workflow_instance_id),
      opencode_session_id = COALESCE(${input.opencodeSessionId === undefined ? null : input.opencodeSessionId}, opencode_session_id),
      sandbox_id = COALESCE(${input.sandboxId === undefined ? null : input.sandboxId}, sandbox_id),
      workspace_backup = COALESCE(${jsonb(input.workspaceBackup)}::jsonb, workspace_backup),
      billing_payload = COALESCE(${jsonb(input.billingPayload)}::jsonb, billing_payload),
      last_error_code = COALESCE(${input.lastErrorCode === undefined ? null : input.lastErrorCode}, last_error_code),
      last_error_message = COALESCE(${input.lastErrorMessage === undefined ? null : input.lastErrorMessage}, last_error_message),
      finished_at = COALESCE(${input.finishedAt === undefined ? null : input.finishedAt}, finished_at),
      lease_owner = CASE WHEN ${input.clearLease === true} THEN NULL ELSE lease_owner END,
      lease_expires_at = CASE WHEN ${input.clearLease === true} THEN NULL ELSE lease_expires_at END,
      updated_at = CURRENT_TIMESTAMP
    WHERE runtime_run_id = ${runtimeRunId}::uuid
  `)
}

export async function appendOpenCodeRuntimeCheckpoint(input: {
  runtimeRunId: string
  sequence: number
  stage: string
  backupHandle?: Record<string, unknown> | null
  resumePayload?: Record<string, unknown>
  artifactIds?: number[]
}) {
  if (!Number.isInteger(input.sequence) || input.sequence <= 0) throw new Error("opencode_runtime_checkpoint_sequence_invalid")
  await ensureOpenCodeRuntimeTables()
  const result = await db.execute(sql`
    INSERT INTO "AI_MARKETING_platform_opencode_runtime_checkpoints"
      (runtime_run_id, sequence, stage, backup_handle, resume_payload, artifact_ids)
    VALUES
      (${input.runtimeRunId}::uuid, ${input.sequence}, ${input.stage}, ${jsonb(input.backupHandle)}::jsonb, ${jsonb(input.resumePayload || {})}::jsonb, ${JSON.stringify(input.artifactIds || [])}::jsonb)
    ON CONFLICT (runtime_run_id, sequence) DO UPDATE SET runtime_run_id = EXCLUDED.runtime_run_id
    RETURNING
      id,
      runtime_run_id AS "runtimeRunId",
      sequence,
      stage,
      backup_handle AS "backupHandle",
      resume_payload AS "resumePayload",
      artifact_ids AS "artifactIds",
      created_at AS "createdAt"
  `)
  const row = firstRow<OpenCodeRuntimeCheckpointRecord>(result)
  if (!row) throw new Error("opencode_runtime_checkpoint_append_failed")
  return row
}

export async function getOpenCodeRuntimeRunByRuntimeId(runtimeRunId: string) {
  await ensureOpenCodeRuntimeTables()
  const result = await db.execute(sql`
    SELECT
      id,
      task_run_id AS "taskRunId",
      runtime_run_id AS "runtimeRunId",
      session_key AS "sessionKey",
      conversation_id AS "conversationId",
      agent_id AS "agentId",
      function_id AS "functionId",
      backend,
      status,
      dispatch_key AS "dispatchKey",
      workflow_instance_id AS "workflowInstanceId",
      opencode_session_id AS "opencodeSessionId",
      sandbox_id AS "sandboxId",
      workspace_backup AS "workspaceBackup",
      attempt,
      max_attempts AS "maxAttempts",
      deadline_at AS "deadlineAt",
      lease_owner AS "leaseOwner",
      lease_expires_at AS "leaseExpiresAt",
      billing_payload AS "billingPayload",
      last_error_code AS "lastErrorCode",
      last_error_message AS "lastErrorMessage",
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      finished_at AS "finishedAt"
    FROM "AI_MARKETING_platform_opencode_runtime_runs"
    WHERE runtime_run_id = ${runtimeRunId}::uuid
    LIMIT 1
  `)
  return firstRow<OpenCodeRuntimeRunRecord>(result)
}

export async function getOpenCodeRuntimeRunByTaskRunId(taskRunId: number) {
  await ensureOpenCodeRuntimeTables()
  const result = await db.execute(sql`
    SELECT
      id,
      task_run_id AS "taskRunId",
      runtime_run_id AS "runtimeRunId",
      session_key AS "sessionKey",
      conversation_id AS "conversationId",
      agent_id AS "agentId",
      function_id AS "functionId",
      backend,
      status,
      dispatch_key AS "dispatchKey",
      workflow_instance_id AS "workflowInstanceId",
      opencode_session_id AS "opencodeSessionId",
      sandbox_id AS "sandboxId",
      workspace_backup AS "workspaceBackup",
      attempt,
      max_attempts AS "maxAttempts",
      deadline_at AS "deadlineAt",
      lease_owner AS "leaseOwner",
      lease_expires_at AS "leaseExpiresAt",
      billing_payload AS "billingPayload",
      last_error_code AS "lastErrorCode",
      last_error_message AS "lastErrorMessage",
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      finished_at AS "finishedAt"
    FROM "AI_MARKETING_platform_opencode_runtime_runs"
    WHERE task_run_id = ${taskRunId}
    LIMIT 1
  `)
  return firstRow<OpenCodeRuntimeRunRecord>(result)
}
