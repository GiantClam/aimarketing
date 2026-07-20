import type {
  WorkflowNodeExecutionContext,
  WorkflowNodeExecutionResult,
  WorkflowNodeExecutor,
  WorkflowNodeInputBundle,
  WorkflowNodeOutputBundle,
} from "@/lib/workflows/node-executors"
import type { WorkflowNodeType } from "@/lib/workflows/schema"

/** The state persisted by the iteration store is deliberately represented by
 * a small structural type here.  The executor must not depend on a database
 * row or on an orchestrator implementation. */
export type WorkflowIterationStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"
export type WorkflowIterationFailurePolicy = "continue" | "fail_fast"

export type WorkflowIterationResult = {
  iterationKey: string
  index: number
  status: WorkflowIterationStatus
  artifacts?: WorkflowNodeOutputBundle | null
  output?: WorkflowNodeOutputBundle | null
  error?: string | null
}

export type WorkflowCollectedIteration = {
  iterationKey: string
  index: number
  status: WorkflowIterationStatus
  artifacts: WorkflowNodeOutputBundle
  error: string | null
}

export type WorkflowCollectOptions = {
  order?: "input"
  includeFailures?: boolean
}

export type WorkflowOutputOptions = {
  allowEmpty?: boolean
  requireAllSucceeded?: boolean
  displayName?: string
}

const VALUE_KINDS = ["text", "asset", "image", "video", "audio", "ppt"] as const

function emptyBundle(): WorkflowNodeInputBundle {
  return {
    text: [],
    asset: [],
    image: [],
    video: [],
    audio: [],
    ppt: [],
  }
}

function cloneBundle(value: WorkflowNodeOutputBundle | null | undefined): WorkflowNodeOutputBundle {
  const result: WorkflowNodeOutputBundle = {}
  const writable = result as unknown as Record<string, unknown>
  for (const kind of VALUE_KINDS) {
    const values = value?.[kind]
    if (values) writable[kind] = [...values]
  }
  return result
}

function mergeBundles(items: WorkflowNodeOutputBundle[]) {
  const result = emptyBundle()
  const writable = result as unknown as Record<string, unknown[]>
  for (const item of items) {
    for (const kind of VALUE_KINDS) {
      const values = item[kind]
      if (values?.length) writable[kind].push(...values)
    }
  }
  return result
}

function hasBundleValues(value: WorkflowNodeOutputBundle | null | undefined) {
  return VALUE_KINDS.some((kind) => (value?.[kind]?.length ?? 0) > 0)
}

function errorMessage(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "string") return value
  if (value instanceof Error && value.message) return value.message
  return String(value)
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    if (value.trim().toLowerCase() === "true") return true
    if (value.trim().toLowerCase() === "false") return false
  }
  return fallback
}

function normalizePositiveInteger(value: unknown, fallback: number, max?: number) {
  const numeric =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN
  if (!Number.isInteger(numeric) || numeric < 1) return fallback
  return max === undefined ? numeric : Math.min(numeric, max)
}

function normalizedIterationResult(item: WorkflowIterationResult): WorkflowCollectedIteration {
  return {
    iterationKey: String(item.iterationKey),
    index: Number.isInteger(item.index) && item.index >= 0 ? item.index : Number.MAX_SAFE_INTEGER,
    status: item.status,
    artifacts: cloneBundle(item.artifacts ?? item.output),
    error: errorMessage(item.error),
  }
}

/**
 * Collect iteration rows deterministically.  Completion order is never used
 * as an ordering signal: index is the input order and iterationKey is a
 * deterministic tie-breaker for malformed/duplicate indexes.
 */
export function collectWorkflowIterationResults(
  iterations: readonly WorkflowIterationResult[],
  options: WorkflowCollectOptions = {},
): WorkflowCollectedIteration[] {
  const includeFailures = options.includeFailures ?? false
  return iterations
    .map(normalizedIterationResult)
    .filter((item) => includeFailures || item.status === "succeeded")
    .sort((left, right) => left.index - right.index || left.iterationKey.localeCompare(right.iterationKey))
}

/** Alias kept short for compiler/orchestrator callers. */
export const collectIterationOutputs = collectWorkflowIterationResults

export function isWorkflowIterationFailure(status: WorkflowIterationStatus) {
  return status === "failed" || status === "cancelled"
}

export function shouldStopWorkflowIterationScope(input: {
  failurePolicy: WorkflowIterationFailurePolicy
  status: WorkflowIterationStatus
}) {
  return input.failurePolicy === "fail_fast" && isWorkflowIterationFailure(input.status)
}

