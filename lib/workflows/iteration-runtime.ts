import { createHmac, timingSafeEqual } from "node:crypto"

import {
  compileWorkflowPlan,
  sortWorkflowIterationsForCollect,
  type CompiledWorkflowPlan,
  type WorkflowPlanDefinition,
  type WorkflowPlanLimits,
} from "@/lib/workflows/plan-compiler"
import type {
  CompleteAttemptInput,
  CreateWorkflowIterationsInput,
  MarkAttemptSubmittedInput,
  StartAttemptInput,
  WorkflowAttemptStatus,
  WorkflowIterationStatus,
} from "@/lib/workflows/workflow-attempts"

export type WorkflowConfirmationPayload = {
  enterpriseId: number
  workflowId: number
  revision: number
  requestId: string
  taskCount: number
  maxCredits: number
  expiresAt: number
}

export type WorkflowConfirmationVerification =
  | { ok: true; payload: WorkflowConfirmationPayload }
  | { ok: false; code: "invalid_confirmation_token" | "confirmation_token_expired" }

export class WorkflowIterationRuntimeError extends Error {
  readonly code: string
  readonly details?: Record<string, unknown>

  constructor(code: string, details?: Record<string, unknown>) {
    super(code)
    this.name = "WorkflowIterationRuntimeError"
    this.code = code
    this.details = details
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(typeof value === "string" ? value : value.toString("utf8")).toString("base64url")
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url")
}

function assertSecret(secret: string) {
  if (Buffer.byteLength(secret, "utf8") < 32) throw new WorkflowIterationRuntimeError("workflow_confirmation_secret_invalid")
}

function stablePayload(value: WorkflowConfirmationPayload) {
  return JSON.stringify({
    enterpriseId: value.enterpriseId,
    workflowId: value.workflowId,
    revision: value.revision,
    requestId: value.requestId,
    taskCount: value.taskCount,
    maxCredits: value.maxCredits,
    expiresAt: value.expiresAt,
  })
}

function signConfirmationPayload(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url")
}

export function isWorkflowRequestId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value)
}

export function createWorkflowConfirmationToken(payload: WorkflowConfirmationPayload, secret: string) {
  assertSecret(secret)
  if (!isWorkflowRequestId(payload.requestId)) throw new WorkflowIterationRuntimeError("workflow_request_id_invalid")
  if (!Number.isInteger(payload.expiresAt) || payload.expiresAt <= Date.now()) {
    throw new WorkflowIterationRuntimeError("confirmation_token_expired")
  }
  const encodedPayload = base64UrlEncode(stablePayload(payload))
  return `${encodedPayload}.${signConfirmationPayload(encodedPayload, secret)}`
}

function samePayload(left: WorkflowConfirmationPayload, right: WorkflowConfirmationPayload) {
  return stablePayload(left) === stablePayload(right)
}

export function verifyWorkflowConfirmationToken(
  token: unknown,
  secret: string,
  expected: WorkflowConfirmationPayload,
  now = Date.now(),
): WorkflowConfirmationVerification {
  try {
    assertSecret(secret)
  } catch {
    return { ok: false, code: "invalid_confirmation_token" }
  }
  if (typeof token !== "string") return { ok: false, code: "invalid_confirmation_token" }
  const [encodedPayload, signature, ...extra] = token.split(".")
  if (!encodedPayload || !signature || extra.length > 0) return { ok: false, code: "invalid_confirmation_token" }
  let payload: WorkflowConfirmationPayload
  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as Partial<WorkflowConfirmationPayload>
    if (
      !Number.isInteger(parsed.enterpriseId) ||
      !Number.isInteger(parsed.workflowId) ||
      !Number.isInteger(parsed.revision) ||
      !isWorkflowRequestId(parsed.requestId) ||
      !Number.isInteger(parsed.taskCount) ||
      !Number.isInteger(parsed.maxCredits) ||
      !Number.isInteger(parsed.expiresAt)
    ) return { ok: false, code: "invalid_confirmation_token" }
    payload = parsed as WorkflowConfirmationPayload
  } catch {
    return { ok: false, code: "invalid_confirmation_token" }
  }
  const expectedSignature = signConfirmationPayload(encodedPayload, secret)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer as unknown as Uint8Array, expectedBuffer as unknown as Uint8Array)
  ) {
    return { ok: false, code: "invalid_confirmation_token" }
  }
  if (payload.expiresAt <= now) return { ok: false, code: "confirmation_token_expired" }
  if (!samePayload(payload, expected)) return { ok: false, code: "invalid_confirmation_token" }
  return { ok: true, payload }
}

export type IterationRuntimeItem<T = unknown> = {
  iterationKey: string
  iterationIndex: number
  input: T
}

export type IterationExecutionContext = {
  runId: number
  scopeNodeKey: string
  iterationKey: string
  iterationIndex: number
  attemptNumber: number
  idempotencyKey: string
  signal: AbortSignal
}

