import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { parseAiEntryTaskRunSummary } from "@/lib/ai-entry/task-runs"
import { getTasksByIds } from "@/lib/services/tasks"

function normalizeTaskIds(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value
      .map((item) => Number.parseInt(String(item || ""), 10))
      .filter((item) => Number.isFinite(item) && item > 0),
  )].slice(0, 50)
}

export async function POST(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) {
    return auth.response
  }

  const body = (await request.json().catch(() => ({}))) as { taskRunIds?: unknown }
  const taskIds = normalizeTaskIds(body.taskRunIds)
  if (taskIds.length === 0) {
    return NextResponse.json({ data: [] })
  }

  try {
    const tasks = await getTasksByIds(taskIds, auth.user.id)
    const data = taskIds
      .map((taskId) => tasks.find((task) => task.id === taskId) || null)
      .map((task) =>
        task
          ? parseAiEntryTaskRunSummary({
              id: task.id,
              status: task.status,
              payload: task.payload,
              result: task.result,
              createdAt: task.createdAt,
              updatedAt: task.updatedAt,
              startedAt: task.startedAt,
            })
          : null,
      )
      .filter(Boolean)

    return NextResponse.json({ data })
  } catch (error) {
    const message = error instanceof Error ? error.message : "ai_entry_task_run_status_failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
