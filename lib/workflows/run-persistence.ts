import {
  createPlatformWorkItem,
  deletePlatformArtifactPermanently,
  listPlatformWorkLibraryItemsForEnterprise,
  savePlatformArtifact,
  type PlatformWorkLibraryItemRecord,
} from "@/lib/platform/task-run-store"
import type { WorkflowNodeRunState } from "@/lib/workflows/execution"
import type { WorkflowDefinitionEdge, WorkflowDefinitionNode } from "@/lib/workflows/schema"
import { updateWorkflowNodeExecution } from "@/lib/workflows/store"

function mapOutputKindToWorkType(kind: "text" | "asset" | "image" | "video" | "audio" | "ppt") {
  if (kind === "image") return "image_set" as const
  if (kind === "video") return "video" as const
  if (kind === "audio") return "audio" as const
  if (kind === "ppt") return "deck" as const
  if (kind === "text") return "article" as const
  return "document" as const
}

function normalizeCollectionItem(item: unknown) {
  if (!item || typeof item !== "object") return null
  const record = item as Record<string, unknown>

  return {
    artifactId: typeof record.artifactId === "number" ? record.artifactId : undefined,
    storageKey: typeof record.storageKey === "string" ? record.storageKey : undefined,
    mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
    url: typeof record.url === "string" ? record.url : null,
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
    source: "generated" as const,
    ...payload,
  }
}

export type WorkflowPersistenceTarget = {
  sourceNodeKey: string
  targetNodeKey: string
}

