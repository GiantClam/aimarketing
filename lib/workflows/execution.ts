import {
  createWorkflowNodeInputBundle,
  mergeWorkflowNodeOutputBundles,
  resolveWorkflowNodeExecutor,
  type WorkflowNodeExecutionContext,
  type WorkflowMediaRef,
  type WorkflowNodeInputBundle,
  type WorkflowNodeOutputBundle,
} from "@/lib/workflows/node-executors"
import {
  canWorkflowNodeConnectValueKind,
  getWorkflowNodeOutputKinds,
  type WorkflowDefinitionEdge,
  type WorkflowDefinitionNode,
  type WorkflowValueKind,
} from "@/lib/workflows/schema"

export type WorkflowNodeRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"

export type WorkflowNodeRunState = {
  nodeKey: string
  status: WorkflowNodeRunStatus
  attemptCount: number
  output: WorkflowNodeOutputBundle
  startedAt: Date | null
  finishedAt: Date | null
  providerId?: string | null
  modelId?: string | null
  taskRunId?: number | null
  creditsConsumed: number
  errorMessage?: string | null
  metadata?: Record<string, unknown> | null
}

export type WorkflowGraphValidation = {
  nodeMap: Map<string, WorkflowDefinitionNode>
  parentMap: Map<string, string[]>
  childMap: Map<string, string[]>
  inDegree: Map<string, number>
}

export type ExecutableWorkflowPlan = WorkflowGraphValidation & {
  parallelLevels: string[][]
}

export type WorkflowRunDefinitionInput = {
  enterpriseId: number
  ownerUserId: number
  nodes: WorkflowDefinitionNode[]
  edges: WorkflowDefinitionEdge[]
  executorContext?: Omit<WorkflowNodeExecutionContext, "enterpriseId" | "ownerUserId" | "node" | "input">
  initialState?: Record<string, WorkflowNodeRunState>
  rerunNodeKeys?: string[]
  onNodeStateChange?: (state: WorkflowNodeRunState) => Promise<void> | void
}

export type WorkflowRunResult = {
  status: "succeeded" | "failed"
  parallelLevels: string[][]
  nodeStates: Record<string, WorkflowNodeRunState>
  finalNodeKeys: string[]
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error.trim()) return error.trim()
  return "workflow_node_execution_failed"
}

function inputNameToValueKind(inputName: string | null | undefined) {
  if (inputName === "text") return "text"
  if (inputName === "assets") return "asset"
  if (inputName === "image" || inputName === "images") return "image"
  if (inputName === "video" || inputName === "videos") return "video"
  if (inputName === "audio" || inputName === "audios") return "audio"
  if (inputName === "presentation" || inputName === "presentations" || inputName === "ppt") return "ppt"
  return null
}

function normalizeMimeType(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : ""
  return normalized || "application/octet-stream"
}

function inferWorkflowValueKindFromMimeType(mimeType: string | null | undefined): WorkflowValueKind | null {
  const normalized = normalizeMimeType(mimeType)
  if (normalized.startsWith("image/")) return "image"
  if (normalized.startsWith("video/")) return "video"
  if (normalized.startsWith("audio/")) return "audio"
  if (
    normalized.includes("presentation") ||
    normalized.includes("powerpoint") ||
    normalized === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return "ppt"
  }
  return null
}

function mapAssetToMediaRef(asset: WorkflowNodeInputBundle["asset"][number]): WorkflowMediaRef {
  return {
    url: asset.url ?? null,
    title: asset.fileName,
    mimeType: asset.mimeType,
    artifactId: asset.artifactId,
    storageKey: asset.storageKey,
  }
}

