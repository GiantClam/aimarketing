import { serializePlatformWorkflowRun } from "@/lib/platform/workflow-runner"
import { getWorkflowRunDetail } from "@/lib/workflows/store"

export function serializeWorkflowRunDetail(detail: Awaited<ReturnType<typeof getWorkflowRunDetail>>) {
  if (!detail) return null

  return {
    run: serializePlatformWorkflowRun(detail.run),
    workflow: {
      ...detail.workflow,
      createdAt: detail.workflow.createdAt instanceof Date ? detail.workflow.createdAt.toISOString() : null,
      updatedAt: detail.workflow.updatedAt instanceof Date ? detail.workflow.updatedAt.toISOString() : null,
      edges: detail.workflow.edges.map((edge) => ({
        ...edge,
        inputName: edge.inputName ?? null,
      })),
    },
    nodeExecutions: detail.nodeExecutions.map((execution) => ({
      ...execution,
      startedAt: execution.startedAt instanceof Date ? execution.startedAt.toISOString() : null,
      finishedAt: execution.finishedAt instanceof Date ? execution.finishedAt.toISOString() : null,
      createdAt: execution.createdAt instanceof Date ? execution.createdAt.toISOString() : null,
      updatedAt: execution.updatedAt instanceof Date ? execution.updatedAt.toISOString() : null,
    })),
    statusPath: `/api/workflows/runs/${detail.run.id}?mode=status`,
  }
}

export type SerializedWorkflowRunDetail = NonNullable<ReturnType<typeof serializeWorkflowRunDetail>>
