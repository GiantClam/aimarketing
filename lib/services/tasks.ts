import { and, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { n8nConnections, tasks } from "@/lib/db/schema"

export type CreateTaskInput = {
  userId: number
  connectionId?: number
  workflowName?: string
  webhookPath: string
  payload?: unknown
  relatedStorageKey?: string
}

type TaskStatusUpdate = {
  status?: string
  executionId?: string
  result?: unknown
}

const TERMINAL_TASK_STATUSES = new Set(["success", "failed", "approved", "rejected"])
const TASK_DB_RETRY_DELAYS_MS = [250, 750]

function msToPostgresInterval(ms: number) {
  return sql`(${Math.max(ms, 0)} / 1000.0) * interval '1 second'`
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function isRetryableDbError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase()
  return (
    message.includes("error connecting to database") ||
    message.includes("fetch failed") ||
    message.includes("connect timeout") ||
    message.includes("und_err_connect_timeout")
  )
}

async function withTaskDbRetry<T>(label: string, operation: () => Promise<T>) {
  for (let attempt = 0; attempt <= TASK_DB_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!isRetryableDbError(error) || attempt === TASK_DB_RETRY_DELAYS_MS.length) {
        throw error
      }

      console.warn("tasks.db.retry", {
        label,
        attempt: attempt + 1,
        message: getErrorMessage(error),
      })
      await sleep(TASK_DB_RETRY_DELAYS_MS[attempt])
    }
  }

  throw new Error(`tasks_db_retry_exhausted:${label}`)
}

export async function createTask(input: CreateTaskInput) {
  const { userId, connectionId, workflowName, webhookPath, payload, relatedStorageKey } = input
  const [row] = await withTaskDbRetry("create-task", () =>
    db
      .insert(tasks)
      .values({
        userId,
        connectionId,
        workflowName: workflowName || null,
        webhookPath,
        payload: payload ? JSON.stringify(payload) : null,
        relatedStorageKey: relatedStorageKey || null,
        status: "pending",
        attempts: 0,
        updatedAt: new Date(),
      })
      .returning(),
  )
  return row
}

export async function updateTaskStatus(taskId: number, data: TaskStatusUpdate) {
  const nextStatus = data.status?.trim()
  const isTerminal = nextStatus ? TERMINAL_TASK_STATUSES.has(nextStatus) : false

  await withTaskDbRetry("update-task-status", () =>
    db
      .update(tasks)
      .set({
        status: nextStatus || undefined,
        executionId: data.executionId || undefined,
        result: data.result !== undefined ? JSON.stringify(data.result) : undefined,
        workerId: isTerminal ? null : undefined,
        leaseExpiresAt: isTerminal ? null : undefined,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId)),
  )
}

export async function claimTaskExecution(taskId: number, workerId: string, leaseMs: number, staleAfterMs: number) {
  const result = await db.execute(sql`
    UPDATE "AI_MARKETING_tasks"
    SET
      status = 'running',
      worker_id = ${workerId},
      attempts = COALESCE(attempts, 0) + 1,
      started_at = COALESCE(started_at, NOW()),
      lease_expires_at = NOW() + ${msToPostgresInterval(leaseMs)},
      updated_at = NOW()
    WHERE id = ${taskId}
      AND (
        status = 'pending'
        OR (
          status = 'running'
          AND (
            lease_expires_at IS NULL
            OR lease_expires_at <= NOW()
            OR updated_at <= NOW() - ${msToPostgresInterval(staleAfterMs)}
          )
        )
      )
    RETURNING *
  `)

  return result.rows[0] ?? null
}

export async function renewTaskLease(taskId: number, workerId: string, leaseMs: number) {
  const result = await db.execute(sql`
    UPDATE "AI_MARKETING_tasks"
    SET
      lease_expires_at = NOW() + ${msToPostgresInterval(leaseMs)},
      updated_at = NOW()
    WHERE id = ${taskId}
      AND worker_id = ${workerId}
      AND status = 'running'
    RETURNING id
  `)

  return Boolean(result.rows[0]?.id)
}

export async function getTaskById(taskId: number, userId?: number) {
  const rows = await withTaskDbRetry("get-task-by-id", () =>
    db
      .select()
      .from(tasks)
      .where(userId ? and(eq(tasks.id, taskId), eq(tasks.userId, userId)) : eq(tasks.id, taskId)),
  )
  return rows[0] || null
}

export async function getConnectionById(connectionId: number, userId?: number) {
  const rows = await withTaskDbRetry("get-connection-by-id", () =>
    db
      .select()
      .from(n8nConnections)
      .where(
        userId ? and(eq(n8nConnections.id, connectionId), eq(n8nConnections.userId, userId)) : eq(n8nConnections.id, connectionId),
      ),
  )
  return rows[0] || null
}
