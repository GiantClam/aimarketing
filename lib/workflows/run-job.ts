import type { AuthUser } from "@/lib/auth/session"
import { appendPlatformRunEvent } from "@/lib/platform/task-run-store"
import { updatePlatformWorkflowRun } from "@/lib/platform/workflow-runner"
import { createWorkflowCapabilityInvoker } from "@/lib/workflows/capability-invoker"
import { retryWorkflowNodeExecution, runWorkflowDefinition, type WorkflowNodeRunState } from "@/lib/workflows/execution"
import {
  applyWorkflowNodeResultPreviews,
  collectWorkflowPersistenceTargets,
  buildWorkflowRunNormalizedResult,
  persistFinalWorkflowOutputs,
  syncWorkflowNodeExecutions,
} from "@/lib/workflows/run-persistence"
import {
  updateWorkflowDefinition,
  updateWorkflowNodeExecution,
  type WorkflowDefinition,
} from "@/lib/workflows/store"

type WorkflowRunJobContext = {
  runId: number
  workflow: WorkflowDefinition
  currentUser: AuthUser
  cookieHeader?: string | null
  locale?: "zh" | "en"
  requestOrigin: string
  requestIp?: string
}

type WorkflowRetryJobContext = WorkflowRunJobContext & {
  existingNodeStates: Record<string, WorkflowNodeRunState>
  mode: "node" | "branch"
  nodeKey: string
  previousNormalizedResult: Record<string, unknown> | null
}

async function persistWorkflowNodeState(runId: number, state: WorkflowNodeRunState) {
  await updateWorkflowNodeExecution({
    runId,
    nodeKey: state.nodeKey,
    status: state.status,
    providerId: state.providerId ?? null,
    modelId: state.modelId ?? null,
    taskRunId: state.taskRunId ?? null,
    outputPayload: state.output as Record<string, unknown>,
    errorMessage: state.errorMessage ?? null,
    creditsConsumed: state.creditsConsumed,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
  })
}

async function appendWorkflowNodeLifecycleEvent(runId: number, state: WorkflowNodeRunState) {
  if (state.status !== "running" && state.status !== "succeeded" && state.status !== "failed" && state.status !== "cancelled") {
    return
  }

  await appendPlatformRunEvent(runId, {
    level: state.status === "failed" ? "error" : state.status === "cancelled" ? "warn" : "info",
    message: `workflow_node_${state.status}`,
    payload: {
      nodeKey: state.nodeKey,
      attemptCount: state.attemptCount,
      providerId: state.providerId ?? null,
      modelId: state.modelId ?? null,
      taskRunId: state.taskRunId ?? null,
      creditsConsumed: state.creditsConsumed ?? 0,
      startedAt: state.startedAt ? state.startedAt.toISOString() : null,
      finishedAt: state.finishedAt ? state.finishedAt.toISOString() : null,
      errorMessage: state.errorMessage ?? null,
    },
  }).catch(() => {})
}

async function persistWorkflowNodeStateWithEvent(runId: number, state: WorkflowNodeRunState) {
  await persistWorkflowNodeState(runId, state)
  await appendWorkflowNodeLifecycleEvent(runId, state)
}