export type IterationExecutionResult<T = unknown> = {
  output?: T | null
  creditsConsumed?: number
  providerRequestId?: string | null
  providerTaskId?: string | null
  provider?: string | null
  modelId?: string | null
}

export type IterationRuntimeOutcome<T = unknown> = {
  iterationKey: string
  index: number
  status: WorkflowIterationStatus
  output: T | null
  error: string | null
  attemptNumber: number
  idempotencyKey: string
  creditsConsumed: number
}

export type WorkflowIterationRuntimeInput<T = unknown, O = unknown> = {
  runId: number
  scopeNodeKey: string
  items: readonly IterationRuntimeItem<T>[]
  concurrency?: number
  maxIterations?: number
  failurePolicy?: "continue" | "fail_fast"
  signal?: AbortSignal
  /**
   * Existing failed iterations can be resumed without reusing the first
   * idempotency key.  The normal path omits this map and starts at attempt 1.
   */
  attemptNumberByKey?: ReadonlyMap<string, number>
  execute: (item: T, context: IterationExecutionContext) => Promise<IterationExecutionResult<O> | O>
  onStateChange?: (outcome: IterationRuntimeOutcome<O>) => void | Promise<void>
}

export type WorkflowIterationRuntimeResult<O = unknown> = {
  status: "succeeded" | "failed" | "cancelled"
  outcomes: IterationRuntimeOutcome<O>[]
  successfulOutputs: O[]
  warningCount: number
}

function normalizePositiveInteger(value: number | undefined, fallback: number, maximum: number) {
  const number = value ?? fallback
  if (!Number.isInteger(number) || number < 1) throw new WorkflowIterationRuntimeError("invalid_workflow_definition")
  return Math.min(number, maximum)
}

function errorMessage(error: unknown) {
  if (error instanceof WorkflowIterationRuntimeError) return error.code
  if (error instanceof Error && error.message) return error.message
  return typeof error === "string" && error.trim() ? error.trim() : "provider_submit_failed"
}

function assertItems(items: readonly IterationRuntimeItem[], maxIterations: number) {
  if (items.length > maxIterations || items.length > 100) {
    throw new WorkflowIterationRuntimeError("workflow_iteration_limit_exceeded", { count: items.length, maxIterations })
  }
  const seen = new Set<string>()
  const seenIndexes = new Set<number>()
  items.forEach((item, index) => {
    if (!item || typeof item.iterationKey !== "string" || !item.iterationKey || seen.has(item.iterationKey)) {
      throw new WorkflowIterationRuntimeError("workflow_iteration_key_invalid", { index })
    }
    // A normal run supplies contiguous indexes.  Iteration-only retries are
    // intentionally sparse (for example, retrying only item index 4), so the
    // runtime validates identity/uniqueness without requiring the selected
    // subset to be re-numbered and thereby losing input-order semantics.
    if (!Number.isInteger(item.iterationIndex) || item.iterationIndex < 0 || seenIndexes.has(item.iterationIndex)) {
      throw new WorkflowIterationRuntimeError("workflow_iteration_index_invalid", { index })
    }
    seen.add(item.iterationKey)
    seenIndexes.add(item.iterationIndex)
  })
}

/** Compile and select the foreach scope used by the runtime. */
export function compileWorkflowIterationPlan(definition: WorkflowPlanDefinition, limits: WorkflowPlanLimits = {}) {
  const plan = compileWorkflowPlan(definition, limits)
  const foreachStep = plan.steps.find((step) => step.kind === "foreach")
  if (!foreachStep || foreachStep.kind !== "foreach") {
    throw new WorkflowIterationRuntimeError("workflow_foreach_not_found")
  }
  return { plan, foreachStep }
}

/**
 * Execute resolved foreach input with bounded concurrency.  The callback is
 * deliberately provider-neutral; persistence can be attached through
 * onStateChange or by wrapping execute with workflow-attempts CAS writes.
 */