function readIterationResults(config: Record<string, unknown>): WorkflowIterationResult[] {
  const candidate = config.iterationResults ?? config.iterations ?? config.items
  if (!Array.isArray(candidate)) return []
  return candidate.filter((item): item is WorkflowIterationResult => Boolean(item && typeof item === "object"))
}

function readBundleFromConfig(config: Record<string, unknown>) {
  const candidate = config.artifacts ?? config.output
  return candidate && typeof candidate === "object" ? cloneBundle(candidate as WorkflowNodeOutputBundle) : null
}

function collectNodeResult(context: WorkflowNodeExecutionContext): WorkflowNodeExecutionResult {
  const includeFailures = normalizeBoolean(context.node.config.includeFailures, false)
  const iterations = readIterationResults(context.node.config)
  const normalizedItems = iterations.map(normalizedIterationResult)
  const items = collectWorkflowIterationResults(iterations, {
    order: "input",
    includeFailures,
  })
  const output = mergeBundles(items.filter((item) => item.status === "succeeded").map((item) => item.artifacts))
  const failureCount = normalizedItems.filter((item) => isWorkflowIterationFailure(item.status)).length

  return {
    output,
    metadata: {
      controlNode: "collect",
      order: "input",
      includeFailures,
      warningCount: failureCount,
      items,
    },
  }
}

function outputNodeResult(context: WorkflowNodeExecutionContext): WorkflowNodeExecutionResult {
  const allowEmpty = normalizeBoolean(context.node.config.allowEmpty, false)
  const requireAllSucceeded = normalizeBoolean(context.node.config.requireAllSucceeded, true)
  const iterations = readIterationResults(context.node.config)
  const items = iterations.length
    ? collectWorkflowIterationResults(iterations, { order: "input", includeFailures: true })
    : []
  const failures = items.filter((item) => isWorkflowIterationFailure(item.status))
  const successes = items.filter((item) => item.status === "succeeded")
  const configuredOutput = readBundleFromConfig(context.node.config)
  const output = configuredOutput ?? (items.length ? mergeBundles(successes.map((item) => item.artifacts)) : cloneBundle(context.input))

  if (requireAllSucceeded && failures.length > 0) {
    throw new Error("workflow_iteration_failed")
  }
  if (items.length > 0 && successes.length === 0) {
    throw new Error("workflow_all_iterations_failed")
  }
  if (!allowEmpty && !hasBundleValues(output)) {
    throw new Error("empty_output")
  }

  return {
    output,
    metadata: {
      controlNode: "output",
      displayName: typeof context.node.config.displayName === "string" ? context.node.config.displayName : "",
      warningCount: failures.length,
      requireAllSucceeded,
      allowEmpty,
      iterationCount: items.length,
    },
  }
}

function foreachNodeResult(context: WorkflowNodeExecutionContext): WorkflowNodeExecutionResult {
  const failurePolicy: WorkflowIterationFailurePolicy = context.node.config.failurePolicy === "fail_fast" ? "fail_fast" : "continue"
  const concurrency = normalizePositiveInteger(context.node.config.concurrency, 3, 6)
  const maxIterations = normalizePositiveInteger(context.node.config.maxIterations, 20, 100)
  const inputPortId = typeof context.node.config.inputPortId === "string" && context.node.config.inputPortId.trim()
    ? context.node.config.inputPortId.trim()
    : "image.reference"
  const collectNodeKey = typeof context.node.config.collectNodeKey === "string" ? context.node.config.collectNodeKey.trim() : ""

  // Foreach is a scope declaration.  The orchestrator owns iteration creation
  // and execution; preserving the bundle makes the node useful in legacy
  // preview execution while keeping the scheduling metadata explicit.
  return {
    output: cloneBundle(context.input),
    metadata: {
      controlNode: "foreach",
      inputPortId,
      collectNodeKey: collectNodeKey || null,
      failurePolicy,
      concurrency,
      maxIterations,
      scopeOnly: true,
    },
  }
}

export const workflowControlExecutors: Readonly<Record<"foreach" | "collect" | "output", WorkflowNodeExecutor>> = {
  foreach: {
    nodeType: "foreach" as WorkflowNodeType,
    action: "foreach-scope",
    outputKinds: ["asset", "image"],
    execute: async (context) => foreachNodeResult(context),
  },
  collect: {
    nodeType: "collect" as WorkflowNodeType,
    action: "collect-iterations",
    outputKinds: ["text", "asset", "image", "video", "audio", "ppt"],
    execute: async (context) => collectNodeResult(context),
  },
  output: {
    nodeType: "output" as WorkflowNodeType,
    action: "workflow-output",
    outputKinds: ["text", "asset", "image", "video", "audio", "ppt"],
    execute: async (context) => outputNodeResult(context),
  },
}
