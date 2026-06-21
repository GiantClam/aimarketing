import { checkRateLimit } from "@/lib/server/rate-limit"
import { getInlineImageMetadata, imageSourceToDataUrl, urlToInlineImage } from "@/lib/image-assistant/assets"
import { estimateGptImage2Credits } from "@/lib/billing/costing"
import {
  finalizeReservedCredits,
  releaseReservedCredits,
  reserveFeatureCredits,
  type BillingReservation,
} from "@/lib/billing/runtime"
import {
  generateOrEditImages,
  getImageAssistantAvailability,
  hasImageAssistantAibermKey,
  hasImageAssistantCrazyrouteKey,
  hasImageAssistantPptokenKey,
  shouldUseImageAssistantFixtures,
  type ImageAssistantRuntimeProviderConfig,
} from "@/lib/image-assistant/aiberm"
import { hasImageAssistantGoogleKey, uploadImageAssistantReferenceToGoogle } from "@/lib/image-assistant/google"
import {
  createImageAssistantAsset,
  createImageAssistantMessage,
  createImageAssistantSession,
  createVersionWithCandidates,
  getImageAssistantSession,
  updateImageAssistantAsset,
  listImageAssistantAssets,
  listImageAssistantAssetsByIds,
  listImageAssistantMessages,
  listImageAssistantVersions,
  setSelectedVersionCandidate,
  updateImageAssistantSession,
} from "@/lib/image-assistant/repository"
import { isImageAssistantR2Available, uploadImageAssistantDataUrl } from "@/lib/image-assistant/r2"
import { shouldPreferInlineReferenceImages } from "@/lib/image-assistant/reference-preference"
import {
  normalizeGptImage2BillingQuality,
  normalizeWorkflowImageConfig,
} from "@/lib/image-assistant/model-options"
import {
  resolveGovernedImageAssistantSelectionForUser,
  type ModelGovernanceUser,
} from "@/lib/platform/model-governance"
import { hasCustomImageModelSelection } from "@/lib/platform/shared-credits-policy"
import { IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS } from "@/lib/image-assistant/skills"
import {
  buildImageAssistantTurnContent,
  extractLatestImageAssistantOrchestration,
  planImageAssistantTurn,
} from "@/lib/image-assistant/tools"
import {
  mergeImageAssistantExtraInstructions,
  resolveImageAssistantMemoryBridge,
  type ImageAssistantMemoryBridgeResult,
} from "@/lib/image-assistant/memory-bridge"
import type {
  ImageAssistantAsset,
  ImageAssistantBrief,
  ImageAssistantGenerateResult,
  ImageAssistantGuidedSelection,
  ImageAssistantMessage,
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

function buildModelGovernanceUser(input: {
  userId: number
  enterpriseId?: number | null
  enterpriseRole?: string | null
  enterpriseStatus?: string | null
}) {
  return {
    id: input.userId,
    enterpriseId: input.enterpriseId || null,
    enterpriseRole: input.enterpriseRole || null,
    enterpriseStatus: input.enterpriseStatus || null,
  } satisfies ModelGovernanceUser
}

function toRuntimeProviderConfig(
  selection: Awaited<ReturnType<typeof resolveGovernedImageAssistantSelectionForUser>>,
): ImageAssistantRuntimeProviderConfig | null {
  const runtime = selection.enterpriseRuntime
  if (!runtime) return null

  if (runtime.kind === "google") {
    return {
      kind: "google",
      config: {
        apiKey: runtime.apiKey,
        model: runtime.model,
      },
      model: runtime.model,
    }
  }

  if (runtime.kind === "runninghub") {
    return {
      kind: "runninghub",
      config: runtime.config,
      model: runtime.model,
    }
  }

  return {
    kind: "openai-compatible",
    provider: "pptoken",
    config: runtime.config,
    model: runtime.model,
  }
}

function normalizeGuidedSelection(input: ImageAssistantGuidedSelection | null | undefined) {
  if (!input) return null
  const sourceMessageId =
    typeof input.source_message_id === "string" && input.source_message_id.trim()
      ? input.source_message_id.trim()
      : null
  const questionId =
    typeof input.question_id === "string" && input.question_id.trim() ? input.question_id.trim() : null
  const optionId = typeof input.option_id === "string" && input.option_id.trim() ? input.option_id.trim() : null

  if (!sourceMessageId && !questionId && !optionId) {
    return null
  }

  return {
    source_message_id: sourceMessageId,
    question_id: questionId,
    option_id: optionId,
  }
}

function getLatestPromptQuestionContext(messages: ImageAssistantMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== "assistant") continue

    const payloads = [message.response_payload, message.request_payload]
    for (const payload of payloads) {
      const orchestration =
        payload && typeof payload === "object" && (payload as Record<string, unknown>).orchestration
          ? ((payload as Record<string, unknown>).orchestration as Record<string, unknown>)
          : null
      if (!orchestration) continue

      const promptQuestions = Array.isArray(orchestration.prompt_questions)
        ? (orchestration.prompt_questions as Array<Record<string, unknown>>)
        : []
      const firstQuestion = promptQuestions.find(
        (question) => question && typeof question === "object" && typeof question.id === "string",
      )
      if (!firstQuestion) continue

      const optionIds = new Set(
        (Array.isArray(firstQuestion.options) ? firstQuestion.options : [])
          .map((option) =>
            option && typeof option === "object" && typeof (option as Record<string, unknown>).id === "string"
              ? String((option as Record<string, unknown>).id)
              : "",
          )
          .filter(Boolean),
      )

      return {
        messageId: message.id,
        questionId: String(firstQuestion.id),
        optionIds,
      }
    }
  }

  return null
}