export async function runWorkflowIterations<T, O>(input: WorkflowIterationRuntimeInput<T, O>): Promise<WorkflowIterationRuntimeResult<O>> {
  if (!Number.isInteger(input.runId) || input.runId < 1) throw new WorkflowIterationRuntimeError("workflow_run_id_invalid")
  if (!input.scopeNodeKey.trim()) throw new WorkflowIterationRuntimeError("workflow_scope_node_key_invalid")
  const maxIterations = normalizePositiveInteger(input.maxIterations, 20, 100)
  const concurrency = normalizePositiveInteger(input.concurrency, 3, 6)
  assertItems(input.items, maxIterations)

  const outcomes: Array<IterationRuntimeOutcome<O> | undefined> = Array(input.items.length)
  const controller = new AbortController()
  const stopOnFailure = input.failurePolicy === "fail_fast"
  let nextIndex = 0
  let failFastTriggered = false
  const abortFromParent = () => controller.abort(input.signal?.reason ?? "user_cancelled")
  if (input.signal) {
    if (input.signal.aborted) abortFromParent()
    else input.signal.addEventListener("abort", abortFromParent, { once: true })
  }

  const runOne = async (index: number) => {
    const item = input.items[index]
    const requestedAttempt = input.attemptNumberByKey?.get(item.iterationKey) ?? 1
    const attemptNumber = Number.isInteger(requestedAttempt) && requestedAttempt > 0 ? requestedAttempt : 1
    const idempotencyKey = `${input.runId}:${input.scopeNodeKey}:${item.iterationKey}:${attemptNumber}`
    const base = {
      iterationKey: item.iterationKey,
      index: item.iterationIndex,
      output: null,
      error: null,
      attemptNumber,
      idempotencyKey,
      creditsConsumed: 0,
    }
    if (controller.signal.aborted || failFastTriggered) {
      const cancelled = { ...base, status: "cancelled" as const, error: "cancelled" }
      outcomes[index] = cancelled
      await input.onStateChange?.(cancelled)
      return
    }
    try {
      const raw = await input.execute(item.input, {
        runId: input.runId,
        scopeNodeKey: input.scopeNodeKey,
        iterationKey: item.iterationKey,
        iterationIndex: item.iterationIndex,
        attemptNumber,
        idempotencyKey,
        signal: controller.signal,
      })
      const result = raw && typeof raw === "object" && ("output" in (raw as object) || "creditsConsumed" in (raw as object))
        ? raw as IterationExecutionResult<O>
        : { output: raw as O }
      const succeeded = { ...base, status: "succeeded" as const, output: result.output ?? null, creditsConsumed: Math.max(0, Math.floor(result.creditsConsumed ?? 0)) }
      outcomes[index] = succeeded
      await input.onStateChange?.(succeeded)
    } catch (error) {
      const cancelled = controller.signal.aborted || errorMessage(error) === "cancelled" || (error instanceof DOMException && error.name === "AbortError")
      const failed = { ...base, status: cancelled ? ("cancelled" as const) : ("failed" as const), error: cancelled ? "cancelled" : errorMessage(error) }
      outcomes[index] = failed
      await input.onStateChange?.(failed)
      if (!cancelled && stopOnFailure) {
        failFastTriggered = true
        controller.abort("fail_fast")
      }
    }
  }

  const worker = async () => {
    while (true) {
      const index = nextIndex++
      if (index >= input.items.length) return
      await runOne(index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, input.items.length) }, () => worker()))
  if (input.signal) input.signal.removeEventListener("abort", abortFromParent)

  const normalized = outcomes.map((outcome, index) => outcome ?? {
    iterationKey: input.items[index].iterationKey,
    index: input.items[index].iterationIndex,
    status: "cancelled" as const,
    output: null,
    error: "cancelled",
    attemptNumber: 1,
    idempotencyKey: `${input.runId}:${input.scopeNodeKey}:${input.items[index].iterationKey}:${
      Number.isInteger(input.attemptNumberByKey?.get(input.items[index].iterationKey)) &&
      (input.attemptNumberByKey?.get(input.items[index].iterationKey) ?? 0) > 0
        ? input.attemptNumberByKey?.get(input.items[index].iterationKey)
        : 1
    }`,
    creditsConsumed: 0,
  })
  const ordered = sortWorkflowIterationsForCollect(normalized.map((outcome) => ({ ...outcome, iterationKey: outcome.iterationKey, index: outcome.index, status: outcome.status })))
    .map((item) => normalized.find((outcome) => outcome.iterationKey === item.iterationKey && outcome.index === item.index)!)
  const failed = ordered.filter((item) => item.status === "failed" || item.status === "cancelled")
  return {
    status: input.signal?.aborted || (controller.signal.aborted && failed.length > 0 && failed.every((item) => item.status === "cancelled"))
      ? "cancelled"
      : failed.length > 0 && stopOnFailure
        ? "failed"
        : "succeeded",
    outcomes: ordered,
    successfulOutputs: ordered.filter((item) => item.status === "succeeded" && item.output !== null).map((item) => item.output as O),
    warningCount: failed.length,
  }
}

/** Ensure runtime callers can pass a workflow-attempts persistence shape without importing Drizzle rows. */
export type WorkflowAttemptPersistence = {
  createIterationsForResolvedInput: (input: CreateWorkflowIterationsInput) => Promise<unknown>
  startAttempt: (input: StartAttemptInput) => Promise<unknown>
  markAttemptSubmitted: (input: MarkAttemptSubmittedInput) => Promise<unknown>
  completeAttempt: (input: CompleteAttemptInput) => Promise<unknown>
  reserveCredits?: (input: { amount: number; idempotencyKey: string; iterationKey: string }) => Promise<unknown>
  finalizeCredits?: (input: { reservation: unknown; actualAmount: number; idempotencyKey: string }) => Promise<unknown>
  releaseCredits?: (input: { reservation: unknown; idempotencyKey: string; reason: string }) => Promise<unknown>
}

