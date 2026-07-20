import type { AuthUser } from "@/lib/auth/session"
import { appendPlatformRunEvent, getPlatformTaskRun } from "@/lib/platform/task-run-store"
import { updatePlatformWorkflowRun } from "@/lib/platform/workflow-runner"
import { createWorkflowCapabilityInvoker } from "@/lib/workflows/capability-invoker"
import { retryWorkflowNodeExecution, runWorkflowDefinition, type WorkflowNodeRunState } from "@/lib/workflows/execution"
import type { WorkflowNodeInputBundle } from "@/lib/workflows/node-executors"
import {
  applyWorkflowNodeResultPreviews,
  collectWorkflowPersistenceTargets,
  buildWorkflowRunNormalizedResult,
  persistFinalWorkflowOutputs,
  syncWorkflowNodeExecutions,
} from "@/lib/workflows/run-persistence"
import {
  ensureWorkflowNodeExecutionRecords,
  getWorkflowRunDetail,
  updateWorkflowDefinition,
  updateWorkflowNodeExecution,
  type WorkflowDefinition,
} from "@/lib/workflows/store"
import { resolveWorkflowFeatures } from "@/lib/workflows/features"
import { runPersistedWorkflowIterationDefinition, type IterationWorkflowRetry } from "@/lib/workflows/iteration-execution"
import { completeAttempt, createIterationsForResolvedInput, markAttemptSubmitted, startAttempt } from "@/lib/workflows/workflow-attempts"
import { finalizeReservedCredits, releaseReservedCredits, reserveFeatureCredits } from "@/lib/billing/runtime"

type WorkflowRunJobContext = {
  runId: number
  workflow: WorkflowDefinition
  currentUser: AuthUser
  seedInput?: Partial<WorkflowNodeInputBundle>
  cookieHeader?: string | null
  locale?: "zh" | "en"
  requestOrigin: string
  requestIp?: string
  iterationRetry?: IterationWorkflowRetry | null
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
  resultStatus: "succeeded" | "failed" | "cancelled"
  finalNodeKeys: string[]
  previousNormalizedResult?: Record<string, unknown> | null
  retry?:
    | {
        mode: "node" | "branch"
        nodeKey: string
      }
    | null
  persistWorkflowDefinition?: boolean
}) {
  await syncWorkflowNodeExecutions(input.runId, input.nodeStates)

  if (input.persistWorkflowDefinition !== false) {
    await updateWorkflowDefinition({
      workflowId: input.workflow.id,
      enterpriseId: input.workflow.enterpriseId,
      nodes: applyWorkflowNodeResultPreviews(input.workflow.nodes, input.nodeStates),
    })
  }

  const persistedOutputs = await persistFinalWorkflowOutputs({
    runId: input.runId,
    workflowId: input.workflow.id,
    workflowSlug: input.workflow.slug,
    workflowTitle: input.workflow.title,
    workflowUpdatedAt: input.workflow.updatedAt,
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
      status: input.resultStatus,
      expectedStatus: input.resultStatus === "cancelled" ? ["queued", "running", "cancel_requested"] : ["queued", "running"],
      finishedAt: new Date(),
      normalizedResult: buildWorkflowRunNormalizedResult({
        workflowId: input.workflow.id,
        finalNodeKeys: input.finalNodeKeys,
        workflowStatus: input.resultStatus,
        persistedArtifactIds: persistedOutputs.artifactIds,
        persistedWorkItemIds: persistedOutputs.workItemIds,
        persistedKnowledgeSaveJobIds: persistedOutputs.knowledgeSaveJobIds,
        previous: input.previousNormalizedResult,
        retry: input.retry ?? null,
      }),
    },
  })
}

function hasIterationScope(workflow: WorkflowDefinition) {
  const types = new Set(workflow.nodes.map((node) => node.type))
  return types.has("foreach") && types.has("collect") && types.has("output")
}

function resolveIterationCreditsReserved(workflow: WorkflowDefinition) {
  return workflow.nodes.reduce((sum, node) => {
    const value = node.config?.estimatedCredits ?? node.config?.credits ?? node.config?.creditCost
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? sum + value : sum
  }, 0)
}

