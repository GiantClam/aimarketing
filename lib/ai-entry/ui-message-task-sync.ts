import type { AiEntryUIMessage, AiEntryUIMessagePart } from "@/lib/ai-entry/ui-message"

export type AiEntryTaskRunStatusPatch = {
  task_id: string
  task_source?: "legacy" | "runtime"
  status: string
  stage?: string | null
  stage_label?: string | null
  error_message?: string | null
  error?: string | null
  finished_at?: number | null
  conversation_id?: string | null
  agent_id?: string | null
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function taskRunId(value: unknown) {
  const record = asRecord(value)
  const taskRun = asRecord(record?.taskRun) || record
  return typeof taskRun?.task_id === "string" && taskRun.task_id.trim()
    ? taskRun.task_id
    : null
}

/**
 * Persisted messages contain the task snapshot emitted when a run was queued.
 * Replace that snapshot with the current task summary returned by the
 * conversation endpoint so terminal states remain visible after reload.
 */
export function mergeTaskRunSummariesIntoMessages(
  messages: AiEntryUIMessage[],
  taskRuns: AiEntryTaskRunStatusPatch[],
) {
  if (messages.length === 0 || taskRuns.length === 0) return messages

  const latestById = new Map(taskRuns.map((taskRun) => [taskRun.task_id, taskRun]))
  return messages.map((message) => {
    let changed = false
    const parts = message.parts.map((part) => {
      if (part.type !== "data-task-run") return part

      const currentData = asRecord(part.data)
      const currentTaskRun = asRecord(currentData?.taskRun)
      const latestTaskRun = latestById.get(taskRunId(currentTaskRun) || "")
      if (!currentTaskRun || !latestTaskRun) return part

      changed = true
      return {
        ...part,
        data: {
          ...currentData,
          taskRun: {
            ...currentTaskRun,
            ...latestTaskRun,
          },
        },
      } as AiEntryUIMessagePart
    })

    return changed ? { ...message, parts } : message
  })
}