function normalizeWorkflowStoredTitle(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
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

function buildWorkflowStoredTitleState(items: PlatformWorkLibraryItemRecord[]) {
  const reservedTitleKeys = new Set<string>()
  const artifactIdsByTitleKey = new Map<string, number[]>()

  for (const item of items) {
    const rawTitle = item.workItem.title || item.artifact.title
    const normalizedTitle = normalizeWorkflowStoredTitle(rawTitle)
    if (!normalizedTitle) continue
    const key = toWorkflowStoredTitleKey(normalizedTitle)
    reservedTitleKeys.add(key)
    artifactIdsByTitleKey.set(key, [
      ...(artifactIdsByTitleKey.get(key) ?? []),
      item.artifact.id,
    ])
  }

  return {
    reservedTitleKeys,
    artifactIdsByTitleKey,
  }
}

export async function persistFinalWorkflowOutputs(input: {
  runId: number
  workflowTitle: string
  enterpriseId: number
  ownerUserId: number
  nodeStates: Record<string, WorkflowNodeRunState>
  workflowNodes: WorkflowDefinitionNode[]
  persistenceTargets: WorkflowPersistenceTarget[]
}) {
  const createdArtifacts: number[] = []
  const createdWorkItems: number[] = []
  const workflowNodeByKey = new Map(input.workflowNodes.map((node) => [node.nodeKey, node] as const))

  let workLibraryTitleState = buildWorkflowStoredTitleState(
    await listPlatformWorkLibraryItemsForEnterprise(input.enterpriseId),
  )

  const reloadWorkLibraryTitleState = async () => {
    workLibraryTitleState = buildWorkflowStoredTitleState(
      await listPlatformWorkLibraryItemsForEnterprise(input.enterpriseId),
    )
  }

  const overwriteWorkLibraryTitleIfNeeded = async (title: string) => {
    const key = toWorkflowStoredTitleKey(title)
    const matchedArtifactIds = [...new Set(workLibraryTitleState.artifactIdsByTitleKey.get(key) ?? [])]
    if (matchedArtifactIds.length === 0) return

    for (const artifactId of matchedArtifactIds) {
      await deletePlatformArtifactPermanently(artifactId, input.enterpriseId)
    }

    await reloadWorkLibraryTitleState()
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

    return ensureUniqueWorkflowStoredTitle(inputTitle.fallbackTitle, workLibraryTitleState.reservedTitleKeys)
  }

  const reserveStoredTitle = (title: string) => {
    workLibraryTitleState.reservedTitleKeys.add(toWorkflowStoredTitleKey(title))
  }

  for (const target of input.persistenceTargets) {
    const state = input.nodeStates[target.sourceNodeKey]
    const storeNode = workflowNodeByKey.get(target.targetNodeKey)
    const configuredStoredTitle = normalizeWorkflowStoredTitle(storeNode?.config.storedFileName)
    if (!state || state.status !== "succeeded") continue

    const textOutputs = state.output.text ?? []
    for (const [index, value] of textOutputs.entries()) {
      const title = resolveStoredOutputTitle({
        configuredTitle: configuredStoredTitle,
        fallbackTitle: `${input.workflowTitle} text output ${index + 1}`,
        outputIndex: index,
      })

      if (configuredStoredTitle) {
        await overwriteWorkLibraryTitleIfNeeded(title)
      }

      const artifact = await savePlatformArtifact({
        runId: input.runId,
        enterpriseId: input.enterpriseId,
        ownerUserId: input.ownerUserId,
        kind: "text",
        title,
        mimeType: "text/plain",
        source: "generated",
        payload: buildWorkflowGeneratedArtifactPayload({
          text: value,
          workflowNodeKey: target.sourceNodeKey,
          workflowStoreNodeKey: target.targetNodeKey,
        }),
      })
      createdArtifacts.push(artifact.id)
      reserveStoredTitle(title)

      const workItem = await createPlatformWorkItem({
        enterpriseId: input.enterpriseId,
        ownerUserId: input.ownerUserId,
        sourceArtifactId: artifact.id,
        type: mapOutputKindToWorkType("text"),
        title: artifact.title,
        metadata: {
          source: "generated",
          mimeType: "text/plain",
          workflowRunId: input.runId,
          workflowNodeKey: target.sourceNodeKey,
          workflowStoreNodeKey: target.targetNodeKey,
        },
      })
      createdWorkItems.push(workItem.id)
    }

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
          await overwriteWorkLibraryTitleIfNeeded(title)
        }

        const artifact = await savePlatformArtifact({
          runId: input.runId,
          enterpriseId: input.enterpriseId,
          ownerUserId: input.ownerUserId,
          kind: item.url ? "link" : "json",
          title,
          mimeType: item.mimeType || "application/octet-stream",
          externalUrl: item.url || null,
          storageKey: item.storageKey || null,
          source: "generated",
          payload: buildWorkflowGeneratedArtifactPayload({
            artifactId: item.artifactId ?? null,
            workflowNodeKey: target.sourceNodeKey,
            workflowStoreNodeKey: target.targetNodeKey,
            outputKind: kind,
          }),
        })
        createdArtifacts.push(artifact.id)
        reserveStoredTitle(title)

        const workItem = await createPlatformWorkItem({
          enterpriseId: input.enterpriseId,
          ownerUserId: input.ownerUserId,
          sourceArtifactId: artifact.id,
          type: mapOutputKindToWorkType(kind),
          title: artifact.title,
          metadata: {
            source: "generated",
            mimeType: item.mimeType || "application/octet-stream",
            workflowRunId: input.runId,
            workflowNodeKey: target.sourceNodeKey,
            workflowStoreNodeKey: target.targetNodeKey,
            outputKind: kind,
          },
        })
        createdWorkItems.push(workItem.id)
      }
    }
  }

  return {
    artifactIds: createdArtifacts,
    workItemIds: createdWorkItems,
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
  previous?: Record<string, unknown> | null
  retry?: {
    mode: "node" | "branch"
    nodeKey: string
  } | null
}) {
  const previous = input.previous ?? null
  const artifactIds = [...new Set([...toNumberList(previous?.persistedArtifactIds), ...input.persistedArtifactIds])]
  const workItemIds = [...new Set([...toNumberList(previous?.persistedWorkItemIds), ...input.persistedWorkItemIds])]

  return {
    workflowId: input.workflowId,
    finalNodeKeys: input.finalNodeKeys,
    workflowStatus: input.workflowStatus,
    persistedArtifactIds: artifactIds,
    persistedWorkItemIds: workItemIds,
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
