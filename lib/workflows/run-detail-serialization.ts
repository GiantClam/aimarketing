import { serializePlatformWorkflowRun } from "@/lib/platform/workflow-runner"
import { getWorkflowRunDetail } from "@/lib/workflows/store"
import type {
  WorkflowIterationRecord,
  WorkflowNodeAttemptRecord,
  WorkflowRunSnapshotRecord,
} from "@/lib/workflows/workflow-attempts"

/**
 * The run detail endpoint predates iteration/attempt persistence.  Keep these
 * fields optional so a legacy run can still be serialized without a database
 * migration or a client-side shape fork.  Callers that have loaded the M3
 * records attach them to the detail object before invoking this serializer.
 */
export type SerializedWorkflowRunSnapshot = Pick<
  WorkflowRunSnapshotRecord,
  "taskRunId" | "workflowId" | "revisionId" | "definitionHash" | "requestId"
> & {
  cancelRequestedAt: string | null
  createdAt: string | null
}

export type SerializedWorkflowIteration = Pick<
  WorkflowIterationRecord,
  | "id"
  | "runId"
  | "scopeNodeKey"
  | "iterationKey"
  | "iterationIndex"
  | "status"
  | "inputPayload"
  | "outputPayload"
  | "creditsReserved"
  | "creditsConsumed"
> & {
  warnings: string[]
  startedAt: string | null
  finishedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type SerializedWorkflowNodeAttempt = Pick<
  WorkflowNodeAttemptRecord,
  | "id"
  | "nodeExecutionId"
  | "iterationId"
  | "scopeKey"
  | "attemptNumber"
  | "status"
  | "providerId"
  | "modelId"
  | "providerRequestId"
  | "providerTaskId"
  | "inputPayload"
  | "outputPayload"
  | "errorCode"
  | "errorMessage"
  | "creditsReserved"
  | "creditsConsumed"
> & {
  warnings: string[]
  submittedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

type WorkflowRunDetailWithM3Records =
  | (NonNullable<Awaited<ReturnType<typeof getWorkflowRunDetail>>> & {
      snapshot?: WorkflowRunSnapshotRecord | null
      iterations?: WorkflowIterationRecord[]
      attempts?: WorkflowNodeAttemptRecord[]
    })
  | null

function serializeDate(value: Date | string | null | undefined) {
  if (value instanceof Date) return value.toISOString()
  return typeof value === "string" && value.trim() ? value : null
}

function serializeWarnings(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
}

function serializeSnapshot(snapshot: WorkflowRunSnapshotRecord): SerializedWorkflowRunSnapshot {
  return {
    taskRunId: snapshot.taskRunId,
    workflowId: snapshot.workflowId,
    revisionId: snapshot.revisionId,
    definitionHash: snapshot.definitionHash,
    requestId: snapshot.requestId,
    cancelRequestedAt: serializeDate(snapshot.cancelRequestedAt),
    createdAt: serializeDate(snapshot.createdAt),
  }
}

function serializeIteration(iteration: WorkflowIterationRecord): SerializedWorkflowIteration {
  const candidate = iteration as WorkflowIterationRecord & { warnings?: unknown }
  return {
    id: iteration.id,
    runId: iteration.runId,
    scopeNodeKey: iteration.scopeNodeKey,
    iterationKey: iteration.iterationKey,
    iterationIndex: iteration.iterationIndex,
    status: iteration.status,
    inputPayload: iteration.inputPayload ?? null,
    outputPayload: iteration.outputPayload ?? null,
    creditsReserved: iteration.creditsReserved,
    creditsConsumed: iteration.creditsConsumed,
    warnings: serializeWarnings(candidate.warnings),
    startedAt: serializeDate(iteration.startedAt),
    finishedAt: serializeDate(iteration.finishedAt),
    createdAt: serializeDate(iteration.createdAt),
    updatedAt: serializeDate(iteration.updatedAt),
  }
}

function serializeAttempt(attempt: WorkflowNodeAttemptRecord): SerializedWorkflowNodeAttempt {
  const candidate = attempt as WorkflowNodeAttemptRecord & { warnings?: unknown }
  return {
    id: attempt.id,
    nodeExecutionId: attempt.nodeExecutionId,
    iterationId: attempt.iterationId ?? null,
    scopeKey: attempt.scopeKey,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    providerId: attempt.providerId ?? null,
    modelId: attempt.modelId ?? null,
    providerRequestId: attempt.providerRequestId ?? null,
    providerTaskId: attempt.providerTaskId ?? null,
    inputPayload: attempt.inputPayload ?? null,
    outputPayload: attempt.outputPayload ?? null,
    errorCode: attempt.errorCode ?? null,
    errorMessage: attempt.errorMessage ?? null,
    creditsReserved: attempt.creditsReserved,
    creditsConsumed: attempt.creditsConsumed,
    warnings: serializeWarnings(candidate.warnings),
    submittedAt: serializeDate(attempt.submittedAt),
    startedAt: serializeDate(attempt.startedAt),
    finishedAt: serializeDate(attempt.finishedAt),
    createdAt: serializeDate(attempt.createdAt),
    updatedAt: serializeDate(attempt.updatedAt),
  }
}

export function serializeWorkflowRunDetail(detail: WorkflowRunDetailWithM3Records) {
  if (!detail) return null

  const serialized = {
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
  const serializedWithM3Fields = serialized as typeof serialized & {
    snapshot?: SerializedWorkflowRunSnapshot | null
    iterations?: SerializedWorkflowIteration[]
    attempts?: SerializedWorkflowNodeAttempt[]
  }

  // Do not add new keys to old payloads.  This keeps exact-shape consumers and
  // cached legacy run responses compatible while allowing M3 callers to opt in
  // by attaching the records to the detail object.
  if (detail.snapshot !== undefined) {
    serializedWithM3Fields.snapshot = detail.snapshot ? serializeSnapshot(detail.snapshot) : null
  }
  if (detail.iterations !== undefined) {
    serializedWithM3Fields.iterations = (detail.iterations ?? []).map(serializeIteration)
  }
  if (detail.attempts !== undefined) {
    serializedWithM3Fields.attempts = (detail.attempts ?? []).map(serializeAttempt)
  }

  return serializedWithM3Fields
}

export type SerializedWorkflowRunDetail = NonNullable<ReturnType<typeof serializeWorkflowRunDetail>> & {
  snapshot?: SerializedWorkflowRunSnapshot | null
  iterations?: SerializedWorkflowIteration[]
  attempts?: SerializedWorkflowNodeAttempt[]
}
