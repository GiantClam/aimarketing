export type WorkflowRetryRequest = {
  mode: "node" | "branch" | "iteration"
  nodeKey: string
  iterationKey?: string
  attemptNumber?: number
}

export type RecoverableWorkflowRun = {
  id: number
  userId: number
  enterpriseId: number
  status: "queued" | "running" | "cancel_requested" | "succeeded" | "failed" | "cancelled"
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
  if ((mode !== "node" && mode !== "branch" && mode !== "iteration") || typeof nodeKey !== "string" || !nodeKey.trim()) {
    return null
  }

  const iterationKey = pendingRetry?.iterationKey
  if (mode === "iteration" && (typeof iterationKey !== "string" || !iterationKey.trim())) return null
  const attemptNumber = pendingRetry?.attemptNumber
  if (mode === "iteration" && attemptNumber !== undefined && (typeof attemptNumber !== "number" || !Number.isInteger(attemptNumber) || attemptNumber < 2)) return null

  return {
    mode,
    nodeKey: nodeKey.trim(),
    ...(mode === "iteration" ? { iterationKey: (iterationKey as string).trim() } : {}),
    ...(mode === "iteration" && typeof attemptNumber === "number" ? { attemptNumber } : {}),
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
