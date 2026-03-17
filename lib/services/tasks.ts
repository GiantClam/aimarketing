import { and, eq } from "drizzle-orm"

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

export async function createTask(input: CreateTaskInput) {
  const { userId, connectionId, workflowName, webhookPath, payload, relatedStorageKey } = input
  const [row] = await db
    .insert(tasks)
    .values({
      userId,
      connectionId,
      workflowName: workflowName || null,
      webhookPath,
      payload: payload ? JSON.stringify(payload) : null,
      relatedStorageKey: relatedStorageKey || null,
      status: "pending",
      updatedAt: new Date(),
    })
    .returning()
  return row
}

export async function updateTaskStatus(taskId: number, data: { status?: string; executionId?: string; result?: unknown }) {
  await db
    .update(tasks)
    .set({
      status: data.status || undefined,
      executionId: data.executionId || undefined,
      result: data.result !== undefined ? JSON.stringify(data.result) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId))
}

export async function getTaskById(taskId: number, userId?: number) {
  const rows = await db
    .select()
    .from(tasks)
    .where(userId ? and(eq(tasks.id, taskId), eq(tasks.userId, userId)) : eq(tasks.id, taskId))
  return rows[0] || null
}

export async function getConnectionById(connectionId: number, userId?: number) {
  const rows = await db
    .select()
    .from(n8nConnections)
    .where(userId ? and(eq(n8nConnections.id, connectionId), eq(n8nConnections.userId, userId)) : eq(n8nConnections.id, connectionId))
  return rows[0] || null
}

