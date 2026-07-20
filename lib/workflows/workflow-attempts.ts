import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  platformTaskRuns,
  platformWorkflowIterations,
  platformWorkflowNodeAttempts,
  platformWorkflowNodeExecutions,
  platformWorkflowRevisions,
  platformWorkflowRunSnapshots,
  platformWorkflows,
} from "@/lib/db/schema"
import { ensureWorkflowAttemptTables } from "@/lib/workflows/workflow-attempt-migrations"
import { getModelDefinition } from "@/lib/ai-runtime/model-registry"
import { getProviderAdapter } from "@/lib/ai-runtime/provider-registry"
import type { ModelProviderId } from "@/lib/ai-runtime/types"

export type WorkflowRunSnapshotRecord = typeof platformWorkflowRunSnapshots.$inferSelect
export type WorkflowIterationRecord = typeof platformWorkflowIterations.$inferSelect
export type WorkflowNodeAttemptRecord = typeof platformWorkflowNodeAttempts.$inferSelect

export type WorkflowIterationStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"
export type WorkflowAttemptStatus =
  | "queued"
  | "submitting"
  | "running"
  | "cancel_requested"
  | "succeeded"
  | "failed"
  | "cancelled"

export type WorkflowRevisionRunInput = {
  enterpriseId: number
  userId: number
  workflowId: number
  revisionId: number
  definitionHash: string
  /** Complete immutable revision snapshot, including title/metadata/definition. */
  definition: Record<string, unknown>
  requestId: string
  inputPayload?: Record<string, unknown> | null
  nodes?: Array<{ nodeKey: string; nodeType: string }>
}

export type WorkflowRunCreationResult = {
  run: typeof platformTaskRuns.$inferSelect
  snapshot: WorkflowRunSnapshotRecord
  nodeExecutions: Array<typeof platformWorkflowNodeExecutions.$inferSelect>
  reused: boolean
}

export type WorkflowRevisionRecord = typeof platformWorkflowRevisions.$inferSelect

/**
 * Resolve an immutable revision through the tenant-owned workflow.  The run
 * route uses this instead of trusting a client-supplied definition.  Keeping
 * this lookup beside snapshot creation makes the enterprise boundary explicit
 * and gives legacy runs a safe feature-gated escape hatch.
 */
export async function getWorkflowRevisionForRun(input: {
  workflowId: number
  enterpriseId: number
  revision: number
}): Promise<WorkflowRevisionRecord | null> {
  requirePositiveInteger(input.workflowId, "workflow_id")
  requirePositiveInteger(input.enterpriseId, "workflow_enterprise_id")
  requirePositiveInteger(input.revision, "workflow_revision")
  await ensureWorkflowAttemptTables()
  const [revision] = await db
    .select({ revision: platformWorkflowRevisions })
    .from(platformWorkflowRevisions)
    .innerJoin(platformWorkflows, eq(platformWorkflows.id, platformWorkflowRevisions.workflowId))
    .where(
      and(
        eq(platformWorkflowRevisions.workflowId, input.workflowId),
        eq(platformWorkflowRevisions.revision, input.revision),
        eq(platformWorkflows.enterpriseId, input.enterpriseId),
      ),
    )
    .limit(1)
  return revision?.revision ?? null
}

export async function getWorkflowIterationForRun(input: {
  runId: number
  scopeNodeKey: string
  iterationKey: string
}): Promise<WorkflowIterationRecord | null> {
  requirePositiveInteger(input.runId, "workflow_run_id")
  const scopeNodeKey = normalizedText(input.scopeNodeKey, 120)
  const iterationKey = normalizedText(input.iterationKey, 160)
  if (!scopeNodeKey) throw new Error("workflow_scope_node_key_invalid")
  if (!iterationKey) throw new Error("workflow_iteration_key_invalid")
  await ensureWorkflowAttemptTables()
  const [iteration] = await db
    .select()
    .from(platformWorkflowIterations)
    .where(
      and(
        eq(platformWorkflowIterations.runId, input.runId),
        eq(platformWorkflowIterations.scopeNodeKey, scopeNodeKey),
        eq(platformWorkflowIterations.iterationKey, iterationKey),
      ),
    )
    .limit(1)
  return iteration ?? null
}

