import type { PlatformTaskRunRecord } from "@/lib/platform/task-run-store"

type WorkflowResumeComparableDetail = {
  workflow: {
    nodes: Array<{ nodeKey: string }>
  }
  nodeExecutions: Array<{
    id: number
    nodeKey: string
    status: string
    providerId?: string | null
    modelId?: string | null
  }>
}

function toWorkflowId(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null
}

export function resolveWorkflowIdFromTaskRunRecord(run: {
  inputPayload?: Record<string, unknown> | null
  normalizedResult?: Record<string, unknown> | null
}) {
  return (
    toWorkflowId(run.inputPayload?.workflowId) ??
    toWorkflowId(run.normalizedResult?.workflowId)
  )
}

export function findLatestWorkflowRunRecordForWorkflow(
  runs: PlatformTaskRunRecord[],
  workflowId: number,
) {
  return runs.find(
    (run) =>
      run.kind === "workflow" &&
      run.itemType === "workflow" &&
      resolveWorkflowIdFromTaskRunRecord(run) === workflowId,
  ) ?? null
}

export function resolveWorkflowResumeNodeKey(detail: WorkflowResumeComparableDetail) {
  const latestNodeExecutionByKey = new Map<string, WorkflowResumeComparableDetail["nodeExecutions"][number]>()

  for (const execution of detail.nodeExecutions) {
    const current = latestNodeExecutionByKey.get(execution.nodeKey)
    if (!current || execution.id >= current.id) {
      latestNodeExecutionByKey.set(execution.nodeKey, execution)
    }
  }

  for (const node of detail.workflow.nodes) {
    const execution = latestNodeExecutionByKey.get(node.nodeKey)
    if (execution?.status === "failed") {
      return node.nodeKey
    }
  }

  for (const node of detail.workflow.nodes) {
    const execution = latestNodeExecutionByKey.get(node.nodeKey)
    if (execution?.status === "cancelled") {
      return node.nodeKey
    }
  }

  return null
}

export function resolveWorkflowResumeNodeExecution(detail: WorkflowResumeComparableDetail) {
  const resumeNodeKey = resolveWorkflowResumeNodeKey(detail)
  if (!resumeNodeKey) return null

  let latestExecution: WorkflowResumeComparableDetail["nodeExecutions"][number] | null = null
  for (const execution of detail.nodeExecutions) {
    if (execution.nodeKey !== resumeNodeKey) continue
    if (!latestExecution || execution.id >= latestExecution.id) {
      latestExecution = execution
    }
  }

  return latestExecution
}
