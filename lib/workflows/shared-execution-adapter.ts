import {
  executeWorkflow,
  migrateWorkflowDefinitionToCurrent,
  type WorkflowDefinitionEnvelope,
} from "@aimarketing/workflow-core"

import {
  createWorkflowNodeInputBundle,
  resolveWorkflowNodeExecutor,
  type WorkflowNodeExecutionContext,
  type WorkflowNodeExecutionResult,
  type WorkflowNodeInputBundle,
  type WorkflowNodeOutputBundle,
} from "@/lib/workflows/node-executors"
import type { WorkflowNodeRunState } from "@/lib/workflows/execution"
import type { WorkflowDefinition } from "@/lib/workflows/store"

type SharedSaasWorkflowExecutionInput = {
  enterpriseId: number
  ownerUserId: number
  nodes: WorkflowDefinition["nodes"]
  edges: WorkflowDefinition["edges"]
  seedInput?: Partial<WorkflowNodeInputBundle>
  executorContext?: Omit<WorkflowNodeExecutionContext, "enterpriseId" | "ownerUserId" | "node" | "input">
  signal?: AbortSignal
  initialNodeStates?: Record<string, WorkflowNodeRunState>
  rerunNodeKeys?: readonly string[]
  onNodeStateChange?: (state: WorkflowNodeRunState) => Promise<void> | void
}

export type SharedSaasWorkflowExecutionResult = {
  status: "succeeded" | "failed"
  definition: WorkflowDefinitionEnvelope
  nodeStates: Record<string, WorkflowNodeRunState>
  finalNodeKeys: string[]
}

function cloneOutput(output: WorkflowNodeOutputBundle): WorkflowNodeOutputBundle {
  return {
    ...(output.text ? { text: [...output.text] } : {}),
    ...(output.asset ? { asset: [...output.asset] } : {}),
    ...(output.image ? { image: [...output.image] } : {}),
    ...(output.video ? { video: [...output.video] } : {}),
    ...(output.audio ? { audio: [...output.audio] } : {}),
    ...(output.ppt ? { ppt: [...output.ppt] } : {}),
  }
}

function bundleFromPortInputs(inputs: Record<string, unknown>, seed?: Partial<WorkflowNodeInputBundle>): WorkflowNodeInputBundle {
  const bundle = createWorkflowNodeInputBundle()
  for (const kind of ["text", "asset", "image", "video", "audio", "ppt"] as const) {
    const value = inputs[kind]
    if (Array.isArray(value)) bundle[kind] = [...value] as never
    else if (value !== undefined) bundle[kind] = [value] as never
    else if (seed?.[kind]) bundle[kind] = [...seed[kind]!] as never
  }
  return bundle
}

function newState(nodeKey: string, status: WorkflowNodeRunState["status"], output: WorkflowNodeOutputBundle = {}, errorMessage: string | null = null, result?: WorkflowNodeExecutionResult, previous?: WorkflowNodeRunState): WorkflowNodeRunState {
  const now = new Date()
  return {
    nodeKey,
    status,
    attemptCount: previous?.status === "running" ? previous.attemptCount : (previous?.attemptCount ?? 0) + 1,
    output: cloneOutput(output),
    startedAt: now,
    finishedAt: status === "running" ? null : now,
    providerId: result?.providerId ?? null,
    modelId: result?.modelId ?? null,
    taskRunId: result?.taskRunId ?? null,
    creditsConsumed: result?.creditsConsumed ?? 0,
    errorMessage,
    metadata: result?.metadata ?? null,
  }
}

function legacyDefinition(nodes: WorkflowDefinition["nodes"], edges: WorkflowDefinition["edges"]): WorkflowDefinitionEnvelope {
  return migrateWorkflowDefinitionToCurrent({
    nodes: nodes.map((node) => ({ ...node })),
    edges: edges.map((edge) => ({ ...edge })),
  })
}

/**
 * SaaS composition for ordinary DAGs.  Capability execution remains in the
 * existing host layer so billing, task persistence and artifact behavior are
 * unchanged; only graph scheduling and typed port propagation are shared.
 */
export async function runSaasWorkflowWithSharedCore(input: SharedSaasWorkflowExecutionInput): Promise<SharedSaasWorkflowExecutionResult> {
  const definition = legacyDefinition(input.nodes, input.edges)
  const sourceNodes = new Map(input.nodes.map((node) => [node.nodeKey, node]))
  const nodeStates: Record<string, WorkflowNodeRunState> = Object.fromEntries(Object.entries(input.initialNodeStates ?? {}).map(([nodeKey, state]) => [nodeKey, { ...state, output: cloneOutput(state.output) }]))
  const results = new Map<string, WorkflowNodeExecutionResult>()
  const rerunNodeKeys = new Set(input.rerunNodeKeys ?? [])
  const completed = Object.fromEntries(
    Object.entries(input.initialNodeStates ?? {})
      .filter(([nodeKey, state]) => state.status === "succeeded" && !rerunNodeKeys.has(nodeKey))
      .map(([nodeKey, state]) => [nodeKey, cloneOutput(state.output) as Record<string, unknown>]),
  )

  const result = await executeWorkflow(definition, {
    runId: "saas-workflow-adapter",
    signal: input.signal,
    completed,
    ports: {
      capability: {
        execute: async ({ nodeKey, inputs }) => {
          const node = sourceNodes.get(nodeKey)
          if (!node) throw new Error(`workflow_node_missing:${nodeKey}`)
          const execution = await resolveWorkflowNodeExecutor(node.type).execute({
            enterpriseId: input.enterpriseId,
            ownerUserId: input.ownerUserId,
            node,
            input: bundleFromPortInputs(inputs, input.seedInput),
            ...input.executorContext,
          })
          results.set(nodeKey, execution)
          return execution.output as Record<string, unknown>
        },
      },
      events: {
        append: async (event) => {
          const nodeKey = typeof event.payload.nodeKey === "string" ? event.payload.nodeKey : null
          if (!nodeKey) return
          if (event.type === "node_started") {
            const state = newState(nodeKey, "running", {}, null, undefined, nodeStates[nodeKey])
            nodeStates[nodeKey] = state
            await input.onNodeStateChange?.(state)
          } else if (event.type === "node_succeeded") {
            const execution = results.get(nodeKey)
            const output = execution?.output ?? {}
            const state = newState(nodeKey, "succeeded", output, null, execution, nodeStates[nodeKey])
            nodeStates[nodeKey] = state
            await input.onNodeStateChange?.(state)
          } else if (event.type === "node_failed") {
            const message = typeof event.payload.message === "string" ? event.payload.message : "workflow_node_execution_failed"
            const state = newState(nodeKey, "failed", {}, message, undefined, nodeStates[nodeKey])
            nodeStates[nodeKey] = state
            await input.onNodeStateChange?.(state)
          }
        },
      },
    },
  })

  if (result.status === "cancelled") {
    const error = new Error("workflow_cancelled")
    error.name = "AbortError"
    throw error
  }
  if (result.status === "failed") {
    for (const node of definition.nodes) {
      if (nodeStates[node.nodeKey]) continue
      const state = newState(node.nodeKey, "cancelled", {}, "workflow_upstream_failed", undefined, nodeStates[node.nodeKey])
      nodeStates[node.nodeKey] = state
      await input.onNodeStateChange?.(state)
    }
  }
  const finalNodeKeys = definition.nodes
    .filter((node) => !definition.edges.some((edge) => edge.sourceNodeKey === node.nodeKey))
    .map((node) => node.nodeKey)
  return { status: result.status === "succeeded" ? "succeeded" : "failed", definition, nodeStates, finalNodeKeys }
}
