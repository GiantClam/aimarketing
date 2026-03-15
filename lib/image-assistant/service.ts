import { checkRateLimit } from "@/lib/server/rate-limit"
import { urlToInlineImage } from "@/lib/image-assistant/assets"
import { generateOrEditImages, getImageAssistantAvailability, shouldUseImageAssistantFixtures } from "@/lib/image-assistant/aiberm"
import {
  createImageAssistantAsset,
  createImageAssistantMessage,
  createImageAssistantSession,
  createVersionWithCandidates,
  getImageAssistantSession,
  listImageAssistantAssets,
  listImageAssistantVersions,
  setSelectedVersionCandidate,
  updateImageAssistantSession,
} from "@/lib/image-assistant/repository"
import { isImageAssistantR2Available, uploadImageAssistantDataUrl } from "@/lib/image-assistant/r2"
import type { ImageAssistantGenerateResult, ImageAssistantQualityMode, ImageAssistantSizePreset, ImageAssistantTaskType } from "@/lib/image-assistant/types"

function normalizeQualityMode(value: unknown): ImageAssistantQualityMode {
  return value === "low_cost" ? "low_cost" : "high"
}

function normalizeSizePreset(value: unknown): ImageAssistantSizePreset {
  return value === "4:5" || value === "3:4" || value === "16:9" || value === "9:16" ? value : "1:1"
}

async function persistGeneratedAsset(params: {
  userId: number
  sessionId: string
  index: number
  dataUrl: string
}) {
  if (!shouldUseImageAssistantFixtures() && isImageAssistantR2Available()) {
    try {
      const uploaded = await uploadImageAssistantDataUrl({
        userId: params.userId,
        sessionId: params.sessionId,
        assetType: "generated",
        dataUrl: params.dataUrl,
        suggestedName: `candidate-${params.index + 1}`,
      })

      return createImageAssistantAsset({
        userId: params.userId,
        sessionId: params.sessionId,
        assetType: "generated",
        storageProvider: "r2",
        storageKey: uploaded.storageKey,
        publicUrl: uploaded.publicUrl,
        mimeType: /^data:([^;]+);/i.exec(params.dataUrl)?.[1] || "image/png",
        fileSize: 0,
        status: "ready",
      })
    } catch (error) {
      console.warn("image-assistant.generated.r2_fallback", {
        sessionId: params.sessionId,
        index: params.index,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return createImageAssistantAsset({
    userId: params.userId,
    sessionId: params.sessionId,
    assetType: "generated",
    storageProvider: "inline",
    storageKey: `inline:generated:${params.sessionId}:${Date.now()}:${params.index}`,
    publicUrl: params.dataUrl,
    mimeType: /^data:([^;]+);/i.exec(params.dataUrl)?.[1] || "image/png",
    fileSize: 0,
    status: "ready",
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
  qualityMode?: string | null
  parentVersionId?: string | null
}) {
  const prompt = params.prompt.trim()
  if (!prompt) {
    throw new Error("prompt_required")
  }

  const limitKey = `image-assistant:${params.userId}:${params.requestIp}:${params.taskType}`
  const rateLimit = checkRateLimit({ key: limitKey, limit: 20, windowMs: 60_000 })
  if (!rateLimit.ok) {
    const error = new Error("rate_limited")
    ;(error as Error & { retryAfterSeconds?: number }).retryAfterSeconds = rateLimit.retryAfterSeconds
    throw error
  }

  let sessionId = params.sessionId || null
  let session =
    sessionId && (await getImageAssistantSession(params.userId, sessionId))
      ? await getImageAssistantSession(params.userId, sessionId)
      : null
  if (!session) {
    const created = await createImageAssistantSession({
      userId: params.userId,
      enterpriseId: params.enterpriseId || null,
      title: prompt,
    })
    sessionId = created.id
    session = await getImageAssistantSession(params.userId, sessionId)
  }
  if (!sessionId || !session) {
    throw new Error("image_assistant_session_create_failed")
  }

  const availability = getImageAssistantAvailability()
  if (!availability.enabled) {
    throw new Error(availability.reason || "image_assistant_unavailable")
  }

  const requestMessage = await createImageAssistantMessage({
    sessionId,
    role: "user",
    messageType: "prompt",
    content: prompt,
    taskType: params.taskType,
    requestPayload: {
      referenceAssetIds: params.referenceAssetIds || [],
      candidateCount: params.candidateCount || 1,
      sizePreset: normalizeSizePreset(params.sizePreset),
      qualityMode: normalizeQualityMode(params.qualityMode),
    },
  })

  const assets = await listImageAssistantAssets(params.userId, sessionId)
  const referencedAssets = (params.referenceAssetIds || [])
    .map((assetId) => assets.find((asset) => asset.id === assetId))
    .filter(Boolean)
  const referenceImages = await Promise.all(
    referencedAssets
      .filter((asset) => asset?.url)
      .map((asset) => urlToInlineImage(asset!.url!)),
  )

  const generated = await generateOrEditImages({
    prompt,
    qualityMode: normalizeQualityMode(params.qualityMode),
    sizePreset: normalizeSizePreset(params.sizePreset),
    referenceImages,
    candidateCount: params.candidateCount || 1,
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

  const version = await createVersionWithCandidates({
    sessionId,
    parentVersionId: params.parentVersionId || null,
    sourceMessageId: requestMessage.id,
    versionKind: params.taskType === "generate" ? "ai_generate" : "ai_edit",
    provider: generated.provider,
    model: generated.model,
    promptText: prompt,
    candidateAssetIds: persistedAssets.map((asset) => asset.id),
  })

  await createImageAssistantMessage({
    sessionId,
    role: "assistant",
    messageType: "result_summary",
    content: generated.textSummary,
    taskType: params.taskType,
    createdVersionId: version.versionId,
    responsePayload: {
      candidateAssetIds: persistedAssets.map((asset) => asset.id),
      provider: generated.provider,
      model: generated.model,
    },
  })

  if (version.selectedCandidateId) {
    await setSelectedVersionCandidate({
      userId: params.userId,
      sessionId,
      versionId: version.versionId,
      candidateId: version.selectedCandidateId,
    })
  } else {
    await updateImageAssistantSession({
      userId: params.userId,
      sessionId,
      currentVersionId: version.versionId,
    })
  }

  const nextAssets = await listImageAssistantAssets(params.userId, sessionId)
  const candidates = version.selectedCandidateId
    ? (await listImageAssistantVersions(params.userId, sessionId)).find((item) => item.id === version.versionId)?.candidates || []
    : persistedAssets.map((asset, index) => ({
        id: `${version.versionId}-${index}`,
        version_id: version.versionId,
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

  return {
    conversation: summary!,
    message_id: requestMessage.id,
    version_id: version.versionId,
    text_summary: generated.textSummary,
    candidates,
  } satisfies ImageAssistantGenerateResult
}