async function executeIterationWorkflowRunJob(context: WorkflowRunJobContext) {
  const detail = await getWorkflowRunDetail(context.runId, context.workflow.enterpriseId)
  if (!detail) throw new Error("workflow_run_detail_missing")
  const nodeExecutionIds = new Map(detail.nodeExecutions.map((execution) => [execution.nodeKey, execution.id]))
  const controller = new AbortController()
  const cancellationPoll = setInterval(() => {
    void getPlatformTaskRun(context.runId).then((run) => {
      if (run?.status === "cancel_requested" || run?.status === "cancelled") controller.abort("user_cancelled")
    }).catch(() => {})
  }, 250)
  try {
    const result = await runPersistedWorkflowIterationDefinition({
      runId: context.runId,
      enterpriseId: context.workflow.enterpriseId,
      ownerUserId: context.workflow.ownerUserId,
      nodes: context.workflow.nodes,
      edges: context.workflow.edges,
      seedInput: context.seedInput,
      executorContext: {
        capabilityInvoker: createJobCapabilityInvoker(context),
        workflowMetadata: context.workflow.metadata ?? null,
      },
      nodeExecutionIds,
      persistence: {
        createIterationsForResolvedInput,
        startAttempt,
        markAttemptSubmitted,
        completeAttempt,
        reserveCredits: ({ amount, idempotencyKey }) => reserveFeatureCredits({
          userId: context.currentUser.id,
          enterpriseId: context.currentUser.enterpriseId,
          userName: context.currentUser.name,
          userEmail: context.currentUser.email,
          userPermissions: context.currentUser.permissions,
          featureKey: "workflow_iteration",
          amount,
          idempotencyKey,
          metadata: { runId: context.runId },
        }),
        finalizeCredits: ({ reservation, actualAmount, idempotencyKey }) => finalizeReservedCredits({
          reservation: reservation as Awaited<ReturnType<typeof reserveFeatureCredits>>,
          userId: context.currentUser.id,
          enterpriseId: context.currentUser.enterpriseId,
          actualAmount,
          idempotencyKey,
          metadata: { runId: context.runId },
        }),
        releaseCredits: ({ reservation, idempotencyKey, reason }) => releaseReservedCredits({
          reservation: reservation as Awaited<ReturnType<typeof reserveFeatureCredits>>,
          userId: context.currentUser.id,
          enterpriseId: context.currentUser.enterpriseId,
          idempotencyKey,
          reason,
        }),
      },
      creditsReserved: resolveIterationCreditsReserved(context.workflow),
      retry: context.iterationRetry ?? null,
      signal: controller.signal,
      onNodeStateChange: (state) => persistWorkflowNodeStateWithEvent(context.runId, state),
    })
    await finalizeWorkflowRun({
      runId: context.runId,
      workflow: context.workflow,
      currentUser: context.currentUser,
      nodeStates: result.nodeStates,
      resultStatus: result.status,
      finalNodeKeys: result.finalNodeKeys,
      persistWorkflowDefinition: false,
    })
  } finally {
    clearInterval(cancellationPoll)
  }
}

function createJobCapabilityInvoker(context: WorkflowRunJobContext) {
  return createWorkflowCapabilityInvoker({
    cookieHeader: context.cookieHeader,
    currentUser: context.currentUser,
    locale: context.locale ?? "en",
    workflowMetadata: context.workflow.metadata ?? null,
    requestOrigin: context.requestOrigin,
    requestIp: context.requestIp,
    activeWorkflowId: context.workflow.id,
  })
}

export async function executeWorkflowRunJob(context: WorkflowRunJobContext) {
  try {
    await ensureWorkflowNodeExecutionRecords({
      runId: context.runId,
      workflowId: context.workflow.id,
      nodes: context.workflow.nodes,
    })

    // Configuration errors must fail closed. Falling back to the legacy DAG
    // executor when the iteration flag is enabled but its confirmation secret
    // is invalid would silently bypass the M3 run contract.
    const iterationsEnabled = resolveWorkflowFeatures().iterationsV1
    if (iterationsEnabled && hasIterationScope(context.workflow)) {
      await executeIterationWorkflowRunJob(context)
      return
    }

    const result = await runWorkflowDefinition({
      enterpriseId: context.workflow.enterpriseId,
      ownerUserId: context.workflow.ownerUserId,
      nodes: context.workflow.nodes,
      edges: context.workflow.edges,
      seedInput: context.seedInput,
      executorContext: {
        capabilityInvoker: createJobCapabilityInvoker(context),
        workflowMetadata: context.workflow.metadata ?? null,
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

    try {
      await updatePlatformWorkflowRun({
        runId: context.runId,
        patch: { status: "cancelled", expectedStatus: "cancel_requested", finishedAt: new Date() },
      })
      return
    } catch (cancelTransitionError) {
      if (!(cancelTransitionError instanceof Error) || cancelTransitionError.message !== "workflow_run_transition_conflict") {
        throw cancelTransitionError
      }
    }
    await updatePlatformWorkflowRun({
      runId: context.runId,
      patch: {
        status: "failed",
        expectedStatus: ["queued", "running"],
        finishedAt: new Date(),
      },
    })
  }
}

export async function executeWorkflowRetryJob(context: WorkflowRetryJobContext) {
  try {
    await ensureWorkflowNodeExecutionRecords({
      runId: context.runId,
      workflowId: context.workflow.id,
      nodes: context.workflow.nodes,
    })

    const result = await retryWorkflowNodeExecution({
      enterpriseId: context.workflow.enterpriseId,
      ownerUserId: context.workflow.ownerUserId,
      nodes: context.workflow.nodes,
      edges: context.workflow.edges,
      seedInput: context.seedInput,
      nodeStates: context.existingNodeStates,
      nodeKey: context.nodeKey,
      mode: context.mode,
      executorContext: {
        capabilityInvoker: createJobCapabilityInvoker(context),
        workflowMetadata: context.workflow.metadata ?? null,
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
        expectedStatus: ["queued", "running"],
        finishedAt: new Date(),
      },
    })
  }
}
