import { checkRateLimit } from "@/lib/server/rate-limit"
import { getInlineImageMetadata, urlToInlineImage } from "@/lib/image-assistant/assets"
import { generateOrEditImages, getImageAssistantAvailability, shouldUseImageAssistantFixtures } from "@/lib/image-assistant/aiberm"
import { hasImageAssistantGoogleKey, uploadImageAssistantReferenceToGoogle } from "@/lib/image-assistant/google"
import {
  createImageAssistantAsset,
  createImageAssistantMessage,
  createImageAssistantSession,
  createVersionWithCandidates,
  getImageAssistantSession,
  updateImageAssistantAsset,
  listImageAssistantAssets,
  listImageAssistantMessages,
  listImageAssistantVersions,
  setSelectedVersionCandidate,
  updateImageAssistantSession,
} from "@/lib/image-assistant/repository"
import { isImageAssistantR2Available, uploadImageAssistantDataUrl } from "@/lib/image-assistant/r2"
import { IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS } from "@/lib/image-assistant/skills"
import {
  buildImageAssistantTurnContent,
  extractLatestImageAssistantOrchestration,
  planImageAssistantTurn,
} from "@/lib/image-assistant/tools"
import type {
  ImageAssistantAsset,
  ImageAssistantBrief,
  ImageAssistantGenerateResult,
  ImageAssistantResolution,
  ImageAssistantSizePreset,
  ImageAssistantTaskType,
} from "@/lib/image-assistant/types"

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error("request_aborted")
    error.name = "AbortError"
    throw error
  }
}

function logImageAssistantStage(stage: string, payload: Record<string, unknown>) {
  console.info(`image-assistant.${stage}`, payload)
}

function normalizeResolution(value: unknown): ImageAssistantResolution {
  return value === "512" || value === "1K" || value === "4K" ? value : "2K"
}

function normalizeSizePreset(value: unknown): ImageAssistantSizePreset {
  return value === "4:5" || value === "3:4" || value === "16:9" || value === "9:16" ? value : "1:1"
}

function getCachedGeminiFileMeta(asset: ImageAssistantAsset) {
  const meta = asset.meta && typeof asset.meta === "object" ? (asset.meta as Record<string, unknown>) : null
  const candidate = meta?.geminiFile
  if (!candidate || typeof candidate !== "object") return null

  const file = candidate as Record<string, unknown>
  const fileUri = typeof file.uri === "string" ? file.uri : ""
  const mimeType = typeof file.mimeType === "string" ? file.mimeType : asset.mime_type
  const expirationTime = typeof file.expirationTime === "string" ? file.expirationTime : null
  const expirationTimestamp = expirationTime ? Date.parse(expirationTime) : Number.NaN
  const isExpired = Number.isFinite(expirationTimestamp) ? expirationTimestamp <= Date.now() + 5 * 60 * 1000 : false

  if (!fileUri || !mimeType || isExpired) {
    return null
  }

  return {
    fileUri,
    mimeType,
  }
}

async function ensureGeminiFileReferenceForAsset(params: {
  userId: number
  sessionId: string
  asset: ImageAssistantAsset
  signal?: AbortSignal
}) {
  const cached = getCachedGeminiFileMeta(params.asset)
  if (cached) {
    return {
      kind: "file" as const,
      fileUri: cached.fileUri,
      mimeType: cached.mimeType,
    }
  }

  if (!params.asset.url) {
    throw new Error("image_assistant_asset_url_missing")
  }

  const uploaded = await uploadImageAssistantReferenceToGoogle({
    url: params.asset.url,
    displayName: `image-assistant-${params.asset.id}`,
    signal: params.signal,
  })

  await updateImageAssistantAsset({
    userId: params.userId,
    sessionId: params.sessionId,
    assetId: params.asset.id,
    meta: {
      ...(params.asset.meta || {}),
      geminiFile: {
        name: uploaded.name,
        uri: uploaded.uri,
        mimeType: uploaded.mimeType,
        createTime: uploaded.createTime,
        expirationTime: uploaded.expirationTime,
        updatedAt: new Date().toISOString(),
      },
    },
  })

  return {
    kind: "file" as const,
    fileUri: uploaded.uri,
    mimeType: uploaded.mimeType,
  }
}

