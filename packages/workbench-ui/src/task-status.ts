export type WorkbenchTaskStatus = "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled"

export type WorkbenchTaskStatusLocale = "zh" | "en"

const STATUS_LABELS: Record<WorkbenchTaskStatus, Record<WorkbenchTaskStatusLocale, string>> = {
  queued: { zh: "排队中", en: "Queued" },
  running: { zh: "运行中", en: "Running" },
  waiting: { zh: "等待中", en: "Waiting" },
  completed: { zh: "已完成", en: "Completed" },
  failed: { zh: "失败", en: "Failed" },
  cancelled: { zh: "已取消", en: "Cancelled" },
}

const STATUS_TONES: Record<WorkbenchTaskStatus, "neutral" | "info" | "warning" | "success" | "danger" | "muted"> = {
  queued: "neutral",
  running: "info",
  waiting: "warning",
  completed: "success",
  failed: "danger",
  cancelled: "muted",
}

/** Maps provider/runtime variants to the six statuses used by every task UI. */
export function normalizeWorkbenchTaskStatus(value: string | null | undefined): WorkbenchTaskStatus {
  switch (value?.trim().toLowerCase()) {
    case "queued":
    case "pending":
      return "queued"
    case "running":
    case "in_progress":
    case "processing":
      return "running"
    case "waiting":
    case "blocked":
    case "approval_requested":
      return "waiting"
    case "succeeded":
    case "success":
    case "completed":
    case "done":
      return "completed"
    case "failed":
    case "error":
    case "interrupted":
    case "timed_out":
    case "timeout":
      return "failed"
    case "cancelled":
    case "canceled":
    case "cancel_requested":
      return "cancelled"
    default:
      return "queued"
  }
}

export function getWorkbenchTaskStatusLabel(status: WorkbenchTaskStatus, locale: WorkbenchTaskStatusLocale) {
  return STATUS_LABELS[status][locale]
}

export function getWorkbenchTaskStatusTone(status: WorkbenchTaskStatus) {
  return STATUS_TONES[status]
}

export function isWorkbenchTaskRetryable(status: WorkbenchTaskStatus) {
  return status === "failed" || status === "cancelled"
}

export function isWorkbenchTaskActive(status: WorkbenchTaskStatus) {
  return status === "queued" || status === "running" || status === "waiting"
}
