import {
  deletePlatformArtifactPermanently,
  enqueuePlatformKnowledgeSaveJob,
  listPlatformArtifactsForEnterprise,
  promotePlatformArtifactToWorkItem,
  savePlatformArtifact,
  type PlatformTaskRunStore,
  type PlatformArtifactRecord,
} from "@/lib/platform/task-run-store"
import { inferWorkItemTypeFromArtifact } from "@/lib/platform/artifact-actions"
import type { WorkflowNodeRunState } from "@/lib/workflows/execution"
import type { WorkflowDefinitionEdge, WorkflowDefinitionNode } from "@/lib/workflows/schema"
import { updateWorkflowNodeExecution } from "@/lib/workflows/store"

function normalizeCollectionItem(item: unknown) {
  if (!item || typeof item !== "object") return null
  const record = item as Record<string, unknown>

  return {
    artifactId: typeof record.artifactId === "number" ? record.artifactId : undefined,
    storageKey: typeof record.storageKey === "string" ? record.storageKey : undefined,
    mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
    url: typeof record.url === "string" ? record.url : null,
    embeddedContentBase64:
      typeof record.embeddedContentBase64 === "string" && record.embeddedContentBase64.trim()
        ? record.embeddedContentBase64.trim()
        : null,
    inlinePreviewText:
      typeof record.inlinePreviewText === "string" && record.inlinePreviewText.trim()
        ? record.inlinePreviewText
        : null,
    title:
      typeof record.title === "string"
        ? record.title
        : typeof record.fileName === "string"
          ? record.fileName
          : null,
  }
}

function buildWorkflowGeneratedArtifactPayload(payload: Record<string, unknown>) {
  return {
    source: "workflow" as const,
    ...payload,
  }
}

type WorkflowPersistenceStore = Pick<
  PlatformTaskRunStore,
  | "savePlatformArtifact"
  | "promotePlatformArtifactToWorkItem"
  | "enqueuePlatformKnowledgeSaveJob"
  | "listPlatformArtifactsForEnterprise"
  | "deletePlatformArtifactPermanently"
>

export type WorkflowPersistenceTarget = {
  sourceNodeKey: string
  targetNodeKey: string
}