async function finalizeWorkflowRun(input: {
  runId: number
  workflow: WorkflowDefinition
  currentUser: AuthUser
  nodeStates: Record<string, WorkflowNodeRunState>
  resultStatus: "succeeded" | "failed"
  finalNodeKeys: string[]
  previousNormalizedResult?: Record<string, unknown> | null
  retry?:
    | {
        mode: "node" | "branch"
        nodeKey: string
      }
    | null
}) {
  await syncWorkflowNodeExecutions(input.runId, input.nodeStates)

  await updateWorkflowDefinition({
    workflowId: input.workflow.id,
    enterpriseId: input.workflow.enterpriseId,
    nodes: applyWorkflowNodeResultPreviews(input.workflow.nodes, input.nodeStates),
  })

  const persistedOutputs = await persistFinalWorkflowOutputs({
    runId: input.runId,
    workflowTitle: input.workflow.title,
    enterpriseId: input.currentUser.enterpriseId!,
    ownerUserId: input.currentUser.id,
    nodeStates: input.nodeStates,
    workflowNodes: input.workflow.nodes,
    persistenceTargets: collectWorkflowPersistenceTargets({
      nodes: input.workflow.nodes,
      edges: input.workflow.edges,
    }),
  })

  await updatePlatformWorkflowRun({
    runId: input.runId,
    patch: {
      status: input.resultStatus === "succeeded" ? "succeeded" : "failed",
      finishedAt: new Date(),
      normalizedResult: buildWorkflowRunNormalizedResult({
        workflowId: input.workflow.id,
        finalNodeKeys: input.finalNodeKeys,
        workflowStatus: input.resultStatus,
        persistedArtifactIds: persistedOutputs.artifactIds,
        persistedWorkItemIds: persistedOutputs.workItemIds,
        previous: input.previousNormalizedResult,
        retry: input.retry ?? null,
      }),
    },
  })
}

function createJobCapabilityInvoker(context: WorkflowRunJobContext) {
  return createWorkflowCapabilityInvoker({
    cookieHeader: context.cookieHeader,
    currentUser: context.currentUser,
    locale: context.locale ?? "en",
    requestOrigin: context.requestOrigin,
    requestIp: context.requestIp,
  })
}

export async function executeWorkflowRunJob(context: WorkflowRunJobContext) {
  try {
    const result = await runWorkflowDefinition({
      enterpriseId: context.workflow.enterpriseId,
      ownerUserId: context.workflow.ownerUserId,
      nodes: context.workflow.nodes,
      edges: context.workflow.edges,
      executorContext: {
        capabilityInvoker: createJobCapabilityInvoker(context),
      },
      onNodeStateChange: (state) => persistWorkflowNodeStateWithEvent(context.runId, state),
    })

    await finalizeWorkflowRun({
      runId: context.runId,
      workflow: context.workflow,
      currentUser: context.currentUser,
      nodeStates: result.nodeStates,
      resultStatus: result.status,
      finalNodeKeys: result.finalNodeKeys,
    })
  } catch (error) {
    console.error("workflow.run-job.failed", {
      runId: context.runId,
      workflowId: context.workflow.id,
      message: error instanceof Error ? error.message : String(error),
    })

    await updatePlatformWorkflowRun({
      runId: context.runId,
      patch: {
        status: "failed",
        finishedAt: new Date(),
      },
    })
  }
}

export async function executeWorkflowRetryJob(context: WorkflowRetryJobContext) {
  try {
    const result = await retryWorkflowNodeExecution({
      enterpriseId: context.workflow.enterpriseId,
      ownerUserId: context.workflow.ownerUserId,
      nodes: context.workflow.nodes,
      edges: context.workflow.edges,
      nodeStates: context.existingNodeStates,
      nodeKey: context.nodeKey,
      mode: context.mode,
      executorContext: {
        capabilityInvoker: createJobCapabilityInvoker(context),
      },
      onNodeStateChange: (state) => persistWorkflowNodeStateWithEvent(context.runId, state),
    })

    await finalizeWorkflowRun({
      runId: context.runId,
      workflow: context.workflow,
      currentUser: context.currentUser,
      nodeStates: result.nodeStates,
      resultStatus: result.status,
      finalNodeKeys: result.finalNodeKeys,
      previousNormalizedResult: context.previousNormalizedResult,
      retry: {
        mode: context.mode,
        nodeKey: context.nodeKey,
      },
    })
  } catch (error) {
    console.error("workflow.retry-job.failed", {
      runId: context.runId,
      workflowId: context.workflow.id,
      nodeKey: context.nodeKey,
      mode: context.mode,
      message: error instanceof Error ? error.message : String(error),
    })

    await updatePlatformWorkflowRun({
      runId: context.runId,
      patch: {
        status: "failed",
        finishedAt: new Date(),
      },
    })
  }
}
