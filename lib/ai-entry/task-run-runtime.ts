import type { AiEntryTaskRunSummary } from "@/lib/ai-entry/task-runs"

export const AI_ENTRY_TASK_POLL_FOCUSED_INTERVAL_MS = 2_500
export const AI_ENTRY_TASK_POLL_BLURRED_INTERVAL_MS = 8_000
export const AI_ENTRY_TASK_HEARTBEAT_STALE_AFTER_MS = 45_000
export const AI_ENTRY_CONVERSATION_SUMMARY_POLL_FOCUSED_INTERVAL_MS = 10_000
export const AI_ENTRY_CONVERSATION_SUMMARY_POLL_BLURRED_INTERVAL_MS = 25_000

export function resolveAiEntryTaskPollIntervalMs(input: {
  isDocumentVisible: boolean
}) {
  return input.isDocumentVisible
    ? AI_ENTRY_TASK_POLL_FOCUSED_INTERVAL_MS
    : AI_ENTRY_TASK_POLL_BLURRED_INTERVAL_MS
}

export function resolveAiEntryConversationSummaryPollIntervalMs(input: {
  isDocumentVisible: boolean
}) {
  return input.isDocumentVisible
    ? AI_ENTRY_CONVERSATION_SUMMARY_POLL_FOCUSED_INTERVAL_MS
    : AI_ENTRY_CONVERSATION_SUMMARY_POLL_BLURRED_INTERVAL_MS
}

export function getAiEntryTaskElapsedSeconds(
  taskRun: Pick<AiEntryTaskRunSummary, "created_at" | "started_at" | "updated_at" | "finished_at" | "status">,
  nowMs = Date.now(),
) {
  const startedAt = taskRun.started_at || taskRun.created_at
  const terminalAt =
    taskRun.status === "success" || taskRun.status === "failed"
      ? taskRun.finished_at || taskRun.updated_at
      : Math.floor(nowMs / 1000)

  return Math.max(0, terminalAt - startedAt)
}

export function isAiEntryTaskHeartbeatStale(
  taskRun: Pick<AiEntryTaskRunSummary, "status" | "last_heartbeat_at" | "updated_at">,
  nowMs = Date.now(),
) {
  if (taskRun.status !== "pending" && taskRun.status !== "running") {
    return false
  }

  const heartbeatAt = (taskRun.last_heartbeat_at || taskRun.updated_at) * 1000
  return nowMs - heartbeatAt > AI_ENTRY_TASK_HEARTBEAT_STALE_AFTER_MS
}