function normalizeResolution(value: unknown): ImageAssistantResolution {
  return value === "512" || value === "1K" || value === "4K" ? value : "2K"
}

function normalizeSizePreset(value: unknown): ImageAssistantSizePreset {
  return value === "4:5" || value === "3:4" || value === "4:3" || value === "16:9" || value === "9:16" ? value : "1:1"
}

function getImageAssistantBillingFeatureKey(taskType: ImageAssistantTaskType) {
  if (taskType === "generate") return "image_design_generate"
  if (taskType === "mask_edit") return "image_design_mask_edit"
  return "image_design_edit"
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
      assetId: params.asset.id,
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
    assetId: params.asset.id,
    fileUri: uploaded.uri,
    mimeType: uploaded.mimeType,
  }
}

export async function resolveReferenceImagesForModel(params: {
  userId: number
  sessionId: string
  referencedAssets: ImageAssistantAsset[]
  referenceUrls?: string[]
  preferInline?: boolean
  signal?: AbortSignal
}) {
  const assetsWithUrls = params.referencedAssets.filter((asset): asset is ImageAssistantAsset => Boolean(asset?.url))
  const standaloneUrls = [...new Set((params.referenceUrls || []).map((value) => value.trim()).filter(Boolean))]
  if (!assetsWithUrls.length && !standaloneUrls.length) return []

  const standaloneUrlsOnly = standaloneUrls.filter((url) => !assetsWithUrls.some((asset) => asset.url === url))

  const prepareInlineReferences = async () =>
    Promise.all([
      ...assetsWithUrls.map(async (asset) => {
        const inline = await urlToInlineImage(asset.url!, { signal: params.signal })
        return {
          kind: "inline" as const,
          assetId: asset.id,
          mimeType: inline.mimeType,
          base64Data: inline.base64Data,
        }
      }),
      ...standaloneUrlsOnly.map(async (url) => {
          const inline = await urlToInlineImage(url, { signal: params.signal })
          return {
            kind: "inline" as const,
            assetId: null,
            mimeType: inline.mimeType,
            base64Data: inline.base64Data,
          }
        }),
    ])

  if (params.preferInline || shouldUseImageAssistantFixtures()) {
    return prepareInlineReferences()
  }

  const shouldPrepareInlineReferences = shouldPreferInlineReferenceImages({
    hasPptoken: hasImageAssistantPptokenKey(),
    hasAiberm: hasImageAssistantAibermKey(),
    hasCrazyroute: hasImageAssistantCrazyrouteKey(),
  })

  if (shouldPrepareInlineReferences) {
    return prepareInlineReferences()
  }

  if (hasImageAssistantGoogleKey()) {
    try {
      const fileReferences = await Promise.all(
        assetsWithUrls.map((asset) =>
          ensureGeminiFileReferenceForAsset({
            userId: params.userId,
            sessionId: params.sessionId,
            asset,
            signal: params.signal,
          }),
        ),
      )
      let inlineReferences: Array<{ kind: "inline"; assetId?: string | null; mimeType: string; base64Data: string }> = []
      if (shouldPrepareInlineReferences) {
        try {
          inlineReferences = standaloneUrlsOnly.length > 0 ? await Promise.all(
            standaloneUrlsOnly.map(async (url) => {
              const inline = await urlToInlineImage(url, { signal: params.signal })
              return {
                kind: "inline" as const,
                assetId: null,
                mimeType: inline.mimeType,
                base64Data: inline.base64Data,
              }
            }),
          ) : []
        } catch (error) {
          console.warn("image-assistant.references.inline-fallback", {
            sessionId: params.sessionId,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }
      return [...fileReferences, ...inlineReferences]
    } catch (error) {
      console.warn("image-assistant.references.google-file-fallback", {
        sessionId: params.sessionId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return []
}

async function ensureImageAssistantSession(params: {
  userId: number
  enterpriseId?: number | null
  sessionId?: string | null
  title: string
}) {
  let sessionId = params.sessionId || null
  let session = sessionId ? await getImageAssistantSession(params.userId, sessionId) : null

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
  referenceUrls?: string[]
  sessionValidated?: boolean
}) {
  const scopedReferenceAssetIds = (params.referenceAssetIds || []).slice(-IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS)
  const scopedReferenceUrls = [...new Set(
    (params.referenceUrls || [])
      .map((value) => value.trim())
      .filter(Boolean),
  )].slice(-IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS)

  if (!scopedReferenceAssetIds.length && !scopedReferenceUrls.length) {
    return {
      assets: [] as ImageAssistantAsset[],
      referencedAssets: [] as ImageAssistantAsset[],
      referenceUrls: [] as string[],
    }
  }

  const assets = scopedReferenceAssetIds.length
    ? await listImageAssistantAssets(params.userId, params.sessionId, {
        limit: scopedReferenceAssetIds.length,
        assetIds: scopedReferenceAssetIds,
        skipSessionValidation: Boolean(params.sessionValidated),
      })
    : []
  const missingAssetIds = scopedReferenceAssetIds.filter((assetId) => !assets.some((asset) => asset.id === assetId))
  const crossSessionAssets = missingAssetIds.length
    ? await listImageAssistantAssetsByIds(params.userId, missingAssetIds)
    : []
  const allResolvedAssets = [...assets, ...crossSessionAssets]
  const referencedAssets = scopedReferenceAssetIds
    .map((assetId) => allResolvedAssets.find((asset) => asset.id === assetId))
    .filter((asset): asset is ImageAssistantAsset => Boolean(asset))

  return {
    assets: allResolvedAssets,
    referencedAssets,
    referenceUrls: scopedReferenceUrls.filter((url) => !referencedAssets.some((asset) => asset.url === url)),
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

async function materializeGeneratedImageDataUrl(params: {
  sessionId: string
  index: number
  imageSource: string
  signal?: AbortSignal
}) {
  const dataUrl = await imageSourceToDataUrl(params.imageSource, {
    signal: params.signal,
  })

  if (dataUrl !== params.imageSource) {
    console.info("image-assistant.generated.remote-source.materialized", {
      sessionId: params.sessionId,
      index: params.index,
    })
  }

  return dataUrl
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
  enterpriseRole?: string | null
  enterpriseStatus?: string | null
  requestIp: string
  sessionId?: string | null
  prompt: string
  taskType: ImageAssistantTaskType
  referenceAssetIds?: string[]
  referenceUrls?: string[]
  modelOptionId?: string | null
  providerLock?: "pptoken" | "aiberm" | "crazyroute" | null
  model?: string | null
  candidateCount?: number
  sizePreset?: string | null
  resolution?: string | null
  imageSize?: string | null
  imageQuality?: "auto" | "low" | "medium" | "high" | null
  imageBackground?: "auto" | "transparent" | "opaque" | null
  imageOutputFormat?: "png" | "jpeg" | "webp" | null
  imageOutputCompression?: number | null
  imageModeration?: "auto" | "low" | null
  imageResponseFormat?: "b64_json" | "url" | null
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
  const governedSelection = await resolveGovernedImageAssistantSelectionForUser({
    user: buildModelGovernanceUser({
      userId: params.userId,
      enterpriseId: params.enterpriseId,
      enterpriseRole: params.enterpriseRole,
      enterpriseStatus: params.enterpriseStatus,
    }),
    modelOptionId: params.modelOptionId,
    providerLock: params.providerLock,
    model: params.model,
    taskType: params.taskType,
    hasReferenceInput: Boolean((params.referenceAssetIds?.length || 0) + (params.referenceUrls?.length || 0)),
    hasMask: Boolean(params.maskAssetId),
    hasSnapshot: Boolean(params.snapshotAssetId),
  })
  const normalizedImageConfig = normalizeWorkflowImageConfig({
    selectedProviderId: governedSelection.providerLock,
    selectedModelId: governedSelection.model,
    candidateCount: params.candidateCount,
    sizePreset: params.sizePreset,
    resolution: params.resolution,
    imageSize: params.imageSize,
    imageQuality: params.imageQuality,
    imageBackground: params.imageBackground,
    imageOutputFormat: params.imageOutputFormat,
    imageOutputCompression: params.imageOutputCompression,
    imageModeration: params.imageModeration,
    imageResponseFormat: params.imageResponseFormat,
  })

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
    referenceAssetCount: (params.referenceAssetIds?.length || 0) + (params.referenceUrls?.length || 0),
    candidateCount: normalizedImageConfig.candidateCount,
    model: normalizedImageConfig.modelId,
    modelOptionId: governedSelection.modelOptionId,
    providerId: governedSelection.providerId,
    imageSize: normalizedImageConfig.imageSize,
    imageQuality: normalizedImageConfig.imageQuality,
  })

  const runtimeProviderConfig = toRuntimeProviderConfig(governedSelection)
  const availability = getImageAssistantAvailability({
    runtimeProviderConfig,
  })
  if (!availability.enabled) {
    throw new Error(availability.reason || "image_assistant_unavailable")
  }

  const { referencedAssets } = await resolveReferenceAssets({
    userId: params.userId,
    sessionId,
    referenceAssetIds: params.referenceAssetIds,
    referenceUrls: params.referenceUrls,
    sessionValidated: true,
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
    referenceUrls: params.referenceUrls,
    preferInline: runtimeProviderConfig?.kind === "runninghub",
    signal: params.signal,
  })
  throwIfAborted(params.signal)
  logImageAssistantStage("job.references.prepared", {
    sessionId,
    referenceImageCount: referenceImages.length,
    kinds: referenceImages.map((image) => image.kind),
    elapsedMs: Date.now() - startedAt,
  })

  const billingFeatureKey = getImageAssistantBillingFeatureKey(params.taskType)
  const billingEstimate = estimateGptImage2Credits({
    featureKey: billingFeatureKey,
    size: normalizedImageConfig.imageSize,
    quality: normalizeGptImage2BillingQuality(normalizedImageConfig.imageQuality),
    imageCount: normalizedImageConfig.candidateCount,
    model: normalizedImageConfig.modelId,
  })
  const reserveIdempotencyKey = `image-assistant:${sessionId}:${params.requestMessageId || startedAt}:reserve`
  const shouldChargeSharedCredits = !hasCustomImageModelSelection({
    providerLock: normalizedImageConfig.providerLock,
    model: normalizedImageConfig.modelId,
  })
  const creditReservation: BillingReservation | null = shouldChargeSharedCredits
    ? await reserveFeatureCredits({
        userId: params.userId,
        enterpriseId: params.enterpriseId,
        featureKey: billingFeatureKey,
        amount: billingEstimate.credits,
        idempotencyKey: reserveIdempotencyKey,
        metadata: {
          sessionId,
          taskType: params.taskType,
          estimate: billingEstimate,
        },
      })
    : null

  let generated: Awaited<ReturnType<typeof generateOrEditImages>>
  try {
    generated = await generateOrEditImages({
      prompt,
      taskType: params.taskType,
      model: normalizedImageConfig.modelId,
      resolution: normalizedImageConfig.resolution || normalizeResolution(params.resolution),
      sizePreset: normalizedImageConfig.sizePreset || normalizeSizePreset(params.sizePreset),
      imageSize: normalizedImageConfig.imageSize,
      imageQuality: normalizedImageConfig.imageQuality,
      imageBackground: normalizedImageConfig.imageBackground,
      imageOutputFormat: normalizedImageConfig.imageOutputFormat,
      imageOutputCompression: normalizedImageConfig.imageOutputCompression,
      imageModeration: normalizedImageConfig.imageModeration,
      imageResponseFormat: normalizedImageConfig.imageResponseFormat,
      referenceImages,
      providerLock: normalizedImageConfig.providerLock,
      runtimeProviderConfig,
      snapshotAssetId: params.snapshotAssetId || null,
      maskAssetId: params.maskAssetId || null,
      candidateCount: normalizedImageConfig.candidateCount,
      signal: params.signal,
    })
  } catch (error) {
    await releaseReservedCredits({
      reservation: creditReservation,
      userId: params.userId,
      enterpriseId: params.enterpriseId,
      idempotencyKey: `image-assistant:${sessionId}:${params.requestMessageId || startedAt}:release`,
      reason: "image_generation_failed",
    }).catch((releaseError) => {
      console.warn("image-assistant.billing.release.failed", {
        sessionId,
        message: releaseError instanceof Error ? releaseError.message : String(releaseError),
      })
    })
    throw error
  }
  throwIfAborted(params.signal)
  logImageAssistantStage("job.provider.completed", {
    sessionId,
    provider: generated.provider,
    model: generated.model,
    imageCount: generated.images.length,
    elapsedMs: Date.now() - startedAt,
  })

  const generatedImageDataUrls = await Promise.all(
    generated.images.map((imageSource, index) =>
      materializeGeneratedImageDataUrl({
        sessionId,
        index,
        imageSource,
        signal: params.signal,
      }),
    ),
  )
  throwIfAborted(params.signal)

  const persistedAssets = await Promise.all(
    generatedImageDataUrls.map((dataUrl, index) =>
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
          modelOptionId: governedSelection.modelOptionId,
          providerId: governedSelection.providerId,
          referenceAssetIds: params.referenceAssetIds || [],
          model: normalizedImageConfig.modelId,
          candidateCount: normalizedImageConfig.candidateCount,
          imageSize: normalizedImageConfig.imageSize,
          imageQuality: normalizedImageConfig.imageQuality,
          imageBackground: normalizedImageConfig.imageBackground,
          imageOutputFormat: normalizedImageConfig.imageOutputFormat,
          imageOutputCompression: normalizedImageConfig.imageOutputCompression,
          imageModeration: normalizedImageConfig.imageModeration,
          imageResponseFormat: normalizedImageConfig.imageResponseFormat,
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

  await finalizeReservedCredits({
    reservation: creditReservation,
    userId: params.userId,
    enterpriseId: params.enterpriseId,
    actualAmount: billingEstimate.credits,
    idempotencyKey: `image-assistant:${sessionId}:${params.requestMessageId || startedAt}:debit`,
    provider: generated.provider,
    model: generated.model,
    officialCostUsd: billingEstimate.officialCostUsd,
    costBasisUsd: billingEstimate.costBasisUsd,
    usagePayload: billingEstimate.metadata,
    metadata: {
      sessionId,
      taskType: params.taskType,
      versionId: version?.versionId || null,
    },
  }).catch((error) => {
    console.warn("image-assistant.billing.finalize.failed", {
      sessionId,
      message: error instanceof Error ? error.message : String(error),
    })
  })

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
    generatedImages: generatedImageDataUrls,
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
  enterpriseRole?: string | null
  enterpriseStatus?: string | null
  requestIp: string
  sessionId?: string | null
  prompt: string
  brief?: Partial<ImageAssistantBrief> | null
  taskType: ImageAssistantTaskType
  referenceAssetIds?: string[]
  referenceUrls?: string[]
  modelOptionId?: string | null
  providerLock?: "pptoken" | "aiberm" | "crazyroute" | null
  model?: string | null
  candidateCount?: number
  sizePreset?: string | null
  resolution?: string | null
  imageSize?: string | null
  imageQuality?: "auto" | "low" | "medium" | "high" | null
  imageBackground?: "auto" | "transparent" | "opaque" | null
  imageOutputFormat?: "png" | "jpeg" | "webp" | null
  imageOutputCompression?: number | null
  imageModeration?: "auto" | "low" | null
  imageResponseFormat?: "b64_json" | "url" | null
  parentVersionId?: string | null
  extraInstructions?: string | null
  snapshotAssetId?: string | null
  maskAssetId?: string | null
  versionMeta?: Record<string, unknown> | null
  guidedSelection?: ImageAssistantGuidedSelection | null
  memoryBridge?: ImageAssistantMemoryBridgeResult | null
  signal?: AbortSignal
}) {
  const startedAt = Date.now()
  const governedSelection = await resolveGovernedImageAssistantSelectionForUser({
    user: buildModelGovernanceUser({
      userId: params.userId,
      enterpriseId: params.enterpriseId,
      enterpriseRole: params.enterpriseRole,
      enterpriseStatus: params.enterpriseStatus,
    }),
    modelOptionId: params.modelOptionId,
    providerLock: params.providerLock,
    model: params.model,
    taskType: params.taskType,
    hasReferenceInput: Boolean((params.referenceAssetIds?.length || 0) + (params.referenceUrls?.length || 0)),
    hasMask: Boolean(params.maskAssetId),
    hasSnapshot: Boolean(params.snapshotAssetId),
  })
  const normalizedImageConfig = normalizeWorkflowImageConfig({
    selectedProviderId: governedSelection.providerLock,
    selectedModelId: governedSelection.model,
    candidateCount: params.candidateCount,
    sizePreset: params.sizePreset,
    resolution: params.resolution,
    imageSize: params.imageSize,
    imageQuality: params.imageQuality,
    imageBackground: params.imageBackground,
    imageOutputFormat: params.imageOutputFormat,
    imageOutputCompression: params.imageOutputCompression,
    imageModeration: params.imageModeration,
    imageResponseFormat: params.imageResponseFormat,
  })
  const memoryBridge =
    params.memoryBridge ||
    (await resolveImageAssistantMemoryBridge({
      userId: params.userId,
      prompt: params.prompt,
    }))
  const effectiveExtraInstructions = mergeImageAssistantExtraInstructions({
    extraInstructions: params.extraInstructions,
    memoryContext: memoryBridge.memoryContext,
    soulCard: memoryBridge.soulCard,
  })
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
    referenceAssetCount: (params.referenceAssetIds?.length || 0) + (params.referenceUrls?.length || 0),
    model: normalizedImageConfig.modelId,
    modelOptionId: governedSelection.modelOptionId,
    providerId: governedSelection.providerId,
    imageSize: normalizedImageConfig.imageSize,
    imageQuality: normalizedImageConfig.imageQuality,
    memoryAppliedCount: memoryBridge.memoryAppliedIds.length,
  })

  const [messages, { referencedAssets, referenceUrls }] = await Promise.all([
    listImageAssistantMessages(params.userId, sessionId, { skipSessionValidation: true }),
    resolveReferenceAssets({
      userId: params.userId,
      sessionId,
      referenceAssetIds: params.referenceAssetIds,
      referenceUrls: params.referenceUrls,
      sessionValidated: true,
    }),
  ])
  throwIfAborted(params.signal)
  logImageAssistantStage("conversation.context.loaded", {
    sessionId,
    historyCount: messages.length,
    referenceAssetCount: referencedAssets.length + referenceUrls.length,
    elapsedMs: Date.now() - startedAt,
  })
  const isFirstUserTurn = !messages.some((message) => message.role === "user")

  const previousState = extractLatestImageAssistantOrchestration(messages)
  const latestPromptQuestionContext = getLatestPromptQuestionContext(messages)
  const guidedSelection = normalizeGuidedSelection(params.guidedSelection)
  if (guidedSelection && previousState && latestPromptQuestionContext) {
    const staleMessageSelection =
      guidedSelection.source_message_id &&
      guidedSelection.source_message_id !== latestPromptQuestionContext.messageId
    const staleQuestionSelection =
      guidedSelection.question_id &&
      guidedSelection.question_id !== latestPromptQuestionContext.questionId
    const staleOptionSelection =
      guidedSelection.option_id && !latestPromptQuestionContext.optionIds.has(guidedSelection.option_id)

    if (staleMessageSelection || staleQuestionSelection || staleOptionSelection) {
      logImageAssistantStage("conversation.guided-selection.stale", {
        sessionId,
        sourceMessageId: guidedSelection.source_message_id,
        sourceQuestionId: guidedSelection.question_id,
        sourceOptionId: guidedSelection.option_id,
        latestMessageId: latestPromptQuestionContext.messageId,
        latestQuestionId: latestPromptQuestionContext.questionId,
      })

      const conversation = await updateImageAssistantSession({
        userId: params.userId,
        sessionId,
        currentMode: "chat",
        title: previousState.brief.goal || undefined,
      })

      return {
        conversation: conversation!,
        message_id: latestPromptQuestionContext.messageId,
        version_id: null,
        text_summary:
          previousState.follow_up_question ||
          "Please answer the latest clarification question shown in the newest assistant message.",
        candidates: [],
        outcome: "needs_clarification",
        follow_up_message_id: latestPromptQuestionContext.messageId,
        orchestration: previousState,
        max_reference_attachments: IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS,
      } satisfies ImageAssistantGenerateResult
    }
  }

  const plan = await planImageAssistantTurn({
    prompt: params.prompt,
    currentBrief: params.brief,
    previousState,
    taskType: params.taskType,
    sizePreset: normalizedImageConfig.sizePreset || normalizeSizePreset(params.sizePreset),
    resolution: normalizedImageConfig.resolution || normalizeResolution(params.resolution),
    referenceCount: referencedAssets.length + referenceUrls.length,
    extraInstructions: effectiveExtraInstructions,
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
  const firstTurnTitle = plan.orchestration.brief.goal?.trim() || params.prompt.trim() || ""

  const requestPayload = {
    workflow: "skills_tools",
    modelOptionId: governedSelection.modelOptionId,
    providerId: governedSelection.providerId,
    referenceAssetIds: (params.referenceAssetIds || []).slice(-IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS),
    referenceUrls: (params.referenceUrls || []).slice(-IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS),
    providerLock: normalizedImageConfig.providerLock,
    model: normalizedImageConfig.modelId,
    candidateCount: normalizedImageConfig.candidateCount,
    imageSize: normalizedImageConfig.imageSize,
    imageQuality: normalizedImageConfig.imageQuality,
    imageBackground: normalizedImageConfig.imageBackground,
    imageOutputFormat: normalizedImageConfig.imageOutputFormat,
    imageOutputCompression: normalizedImageConfig.imageOutputCompression,
    imageModeration: normalizedImageConfig.imageModeration,
    imageResponseFormat: normalizedImageConfig.imageResponseFormat,
    snapshotAssetId: params.snapshotAssetId || null,
    maskAssetId: params.maskAssetId || null,
    versionMeta: params.versionMeta || null,
    orchestration: plan.orchestration,
    memoryAppliedIds: memoryBridge.memoryAppliedIds,
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
      title: isFirstUserTurn ? firstTurnTitle || undefined : undefined,
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

  if (isFirstUserTurn && firstTurnTitle) {
    await updateImageAssistantSession({
      userId: params.userId,
      sessionId,
      title: firstTurnTitle,
    })
  }

  return runImageAssistantJob({
    userId: params.userId,
    enterpriseId: params.enterpriseId,
    requestIp: params.requestIp,
    sessionId,
    prompt: plan.orchestration.generated_prompt,
    taskType: params.taskType,
    referenceAssetIds: (params.referenceAssetIds || []).slice(-IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS),
    referenceUrls: (params.referenceUrls || []).slice(-IMAGE_ASSISTANT_MAX_REFERENCE_ATTACHMENTS),
    modelOptionId: governedSelection.modelOptionId,
    enterpriseRole: params.enterpriseRole || null,
    enterpriseStatus: params.enterpriseStatus || null,
    providerLock: normalizedImageConfig.providerLock,
    model: normalizedImageConfig.modelId,
    candidateCount: normalizedImageConfig.candidateCount,
    sizePreset: normalizedImageConfig.sizePreset || normalizeSizePreset(params.sizePreset),
    resolution: normalizedImageConfig.resolution || normalizeResolution(params.resolution),
    imageSize: normalizedImageConfig.imageSize,
    imageQuality: normalizedImageConfig.imageQuality,
    imageBackground: normalizedImageConfig.imageBackground,
    imageOutputFormat: normalizedImageConfig.imageOutputFormat,
    imageOutputCompression: normalizedImageConfig.imageOutputCompression,
    imageModeration: normalizedImageConfig.imageModeration,
    imageResponseFormat: normalizedImageConfig.imageResponseFormat,
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
