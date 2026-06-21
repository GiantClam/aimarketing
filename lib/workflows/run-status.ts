export type WorkflowRunUiStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | string

export function isWorkflowRunActiveStatus(status: WorkflowRunUiStatus | null | undefined) {
  return status === "queued" || status === "running"
}

export function isWorkflowRunResumableStatus(status: WorkflowRunUiStatus | null | undefined) {
  return status === "failed"
}
