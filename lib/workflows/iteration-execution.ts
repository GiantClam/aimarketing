import {
  collectWorkflowNodeInput,
  runWorkflowDefinition,
  type WorkflowNodeRunState,
  type WorkflowRunResult,
} from "@/lib/workflows/execution"
import {
  createWorkflowNodeInputBundle,
  mergeWorkflowNodeOutputBundles,
  resolveWorkflowNodeExecutor,
  type WorkflowNodeExecutionContext,
  type WorkflowNodeInputBundle,
  type WorkflowNodeOutputBundle,
} from "@/lib/workflows/node-executors"
import {
  compileWorkflowPlan,
  createWorkflowIterationKeys,
  type CompiledWorkflowPlan,
} from "@/lib/workflows/plan-compiler"
import type { WorkflowDefinition } from "@/lib/workflows/store"
import type { WorkflowDefinitionEdge } from "@/lib/workflows/schema"
import {
  runPersistedWorkflowIterations,
  type WorkflowAttemptPersistence,
  type IterationRuntimeOutcome,
  type IterationExecutionResult,
} from "@/lib/workflows/iteration-runtime"

type WorkflowIterationRow = {
  id: number
  iterationKey: string
  iterationIndex: number
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled"
  inputPayload?: Record<string, unknown> | null
  outputPayload?: Record<string, unknown> | null
}

export type IterationWorkflowRetry = {
  iterationKey: string
  /** Defaults to 2; callers may provide the latest attempt + 1. */
  attemptNumber?: number
}

export type IterationWorkflowExecutionInput = {
  runId: number
  enterpriseId: number
  ownerUserId: number
  nodes: WorkflowDefinition["nodes"]
  edges: WorkflowDefinitionEdge[]
  seedInput?: Partial<WorkflowNodeInputBundle>
  executorContext?: Omit<WorkflowNodeExecutionContext, "enterpriseId" | "ownerUserId" | "node" | "input">
  nodeExecutionIds: ReadonlyMap<string, number>
  persistence: WorkflowAttemptPersistence
  retry?: IterationWorkflowRetry | null
  signal?: AbortSignal
  onNodeStateChange?: (state: WorkflowNodeRunState) => Promise<void> | void
  creditsReserved?: number
}