function projectParentOutputToInputKind(
  parentState: WorkflowNodeRunState,
  targetKind: WorkflowValueKind,
  targetNodeKey: string,
): WorkflowNodeOutputBundle {
  if (targetKind === "text") {
    return parentState.output.text ? { text: parentState.output.text } : {}
  }

  if (targetKind === "asset") {
    return parentState.output.asset ? { asset: parentState.output.asset } : {}
  }

  if (targetKind === "image") {
    if (parentState.output.image?.length) return { image: parentState.output.image }
    if (!parentState.output.asset?.length) return {}
    const matched = parentState.output.asset.filter((asset) => inferWorkflowValueKindFromMimeType(asset.mimeType) === "image")
    if (matched.length !== parentState.output.asset.length) {
      throw new Error(`workflow_edge_asset_type_mismatch:${targetNodeKey}:image`)
    }
    return { image: matched.map(mapAssetToMediaRef) }
  }

  if (targetKind === "video") {
    if (parentState.output.video?.length) return { video: parentState.output.video }
    if (!parentState.output.asset?.length) return {}
    const matched = parentState.output.asset.filter((asset) => inferWorkflowValueKindFromMimeType(asset.mimeType) === "video")
    if (matched.length !== parentState.output.asset.length) {
      throw new Error(`workflow_edge_asset_type_mismatch:${targetNodeKey}:video`)
    }
    return { video: matched.map(mapAssetToMediaRef) }
  }

  if (targetKind === "audio") {
    if (parentState.output.audio?.length) return { audio: parentState.output.audio }
    if (!parentState.output.asset?.length) return {}
    const matched = parentState.output.asset.filter((asset) => inferWorkflowValueKindFromMimeType(asset.mimeType) === "audio")
    if (matched.length !== parentState.output.asset.length) {
      throw new Error(`workflow_edge_asset_type_mismatch:${targetNodeKey}:audio`)
    }
    return { audio: matched.map(mapAssetToMediaRef) }
  }

  if (parentState.output.ppt?.length) return { ppt: parentState.output.ppt }
  if (!parentState.output.asset?.length) return {}
  const matched = parentState.output.asset.filter((asset) => inferWorkflowValueKindFromMimeType(asset.mimeType) === "ppt")
  if (matched.length !== parentState.output.asset.length) {
    throw new Error(`workflow_edge_asset_type_mismatch:${targetNodeKey}:ppt`)
  }
  return { ppt: matched.map(mapAssetToMediaRef) }
}

export function validateWorkflowGraph(input: {
  nodes: WorkflowDefinitionNode[]
  edges: WorkflowDefinitionEdge[]
}): WorkflowGraphValidation {
  const nodeMap = new Map<string, WorkflowDefinitionNode>()
  const parentMap = new Map<string, string[]>()
  const childMap = new Map<string, string[]>()
  const inDegree = new Map<string, number>()

  for (const node of input.nodes) {
    if (nodeMap.has(node.nodeKey)) {
      throw new Error("workflow_graph_duplicate_node_key")
    }
    nodeMap.set(node.nodeKey, node)
    parentMap.set(node.nodeKey, [])
    childMap.set(node.nodeKey, [])
    inDegree.set(node.nodeKey, 0)
  }

  for (const edge of input.edges) {
    const source = nodeMap.get(edge.sourceNodeKey)
    const target = nodeMap.get(edge.targetNodeKey)

    if (!source || !target) {
      throw new Error("workflow_graph_dangling_edge")
    }

    const sourceKinds = getWorkflowNodeOutputKinds(source.type)
    const edgeInputKind = inputNameToValueKind(edge.inputName)
    const compatible = edgeInputKind
      ? sourceKinds.some((kind) => kind === edgeInputKind || (kind === "asset" && canWorkflowNodeConnectValueKind(target.type, edgeInputKind)))
      : sourceKinds.some((kind) => canWorkflowNodeConnectValueKind(target.type, kind))
    if (!compatible) {
      throw new Error("workflow_graph_invalid_input_type")
    }

    parentMap.set(target.nodeKey, [...(parentMap.get(target.nodeKey) ?? []), source.nodeKey])
    childMap.set(source.nodeKey, [...(childMap.get(source.nodeKey) ?? []), target.nodeKey])
    inDegree.set(target.nodeKey, (inDegree.get(target.nodeKey) ?? 0) + 1)
  }

  const remainingInDegree = new Map(inDegree)
  const queue = [...remainingInDegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([nodeKey]) => nodeKey)
  let visitedCount = 0

  while (queue.length > 0) {
    const next = queue.shift()!
    visitedCount += 1
    for (const childNodeKey of childMap.get(next) ?? []) {
      const degree = (remainingInDegree.get(childNodeKey) ?? 0) - 1
      remainingInDegree.set(childNodeKey, degree)
      if (degree === 0) {
        queue.push(childNodeKey)
      }
    }
  }

  if (visitedCount !== input.nodes.length) {
    throw new Error("workflow_graph_cycle_detected")
  }

  return {
    nodeMap,
    parentMap,
    childMap,
    inDegree,
  }
}