export async function getLatestWorkflowAttemptForIteration(input: {
  iterationId: number
}): Promise<WorkflowNodeAttemptRecord | null> {
  requirePositiveInteger(input.iterationId, "workflow_iteration_id")
  await ensureWorkflowAttemptTables()
  const [attempt] = await db
    .select()
    .from(platformWorkflowNodeAttempts)
    .where(eq(platformWorkflowNodeAttempts.iterationId, input.iterationId))
    .orderBy(desc(platformWorkflowNodeAttempts.attemptNumber), desc(platformWorkflowNodeAttempts.id))
    .limit(1)
  return attempt ?? null
}

export type CreateWorkflowIterationsInput = {
  runId: number
  scopeNodeKey: string
  items: Array<{
    iterationKey: string
    iterationIndex: number
    inputPayload?: Record<string, unknown> | null
    creditsReserved?: number
  }>
  maxIterations?: number
}

export type StartAttemptInput = {
  nodeExecutionId: number
  iterationId?: number | null
  scopeKey?: string
  idempotencyKey: string
  providerId?: string | null
  modelId?: string | null
  inputPayload?: Record<string, unknown> | null
  creditsReserved?: number
}

export type MarkAttemptSubmittedInput = {
  attemptId: number
  providerRequestId?: string | null
  providerTaskId?: string | null
  status?: "submitting" | "running"
  startedAt?: Date | null
}

export type CompleteAttemptInput = {
  attemptId: number
  status: Extract<WorkflowAttemptStatus, "succeeded" | "failed" | "cancelled">
  outputPayload?: Record<string, unknown> | null
  errorCode?: string | null
  errorMessage?: string | null
  creditsConsumed?: number
}

export type WorkflowCancellationResult = {
  taskRunId: number
  alreadyRequested: boolean
  cancelledIterationCount: number
  cancelRequestedAttemptCount: number
  providerCancelRequestedCount?: number
  providerCancelNotSupportedCount?: number
}

function normalizedText(value: string | null | undefined, maxLength: number) {
  if (typeof value !== "string") return null
  const text = value.trim()
  return text ? text.slice(0, maxLength) : null
}

function requirePositiveInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${field}_invalid`)
  return value
}

function requireRequestId(value: string) {
  const normalized = normalizedText(value, 64)
  if (!normalized || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error("workflow_request_id_invalid")
  }
  return normalized
}

function requireScopeKey(value: string | undefined) {
  const normalized = normalizedText(value ?? "__node__", 160)
  if (!normalized) throw new Error("workflow_attempt_scope_key_invalid")
  return normalized
}

function requireIdempotencyKey(value: string) {
  const normalized = normalizedText(value, 255)
  if (!normalized) throw new Error("workflow_attempt_idempotency_key_invalid")
  return normalized
}

function normalizeCredits(value: number | undefined) {
  return Number.isFinite(value) && Number(value) >= 0 ? Math.floor(Number(value)) : 0
}

function validateIterationItems(input: CreateWorkflowIterationsInput) {
  const maxIterations = Number.isInteger(input.maxIterations) && Number(input.maxIterations) > 0 ? Number(input.maxIterations) : 100
  if (input.items.length > maxIterations || input.items.length > 100) throw new Error("workflow_iteration_limit_exceeded")
  const keys = new Set<string>()
  input.items.forEach((item, index) => {
    if (!item.iterationKey || item.iterationKey.length > 160 || keys.has(item.iterationKey)) {
      throw new Error("workflow_iteration_key_invalid")
    }
    keys.add(item.iterationKey)
    if (!Number.isInteger(item.iterationIndex) || item.iterationIndex !== index || item.iterationIndex < 0) {
      throw new Error("workflow_iteration_index_invalid")
    }
  })
}

async function findExistingRunByRequest(tx: any, workflowId: number, enterpriseId: number, requestId: string) {
  const [row] = await tx
    .select({ run: platformTaskRuns, snapshot: platformWorkflowRunSnapshots })
    .from(platformWorkflowRunSnapshots)
    .innerJoin(platformTaskRuns, eq(platformTaskRuns.id, platformWorkflowRunSnapshots.taskRunId))
    .where(and(
      eq(platformWorkflowRunSnapshots.workflowId, workflowId),
      eq(platformWorkflowRunSnapshots.requestId, requestId),
      eq(platformTaskRuns.enterpriseId, enterpriseId),
    ))
    .limit(1)
  return row ?? null
}

async function loadRunCreationResult(tx: any, run: typeof platformTaskRuns.$inferSelect, snapshot: WorkflowRunSnapshotRecord, reused: boolean): Promise<WorkflowRunCreationResult> {
  const nodeExecutions = await tx
    .select()
    .from(platformWorkflowNodeExecutions)
    .where(eq(platformWorkflowNodeExecutions.runId, run.id))
    .orderBy(platformWorkflowNodeExecutions.id)
  return { run, snapshot, nodeExecutions, reused }
}

/** Create the task run, immutable snapshot, and node summaries atomically. */
export async function createWorkflowRunFromRevision(input: WorkflowRevisionRunInput): Promise<WorkflowRunCreationResult> {
  requirePositiveInteger(input.enterpriseId, "workflow_enterprise_id")
  requirePositiveInteger(input.userId, "workflow_user_id")
  requirePositiveInteger(input.workflowId, "workflow_id")
  requirePositiveInteger(input.revisionId, "workflow_revision_id")
  const requestId = requireRequestId(input.requestId)
  await ensureWorkflowAttemptTables()

  try {
    return await db.transaction(async (tx) => {
      const existing = await findExistingRunByRequest(tx, input.workflowId, input.enterpriseId, requestId)
      if (existing) return loadRunCreationResult(tx, existing.run, existing.snapshot, true)

      const [run] = await tx
        .insert(platformTaskRuns)
        .values({
          enterpriseId: input.enterpriseId,
          userId: input.userId,
          kind: "workflow",
          itemType: "workflow",
          itemSlug: `workflow-${input.workflowId}`.slice(0, 128),
          status: "queued",
          inputPayload: input.inputPayload ?? null,
          normalizedResult: null,
        })
        .returning()
      if (!run) throw new Error("workflow_run_create_failed")

      const [snapshot] = await tx
        .insert(platformWorkflowRunSnapshots)
        .values({
          taskRunId: run.id,
          workflowId: input.workflowId,
          revisionId: input.revisionId,
          definitionHash: input.definitionHash,
          definition: input.definition,
          requestId,
        })
        .returning()
      if (!snapshot) throw new Error("workflow_run_snapshot_create_failed")

      const nodes = input.nodes ?? []
      if (nodes.length > 0) {
        await tx.insert(platformWorkflowNodeExecutions).values(
          nodes.map((node) => ({
            runId: run.id,
            workflowId: input.workflowId,
            nodeKey: node.nodeKey,
            nodeType: node.nodeType,
            status: "queued" as const,
            creditsConsumed: 0,
          })),
        )
      }
      return loadRunCreationResult(tx, run, snapshot, false)
    })
  } catch (error) {
    // A concurrent request can win the unique (workflow_id, request_id) race.
    // The transaction rolls back its task run; return the winner instead.
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    if (!message.includes("unique") && !message.includes("duplicate")) throw error
    const existing = await db
      .select({ run: platformTaskRuns, snapshot: platformWorkflowRunSnapshots })
      .from(platformWorkflowRunSnapshots)
      .innerJoin(platformTaskRuns, eq(platformTaskRuns.id, platformWorkflowRunSnapshots.taskRunId))
      .where(and(eq(platformWorkflowRunSnapshots.workflowId, input.workflowId), eq(platformWorkflowRunSnapshots.requestId, requestId), eq(platformTaskRuns.enterpriseId, input.enterpriseId)))
      .limit(1)
    if (!existing[0]) throw error
    const nodeExecutions = await db
      .select()
      .from(platformWorkflowNodeExecutions)
      .where(eq(platformWorkflowNodeExecutions.runId, existing[0].run.id))
      .orderBy(platformWorkflowNodeExecutions.id)
    return { run: existing[0].run, snapshot: existing[0].snapshot, nodeExecutions, reused: true }
  }
}

export async function createIterationsForResolvedInput(input: CreateWorkflowIterationsInput) {
  requirePositiveInteger(input.runId, "workflow_run_id")
  const scopeNodeKey = normalizedText(input.scopeNodeKey, 120)
  if (!scopeNodeKey) throw new Error("workflow_scope_node_key_invalid")
  validateIterationItems(input)
  await ensureWorkflowAttemptTables()
  if (input.items.length === 0) return [] as WorkflowIterationRecord[]

  await db.transaction(async (tx) => {
    await tx
      .insert(platformWorkflowIterations)
      .values(
        input.items.map((item) => ({
          runId: input.runId,
          scopeNodeKey,
          iterationKey: item.iterationKey,
          iterationIndex: item.iterationIndex,
          status: "queued" as const,
          inputPayload: item.inputPayload ?? null,
          creditsReserved: normalizeCredits(item.creditsReserved),
          creditsConsumed: 0,
        })),
      )
      .onConflictDoNothing()
  })
  return db
    .select()
    .from(platformWorkflowIterations)
    .where(and(eq(platformWorkflowIterations.runId, input.runId), eq(platformWorkflowIterations.scopeNodeKey, scopeNodeKey)))
    .orderBy(platformWorkflowIterations.iterationIndex)
}

export async function startAttempt(input: StartAttemptInput) {
  requirePositiveInteger(input.nodeExecutionId, "workflow_node_execution_id")
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey)
  const scopeKey = requireScopeKey(input.scopeKey)
  await ensureWorkflowAttemptTables()
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(platformWorkflowNodeAttempts).where(eq(platformWorkflowNodeAttempts.idempotencyKey, idempotencyKey)).limit(1)
      if (existing) return existing
      const [inProgress] = await tx
        .select()
        .from(platformWorkflowNodeAttempts)
        .where(and(
          eq(platformWorkflowNodeAttempts.nodeExecutionId, input.nodeExecutionId),
          eq(platformWorkflowNodeAttempts.scopeKey, scopeKey),
          inArray(platformWorkflowNodeAttempts.status, ["queued", "submitting", "running", "cancel_requested"]),
        ))
        .orderBy(desc(platformWorkflowNodeAttempts.attemptNumber))
        .limit(1)
      if (inProgress) throw new Error("workflow_attempt_in_progress")
      const [latest] = await tx
        .select({ attemptNumber: platformWorkflowNodeAttempts.attemptNumber })
        .from(platformWorkflowNodeAttempts)
        .where(and(eq(platformWorkflowNodeAttempts.nodeExecutionId, input.nodeExecutionId), eq(platformWorkflowNodeAttempts.scopeKey, scopeKey)))
        .orderBy(desc(platformWorkflowNodeAttempts.attemptNumber))
        .limit(1)
      const [attempt] = await tx
        .insert(platformWorkflowNodeAttempts)
        .values({
          nodeExecutionId: input.nodeExecutionId,
          iterationId: input.iterationId ?? null,
          scopeKey,
          attemptNumber: (latest?.attemptNumber ?? 0) + 1,
          status: "queued",
          idempotencyKey,
          providerId: normalizedText(input.providerId, 80),
          modelId: normalizedText(input.modelId, 160),
          inputPayload: input.inputPayload ?? null,
          creditsReserved: normalizeCredits(input.creditsReserved),
          creditsConsumed: 0,
        })
        .returning()
      if (!attempt) throw new Error("workflow_attempt_create_failed")
      if (input.iterationId) {
        await tx
          .update(platformWorkflowIterations)
          .set({ status: "running", startedAt: sql`COALESCE(${platformWorkflowIterations.startedAt}, CURRENT_TIMESTAMP)`, updatedAt: new Date() })
          .where(and(eq(platformWorkflowIterations.id, input.iterationId), inArray(platformWorkflowIterations.status, ["queued", "failed"])))
      }
      return attempt
    })
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    if (!message.includes("unique") && !message.includes("duplicate")) throw error
    const [existing] = await db.select().from(platformWorkflowNodeAttempts).where(eq(platformWorkflowNodeAttempts.idempotencyKey, idempotencyKey)).limit(1)
    if (!existing) throw error
    return existing
  }
}

export async function markAttemptSubmitted(input: MarkAttemptSubmittedInput) {
  requirePositiveInteger(input.attemptId, "workflow_attempt_id")
  await ensureWorkflowAttemptTables()
  const now = new Date()
  const [updated] = await db
    .update(platformWorkflowNodeAttempts)
    .set({
      status: input.status ?? "running",
      providerRequestId: input.providerRequestId ? normalizedText(input.providerRequestId, 255) : sql`${platformWorkflowNodeAttempts.providerRequestId}`,
      providerTaskId: input.providerTaskId ? normalizedText(input.providerTaskId, 255) : sql`${platformWorkflowNodeAttempts.providerTaskId}`,
      submittedAt: now,
      startedAt: input.startedAt ?? now,
      updatedAt: now,
    })
    .where(and(eq(platformWorkflowNodeAttempts.id, input.attemptId), inArray(platformWorkflowNodeAttempts.status, ["queued", "submitting"])))
    .returning()
  if (updated) return updated
  const [existing] = await db.select().from(platformWorkflowNodeAttempts).where(eq(platformWorkflowNodeAttempts.id, input.attemptId)).limit(1)
  if (!existing) return null
  return existing
}

export async function completeAttempt(input: CompleteAttemptInput) {
  requirePositiveInteger(input.attemptId, "workflow_attempt_id")
  await ensureWorkflowAttemptTables()
  const now = new Date()
  const creditsConsumed = normalizeCredits(input.creditsConsumed)
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(platformWorkflowNodeAttempts)
      .set({
        status: input.status,
        outputPayload: input.outputPayload ?? null,
        errorCode: normalizedText(input.errorCode, 128),
        errorMessage: normalizedText(input.errorMessage, 10_000),
        creditsConsumed: sql`GREATEST(${platformWorkflowNodeAttempts.creditsConsumed}, ${creditsConsumed})`,
        finishedAt: now,
        updatedAt: now,
      })
      .where(and(eq(platformWorkflowNodeAttempts.id, input.attemptId), inArray(platformWorkflowNodeAttempts.status, ["queued", "submitting", "running"])))
      .returning()
    const attempt = updated ?? (await tx.select().from(platformWorkflowNodeAttempts).where(eq(platformWorkflowNodeAttempts.id, input.attemptId)).limit(1))[0]
    if (!attempt) return null
    if (attempt.iterationId && updated) {
      await tx
        .update(platformWorkflowIterations)
        .set({
          status: input.status,
          outputPayload: input.outputPayload ?? null,
          creditsConsumed: sql`GREATEST(${platformWorkflowIterations.creditsConsumed}, ${creditsConsumed})`,
          finishedAt: now,
          updatedAt: now,
        })
        .where(and(eq(platformWorkflowIterations.id, attempt.iterationId), inArray(platformWorkflowIterations.status, ["queued", "running"])))
    }
    return attempt
  })
}

export async function requestRunCancellation(taskRunId: number): Promise<WorkflowCancellationResult | null> {
  requirePositiveInteger(taskRunId, "workflow_run_id")
  await ensureWorkflowAttemptTables()
  const result = await db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(platformTaskRuns)
      .where(eq(platformTaskRuns.id, taskRunId))
      .limit(1)
      .for("update")
    if (!run) return null
    const [snapshot] = await tx.select().from(platformWorkflowRunSnapshots).where(eq(platformWorkflowRunSnapshots.taskRunId, taskRunId)).limit(1)
    const terminalRun = run.status === "succeeded" || run.status === "failed" || run.status === "cancelled"
    const alreadyRequested = terminalRun || Boolean(snapshot?.cancelRequestedAt) || run.status === "cancel_requested"
    const now = new Date()
    if (terminalRun) return { taskRunId, alreadyRequested: true, cancelledIterationCount: 0, cancelRequestedAttemptCount: 0, providerTasks: [] as Array<{ providerId: string | null; modelId: string | null; providerTaskId: string }>, userId: run.userId, enterpriseId: run.enterpriseId }
    if (snapshot && !snapshot.cancelRequestedAt) {
      await tx.update(platformWorkflowRunSnapshots).set({ cancelRequestedAt: now }).where(and(eq(platformWorkflowRunSnapshots.taskRunId, taskRunId), isNull(platformWorkflowRunSnapshots.cancelRequestedAt)))
    }
    if (run.status === "queued" || run.status === "running") {
      await tx.update(platformTaskRuns).set({ status: "cancel_requested", updatedAt: now }).where(and(eq(platformTaskRuns.id, taskRunId), inArray(platformTaskRuns.status, ["queued", "running"])))
    }
    const iterations = await tx.update(platformWorkflowIterations).set({ status: "cancelled", finishedAt: now, updatedAt: now }).where(and(eq(platformWorkflowIterations.runId, taskRunId), eq(platformWorkflowIterations.status, "queued"))).returning({ id: platformWorkflowIterations.id })
    const nodeExecutionIds = tx.select({ id: platformWorkflowNodeExecutions.id }).from(platformWorkflowNodeExecutions).where(eq(platformWorkflowNodeExecutions.runId, taskRunId))
    const activeAttempts = await tx
      .select({ providerId: platformWorkflowNodeAttempts.providerId, modelId: platformWorkflowNodeAttempts.modelId, providerTaskId: platformWorkflowNodeAttempts.providerTaskId })
      .from(platformWorkflowNodeAttempts)
      .where(and(inArray(platformWorkflowNodeAttempts.nodeExecutionId, nodeExecutionIds), inArray(platformWorkflowNodeAttempts.status, ["submitting", "running"]), isNotNull(platformWorkflowNodeAttempts.providerTaskId)))
    const attempts = await tx.update(platformWorkflowNodeAttempts).set({ status: "cancel_requested", updatedAt: now }).where(and(inArray(platformWorkflowNodeAttempts.nodeExecutionId, nodeExecutionIds), inArray(platformWorkflowNodeAttempts.status, ["queued", "submitting", "running"]))).returning({ id: platformWorkflowNodeAttempts.id })
    return { taskRunId, alreadyRequested, cancelledIterationCount: iterations.length, cancelRequestedAttemptCount: attempts.length, providerTasks: activeAttempts.filter((item): item is { providerId: string | null; modelId: string | null; providerTaskId: string } => Boolean(item.providerTaskId)), userId: run.userId, enterpriseId: run.enterpriseId }
  })
  if (!result) return null
  if (!result.providerTasks.length) {
    const { providerTasks: _providerTasks, userId: _userId, enterpriseId: _enterpriseId, ...withoutTasks } = result
    return withoutTasks
  }
  let providerCancelRequestedCount = 0
  let providerCancelNotSupportedCount = 0
  await Promise.all(result.providerTasks.map(async (task) => {
    if (!task.providerId || !task.modelId) {
      providerCancelNotSupportedCount += 1
      return
    }
    const model = getModelDefinition(task.modelId)
    const adapter = model ? getProviderAdapter(task.providerId as ModelProviderId, model.capability) : null
    if (!adapter?.cancel) {
      providerCancelNotSupportedCount += 1
      return
    }
    try {
      const cancelled = await adapter.cancel({
        currentUser: { id: result.userId, enterpriseId: result.enterpriseId },
        capability: model!.capability,
        modelId: model!.id,
        runId: taskRunId,
        taskId: task.providerTaskId,
        providerTaskId: task.providerTaskId,
        reason: "user_cancelled",
        runtimeContext: undefined,
      }, model!)
      if (cancelled.status === "not_supported") providerCancelNotSupportedCount += 1
      else providerCancelRequestedCount += 1
    } catch {
      providerCancelNotSupportedCount += 1
    }
  }))
  const { providerTasks: _providerTasks, userId: _userId, enterpriseId: _enterpriseId, ...base } = result
  return { ...base, providerCancelRequestedCount, providerCancelNotSupportedCount }
}

type MemoryRun = typeof platformTaskRuns.$inferSelect

/** Deterministic in-memory implementation used by contract tests and local dry runs. */
export function createInMemoryWorkflowAttemptStore() {
  let nextRunId = 1
  let nextNodeExecutionId = 1
  let nextIterationId = 1
  let nextAttemptId = 1
  const runs = new Map<number, MemoryRun>()
  const snapshots = new Map<number, WorkflowRunSnapshotRecord>()
  const executions = new Map<number, typeof platformWorkflowNodeExecutions.$inferSelect>()
  const iterations = new Map<number, WorkflowIterationRecord>()
  const attempts = new Map<number, WorkflowNodeAttemptRecord>()

  const now = () => new Date()
  const findRunByRequest = (workflowId: number, enterpriseId: number, requestId: string) => [...snapshots.values()].find((s) => {
    if (s.workflowId !== workflowId || s.requestId !== requestId) return false
    return runs.get(s.taskRunId)?.enterpriseId === enterpriseId
  })

  return {
    async createWorkflowRunFromRevision(input: WorkflowRevisionRunInput): Promise<WorkflowRunCreationResult> {
      requirePositiveInteger(input.enterpriseId, "workflow_enterprise_id")
      requirePositiveInteger(input.userId, "workflow_user_id")
      requirePositiveInteger(input.workflowId, "workflow_id")
      const requestId = requireRequestId(input.requestId)
      const existingSnapshot = findRunByRequest(input.workflowId, input.enterpriseId, requestId)
      if (existingSnapshot) {
        const run = runs.get(existingSnapshot.taskRunId)!
        return { run, snapshot: existingSnapshot, nodeExecutions: [...executions.values()].filter((e) => e.runId === run.id), reused: true }
      }
      const createdAt = now()
      const run = {
        id: nextRunId++, enterpriseId: input.enterpriseId, userId: input.userId, kind: "workflow", itemType: "workflow", itemSlug: `workflow-${input.workflowId}`,
        externalRunId: null, externalSystem: null, status: "queued", inputPayload: input.inputPayload ?? null, normalizedResult: null,
        startedAt: null, finishedAt: null, createdAt, updatedAt: createdAt,
      } as MemoryRun
      const snapshot = {
        taskRunId: run.id, workflowId: input.workflowId, revisionId: input.revisionId, definitionHash: input.definitionHash,
        definition: input.definition, requestId, cancelRequestedAt: null, createdAt,
      } as WorkflowRunSnapshotRecord
      runs.set(run.id, run); snapshots.set(run.id, snapshot)
      for (const node of input.nodes ?? []) {
        const execution = { id: nextNodeExecutionId++, runId: run.id, workflowId: input.workflowId, nodeKey: node.nodeKey, nodeType: node.nodeType, status: "queued", providerId: null, modelId: null, taskRunId: null, inputPayload: null, outputPayload: null, errorMessage: null, creditsConsumed: 0, startedAt: null, finishedAt: null, createdAt, updatedAt: createdAt } as typeof platformWorkflowNodeExecutions.$inferSelect
        executions.set(execution.id, execution)
      }
      return { run, snapshot, nodeExecutions: [...executions.values()].filter((e) => e.runId === run.id), reused: false }
    },
    async createIterationsForResolvedInput(input: CreateWorkflowIterationsInput) {
      validateIterationItems(input)
      const scope = normalizedText(input.scopeNodeKey, 120)!
      const current = [...iterations.values()].filter((i) => i.runId === input.runId && i.scopeNodeKey === scope)
      if (current.length === 0) {
        const createdAt = now()
        for (const item of input.items) {
          const row = { id: nextIterationId++, runId: input.runId, scopeNodeKey: scope, iterationKey: item.iterationKey, iterationIndex: item.iterationIndex, status: "queued", inputPayload: item.inputPayload ?? null, outputPayload: null, creditsReserved: normalizeCredits(item.creditsReserved), creditsConsumed: 0, startedAt: null, finishedAt: null, createdAt, updatedAt: createdAt } as WorkflowIterationRecord
          iterations.set(row.id, row)
        }
      }
      return [...iterations.values()].filter((i) => i.runId === input.runId && i.scopeNodeKey === scope).sort((a, b) => a.iterationIndex - b.iterationIndex)
    },
    async startAttempt(input: StartAttemptInput) {
      const key = requireIdempotencyKey(input.idempotencyKey)
      const existing = [...attempts.values()].find((a) => a.idempotencyKey === key)
      if (existing) return existing
      const scope = requireScopeKey(input.scopeKey)
      const latest = [...attempts.values()].filter((a) => a.nodeExecutionId === input.nodeExecutionId && a.scopeKey === scope).sort((a, b) => b.attemptNumber - a.attemptNumber)[0]
      const inProgress = [...attempts.values()].find((a) => a.nodeExecutionId === input.nodeExecutionId && a.scopeKey === scope && ["queued", "submitting", "running", "cancel_requested"].includes(a.status))
      if (inProgress) throw new Error("workflow_attempt_in_progress")
      const createdAt = now()
      const row = { id: nextAttemptId++, nodeExecutionId: input.nodeExecutionId, iterationId: input.iterationId ?? null, scopeKey: scope, attemptNumber: (latest?.attemptNumber ?? 0) + 1, status: "queued", idempotencyKey: key, providerId: normalizedText(input.providerId, 80), modelId: normalizedText(input.modelId, 160), providerRequestId: null, providerTaskId: null, inputPayload: input.inputPayload ?? null, outputPayload: null, errorCode: null, errorMessage: null, creditsReserved: normalizeCredits(input.creditsReserved), creditsConsumed: 0, submittedAt: null, startedAt: null, finishedAt: null, createdAt, updatedAt: createdAt } as WorkflowNodeAttemptRecord
      attempts.set(row.id, row)
      if (row.iterationId) { const iteration = iterations.get(row.iterationId); if (iteration && (iteration.status === "queued" || iteration.status === "failed")) iteration.status = "running" }
      return row
    },
    async markAttemptSubmitted(input: MarkAttemptSubmittedInput) {
      const row = attempts.get(input.attemptId)
      if (!row) return null
      if (row.status === "queued" || row.status === "submitting") { row.status = input.status ?? "running"; row.providerRequestId = normalizedText(input.providerRequestId, 255) ?? row.providerRequestId; row.providerTaskId = normalizedText(input.providerTaskId, 255) ?? row.providerTaskId; row.submittedAt ??= now(); row.startedAt = input.startedAt ?? row.startedAt ?? row.submittedAt; row.updatedAt = now() }
      return row
    },
    async completeAttempt(input: CompleteAttemptInput) {
      const row = attempts.get(input.attemptId)
      if (!row) return null
      if (["succeeded", "failed", "cancelled", "cancel_requested"].includes(row.status)) return row
      row.status = input.status; row.outputPayload = input.outputPayload ?? null; row.errorCode = normalizedText(input.errorCode, 128); row.errorMessage = normalizedText(input.errorMessage, 10_000); row.creditsConsumed = Math.max(row.creditsConsumed, normalizeCredits(input.creditsConsumed)); row.finishedAt = now(); row.updatedAt = now()
      if (row.iterationId) { const iteration = iterations.get(row.iterationId); if (iteration) { iteration.status = input.status; iteration.outputPayload = row.outputPayload; iteration.creditsConsumed = Math.max(iteration.creditsConsumed, row.creditsConsumed); iteration.finishedAt = row.finishedAt; iteration.updatedAt = row.updatedAt } }
      return row
    },
    async requestRunCancellation(taskRunId: number) {
      const run = runs.get(taskRunId); if (!run) return null
      const snapshot = snapshots.get(taskRunId); if (!snapshot) return null
      const terminalRun = run.status === "succeeded" || run.status === "failed" || run.status === "cancelled"
      const alreadyRequested = terminalRun || Boolean(snapshot.cancelRequestedAt) || run.status === "cancel_requested"
      if (terminalRun) return { taskRunId, alreadyRequested: true, cancelledIterationCount: 0, cancelRequestedAttemptCount: 0 }
      snapshot.cancelRequestedAt ??= now(); run.status = run.status === "succeeded" || run.status === "failed" ? run.status : "cancel_requested"; run.updatedAt = now()
      let cancelledIterationCount = 0; let cancelRequestedAttemptCount = 0
      for (const iteration of iterations.values()) if (iteration.runId === taskRunId && iteration.status === "queued") { iteration.status = "cancelled"; iteration.finishedAt = now(); cancelledIterationCount += 1 }
      for (const attempt of attempts.values()) if (["queued", "submitting", "running"].includes(attempt.status) && [...executions.values()].some((e) => e.id === attempt.nodeExecutionId && e.runId === taskRunId)) { attempt.status = "cancel_requested"; cancelRequestedAttemptCount += 1 }
      return { taskRunId, alreadyRequested, cancelledIterationCount, cancelRequestedAttemptCount }
    },
    listAttempts: (nodeExecutionId?: number) => [...attempts.values()].filter((a) => nodeExecutionId == null || a.nodeExecutionId === nodeExecutionId).sort((a, b) => a.id - b.id),
    listIterations: (runId: number, scopeNodeKey?: string) => [...iterations.values()].filter((i) => i.runId === runId && (scopeNodeKey == null || i.scopeNodeKey === scopeNodeKey)).sort((a, b) => a.iterationIndex - b.iterationIndex),
  }
}
