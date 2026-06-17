import { createPlatformWorkItem, savePlatformArtifact } from "@/lib/platform/task-run-store"
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

export async function persistFinalWorkflowOutputs(input: {
  runId: number
  workflowTitle: string
  enterpriseId: number
  ownerUserId: number
  nodeStates: Record<string, WorkflowNodeRunState>
  persistedSourceNodeKeys: string[]
}) {
  const createdArtifacts: number[] = []
  const createdWorkItems: number[] = []

  for (const nodeKey of input.persistedSourceNodeKeys) {
    const state = input.nodeStates[nodeKey]
    if (!state || state.status !== "succeeded") continue

    const textOutputs = state.output.text ?? []
    for (const [index, value] of textOutputs.entries()) {
      const artifact = await savePlatformArtifact({
        runId: input.runId,
        enterpriseId: input.enterpriseId,
        ownerUserId: input.ownerUserId,
        kind: "text",
        title: `${input.workflowTitle} text output ${index + 1}`,
        mimeType: "text/plain",
        source: "generated",
        payload: buildWorkflowGeneratedArtifactPayload({
          text: value,
          workflowNodeKey: nodeKey,
        }),
      })
      createdArtifacts.push(artifact.id)

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
          workflowNodeKey: nodeKey,
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

        const artifact = await savePlatformArtifact({
          runId: input.runId,
          enterpriseId: input.enterpriseId,
          ownerUserId: input.ownerUserId,
          kind: item.url ? "link" : "json",
          title: item.title || `${input.workflowTitle} ${kind} output ${index + 1}`,
          mimeType: item.mimeType || "application/octet-stream",
          externalUrl: item.url || null,
          storageKey: item.storageKey || null,
          source: "generated",
          payload: buildWorkflowGeneratedArtifactPayload({
            artifactId: item.artifactId ?? null,
            workflowNodeKey: nodeKey,
            outputKind: kind,
          }),
        })
        createdArtifacts.push(artifact.id)

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
            workflowNodeKey: nodeKey,
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
  const productStoreNodeKeys = new Set(
    input.nodes.filter((node) => node.type === "product_store").map((node) => node.nodeKey),
  )

  return [
    ...new Set(
      input.edges
        .filter((edge) => productStoreNodeKeys.has(edge.targetNodeKey))
        .map((edge) => edge.sourceNodeKey),
    ),
  ]
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
