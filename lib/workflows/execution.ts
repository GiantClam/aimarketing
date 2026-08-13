import {
  createWorkflowNodeInputBundle,
  mergeWorkflowNodeOutputBundles,
  type WorkflowNodeExecutionContext,
  type WorkflowMediaRef,
  type WorkflowNodeInputBundle,
  type WorkflowNodeOutputBundle,
} from "@/lib/workflows/node-executors"
import { runSaasWorkflowWithSharedCore } from "@/lib/workflows/shared-execution-adapter"
import {
  canWorkflowNodeConnectValueKind,
  getWorkflowNodeDefinition,
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
  seedInput?: Partial<WorkflowNodeInputBundle>
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

function inputNameToValueKind(inputName: string | null | undefined) {
  if (inputName === "text") return "text"
  if (inputName === "assets") return "asset"
  if (inputName === "image" || inputName === "images") return "image"
  if (inputName === "video" || inputName === "videos") return "video"
  if (inputName === "audio" || inputName === "audios") return "audio"
  if (inputName === "presentation" || inputName === "presentations" || inputName === "ppt") return "ppt"
  return null
}

function edgeValueKind(edge: WorkflowDefinitionEdge, targetNode?: WorkflowDefinitionNode) {
  const legacyKind = inputNameToValueKind(edge.inputName)
  if (legacyKind) return legacyKind
  if (!targetNode || !edge.targetPortId) return null
  return getWorkflowNodeDefinition(targetNode.type).inputs.find((port) => port.id === edge.targetPortId)?.valueKind ?? null
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

function withSourceNodeKey(media: WorkflowMediaRef, sourceNodeKey: string): WorkflowMediaRef {
  return {
    ...media,
    sourceNodeKey: media.sourceNodeKey ?? sourceNodeKey,
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
    if (parentState.output.image?.length) {
      return {
        image: parentState.output.image.map((item) => withSourceNodeKey(item, parentState.nodeKey)),
      }
    }
    if (!parentState.output.asset?.length) return {}
    const matched = parentState.output.asset.filter((asset) => inferWorkflowValueKindFromMimeType(asset.mimeType) === "image")
    if (matched.length !== parentState.output.asset.length) {
      throw new Error(`workflow_edge_asset_type_mismatch:${targetNodeKey}:image`)
    }
    return { image: matched.map((asset) => withSourceNodeKey(mapAssetToMediaRef(asset), parentState.nodeKey)) }
  }

  if (targetKind === "video") {
    if (parentState.output.video?.length) {
      return {
        video: parentState.output.video.map((item) => withSourceNodeKey(item, parentState.nodeKey)),
      }
    }
    if (!parentState.output.asset?.length) return {}
    const matched = parentState.output.asset.filter((asset) => inferWorkflowValueKindFromMimeType(asset.mimeType) === "video")
    if (matched.length !== parentState.output.asset.length) {
      throw new Error(`workflow_edge_asset_type_mismatch:${targetNodeKey}:video`)
    }
    return { video: matched.map((asset) => withSourceNodeKey(mapAssetToMediaRef(asset), parentState.nodeKey)) }
  }

  if (targetKind === "audio") {
    if (parentState.output.audio?.length) {
      return {
        audio: parentState.output.audio.map((item) => withSourceNodeKey(item, parentState.nodeKey)),
      }
    }
    if (!parentState.output.asset?.length) return {}
    const matched = parentState.output.asset.filter((asset) => inferWorkflowValueKindFromMimeType(asset.mimeType) === "audio")
    if (matched.length !== parentState.output.asset.length) {
      throw new Error(`workflow_edge_asset_type_mismatch:${targetNodeKey}:audio`)
    }
    return { audio: matched.map((asset) => withSourceNodeKey(mapAssetToMediaRef(asset), parentState.nodeKey)) }
  }

  if (parentState.output.ppt?.length) {
    return {
      ppt: parentState.output.ppt.map((item) => withSourceNodeKey(item, parentState.nodeKey)),
    }
  }
  if (!parentState.output.asset?.length) return {}
  const matched = parentState.output.asset.filter((asset) => inferWorkflowValueKindFromMimeType(asset.mimeType) === "ppt")
  if (matched.length !== parentState.output.asset.length) {
    throw new Error(`workflow_edge_asset_type_mismatch:${targetNodeKey}:ppt`)
  }
  return { ppt: matched.map((asset) => withSourceNodeKey(mapAssetToMediaRef(asset), parentState.nodeKey)) }
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
  seedInput?: Partial<WorkflowNodeInputBundle>,
  nodes?: WorkflowDefinitionNode[],
) {
  const bundle = createWorkflowNodeInputBundle()
  const parents = parentMap.get(nodeKey) ?? []
  if (parents.length === 0 && seedInput) {
    Object.assign(bundle, mergeWorkflowNodeOutputBundles(bundle, seedInput))
  }
  for (const parentNodeKey of parents) {
    const parentState = nodeStates[parentNodeKey]
    if (!parentState || parentState.status !== "succeeded") continue

    const targetNode = nodes?.find((node) => node.nodeKey === nodeKey)
    const edgeKinds = new Set(
      edges
        .filter((edge) => edge.sourceNodeKey === parentNodeKey && edge.targetNodeKey === nodeKey)
        .map((edge) => edgeValueKind(edge, targetNode))
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

/**
 * Resolve one node's upstream bundle using the same typed-port projection as
 * the legacy DAG runner.  Iteration orchestration uses this exported helper
 * to seed each isolated body execution without duplicating edge semantics.
 */
export function collectWorkflowNodeInput(input: {
  nodeKey: string
  parentMap: Map<string, string[]>
  edges: WorkflowDefinitionEdge[]
  nodeStates: Record<string, WorkflowNodeRunState>
  seedInput?: Partial<WorkflowNodeInputBundle>
  nodes?: WorkflowDefinitionNode[]
}) {
  return collectUpstreamInputs(input.nodeKey, input.parentMap, input.edges, input.nodeStates, input.seedInput, input.nodes)
}

export async function runWorkflowDefinition(input: WorkflowRunDefinitionInput): Promise<WorkflowRunResult> {
  const plan = buildExecutableWorkflowPlan({
    nodes: input.nodes,
    edges: input.edges,
  })
  const shared = await runSaasWorkflowWithSharedCore({
    enterpriseId: input.enterpriseId,
    ownerUserId: input.ownerUserId,
    nodes: input.nodes,
    edges: input.edges,
    seedInput: input.seedInput,
    executorContext: input.executorContext,
    initialNodeStates: input.initialState,
    rerunNodeKeys: input.rerunNodeKeys,
    onNodeStateChange: input.onNodeStateChange,
  })
  return {
    status: shared.status,
    parallelLevels: plan.parallelLevels,
    nodeStates: shared.nodeStates,
    finalNodeKeys: shared.finalNodeKeys,
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

export function collectWorkflowRetryNodeKeys(input: {
  mode: "node" | "branch"
  nodeKey: string
  nodes: WorkflowDefinitionNode[]
  edges: WorkflowDefinitionEdge[]
  nodeStates?: Record<string, Pick<WorkflowNodeRunState, "status"> | undefined>
}) {
  const plan = buildExecutableWorkflowPlan({
    nodes: input.nodes,
    edges: input.edges,
  })

  const rerunNodeKeys = new Set(
    input.mode === "branch"
      ? collectBranchNodeKeys(input.nodeKey, plan.childMap)
      : [input.nodeKey],
  )
  const queue = [...rerunNodeKeys]

  while (queue.length > 0) {
    const nextNodeKey = queue.shift()!
    for (const parentNodeKey of plan.parentMap.get(nextNodeKey) ?? []) {
      if (rerunNodeKeys.has(parentNodeKey)) continue
      const parentStatus = input.nodeStates?.[parentNodeKey]?.status
      if (parentStatus === "succeeded" || parentStatus === "failed" || parentStatus === "cancelled") continue
      rerunNodeKeys.add(parentNodeKey)
      queue.push(parentNodeKey)
    }
  }

  return [...rerunNodeKeys]
}

export async function retryWorkflowNodeExecution(input: WorkflowRunDefinitionInput & {
  nodeStates: Record<string, WorkflowNodeRunState>
  mode: "node" | "branch"
  nodeKey: string
}) {
  const rerunNodeKeys = collectWorkflowRetryNodeKeys({
    mode: input.mode,
    nodeKey: input.nodeKey,
    nodes: input.nodes,
    edges: input.edges,
    nodeStates: input.nodeStates,
  })

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