export function buildExecutableWorkflowPlan(input: {
  nodes: WorkflowDefinitionNode[]
  edges: WorkflowDefinitionEdge[]
}): ExecutableWorkflowPlan {
  const validation = validateWorkflowGraph(input)
  const levels = new Map<string, number>()
  const queue = [...validation.inDegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([nodeKey]) => nodeKey)
  const remainingInDegree = new Map(validation.inDegree)

  for (const nodeKey of queue) {
    levels.set(nodeKey, 0)
  }

  while (queue.length > 0) {
    const nodeKey = queue.shift()!
    const level = levels.get(nodeKey) ?? 0

    for (const childNodeKey of validation.childMap.get(nodeKey) ?? []) {
      const nextLevel = Math.max(levels.get(childNodeKey) ?? 0, level + 1)
      levels.set(childNodeKey, nextLevel)

      const degree = (remainingInDegree.get(childNodeKey) ?? 0) - 1
      remainingInDegree.set(childNodeKey, degree)
      if (degree === 0) {
        queue.push(childNodeKey)
      }
    }
  }

  const parallelLevels = [...unique([...levels.values()].sort((left, right) => left - right).map(String))]
    .map((value) => Number(value))
    .map((level) =>
      [...levels.entries()]
        .filter(([, candidateLevel]) => candidateLevel === level)
        .map(([nodeKey]) => nodeKey),
    )

  return {
    ...validation,
    parallelLevels,
  }
}

function collectUpstreamInputs(
  nodeKey: string,
  parentMap: Map<string, string[]>,
  edges: WorkflowDefinitionEdge[],
  nodeStates: Record<string, WorkflowNodeRunState>,
) {
  const bundle = createWorkflowNodeInputBundle()
  for (const parentNodeKey of parentMap.get(nodeKey) ?? []) {
    const parentState = nodeStates[parentNodeKey]
    if (!parentState || parentState.status !== "succeeded") continue

    const edgeKinds = new Set(
      edges
        .filter((edge) => edge.sourceNodeKey === parentNodeKey && edge.targetNodeKey === nodeKey)
        .map((edge) => inputNameToValueKind(edge.inputName))
        .filter((kind): kind is NonNullable<ReturnType<typeof inputNameToValueKind>> => Boolean(kind)),
    )

    if (edgeKinds.size === 0) {
      Object.assign(bundle, mergeWorkflowNodeOutputBundles(bundle, parentState.output))
      continue
    }

    const scopedOutput: WorkflowNodeOutputBundle = {}
    for (const edgeKind of edgeKinds) {
      Object.assign(
        scopedOutput,
        mergeWorkflowNodeOutputBundles(
          createWorkflowNodeInputBundle(),
          projectParentOutputToInputKind(parentState, edgeKind, nodeKey),
        ),
      )
    }

    Object.assign(bundle, mergeWorkflowNodeOutputBundles(bundle, scopedOutput))
  }
  return bundle
}

function buildInitialNodeStates(input: {
  nodes: WorkflowDefinitionNode[]
  initialState?: Record<string, WorkflowNodeRunState>
  rerunNodeKeys?: string[]
}) {
  const rerunNodeKeys = new Set(input.rerunNodeKeys ?? [])
  const states: Record<string, WorkflowNodeRunState> = {}

  for (const node of input.nodes) {
    const existing = input.initialState?.[node.nodeKey]
    if (existing && !rerunNodeKeys.has(node.nodeKey)) {
      states[node.nodeKey] = {
        ...existing,
        output: { ...existing.output },
      }
      continue
    }

    states[node.nodeKey] = {
      nodeKey: node.nodeKey,
      status: "queued",
      attemptCount: existing ? existing.attemptCount : 0,
      output: {},
      startedAt: null,
      finishedAt: null,
      providerId: null,
      modelId: null,
      taskRunId: null,
      creditsConsumed: 0,
      errorMessage: null,
      metadata: null,
    }
  }

  return states
}