export type IterationWorkflowExecutionResult = {
  status: "succeeded" | "failed" | "cancelled"
  plan: CompiledWorkflowPlan
  nodeStates: Record<string, WorkflowNodeRunState>
  finalNodeKeys: string[]
  iterations: WorkflowIterationRow[]
  outcomes: IterationRuntimeOutcome<WorkflowNodeOutputBundle>[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function cloneBundle(value: WorkflowNodeOutputBundle | null | undefined): WorkflowNodeOutputBundle {
  if (!value) return {}
  const result: WorkflowNodeOutputBundle = {}
  const writable = result as unknown as Record<string, unknown[]>
  for (const kind of ["text", "asset", "image", "video", "audio", "ppt"] as const) {
    if (value[kind]) writable[kind] = [...value[kind]!]
  }
  return result
}

function mergeFinalOutputs(result: WorkflowRunResult): WorkflowNodeOutputBundle {
  return result.finalNodeKeys.reduce(
    (bundle, nodeKey) => mergeWorkflowNodeOutputBundles(bundle, result.nodeStates[nodeKey]?.output ?? {}),
    createWorkflowNodeInputBundle(),
  )
}

function statusState(nodeKey: string, status: WorkflowNodeRunState["status"], output: WorkflowNodeOutputBundle = {}, errorMessage: string | null = null): WorkflowNodeRunState {
  const now = new Date()
  return {
    nodeKey,
    status,
    attemptCount: 1,
    output: cloneBundle(output),
    startedAt: now,
    finishedAt: now,
    providerId: null,
    modelId: null,
    taskRunId: null,
    creditsConsumed: 0,
    errorMessage,
    metadata: null,
  }
}

function inputKindFromPort(portId: string) {
  const kind = portId.split(".")[0]
  if (kind === "asset" || kind === "image" || kind === "video" || kind === "audio" || kind === "ppt" || kind === "text") return kind
  if (kind === "assets") return "asset"
  return "image"
}

function payloadForItem(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  return { value }
}

function outputFromPayload(value: Record<string, unknown> | null | undefined): WorkflowNodeOutputBundle {
  if (!value) return {}
  if (isRecord(value.value) && Object.keys(value).length === 1) return value.value as WorkflowNodeOutputBundle
  return value as WorkflowNodeOutputBundle
}

function scopedEdges(edges: WorkflowDefinitionEdge[], nodeKeys: Set<string>) {
  return edges.filter((edge) => nodeKeys.has(edge.sourceNodeKey) && nodeKeys.has(edge.targetNodeKey))
}

function findIterationNodeExecutionId(input: IterationWorkflowExecutionInput, bodyNodeKeys: readonly string[]) {
  // The terminal body executor owns the provider attempt.  Persisting against
  // its summary row keeps attempt history attached to the visible workflow.
  for (let index = bodyNodeKeys.length - 1; index >= 0; index -= 1) {
    const id = input.nodeExecutionIds.get(bodyNodeKeys[index])
    if (id) return id
  }
  throw new Error("workflow_node_execution_id_invalid")
}

function dynamicControlNode(
  node: WorkflowDefinition["nodes"][number],
  iterationResults: IterationRuntimeOutcome<WorkflowNodeOutputBundle>[],
) {
  return {
    ...node,
    config: {
      ...node.config,
      iterationResults: iterationResults.map((outcome) => ({
        iterationKey: outcome.iterationKey,
        index: outcome.index,
        status: outcome.status,
        artifacts: outcome.output,
        error: outcome.error,
      })),
    },
  }
}

/**
 * Execute a compiled foreach scope while retaining the existing DAG executor
 * for ordinary nodes. The body is isolated per input, attempts are persisted
 * before provider execution, and collect/output are dispatched only after the
 * deterministic input-order outcome list has been assembled.
 */
export async function runPersistedWorkflowIterationDefinition(
  input: IterationWorkflowExecutionInput,
): Promise<IterationWorkflowExecutionResult> {
  const plan = compileWorkflowPlan({
    nodes: input.nodes,
    edges: input.edges.map((edge) => ({
      ...edge,
      sourcePortId: edge.sourcePortId ?? undefined,
      targetPortId: edge.targetPortId ?? undefined,
    })),
  })
  const foreachStep = plan.steps.find((step) => step.kind === "foreach")
  if (!foreachStep || foreachStep.kind !== "foreach") throw new Error("workflow_foreach_not_found")

  const scopeNode = input.nodes.find((node) => node.nodeKey === foreachStep.nodeKey)
  const collectNode = input.nodes.find((node) => node.nodeKey === foreachStep.collectNodeKey)
  if (!scopeNode || !collectNode) throw new Error("workflow_foreach_collect_pair_invalid")

  const bodyNodeKeys = new Set(foreachStep.bodyNodeKeys)
  // Only top-level steps before the foreach scope belong to the pre-scope.
  // A plain `kind === node` filter also captures output/post nodes, causing
  // them to execute once before iterations and making cancellation appear to
  // succeed even though post-scope dispatch was skipped.
  const foreachStepIndex = plan.steps.findIndex((step) => step === foreachStep)
  const preNodeKeys = new Set(
    plan.steps
      .slice(0, foreachStepIndex)
      .filter((step): step is Extract<CompiledWorkflowPlan["steps"][number], { kind: "node" }> => step.kind === "node")
      .map((step) => step.nodeKey),
  )
  const preNodes = input.nodes.filter((node) => preNodeKeys.has(node.nodeKey))
  const preEdges = scopedEdges(input.edges, preNodeKeys)
  const preResult = preNodes.length
    ? await runWorkflowDefinition({
        enterpriseId: input.enterpriseId,
        ownerUserId: input.ownerUserId,
        nodes: preNodes,
        edges: preEdges,
        seedInput: input.seedInput,
        executorContext: input.executorContext,
        onNodeStateChange: input.onNodeStateChange,
      })
    : {
        status: "succeeded" as const,
        parallelLevels: [],
        nodeStates: {},
        finalNodeKeys: [],
      }
  if (preResult.status === "failed") {
    return {
      status: "failed",
      plan,
      nodeStates: preResult.nodeStates,
      finalNodeKeys: preResult.finalNodeKeys,
      iterations: [],
      outcomes: [],
    }
  }

  const preGraph = preNodes.length
    ? { parentMap: new Map<string, string[]>(preNodes.map((node) => [node.nodeKey, []])) }
    : { parentMap: new Map<string, string[]>() }
  // Resolve the foreach input against the original graph and the completed
  // pre-scope states. There can be no body parent at this point by compiler
  // contract, so only the upstream static nodes contribute.
  for (const edge of input.edges.filter((edge) => edge.targetNodeKey === scopeNode.nodeKey)) {
    const parents = preGraph.parentMap.get(scopeNode.nodeKey) ?? []
    if (!parents.includes(edge.sourceNodeKey)) parents.push(edge.sourceNodeKey)
    preGraph.parentMap.set(scopeNode.nodeKey, parents)
  }
  const foreachInput = collectWorkflowNodeInput({
    nodeKey: scopeNode.nodeKey,
    parentMap: preGraph.parentMap,
    edges: input.edges,
    nodes: input.nodes,
    nodeStates: preResult.nodeStates,
    seedInput: input.seedInput,
  })
  const inputKind = inputKindFromPort(foreachStep.inputPortId)
  const resolvedItems = (foreachInput[inputKind] ?? []) as unknown[]
  const iterationKeys = createWorkflowIterationKeys(resolvedItems)
  const allItems = resolvedItems.map((item, index) => ({
    iterationKey: iterationKeys[index],
    iterationIndex: index,
    input: item,
    inputPayload: payloadForItem(item),
  }))

  const persistedRows = (await input.persistence.createIterationsForResolvedInput({
    runId: input.runId,
    scopeNodeKey: scopeNode.nodeKey,
    items: allItems.map((item) => ({
      iterationKey: item.iterationKey,
      iterationIndex: item.iterationIndex,
      inputPayload: item.inputPayload,
    })),
    maxIterations: foreachStep.maxIterations,
  })) as WorkflowIterationRow[]
  const retryKey = input.retry?.iterationKey ?? null
  const items = retryKey ? allItems.filter((item) => item.iterationKey === retryKey) : allItems
  if (retryKey && items.length === 0) throw new Error("iteration_not_found")
  const iterationIds = new Map<string, number>(persistedRows.map((row) => [row.iterationKey, row.id]))
  const attemptNumberByKey = new Map<string, number>()
  if (retryKey) attemptNumberByKey.set(retryKey, Math.max(2, input.retry?.attemptNumber ?? 2))
  const bodyEdges = scopedEdges(input.edges, bodyNodeKeys)
  const bodyNodes = input.nodes.filter((node) => bodyNodeKeys.has(node.nodeKey))
  const bodyExecutionId = findIterationNodeExecutionId(input, foreachStep.bodyNodeKeys)
  const bodyOutputs = new Map<string, WorkflowNodeOutputBundle>()

  const runtime = await runPersistedWorkflowIterations({
    runId: input.runId,
    scopeNodeKey: scopeNode.nodeKey,
    nodeExecutionId: bodyExecutionId,
    items: items.map((item) => ({ iterationKey: item.iterationKey, iterationIndex: item.iterationIndex, input: item.input })),
    iterationIds,
    attemptNumberByKey,
    persistence: input.persistence,
    creditsReserved: input.creditsReserved,
    signal: input.signal,
    concurrency: foreachStep.concurrency,
    maxIterations: foreachStep.maxIterations,
    failurePolicy: foreachStep.failurePolicy,
    execute: async (item, context): Promise<IterationExecutionResult<WorkflowNodeOutputBundle>> => {
      const bodyResult = await runWorkflowDefinition({
        enterpriseId: input.enterpriseId,
        ownerUserId: input.ownerUserId,
        nodes: bodyNodes,
        edges: bodyEdges,
        seedInput: {
          [inputKind]: [item],
        } as Partial<WorkflowNodeInputBundle>,
        executorContext: {
          ...input.executorContext,
          idempotencyKey: context.idempotencyKey,
          signal: context.signal,
        },
      })
      if (bodyResult.status === "failed") {
        const failedNode = Object.values(bodyResult.nodeStates).find((state) => state.status === "failed")
        throw new Error(failedNode?.errorMessage || "workflow_iteration_body_failed")
      }
      const output = mergeFinalOutputs(bodyResult)
      bodyOutputs.set(context.iterationKey, output)
      return { output }
    },
  })

  // Include prior successful outcomes when an iteration-only retry runs. The
  // retry changes only one item while collect remains a complete ordered view.
  const priorOutcomes: IterationRuntimeOutcome<WorkflowNodeOutputBundle>[] = retryKey
    ? persistedRows
        .filter((row) => row.iterationKey !== retryKey && row.status === "succeeded")
        .map((row) => ({
          iterationKey: row.iterationKey,
          index: row.iterationIndex,
          status: "succeeded" as const,
          output: outputFromPayload(row.outputPayload),
          error: null,
          attemptNumber: 1,
          idempotencyKey: `${input.runId}:${scopeNode.nodeKey}:${row.iterationKey}:1`,
          creditsConsumed: 0,
        }))
    : []
  const outcomes = [...priorOutcomes, ...runtime.outcomes].sort((left, right) => left.index - right.index || left.iterationKey.localeCompare(right.iterationKey))

  const foreachState = statusState(scopeNode.nodeKey, runtime.status === "cancelled" ? "cancelled" : runtime.status === "failed" ? "failed" : "succeeded", foreachInput, runtime.status === "failed" ? "workflow_iteration_failed" : runtime.status === "cancelled" ? "cancelled" : null)
  const nodeStates: Record<string, WorkflowNodeRunState> = { ...preResult.nodeStates, [scopeNode.nodeKey]: foreachState }
  await input.onNodeStateChange?.({ ...foreachState, output: cloneBundle(foreachState.output) })

  const postNodeKeys = new Set(
    input.nodes
      .map((node) => node.nodeKey)
      .filter((nodeKey) => !preNodeKeys.has(nodeKey) && !bodyNodeKeys.has(nodeKey) && nodeKey !== scopeNode.nodeKey && nodeKey !== collectNode.nodeKey),
  )

  // Cancellation is terminal for the scope.  Do not dispatch collect/output
  // (or any other post-scope provider node) after the scheduler has observed
  // the cancellation signal; mark the remaining summaries terminal instead.
  if (runtime.status === "cancelled" || input.signal?.aborted) {
    const cancelledState = (nodeKey: string) => statusState(nodeKey, "cancelled", {}, "cancelled")
    const cancelledCollect = cancelledState(collectNode.nodeKey)
    nodeStates[collectNode.nodeKey] = cancelledCollect
    await input.onNodeStateChange?.({ ...cancelledCollect, output: cloneBundle(cancelledCollect.output) })
    for (const nodeKey of [...bodyNodeKeys, ...postNodeKeys]) {
      const state = cancelledState(nodeKey)
      nodeStates[nodeKey] = state
      await input.onNodeStateChange?.({ ...state, output: cloneBundle(state.output) })
    }
    return {
      status: "cancelled",
      plan,
      nodeStates,
      finalNodeKeys: [collectNode.nodeKey],
      iterations: persistedRows,
      outcomes,
    }
  }

  // Control nodes are dispatched through their registered executors, with the
  // dynamic results explicitly supplied instead of relying on static config.
  const collectResult = await resolveWorkflowNodeExecutor(collectNode.type).execute({
    enterpriseId: input.enterpriseId,
    ownerUserId: input.ownerUserId,
    node: dynamicControlNode(collectNode, outcomes),
    input: createWorkflowNodeInputBundle(),
    ...input.executorContext,
  })
  const collectState = statusState(collectNode.nodeKey, "succeeded", collectResult.output)
  collectState.metadata = collectResult.metadata ?? null
  nodeStates[collectNode.nodeKey] = collectState
  await input.onNodeStateChange?.({ ...collectState, output: cloneBundle(collectState.output) })

  const postNodes = input.nodes
    .filter((node) => postNodeKeys.has(node.nodeKey))
    .map((node) => (node.type === "output" ? dynamicControlNode(node, outcomes) : node))
  let postResult: WorkflowRunResult = {
    status: "succeeded",
    parallelLevels: [],
    nodeStates: {},
    finalNodeKeys: [],
  }
  if (postNodes.length) {
    postResult = await runWorkflowDefinition({
      enterpriseId: input.enterpriseId,
      ownerUserId: input.ownerUserId,
      nodes: postNodes,
      edges: scopedEdges(input.edges, postNodeKeys),
      seedInput: collectResult.output,
      executorContext: input.executorContext,
      onNodeStateChange: input.onNodeStateChange,
    })
    Object.assign(nodeStates, postResult.nodeStates)
  }

  for (const nodeKey of bodyNodeKeys) {
    const latest = [...runtime.outcomes].reverse().find((outcome) => outcome.status === "succeeded")
    const state = statusState(nodeKey, latest ? "succeeded" : "failed", latest?.output ?? {}, latest ? null : "workflow_iteration_failed")
    nodeStates[nodeKey] = state
  }
  const finalNodeKeys = postResult.finalNodeKeys.length ? postResult.finalNodeKeys : [collectNode.nodeKey]
  const status = runtime.status === "failed" || postResult.status === "failed" ? "failed" : "succeeded"
  return { status, plan, nodeStates, finalNodeKeys, iterations: persistedRows, outcomes }
}