function normalizeWorkflowStoredTitle(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

function normalizeWorkflowKnowledgeSaveTargetType(value: unknown, datasetScope: "enterprise" | "personal") {
  if (typeof value === "string" && value.trim()) {
    return value.trim()
  }

  return datasetScope === "personal" ? "personal_knowledge_base" : "knowledge_base"
}

function readWorkflowKnowledgeWriteMetadata(
  state: WorkflowNodeRunState | undefined,
  node: WorkflowDefinitionNode | undefined,
) {
  if (!state || state.status !== "succeeded" || state.metadata?.persistenceTarget !== "knowledge_write") {
    return null
  }

  const title =
    normalizeWorkflowStoredTitle(state.metadata.knowledgeDocumentTitle) ??
    normalizeWorkflowStoredTitle(node?.title) ??
    `${node?.nodeKey ?? state.nodeKey}-knowledge`
  const content = typeof state.metadata.knowledgeDraftContent === "string" ? state.metadata.knowledgeDraftContent.trim() : ""
  if (!content) return null

  const rawDatasetId = state.metadata.datasetId
  const datasetId =
    typeof rawDatasetId === "number" && Number.isInteger(rawDatasetId) && rawDatasetId > 0
      ? rawDatasetId
      : typeof rawDatasetId === "string" && rawDatasetId.trim()
        ? Number(rawDatasetId)
        : NaN
  if (!Number.isInteger(datasetId) || datasetId <= 0) return null

  const datasetScope = state.metadata.datasetScope === "personal" ? "personal" : "enterprise"
  const knowledgeCategory =
    typeof state.metadata.knowledgeCategory === "string" && state.metadata.knowledgeCategory.trim()
      ? state.metadata.knowledgeCategory.trim()
      : "general"

  return {
    title,
    content,
    datasetId,
    datasetScope,
    knowledgeCategory,
    targetType: normalizeWorkflowKnowledgeSaveTargetType(state.metadata.targetType, datasetScope),
  }
}

function toWorkflowStoredTitleKey(title: string) {
  return title.trim().toLocaleLowerCase()
}

function splitWorkflowStoredTitle(title: string) {
  const trimmed = title.trim()
  const extensionMatch = trimmed.match(/^(.*?)(\.[a-z0-9]{1,10})$/i)
  if (!extensionMatch) {
    return {
      base: trimmed,
      extension: "",
    }
  }

  return {
    base: extensionMatch[1]?.trim() || trimmed,
    extension: extensionMatch[2] || "",
  }
}

export function appendWorkflowStoredTitleOrdinal(title: string, ordinal: number) {
  const trimmed = title.trim() || "workflow-output"
  if (!Number.isInteger(ordinal) || ordinal <= 1) return trimmed
  const { base, extension } = splitWorkflowStoredTitle(trimmed)
  return `${base} ${ordinal}${extension}`
}

export function ensureUniqueWorkflowStoredTitle(title: string, reservedTitleKeys: Set<string>) {
  const trimmed = title.trim() || "workflow-output"
  if (!reservedTitleKeys.has(toWorkflowStoredTitleKey(trimmed))) {
    return trimmed
  }

  for (let ordinal = 2; ordinal < 10_000; ordinal += 1) {
    const candidate = appendWorkflowStoredTitleOrdinal(trimmed, ordinal)
    if (!reservedTitleKeys.has(toWorkflowStoredTitleKey(candidate))) {
      return candidate
    }
  }

  return `${trimmed}-${Date.now()}`
}

function buildWorkflowStoredTitleState(items: PlatformArtifactRecord[]) {
  const reservedTitleKeys = new Set<string>()
  const artifactIdsByTitleKey = new Map<string, number[]>()

  for (const item of items) {
    const rawTitle = item.title
    const normalizedTitle = normalizeWorkflowStoredTitle(rawTitle)
    if (!normalizedTitle) continue
    const key = toWorkflowStoredTitleKey(normalizedTitle)
    reservedTitleKeys.add(key)
    artifactIdsByTitleKey.set(key, [
      ...(artifactIdsByTitleKey.get(key) ?? []),
      item.id,
    ])
  }

  return {
    reservedTitleKeys,
    artifactIdsByTitleKey,
  }
}

export async function persistFinalWorkflowOutputs(input: {
  runId: number
  workflowId: number
  workflowSlug: string
  workflowTitle: string
  workflowUpdatedAt?: Date | null
  enterpriseId: number
  ownerUserId: number
  nodeStates: Record<string, WorkflowNodeRunState>
  workflowNodes: WorkflowDefinitionNode[]
  persistenceTargets: WorkflowPersistenceTarget[]
  store?: WorkflowPersistenceStore
}) {
  const createdArtifacts: number[] = []
  const createdWorkItems: number[] = []
  const createdKnowledgeSaveJobs: number[] = []
  const workflowNodeByKey = new Map(input.workflowNodes.map((node) => [node.nodeKey, node] as const))
  const store = input.store ?? {
    savePlatformArtifact,
    promotePlatformArtifactToWorkItem,
    enqueuePlatformKnowledgeSaveJob,
    listPlatformArtifactsForEnterprise,
    deletePlatformArtifactPermanently,
  }

  let assetLibraryTitleState = buildWorkflowStoredTitleState(
    await store.listPlatformArtifactsForEnterprise(input.enterpriseId),
  )

  const reloadAssetLibraryTitleState = async () => {
    assetLibraryTitleState = buildWorkflowStoredTitleState(
      await store.listPlatformArtifactsForEnterprise(input.enterpriseId),
    )
  }

  const overwriteAssetLibraryTitleIfNeeded = async (title: string) => {
    const key = toWorkflowStoredTitleKey(title)
    const matchedArtifactIds = [...new Set(assetLibraryTitleState.artifactIdsByTitleKey.get(key) ?? [])]
    if (matchedArtifactIds.length === 0) return

    for (const artifactId of matchedArtifactIds) {
      await store.deletePlatformArtifactPermanently(artifactId, input.enterpriseId)
    }

    await reloadAssetLibraryTitleState()
  }

  const resolveStoredOutputTitle = (inputTitle: {
    configuredTitle: string | null
    fallbackTitle: string
    outputIndex: number
  }) => {
    const configuredCandidate = inputTitle.configuredTitle
      ? appendWorkflowStoredTitleOrdinal(inputTitle.configuredTitle, inputTitle.outputIndex + 1)
      : null

    if (configuredCandidate) {
      return configuredCandidate
    }

    return ensureUniqueWorkflowStoredTitle(inputTitle.fallbackTitle, assetLibraryTitleState.reservedTitleKeys)
  }

  const reserveStoredTitle = (title: string) => {
    assetLibraryTitleState.reservedTitleKeys.add(toWorkflowStoredTitleKey(title))
  }

  const shouldPersistToWorkLibrary = (storeNode: WorkflowDefinitionNode | undefined) =>
    Boolean(storeNode?.config.persistToWorkLibrary)

  const shouldPersistToKnowledgeBase = (storeNode: WorkflowDefinitionNode | undefined) =>
    Boolean(storeNode?.config.persistToKnowledgeBase)

  const knowledgeTargetTypeForStoreNode = (storeNode: WorkflowDefinitionNode | undefined) => {
    const configured = storeNode?.config.knowledgeTargetType
    return typeof configured === "string" && configured.trim() ? configured.trim() : "knowledge_base"
  }

  const workflowVersionAt = input.workflowUpdatedAt instanceof Date ? input.workflowUpdatedAt.toISOString() : null

  const persistArtifactSideEffects = async (params: {
    artifact: PlatformArtifactRecord
    title: string
    outputKind: "text" | "asset" | "image" | "video" | "audio" | "ppt"
    sourceNodeKey: string
    targetNodeKey: string
    storeNode: WorkflowDefinitionNode | undefined
  }) => {
    if (shouldPersistToWorkLibrary(params.storeNode)) {
      const workItem = await store.promotePlatformArtifactToWorkItem({
        enterpriseId: input.enterpriseId,
        ownerUserId: input.ownerUserId,
        sourceArtifactId: params.artifact.id,
        type: inferWorkItemTypeFromArtifact(params.artifact),
        title: params.title,
        summary: `${input.workflowTitle} / ${params.outputKind}`,
        metadata: {
          source: "workflow",
          workflowId: input.workflowId,
          workflowSlug: input.workflowSlug,
          workflowTitle: input.workflowTitle,
          workflowRunId: input.runId,
          workflowVersionAt,
          sourceNodeKey: params.sourceNodeKey,
          workflowStoreNodeKey: params.targetNodeKey,
          outputKind: params.outputKind,
          persistedFrom: "product_store",
        },
      })
      createdWorkItems.push(workItem.id)
    }

    if (shouldPersistToKnowledgeBase(params.storeNode)) {
      const job = await store.enqueuePlatformKnowledgeSaveJob({
        artifactId: params.artifact.id,
        enterpriseId: input.enterpriseId,
        ownerUserId: input.ownerUserId,
        targetType: knowledgeTargetTypeForStoreNode(params.storeNode),
        requestPayload: {
          source: "workflow",
          workflowId: input.workflowId,
          workflowSlug: input.workflowSlug,
          workflowTitle: input.workflowTitle,
          workflowRunId: input.runId,
          workflowVersionAt,
          artifactTitle: params.title,
          sourceNodeKey: params.sourceNodeKey,
          workflowStoreNodeKey: params.targetNodeKey,
          outputKind: params.outputKind,
          persistedFrom: "product_store",
        },
      })
      createdKnowledgeSaveJobs.push(job.id)
    }
  }

  for (const target of input.persistenceTargets) {
    const state = input.nodeStates[target.sourceNodeKey]
    const storeNode = workflowNodeByKey.get(target.targetNodeKey)
    const configuredStoredTitle = normalizeWorkflowStoredTitle(storeNode?.config.storedFileName)
    if (!state || state.status !== "succeeded") continue

    const collections: Array<["asset" | "image" | "video" | "audio" | "ppt", unknown[]]> = [
      ["asset", state.output.asset ?? []],
      ["image", state.output.image ?? []],
      ["video", state.output.video ?? []],
      ["audio", state.output.audio ?? []],
      ["ppt", state.output.ppt ?? []],
    ]

    for (const [kind, items] of collections) {
      for (const [index, rawItem] of items.entries()) {
        const item = normalizeCollectionItem(rawItem)
        if (!item) continue
        const title = resolveStoredOutputTitle({
          configuredTitle: configuredStoredTitle,
          fallbackTitle: item.title || `${input.workflowTitle} ${kind} output ${index + 1}`,
          outputIndex: index,
        })

        if (configuredStoredTitle) {
          await overwriteAssetLibraryTitleIfNeeded(title)
        }

        const artifact = await store.savePlatformArtifact({
          runId: input.runId,
          enterpriseId: input.enterpriseId,
          ownerUserId: input.ownerUserId,
          kind: item.storageKey || item.embeddedContentBase64 ? "file" : item.url ? "link" : "json",
          title,
          mimeType: item.mimeType || "application/octet-stream",
          externalUrl: item.url || null,
          storageKey: item.storageKey || null,
          source: "workflow",
          payload: buildWorkflowGeneratedArtifactPayload({
            workflowId: input.workflowId,
            workflowSlug: input.workflowSlug,
            workflowTitle: input.workflowTitle,
            workflowRunId: input.runId,
            workflowVersionAt,
            artifactId: item.artifactId ?? null,
            embeddedContentBase64: item.embeddedContentBase64,
            text: item.inlinePreviewText,
            workflowNodeKey: target.sourceNodeKey,
            workflowStoreNodeKey: target.targetNodeKey,
            outputKind: kind,
          }),
        })
        createdArtifacts.push(artifact.id)
        await persistArtifactSideEffects({
          artifact,
          title,
          outputKind: kind,
          sourceNodeKey: target.sourceNodeKey,
          targetNodeKey: target.targetNodeKey,
          storeNode,
        })
        reserveStoredTitle(title)
      }
    }
  }

  for (const node of input.workflowNodes) {
    if (node.type !== "knowledge_write") continue

    const state = input.nodeStates[node.nodeKey]
    const knowledgeWrite = readWorkflowKnowledgeWriteMetadata(state, node)
    if (!knowledgeWrite) continue

    const title = ensureUniqueWorkflowStoredTitle(knowledgeWrite.title, assetLibraryTitleState.reservedTitleKeys)
    const artifact = await store.savePlatformArtifact({
      runId: input.runId,
      enterpriseId: input.enterpriseId,
      ownerUserId: input.ownerUserId,
      kind: "text",
      title,
      mimeType: "text/markdown",
      source: "workflow",
      payload: buildWorkflowGeneratedArtifactPayload({
        workflowId: input.workflowId,
        workflowSlug: input.workflowSlug,
        workflowTitle: input.workflowTitle,
        workflowRunId: input.runId,
        workflowVersionAt,
        text: knowledgeWrite.content,
        workflowNodeKey: node.nodeKey,
        outputKind: "knowledge_write",
        datasetId: knowledgeWrite.datasetId,
        datasetScope: knowledgeWrite.datasetScope,
        knowledgeCategory: knowledgeWrite.knowledgeCategory,
        requiresManualConfirmation: true,
        persistedFrom: "knowledge_write",
      }),
    })
    createdArtifacts.push(artifact.id)
    reserveStoredTitle(title)

    const job = await store.enqueuePlatformKnowledgeSaveJob({
      artifactId: artifact.id,
      enterpriseId: input.enterpriseId,
      ownerUserId: input.ownerUserId,
      targetType: knowledgeWrite.targetType,
      requestPayload: {
        source: "workflow",
        workflowId: input.workflowId,
        workflowSlug: input.workflowSlug,
        workflowTitle: input.workflowTitle,
        workflowRunId: input.runId,
        workflowVersionAt,
        artifactTitle: title,
        sourceNodeKey: node.nodeKey,
        workflowNodeType: node.type,
        datasetId: knowledgeWrite.datasetId,
        datasetScope: knowledgeWrite.datasetScope,
        knowledgeCategory: knowledgeWrite.knowledgeCategory,
        manualConfirmationRequired: true,
        persistedFrom: "knowledge_write",
      },
    })
    createdKnowledgeSaveJobs.push(job.id)
  }

  return {
    artifactIds: createdArtifacts,
    workItemIds: createdWorkItems,
    knowledgeSaveJobIds: createdKnowledgeSaveJobs,
  }
}

export function collectWorkflowPersistedSourceNodeKeys(input: {
  nodes: WorkflowDefinitionNode[]
  edges: WorkflowDefinitionEdge[]
}) {
  return [...new Set(collectWorkflowPersistenceTargets(input).map((target) => target.sourceNodeKey))]
}

export function collectWorkflowPersistenceTargets(input: {
  nodes: WorkflowDefinitionNode[]
  edges: WorkflowDefinitionEdge[]
}) {
  const productStoreNodeKeys = new Set(
    input.nodes.filter((node) => node.type === "product_store").map((node) => node.nodeKey),
  )

  const targets: WorkflowPersistenceTarget[] = []
  const seen = new Set<string>()

  for (const edge of input.edges) {
    if (!productStoreNodeKeys.has(edge.targetNodeKey)) continue
    const key = `${edge.sourceNodeKey}::${edge.targetNodeKey}`
    if (seen.has(key)) continue
    seen.add(key)
    targets.push({
      sourceNodeKey: edge.sourceNodeKey,
      targetNodeKey: edge.targetNodeKey,
    })
  }

  return targets
}

export async function syncWorkflowNodeExecutions(
  runId: number,
  nodeStates: Record<string, WorkflowNodeRunState>,
) {
  await Promise.all(
    Object.values(nodeStates).map((state) =>
      updateWorkflowNodeExecution({
        runId,
        nodeKey: state.nodeKey,
        status: state.status,
        providerId: state.providerId ?? null,
        modelId: state.modelId ?? null,
        taskRunId: state.taskRunId ?? null,
        outputPayload: state.output as Record<string, unknown>,
        creditsConsumed: state.creditsConsumed,
        startedAt: state.startedAt,
        finishedAt: state.finishedAt,
      }),
    ),
  )
}

function buildPreviewPatchForNodeState(state: WorkflowNodeRunState) {
  if (state.status !== "succeeded") return null

  const firstImage = state.output.image?.[0]
  if (firstImage?.url) {
    return {
      previewImageUrl: firstImage.url,
      previewImageTitle: firstImage.title || null,
      previewUpdatedAt: new Date().toISOString(),
    }
  }

  const firstVideo = state.output.video?.[0]
  if (firstVideo?.url) {
    return {
      previewVideoUrl: firstVideo.url,
      previewVideoTitle: firstVideo.title || null,
      previewUpdatedAt: new Date().toISOString(),
    }
  }

  const firstAudio = state.output.audio?.[0]
  if (firstAudio?.url) {
    return {
      previewAudioUrl: firstAudio.url,
      previewAudioTitle: firstAudio.title || null,
      previewUpdatedAt: new Date().toISOString(),
    }
  }

  return null
}

export function applyWorkflowNodeResultPreviews(
  nodes: WorkflowDefinitionNode[],
  nodeStates: Record<string, WorkflowNodeRunState>,
) {
  return nodes.map((node) => {
    const state = nodeStates[node.nodeKey]
    const previewPatch = state ? buildPreviewPatchForNodeState(state) : null
    if (!previewPatch) return node

    return {
      ...node,
      config: {
        ...node.config,
        ...previewPatch,
      },
    }
  })
}

function toNumberList(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is number => Number.isInteger(item) && item > 0)
}