export async function runWorkflowDefinition(input: WorkflowRunDefinitionInput): Promise<WorkflowRunResult> {
  const plan = buildExecutableWorkflowPlan({
    nodes: input.nodes,
    edges: input.edges,
  })
  const nodeStates = buildInitialNodeStates({
    nodes: input.nodes,
    initialState: input.initialState,
    rerunNodeKeys: input.rerunNodeKeys,
  })
  const blockedNodes = new Set<string>()

  while (true) {
    const runnableNodes = input.nodes.filter((node) => {
      const state = nodeStates[node.nodeKey]
      if (!state || state.status !== "queued") return false
      const parents = plan.parentMap.get(node.nodeKey) ?? []
      return parents.every((parentNodeKey) => nodeStates[parentNodeKey]?.status === "succeeded")
    })

    if (runnableNodes.length === 0) {
      for (const node of input.nodes) {
        const state = nodeStates[node.nodeKey]
        if (!state || state.status !== "queued") continue

        const parents = plan.parentMap.get(node.nodeKey) ?? []
        if (parents.some((parentNodeKey) => nodeStates[parentNodeKey]?.status === "failed")) {
          state.status = "cancelled"
          state.finishedAt = new Date()
          state.errorMessage = "workflow_upstream_failed"
          await input.onNodeStateChange?.({ ...state, output: { ...state.output } })
          blockedNodes.add(node.nodeKey)
        }
      }

      const remainingQueued = Object.values(nodeStates).some((state) => state.status === "queued")
      if (!remainingQueued) break
      throw new Error("workflow_execution_stalled")
    }

    const settled = await Promise.allSettled(
      runnableNodes.map(async (node) => {
        const state = nodeStates[node.nodeKey]
        state.status = "running"
        state.startedAt = new Date()
        state.attemptCount += 1
        await input.onNodeStateChange?.({ ...state, output: { ...state.output } })

        const executor = resolveWorkflowNodeExecutor(node.type)
        const result = await executor.execute({
          enterpriseId: input.enterpriseId,
          ownerUserId: input.ownerUserId,
          node,
          input: collectUpstreamInputs(node.nodeKey, plan.parentMap, input.edges, nodeStates),
          ...input.executorContext,
        })

        return { node, result }
      }),
    )

    for (let index = 0; index < settled.length; index += 1) {
      const node = runnableNodes[index]
      const state = nodeStates[node.nodeKey]
      const outcome = settled[index]
      state.finishedAt = new Date()

      if (outcome?.status === "fulfilled") {
        const result = outcome.value.result
        state.status = "succeeded"
        state.output = result.output
        state.providerId = result.providerId ?? null
        state.modelId = result.modelId ?? null
        state.taskRunId = result.taskRunId ?? null
        state.creditsConsumed = result.creditsConsumed ?? 0
        state.errorMessage = null
        state.metadata = result.metadata ?? null
      } else {
        state.status = "failed"
        state.errorMessage = toErrorMessage(outcome?.reason)
        state.output = {}
      }

      await input.onNodeStateChange?.({ ...state, output: { ...state.output } })
    }
  }

  const finalNodeKeys = input.nodes
    .filter((node) => (plan.childMap.get(node.nodeKey) ?? []).length === 0)
    .map((node) => node.nodeKey)
  const hasFailure = Object.values(nodeStates).some((state) => state.status === "failed" || state.status === "cancelled")

  return {
    status: hasFailure ? "failed" : "succeeded",
    parallelLevels: plan.parallelLevels,
    nodeStates,
    finalNodeKeys,
  }
}

function collectBranchNodeKeys(nodeKey: string, childMap: Map<string, string[]>) {
  const collected = new Set<string>([nodeKey])
  const queue = [nodeKey]

  while (queue.length > 0) {
    const next = queue.shift()!
    for (const childNodeKey of childMap.get(next) ?? []) {
      if (collected.has(childNodeKey)) continue
      collected.add(childNodeKey)
      queue.push(childNodeKey)
    }
  }

  return [...collected]
}

export function collectWorkflowBranchNodeKeys(input: {
  nodeKey: string
  nodes: WorkflowDefinitionNode[]
  edges: WorkflowDefinitionEdge[]
}) {
  const plan = buildExecutableWorkflowPlan({
    nodes: input.nodes,
    edges: input.edges,
  })

  return collectBranchNodeKeys(input.nodeKey, plan.childMap)
}

export async function retryWorkflowNodeExecution(input: WorkflowRunDefinitionInput & {
  nodeStates: Record<string, WorkflowNodeRunState>
  mode: "node" | "branch"
  nodeKey: string
}) {
  const rerunNodeKeys =
    input.mode === "branch"
      ? collectWorkflowBranchNodeKeys({
          nodeKey: input.nodeKey,
          nodes: input.nodes,
          edges: input.edges,
        })
      : [input.nodeKey]

  return runWorkflowDefinition({
    enterpriseId: input.enterpriseId,
    ownerUserId: input.ownerUserId,
    nodes: input.nodes,
    edges: input.edges,
    executorContext: input.executorContext,
    initialState: input.nodeStates,
    rerunNodeKeys,
    onNodeStateChange: input.onNodeStateChange,
  })
}
