export type WorkflowRetryRequest = {
  mode: "node" | "branch"
  nodeKey: string
}

export type RecoverableWorkflowRun = {
  id: number
  userId: number
  enterpriseId: number
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled"
  createdAt: Date
  updatedAt: Date
  normalizedResult: Record<string, unknown> | null
}

export function cloneNormalizedResult(value: Record<string, unknown> | null | undefined) {
  if (!value || typeof value !== "object") return null
  return { ...value }
}

export function parseWorkflowRetryRequest(value: Record<string, unknown> | null | undefined): WorkflowRetryRequest | null {
  const pendingRetry =
    value && typeof value.pendingRetry === "object" && value.pendingRetry
      ? (value.pendingRetry as Record<string, unknown>)
      : null

  const mode = pendingRetry?.mode
  const nodeKey = pendingRetry?.nodeKey
  if ((mode !== "node" && mode !== "branch") || typeof nodeKey !== "string" || !nodeKey.trim()) {
    return null
  }

  return {
    mode,
    nodeKey: nodeKey.trim(),
  }
}

export function stripWorkflowRetryRequest(value: Record<string, unknown> | null | undefined) {
  const next = cloneNormalizedResult(value)
  if (!next) return null
  delete next.pendingRetry
  return next
}

export function isWorkflowRunStale(run: RecoverableWorkflowRun, staleAfterMs: number) {
  return Date.now() - new Date(run.updatedAt).getTime() > staleAfterMs
}

export function shouldEvictActiveWorkflowRunTracker(input: {
  run: RecoverableWorkflowRun
  hasActiveTracker: boolean
  staleAfterMs: number
}) {
  if (!input.hasActiveTracker) return false
  if (input.run.status === "queued") return true
  return isWorkflowRunStale(input.run, input.staleAfterMs)
}
