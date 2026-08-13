import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { parseAiEntryTaskRunSummary } from "@/lib/ai-entry/task-runs"
import { advanceDurableAssistantPptTask } from "@/lib/assistant-async"
import { getTasksByIds } from "@/lib/services/tasks"
import { getPlatformTaskRunsByIdsForUser } from "@/lib/platform/task-run-store"
import { reconcileOpenCodeRuntimeTask } from "@/lib/ai-entry/runtime/cloudflare-session-sync"

function normalizeTaskIds(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value
      .map((item) => Number.parseInt(String(item || ""), 10))
      .filter((item) => Number.isFinite(item) && item > 0),
  )].slice(0, 50)
}

function normalizeTaskSources(value: unknown, length: number) {
  if (!Array.isArray(value)) return new Map<number, "legacy" | "runtime">()
  return new Map(
    value.slice(0, length).flatMap((item, index) =>
      item === "legacy" || item === "runtime" ? [[index, item] as const] : [],
    ),
  )
}

export async function POST(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) {
    return auth.response
  }

  const body = (await request.json().catch(() => ({}))) as { taskRunIds?: unknown; taskRunSources?: unknown }
  const taskIds = normalizeTaskIds(body.taskRunIds)
  if (taskIds.length === 0) {
    return NextResponse.json({ data: [] })
  }
  const sources = normalizeTaskSources(body.taskRunSources, taskIds.length)
  const legacyIds = taskIds.filter((_, index) => sources.get(index) !== "runtime")
  const runtimeIds = taskIds.filter((_, index) => sources.get(index) !== "legacy")

  try {
    const tasks = await getTasksByIds(legacyIds, auth.user.id)
    await Promise.all(
      tasks.slice(0, 6).map((task) => advanceDurableAssistantPptTask(task.id, auth.user.id).catch(() => false)),
    )
    const refreshedTasks = await getTasksByIds(legacyIds, auth.user.id)
    const runtimeTasks = await getPlatformTaskRunsByIdsForUser(runtimeIds, auth.user.id)
    await Promise.all(
      runtimeTasks
        .filter((task) => {
          if (task.status === "queued" || task.status === "running") return true
          const result = task.normalizedResult && typeof task.normalizedResult === "object" ? task.normalizedResult : null
          return ["succeeded", "failed", "cancelled"].includes(task.status) && result?.billingFinalized !== true
        })
        .map((task) => reconcileOpenCodeRuntimeTask(task.id, auth.user.id).catch((error) => {
          console.error("ai-entry.opencode.runtime.fallback_sync_failed", {
            taskRunId: task.id,
            message: error instanceof Error ? error.message : String(error),
          })
          return false
        })),
    )
    const refreshedRuntimeTasks = await getPlatformTaskRunsByIdsForUser(taskIds, auth.user.id)
    const legacyData = taskIds
      .map((taskId) => refreshedTasks.find((task) => task.id === taskId) || null)
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
              finishedAt: ["success", "failed", "approved", "rejected"].includes(task.status || "")
                ? task.updatedAt
                : null,
              taskSource: "legacy",
            })
          : null,
      )
      .filter(Boolean)

    const runtimeData = refreshedRuntimeTasks
      .map((task) => parseAiEntryTaskRunSummary({
        id: task.id,
        status: task.status,
        payload: {
          kind: "opencode_runtime",
          ...(task.inputPayload || {}),
          input: task.inputPayload || null,
        },
        result: task.normalizedResult,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        startedAt: task.startedAt,
        finishedAt: task.finishedAt,
        taskSource: "runtime",
      }))
      .filter(Boolean)

    return NextResponse.json({ data: [...legacyData, ...runtimeData] })
  } catch (error) {
    const message = error instanceof Error ? error.message : "ai_entry_task_run_status_failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