export function buildWorkflowRunNormalizedResult(input: {
  workflowId: number
  finalNodeKeys: string[]
  workflowStatus: "succeeded" | "failed"
  persistedArtifactIds: number[]
  persistedWorkItemIds: number[]
  persistedKnowledgeSaveJobIds?: number[]
  previous?: Record<string, unknown> | null
  retry?: {
    mode: "node" | "branch"
    nodeKey: string
  } | null
}) {
  const previous = input.previous ?? null
  const artifactIds = [...new Set([...toNumberList(previous?.persistedArtifactIds), ...input.persistedArtifactIds])]
  const workItemIds = [...new Set([...toNumberList(previous?.persistedWorkItemIds), ...input.persistedWorkItemIds])]
  const knowledgeSaveJobIds = [
    ...new Set([
      ...toNumberList(previous?.persistedKnowledgeSaveJobIds),
      ...toNumberList(input.persistedKnowledgeSaveJobIds),
    ]),
  ]

  return {
    workflowId: input.workflowId,
    finalNodeKeys: input.finalNodeKeys,
    workflowStatus: input.workflowStatus,
    persistedArtifactIds: artifactIds,
    persistedWorkItemIds: workItemIds,
    persistedKnowledgeSaveJobIds: knowledgeSaveJobIds,
    lastRetry:
      input.retry
        ? {
            ...input.retry,
            at: new Date().toISOString(),
          }
        : previous && typeof previous.lastRetry === "object"
          ? previous.lastRetry
          : null,
  }
}