async function resolveReferenceImagesForModel(params: {
  userId: number
  sessionId: string
  referencedAssets: ImageAssistantAsset[]
  signal?: AbortSignal
}) {
  const assetsWithUrls = params.referencedAssets.filter((asset): asset is ImageAssistantAsset => Boolean(asset?.url))
  if (!assetsWithUrls.length) return []

  if (shouldUseImageAssistantFixtures()) {
    return Promise.all(
      assetsWithUrls.map(async (asset) => {
        const inline = await urlToInlineImage(asset.url!)
        return {
          kind: "inline" as const,
          mimeType: inline.mimeType,
          base64Data: inline.base64Data,
        }
      }),
    )
  }

  if (hasImageAssistantGoogleKey()) {
    try {
      return await Promise.all(
        assetsWithUrls.map((asset) =>
          ensureGeminiFileReferenceForAsset({
            userId: params.userId,
            sessionId: params.sessionId,
            asset,
            signal: params.signal,
          }),
        ),
      )
    } catch (error) {
      console.warn("image-assistant.references.google-file-fallback", {
        sessionId: params.sessionId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return Promise.all(
    assetsWithUrls.map(async (asset) => {
      const inline = await urlToInlineImage(asset.url!)
      return {
        kind: "inline" as const,
        mimeType: inline.mimeType,
        base64Data: inline.base64Data,
      }
    }),
  )
}

async function ensureImageAssistantSession(params: {
  userId: number
  enterpriseId?: number | null
  sessionId?: string | null
  title: string
}) {
  let sessionId = params.sessionId || null
  let session =
    sessionId && (await getImageAssistantSession(params.userId, sessionId))
      ? await getImageAssistantSession(params.userId, sessionId)
      : null

  if (!session) {
    const created = await createImageAssistantSession({
      userId: params.userId,
      enterpriseId: params.enterpriseId || null,
      title: params.title,
    })
    sessionId = created.id
    session = await getImageAssistantSession(params.userId, sessionId)
  }

  if (!sessionId || !session) {
    throw new Error("image_assistant_session_create_failed")
  }

  return { sessionId, session }
}

async function resolveReferenceAssets(params: {
  userId: number
  sessionId: string
  referenceAssetIds?: string[]
}) {
  const assets = await listImageAssistantAssets(params.userId, params.sessionId)
  const referencedAssets = (params.referenceAssetIds || [])
    .slice(-IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS)
    .map((assetId) => assets.find((asset) => asset.id === assetId))
    .filter((asset): asset is ImageAssistantAsset => Boolean(asset))

  return {
    assets,
    referencedAssets,
  }
}

async function persistGeneratedAsset(params: {
  userId: number
  sessionId: string
  index: number
  dataUrl: string
}) {
  let metadata: ReturnType<typeof getInlineImageMetadata> | null = null
  try {
    metadata = getInlineImageMetadata(params.dataUrl)
  } catch (error) {
    console.warn("image-assistant.generated.metadata_unavailable", {
      sessionId: params.sessionId,
      index: params.index,
      message: error instanceof Error ? error.message : String(error),
    })
  }

  const mimeType = metadata?.mimeType || /^data:([^;]+);/i.exec(params.dataUrl)?.[1] || "image/png"
  const fileSize = metadata?.buffer.length || 0
  const width = metadata?.width ?? null
  const height = metadata?.height ?? null

  return createImageAssistantAsset({
    userId: params.userId,
    sessionId: params.sessionId,
    assetType: "generated",
    storageProvider: "inline",
    storageKey: `inline:generated:${params.sessionId}:${Date.now()}:${params.index}`,
    publicUrl: params.dataUrl,
    mimeType,
    fileSize,
    width,
    height,
    status: "ready",
  })
}

async function backfillGeneratedAssetToR2(params: {
  userId: number
  sessionId: string
  assetId: string
  index: number
  dataUrl: string
}) {
  const uploaded = await uploadImageAssistantDataUrl({
    userId: params.userId,
    sessionId: params.sessionId,
    assetType: "generated",
    dataUrl: params.dataUrl,
    suggestedName: `candidate-${params.index + 1}`,
  })

  await updateImageAssistantAsset({
    userId: params.userId,
    sessionId: params.sessionId,
    assetId: params.assetId,
    storageProvider: "r2",
    storageKey: uploaded.storageKey,
    publicUrl: uploaded.publicUrl,
    status: "ready",
  })
}

function scheduleGeneratedAssetBackfill(params: {
  userId: number
  sessionId: string
  persistedAssets: ImageAssistantAsset[]
  generatedImages: string[]
}) {
  if (!isImageAssistantR2Available() || shouldUseImageAssistantFixtures()) {
    return
  }

  void Promise.allSettled(
    params.persistedAssets.map((asset, index) =>
      backfillGeneratedAssetToR2({
        userId: params.userId,
        sessionId: params.sessionId,
        assetId: asset.id,
        index,
        dataUrl: params.generatedImages[index],
      }),
    ),
  ).then((results) => {
    const failed = results.filter((result) => result.status === "rejected")
    if (failed.length) {
      console.error("image-assistant.generated.r2_backfill_failed", {
        sessionId: params.sessionId,
        failedCount: failed.length,
        messages: failed.map((result) =>
          result.status === "rejected" && result.reason instanceof Error ? result.reason.message : String((result as PromiseRejectedResult).reason),
        ),
      })
      return
    }

    console.info("image-assistant.generated.r2_backfill_completed", {
      sessionId: params.sessionId,
      assetCount: params.persistedAssets.length,
    })
  })
}

export async function runImageAssistantJob(params: {
  userId: number
  enterpriseId?: number | null
  requestIp: string
  sessionId?: string | null
  prompt: string
  taskType: ImageAssistantTaskType
  referenceAssetIds?: string[]
  candidateCount?: number
  sizePreset?: string | null
  resolution?: string | null
  parentVersionId?: string | null
  requestMessageId?: string | null
  snapshotAssetId?: string | null
  maskAssetId?: string | null
  requestPayload?: Record<string, unknown> | null
  responsePayload?: Record<string, unknown> | null
  versionMeta?: Record<string, unknown> | null
  signal?: AbortSignal
}) {
  const prompt = params.prompt.trim()
  const startedAt = Date.now()
  if (!prompt) {
    throw new Error("prompt_required")
  }

  const limitKey = `image-assistant:${params.userId}:${params.requestIp}:${params.taskType}`
  const rateLimit = await checkRateLimit({ key: limitKey, limit: 20, windowMs: 60_000 })
  if (!rateLimit.ok) {
    const error = new Error("rate_limited")
    ;(error as Error & { retryAfterSeconds?: number }).retryAfterSeconds = rateLimit.retryAfterSeconds
    throw error
  }

  const { sessionId } = await ensureImageAssistantSession({
    userId: params.userId,
    enterpriseId: params.enterpriseId,
    sessionId: params.sessionId,
    title: prompt,
  })
  logImageAssistantStage("job.start", {
    sessionId,
    taskType: params.taskType,
    referenceAssetCount: params.referenceAssetIds?.length || 0,
    candidateCount: params.candidateCount || 1,
    sizePreset: params.sizePreset,
    resolution: params.resolution,
  })

  const availability = getImageAssistantAvailability()
  if (!availability.enabled) {
    throw new Error(availability.reason || "image_assistant_unavailable")
  }

  const { referencedAssets } = await resolveReferenceAssets({
    userId: params.userId,
    sessionId,
    referenceAssetIds: params.referenceAssetIds,
  })
  logImageAssistantStage("job.references.resolved", {
    sessionId,
    referenceAssetCount: referencedAssets.length,
    elapsedMs: Date.now() - startedAt,
  })
  const referenceImages = await resolveReferenceImagesForModel({
    userId: params.userId,
    sessionId,
    referencedAssets,
    signal: params.signal,
  })
  throwIfAborted(params.signal)
  logImageAssistantStage("job.references.prepared", {
    sessionId,
    referenceImageCount: referenceImages.length,
    kinds: referenceImages.map((image) => image.kind),
    elapsedMs: Date.now() - startedAt,
  })

  const generated = await generateOrEditImages({
    prompt,
    resolution: normalizeResolution(params.resolution),
    sizePreset: normalizeSizePreset(params.sizePreset),
    referenceImages,
    candidateCount: params.candidateCount || 1,
    signal: params.signal,
  })
  throwIfAborted(params.signal)
  logImageAssistantStage("job.provider.completed", {
    sessionId,
    provider: generated.provider,
    model: generated.model,
    imageCount: generated.images.length,
    elapsedMs: Date.now() - startedAt,
  })

  const persistedAssets = await Promise.all(
    generated.images.map((dataUrl, index) =>
      persistGeneratedAsset({
        userId: params.userId,
        sessionId,
        index,
        dataUrl,
      }),
    ),
  )
  throwIfAborted(params.signal)
  logImageAssistantStage("job.assets.created", {
    sessionId,
    persistedAssetCount: persistedAssets.length,
    elapsedMs: Date.now() - startedAt,
  })

  const requestMessage = params.requestMessageId
    ? { id: params.requestMessageId }
    : await createImageAssistantMessage({
        sessionId,
        role: "user",
        messageType: "prompt",
        content: prompt,
        taskType: params.taskType,
        requestPayload: {
          referenceAssetIds: params.referenceAssetIds || [],
          candidateCount: params.candidateCount || 1,
          sizePreset: normalizeSizePreset(params.sizePreset),
          resolution: normalizeResolution(params.resolution),
          ...(params.requestPayload || {}),
        },
      })

  const version = persistedAssets.length
    ? await createVersionWithCandidates({
        userId: params.userId,
        sessionId,
        parentVersionId: params.parentVersionId || null,
        sourceMessageId: requestMessage.id,
        versionKind: params.taskType === "generate" ? "ai_generate" : "ai_edit",
        provider: generated.provider,
        model: generated.model,
        promptText: prompt,
        snapshotAssetId: params.snapshotAssetId || null,
        maskAssetId: params.maskAssetId || null,
        meta: params.versionMeta || null,
        candidateAssetIds: persistedAssets.map((asset) => asset.id),
      })
    : null

  await createImageAssistantMessage({
    sessionId,
    role: "assistant",
    messageType: "result_summary",
    content: generated.textSummary,
    taskType: params.taskType,
    createdVersionId: version?.versionId || null,
    responsePayload: {
      candidateAssetIds: persistedAssets.map((asset) => asset.id),
      provider: generated.provider,
      model: generated.model,
      hasImages: persistedAssets.length > 0,
      ...(params.responsePayload || {}),
    },
  })

  if (version?.selectedCandidateId) {
    await setSelectedVersionCandidate({
      userId: params.userId,
      sessionId,
      versionId: version.versionId,
      candidateId: version.selectedCandidateId,
    })
  } else if (version) {
    await updateImageAssistantSession({
      userId: params.userId,
      sessionId,
      currentVersionId: version.versionId,
    })
  }

  const nextAssets = await listImageAssistantAssets(params.userId, sessionId)
  const candidates = version?.selectedCandidateId
    ? (await listImageAssistantVersions(params.userId, sessionId)).find((item) => item.id === version.versionId)?.candidates || []
    : persistedAssets.map((asset, index) => ({
        id: `${version?.versionId || "generated"}-${index}`,
        version_id: version?.versionId || "",
        asset_id: asset.id,
        candidate_index: index,
        is_selected: index === 0,
        url: nextAssets.find((item) => item.id === asset.id)?.url || asset.url,
      }))

  const summary = await updateImageAssistantSession({
    userId: params.userId,
    sessionId,
    currentMode: "chat",
  })
  scheduleGeneratedAssetBackfill({
    userId: params.userId,
    sessionId,
    persistedAssets,
    generatedImages: generated.images,
  })
  logImageAssistantStage("job.completed", {
    sessionId,
    versionId: version?.versionId || null,
    selectedCandidateId: version?.selectedCandidateId || null,
    elapsedMs: Date.now() - startedAt,
  })

  return {
    conversation: summary!,
    message_id: requestMessage.id,
    version_id: version?.versionId || null,
    version_meta: params.versionMeta || null,
    text_summary: generated.textSummary,
    candidates,
    outcome: "generated",
    follow_up_message_id: null,
    orchestration: (params.responsePayload?.orchestration as ImageAssistantGenerateResult["orchestration"]) || null,
    max_reference_attachments: IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS,
  } satisfies ImageAssistantGenerateResult
}

export async function runImageAssistantConversationTurn(params: {
  userId: number
  enterpriseId?: number | null
  requestIp: string
  sessionId?: string | null
  prompt: string
  brief?: Partial<ImageAssistantBrief> | null
  taskType: ImageAssistantTaskType
  referenceAssetIds?: string[]
  candidateCount?: number
  sizePreset?: string | null
  resolution?: string | null
  parentVersionId?: string | null
  extraInstructions?: string | null
  snapshotAssetId?: string | null
  maskAssetId?: string | null
  versionMeta?: Record<string, unknown> | null
  signal?: AbortSignal
}) {
  const startedAt = Date.now()
  const userTurnContent = buildImageAssistantTurnContent({
    prompt: params.prompt,
    brief: params.brief,
    taskType: params.taskType,
  })
  if (!userTurnContent.trim()) {
    throw new Error("prompt_required")
  }

  const { sessionId } = await ensureImageAssistantSession({
    userId: params.userId,
    enterpriseId: params.enterpriseId,
    sessionId: params.sessionId,
    title: params.brief?.goal?.trim() || params.prompt.trim() || "image design",
  })
  logImageAssistantStage("conversation.start", {
    sessionId,
    taskType: params.taskType,
    referenceAssetCount: params.referenceAssetIds?.length || 0,
    sizePreset: params.sizePreset,
    resolution: params.resolution,
  })

  const [messages, { referencedAssets }] = await Promise.all([
    listImageAssistantMessages(params.userId, sessionId),
    resolveReferenceAssets({
      userId: params.userId,
      sessionId,
      referenceAssetIds: params.referenceAssetIds,
    }),
  ])
  throwIfAborted(params.signal)
  logImageAssistantStage("conversation.context.loaded", {
    sessionId,
    historyCount: messages.length,
    referenceAssetCount: referencedAssets.length,
    elapsedMs: Date.now() - startedAt,
  })

  const previousState = extractLatestImageAssistantOrchestration(messages)
  const plan = await planImageAssistantTurn({
    prompt: params.prompt,
    currentBrief: params.brief,
    previousState,
    taskType: params.taskType,
    sizePreset: normalizeSizePreset(params.sizePreset),
    resolution: normalizeResolution(params.resolution),
    referenceCount: referencedAssets.length,
    extraInstructions: params.extraInstructions,
  })
  throwIfAborted(params.signal)
  logImageAssistantStage("conversation.plan.completed", {
    sessionId,
    readyForGeneration: plan.orchestration.ready_for_generation,
    missingFields: plan.orchestration.missing_fields,
    recommendedMode: plan.orchestration.recommended_mode,
    plannerStrategy: plan.orchestration.planner_strategy || null,
    elapsedMs: Date.now() - startedAt,
  })

  const requestPayload = {
    workflow: "skills_tools",
    referenceAssetIds: (params.referenceAssetIds || []).slice(-IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS),
    candidateCount: params.candidateCount || 1,
    sizePreset: normalizeSizePreset(params.sizePreset),
    resolution: normalizeResolution(params.resolution),
    snapshotAssetId: params.snapshotAssetId || null,
    maskAssetId: params.maskAssetId || null,
    versionMeta: params.versionMeta || null,
    orchestration: plan.orchestration,
  }

  const requestMessage = await createImageAssistantMessage({
    sessionId,
    role: "user",
    messageType: "prompt",
    content: userTurnContent,
    taskType: params.taskType,
    requestPayload,
  })
  logImageAssistantStage("conversation.user-message.created", {
    sessionId,
    requestMessageId: requestMessage.id,
    elapsedMs: Date.now() - startedAt,
  })

  if (!plan.orchestration.ready_for_generation || !plan.orchestration.generated_prompt) {
    const assistantMessage = await createImageAssistantMessage({
      sessionId,
      role: "assistant",
      messageType: "note",
      content: plan.assistantReply || "Please clarify the remaining design requirements.",
      taskType: params.taskType,
      responsePayload: {
        workflow: "skills_tools",
        orchestration: plan.orchestration,
      },
    })

    const conversation = await updateImageAssistantSession({
      userId: params.userId,
      sessionId,
      currentMode: "chat",
      title: plan.orchestration.brief.goal || undefined,
    })

    return {
      conversation: conversation!,
      message_id: requestMessage.id,
      version_id: null,
      text_summary: assistantMessage.content,
      candidates: [],
      outcome: "needs_clarification",
      follow_up_message_id: assistantMessage.id,
      orchestration: plan.orchestration,
      max_reference_attachments: IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS,
    } satisfies ImageAssistantGenerateResult
  }

  return runImageAssistantJob({
    userId: params.userId,
    enterpriseId: params.enterpriseId,
    requestIp: params.requestIp,
    sessionId,
    prompt: plan.orchestration.generated_prompt,
    taskType: params.taskType,
    referenceAssetIds: (params.referenceAssetIds || []).slice(-IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS),
    candidateCount: params.candidateCount || 1,
    sizePreset: normalizeSizePreset(params.sizePreset),
    resolution: normalizeResolution(params.resolution),
    parentVersionId: params.parentVersionId || null,
    snapshotAssetId: params.snapshotAssetId || null,
    maskAssetId: params.maskAssetId || null,
    requestMessageId: requestMessage.id,
    requestPayload,
    responsePayload: {
      workflow: "skills_tools",
      orchestration: plan.orchestration,
    },
    versionMeta: params.versionMeta || null,
    signal: params.signal,
  })
}