export type PersistedWorkflowIterationRuntimeInput<T = unknown, O = unknown> = WorkflowIterationRuntimeInput<T, O> & {
  nodeExecutionId: number
  persistence: WorkflowAttemptPersistence
  /** Resolved iteration row IDs, keyed by iterationKey. */
  iterationIds?: ReadonlyMap<string, number>
  creditsReserved?: number
}

function payloadRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
  if (value === undefined) return null
  return { value }
}

function persistedAttemptId(value: unknown) {
  if (!value || typeof value !== "object" || !Number.isInteger((value as { id?: unknown }).id)) {
    throw new WorkflowIterationRuntimeError("workflow_attempt_create_failed")
  }
  return (value as { id: number }).id
}

/**
 * Adapter that wires the pure scheduler to workflow-attempts persistence.
 * The attempt row is created before provider execution, moved to `running`
 * after the provider callback returns, and completed through the store's CAS
 * transition.  A retry receives a new idempotency key from the scheduler.
 */
export async function runPersistedWorkflowIterations<T, O>(
  input: PersistedWorkflowIterationRuntimeInput<T, O>,
): Promise<WorkflowIterationRuntimeResult<O>> {
  const { persistence, nodeExecutionId, iterationIds, creditsReserved, ...runtimeInput } = input
  if (!Number.isInteger(nodeExecutionId) || nodeExecutionId < 1) throw new WorkflowIterationRuntimeError("workflow_node_execution_id_invalid")
  return runWorkflowIterations({
    ...runtimeInput,
    execute: async (item, context) => {
      const attempt = await persistence.startAttempt({
        nodeExecutionId,
        iterationId: iterationIds?.get(context.iterationKey) ?? null,
        scopeKey: context.iterationKey,
        idempotencyKey: context.idempotencyKey,
        inputPayload: payloadRecord(item),
        creditsReserved,
      })
      const attemptId = persistedAttemptId(attempt)
      let reservation: unknown = null
      try {
        reservation = creditsReserved && creditsReserved > 0 && persistence.reserveCredits
          ? await persistence.reserveCredits({ amount: creditsReserved, idempotencyKey: `${context.idempotencyKey}:reserve`, iterationKey: context.iterationKey })
          : null
        // Mark the attempt before entering provider code. If the process dies
        // during submission, recovery can distinguish queued work from an
        // upstream request that may already exist.
        await persistence.markAttemptSubmitted({ attemptId, status: "submitting" })
        const raw = await input.execute(item, context)
        const result = raw && typeof raw === "object" && ("output" in (raw as object) || "creditsConsumed" in (raw as object))
          ? raw as IterationExecutionResult<O>
          : { output: raw as O }
        if (result.providerRequestId || result.providerTaskId) {
          await persistence.markAttemptSubmitted({
            attemptId,
            status: "running",
            providerRequestId: result.providerRequestId,
            providerTaskId: result.providerTaskId,
          })
        }
        const completed = await persistence.completeAttempt({
          attemptId,
          status: "succeeded",
          outputPayload: payloadRecord(result.output),
          creditsConsumed: result.creditsConsumed,
        })
        // Cancellation is a terminal CAS winner. Never turn a late provider
        // response into a successful iteration after cancel_requested.
        if (completed && typeof completed === "object" && "status" in completed && (completed as { status?: unknown }).status !== "succeeded") {
          throw new WorkflowIterationRuntimeError("cancelled")
        }
        if (reservation && persistence.finalizeCredits) {
          await persistence.finalizeCredits({ reservation, actualAmount: result.creditsConsumed ?? creditsReserved ?? 0, idempotencyKey: `${context.idempotencyKey}:debit` })
        }
        return result
      } catch (error) {
        await persistence.completeAttempt({
          attemptId,
          status: context.signal.aborted || errorMessage(error) === "cancelled" ? "cancelled" : "failed",
          errorCode: context.signal.aborted || errorMessage(error) === "cancelled" ? "cancelled" : errorMessage(error),
          errorMessage: errorMessage(error),
        }).catch(() => {})
        if (reservation && persistence.releaseCredits) {
          await persistence.releaseCredits({ reservation, idempotencyKey: `${context.idempotencyKey}:release`, reason: errorMessage(error) }).catch(() => {})
        }
        throw error
      }
    },
  })
}

export type { CompiledWorkflowPlan, WorkflowPlanDefinition, WorkflowPlanLimits, WorkflowIterationStatus, WorkflowAttemptStatus }
