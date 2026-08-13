import { estimateGptImage2Credits } from "@/lib/billing/costing"
import {
  finalizeReservedCredits,
  releaseReservedCredits,
  reserveFeatureCredits,
  type BillingReservation,
} from "@/lib/billing/runtime"
import {
  generateImagesWithOpenAiCompatibleProvider,
  getOpenAiCompatibleImageProviderConfig,
  type OpenAiCompatibleImageProviderId,
} from "@/lib/image-assistant/openai-compatible-image"
import { buildImageAssistantProviderPlan } from "@/lib/image-assistant/aiberm"
import { executeImageProviderPlan, type ImageGenerationProvider } from "@/lib/image-generation/provider-orchestration"
import { withTaskTimeout } from "@/lib/task-timeout"
import { ensureWriterAssetOrder, markWriterAssetsFailed, partitionWriterAssetsForRecovery, resolveWriterAssetMarkdown, summarizeWriterAssetCompletion, type WriterAsset } from "@/lib/writer/assets"
import type { WriterSubmitResult } from "@/lib/writer/writer-result"
import { normalizeWriterPlatform, WRITER_PLATFORM_CONFIG, type WriterMode } from "@/lib/writer/config"
import { writerFetch } from "@/lib/writer/network"
import { ensureWriterPromptDiversity, extractWriterPromptFocus } from "@/lib/writer/prompt-similarity"
import { updateWriterConversationMeta } from "@/lib/writer/repository"
import { persistWriterAssetProgress } from "@/lib/writer/revisions"
import { isWriterR2Available, parseWriterDataUrl, uploadWriterImageToR2 } from "@/lib/writer/r2"

export type WriterImageProvider = OpenAiCompatibleImageProviderId

export type WriterGeneratedAsset = WriterAsset & {
  status: "ready" | "failed"
  provider: WriterImageProvider | "error"
  storageKey?: string
  contentType?: string
}

export type WriterAssetGenerationResult = {
  ok: boolean
  assets: WriterGeneratedAsset[]
  status: "ready" | "partial" | "failed"
  provider: WriterImageProvider
  model: string
  error?: string
}

const WRITER_IMAGE_DEFAULT_MODEL = "gpt-image-2"
const WRITER_PROMPT_DIVERSITY_MAX_ATTEMPTS = Math.max(
  1,
  Number.parseInt(process.env.WRITER_PROMPT_DIVERSITY_MAX_ATTEMPTS || "3", 10) || 3,
)
const WRITER_PROMPT_SIMILARITY_MAX = Math.max(
  0,
  Math.min(1, Number.parseFloat(process.env.WRITER_PROMPT_SIMILARITY_MAX || "0.82") || 0.82),
)
const WRITER_ENFORCE_PROMPT_DIVERSITY = process.env.WRITER_ENFORCE_PROMPT_DIVERSITY !== "false"
const WRITER_IMAGE_DOWNLOAD_MAX_BYTES = 20 * 1024 * 1024
const WRITER_IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000
const WRITER_IMAGE_REQUEST_TIMEOUT_MS = Math.max(
  60_000,
  Math.min(180_000, Number.parseInt(process.env.WRITER_IMAGE_REQUEST_TIMEOUT_MS || "180000", 10) || 180_000),
)

function isTemporaryProviderError(error: unknown) {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("resource exhausted") ||
    message.includes("temporarily unavailable") ||
    message.includes("_http_429") ||
    message.includes("_http_5")
  )
}

function shouldUseWriterE2EFixtures() {
  if (process.env.WRITER_E2E_FIXTURES === "true") {
    console.warn("writer.assets.fixtures_disabled", { reason: "writer_e2e_fixtures_forbidden_for_generation" })
  }
  return false
}

function getWriterImageModelForProvider(provider: WriterImageProvider) {
  return getOpenAiCompatibleImageProviderConfig(provider)?.model || WRITER_IMAGE_DEFAULT_MODEL
}

export function getWriterImageProviderPlan() {
  return buildImageAssistantProviderPlan() as WriterImageProvider[]
}

export function getPreferredWriterImageProvider() {
  return getWriterImageProviderPlan()[0] || "aiberm"
}

export function getPreferredWriterImageModel() {
  return getWriterImageModelForProvider(getPreferredWriterImageProvider())
}

function estimateWriterImageCredits(provider: WriterImageProvider, imageCount: number) {
  return estimateGptImage2Credits({
    featureKey: "writer_image",
    size: "1024x1024",
    quality: "medium",
    provider,
    model: getWriterImageModelForProvider(provider),
    imageCount,
  })
}

function summarizeWriterAssetError(error: unknown) {
  if (error instanceof Error) {
    return error.message || "writer_asset_failed"
  }
  return typeof error === "string" ? error : "writer_asset_failed"
}

async function normalizeWriterImageDataUrl(dataUrl: string) {
  const normalized = dataUrl.trim()
  if (normalized.startsWith("data:")) {
    parseWriterDataUrl(normalized)
    return normalized
  }

  let imageUrl: URL
  try {
    imageUrl = new URL(normalized)
  } catch {
    throw new Error("writer_asset_data_url_invalid")
  }

  if (imageUrl.protocol !== "http:" && imageUrl.protocol !== "https:") {
    throw new Error("writer_asset_data_url_invalid")
  }

  const abortController = new AbortController()
  const response = await withTaskTimeout(
    writerFetch(imageUrl, { signal: abortController.signal }),
    WRITER_IMAGE_DOWNLOAD_TIMEOUT_MS,
    "writer_asset_image_download_timeout",
    { abortController },
  )
  if (!response.ok) {
    throw new Error(`writer_asset_image_download_http_${response.status}`)
  }

  const contentLength = Number.parseInt(response.headers.get("content-length") || "", 10)
  if (Number.isFinite(contentLength) && contentLength > WRITER_IMAGE_DOWNLOAD_MAX_BYTES) {
    throw new Error("writer_asset_image_download_too_large")
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.length || buffer.length > WRITER_IMAGE_DOWNLOAD_MAX_BYTES) {
    throw new Error("writer_asset_image_download_invalid")
  }

  const responseContentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase()
  const contentType = responseContentType?.startsWith("image/") ? responseContentType : "image/png"
  const converted = `data:${contentType};base64,${buffer.toString("base64")}`
  parseWriterDataUrl(converted)
  return converted
}

async function generateWriterImageWithProvider(input: {
  provider: WriterImageProvider
  prompt: string
  aspectRatio: string
}) {
  const config = getOpenAiCompatibleImageProviderConfig(input.provider)
  if (!config) throw new Error(`writer_${input.provider}_api_key_missing`)

  const result = await generateImagesWithOpenAiCompatibleProvider({
    config,
    prompt: input.prompt,
    taskType: "generate",
    candidateCount: 1,
    sizePreset: input.aspectRatio === "3:4" ? "3:4" : input.aspectRatio === "16:9" ? "16:9" : "1:1",
    resolution: "1K",
    attempts: 1,
    timeoutMs: WRITER_IMAGE_REQUEST_TIMEOUT_MS,
  })
  const dataUrl = result.images[0]
  if (!dataUrl) throw new Error(`writer_${input.provider}_image_missing`)
  return { dataUrl: await normalizeWriterImageDataUrl(dataUrl), model: result.model || config.model }
}

async function generateWriterImage(prompt: string, aspectRatio: string, providerPlan: WriterImageProvider[]) {
  if (shouldUseWriterE2EFixtures()) {
    throw new Error("writer_e2e_fixtures_forbidden_for_generation")
  }

  const { provider, result } = await executeImageProviderPlan({
    providerPlan: providerPlan as ImageGenerationProvider[],
    handlers: {
      pptoken: async () => generateWriterImageWithProvider({ provider: "pptoken", prompt, aspectRatio }),
      aiberm: async () => generateWriterImageWithProvider({ provider: "aiberm", prompt, aspectRatio }),
      crazyroute: async () => generateWriterImageWithProvider({ provider: "crazyroute", prompt, aspectRatio }),
    },
  })
  return { ...result, provider: provider as WriterImageProvider }
}

async function generateWriterAssetsBatch(input: {
  plannedAssets: WriterAsset[]
  platform: ReturnType<typeof normalizeWriterPlatform>
  conversationId: string | null
  userId: number
  providerPlan: WriterImageProvider[]
  onAsset?: (
    asset: WriterGeneratedAsset,
    index: number,
    total: number,
    assets: WriterGeneratedAsset[],
  ) => Promise<void> | void
}) {
  const acceptedPromptFocuses: Array<{ assetId: string; focus: string }> = []
  const assets: WriterGeneratedAsset[] = []
  const temporarilyDegradedProviders = new Set<WriterImageProvider>()

  for (const asset of input.plannedAssets) {
    try {
      const promptGuard = WRITER_ENFORCE_PROMPT_DIVERSITY
        ? ensureWriterPromptDiversity({
            assetId: asset.id,
            prompt: asset.prompt,
            existing: acceptedPromptFocuses,
            maxAttempts: WRITER_PROMPT_DIVERSITY_MAX_ATTEMPTS,
            similarityMax: WRITER_PROMPT_SIMILARITY_MAX,
          })
        : { prompt: asset.prompt, focus: extractWriterPromptFocus(asset.prompt) }
      const preferredProviderPlan = input.providerPlan.filter((provider) => !temporarilyDegradedProviders.has(provider))
      const generated = await generateWriterImage(
        promptGuard.prompt,
        WRITER_PLATFORM_CONFIG[input.platform].imageAspectRatio,
        preferredProviderPlan.length > 0 ? preferredProviderPlan : input.providerPlan,
      )
      const uploaded = await uploadWriterImageToR2({
        userId: input.userId,
        conversationId: input.conversationId,
        assetId: asset.id,
        dataUrl: generated.dataUrl,
      })
      const nextAsset: WriterGeneratedAsset = {
        ...asset,
        url: uploaded.url,
        storageKey: uploaded.storageKey,
        contentType: uploaded.contentType,
        status: "ready" as const,
        provider: generated.provider,
      }
      assets.push(nextAsset)
      acceptedPromptFocuses.push({ assetId: asset.id, focus: promptGuard.focus })
      await input.onAsset?.(nextAsset, assets.length, input.plannedAssets.length, [...assets])
    } catch (error) {
      const failedAsset = {
        ...asset,
        url: "",
        status: "failed" as const,
        provider: "error" as const,
        error: summarizeWriterAssetError(error),
      }
      assets.push(failedAsset)
      await input.onAsset?.(failedAsset, assets.length, input.plannedAssets.length, [...assets])
      if (isTemporaryProviderError(error)) {
        for (const provider of input.providerPlan) {
          if (provider === "aiberm") temporarilyDegradedProviders.add(provider)
        }
      }
    }
  }

  return assets
}

async function updateWriterAssetConversationStatus(input: {
  userId: number
  conversationId: string | null
  status: "image_generating" | "ready" | "partial" | "failed"
}) {
  if (!input.conversationId) return
  await updateWriterConversationMeta(input.userId, input.conversationId, {
    assetStatus: input.status,
    imagesRequested: true,
  })
}

async function reserveWriterImageCredits(input: {
  userId: number
  enterpriseId?: number | null
  provider: WriterImageProvider
  imageCount: number
  conversationId: string | null
  idempotencyKey: string
}) {
  const estimate = estimateWriterImageCredits(input.provider, Math.max(1, input.imageCount))
  return reserveFeatureCredits({
    userId: input.userId,
    enterpriseId: input.enterpriseId,
    featureKey: estimate.featureKey,
    amount: estimate.credits,
    idempotencyKey: input.idempotencyKey,
    metadata: { route: "writer.assets", conversationId: input.conversationId, source: estimate.source, ...estimate.metadata },
  })
}

async function finalizeWriterImageCredits(input: {
  reservation: BillingReservation | null
  userId: number
  enterpriseId?: number | null
  provider: WriterImageProvider
  successCount: number
  conversationId: string | null
  idempotencyKey: string
}) {
  const actualCost = estimateWriterImageCredits(input.provider, Math.max(1, input.successCount))
  return finalizeReservedCredits({
    reservation: input.reservation,
    userId: input.userId,
    enterpriseId: input.enterpriseId,
    actualAmount: actualCost.credits,
    idempotencyKey: input.idempotencyKey,
    provider: actualCost.provider,
    model: actualCost.model,
    officialCostUsd: actualCost.officialCostUsd,
    costBasisUsd: actualCost.costBasisUsd,
    usagePayload: actualCost.metadata,
    metadata: { route: "writer.assets", conversationId: input.conversationId, successCount: input.successCount },
  })
}

export async function generateWriterAssetsForTask(input: {
  markdown: string
  platform: ReturnType<typeof normalizeWriterPlatform>
  mode: WriterMode
  userId: number
  enterpriseId?: number | null
  conversationId: string | null
  taskId: number | string
  expectedRevision?: number | null
  assetIntents?: WriterSubmitResult["assetIntents"]
  onAsset?: (asset: WriterGeneratedAsset, index: number, total: number, assets: WriterGeneratedAsset[]) => Promise<void> | void
}): Promise<WriterAssetGenerationResult> {
  const recovered = partitionWriterAssetsForRecovery(input.markdown, input.platform, input.mode, input.assetIntents)
  const retainedAssets: WriterGeneratedAsset[] = recovered.ready.map((asset) => ({
    ...asset,
    status: "ready" as const,
    provider: asset.provider === "pptoken" || asset.provider === "crazyroute" ? asset.provider : "aiberm",
  }))
  const plannedAssets = recovered.pending
  const providerPlan = getWriterImageProviderPlan()
  const preferredProvider = getPreferredWriterImageProvider()

  await updateWriterAssetConversationStatus({ userId: input.userId, conversationId: input.conversationId, status: "image_generating" })

  if (plannedAssets.length === 0 && retainedAssets.length > 0) {
    await updateWriterAssetConversationStatus({ userId: input.userId, conversationId: input.conversationId, status: "ready" })
    return { ok: true, assets: ensureWriterAssetOrder(retainedAssets, input.platform, input.mode) as WriterGeneratedAsset[], status: "ready", provider: (retainedAssets[0]?.provider || preferredProvider) as WriterImageProvider, model: getPreferredWriterImageModel() }
  }

  if (providerPlan.length === 0) {
    const error = "Configure at least one writer image provider: pptoken, aiberm, crazyroute."
    const assets = ensureWriterAssetOrder([...retainedAssets, ...markWriterAssetsFailed(plannedAssets, error)], input.platform, input.mode) as WriterGeneratedAsset[]
    await updateWriterAssetConversationStatus({ userId: input.userId, conversationId: input.conversationId, status: "failed" })
    return { ok: false, assets, status: "failed", provider: preferredProvider, model: getPreferredWriterImageModel(), error }
  }

  if (!isWriterR2Available()) {
    const error = "writer_r2_config_missing"
    const assets = ensureWriterAssetOrder([...retainedAssets, ...markWriterAssetsFailed(plannedAssets, error)], input.platform, input.mode) as WriterGeneratedAsset[]
    await updateWriterAssetConversationStatus({ userId: input.userId, conversationId: input.conversationId, status: "failed" })
    return { ok: false, assets, status: "failed", provider: preferredProvider, model: getPreferredWriterImageModel(), error }
  }

  let reservation: BillingReservation | null = null
  try {
    if (plannedAssets.length > 0) {
      reservation = await reserveWriterImageCredits({
        userId: input.userId,
        enterpriseId: input.enterpriseId,
        provider: preferredProvider,
        imageCount: plannedAssets.length,
        conversationId: input.conversationId,
        idempotencyKey: `writer-image:async:reserve:${input.taskId}`,
      })
    }

    const generated = await generateWriterAssetsBatch({
      plannedAssets,
      platform: input.platform,
      conversationId: input.conversationId,
      userId: input.userId,
      providerPlan,
      onAsset: async (asset, index, total, assets) => {
        if (input.expectedRevision !== null && input.expectedRevision !== undefined && assets.length > 0) {
          const resolvedMarkdown = resolveWriterAssetMarkdown(input.markdown, assets, input.platform, input.mode)
          await persistWriterAssetProgress({
            userId: input.userId,
            conversationId: input.conversationId,
            expectedRevision: input.expectedRevision,
            content: resolvedMarkdown,
          }).catch(() => false)
        }
        await input.onAsset?.(asset, index, total, assets)
      },
    })
    const assets = ensureWriterAssetOrder([...retainedAssets, ...generated], input.platform, input.mode) as WriterGeneratedAsset[]
    const generatedCompletion = summarizeWriterAssetCompletion(generated)
    const completion = summarizeWriterAssetCompletion(assets)
    const generatedSuccessCount = generatedCompletion.readyCount
    const successCount = completion.readyCount
    const resolvedProvider = assets.find((asset) => asset.status === "ready")?.provider || preferredProvider

    if (successCount > 0) {
      if (reservation && generatedSuccessCount > 0) {
        await finalizeWriterImageCredits({
          reservation,
          userId: input.userId,
          enterpriseId: input.enterpriseId,
          provider: resolvedProvider as WriterImageProvider,
          successCount: generatedSuccessCount,
          conversationId: input.conversationId,
          idempotencyKey: `writer-image:async:debit:${input.taskId}`,
        })
      } else if (reservation) {
        await releaseReservedCredits({
          reservation,
          userId: input.userId,
          enterpriseId: input.enterpriseId,
          idempotencyKey: `writer-image:async:release:${input.taskId}`,
          reason: "writer_assets_existing_only",
        })
      }
      await updateWriterAssetConversationStatus({ userId: input.userId, conversationId: input.conversationId, status: completion.status })
      return { ok: true, assets, status: completion.status, provider: resolvedProvider as WriterImageProvider, model: getWriterImageModelForProvider(resolvedProvider as WriterImageProvider) }
    }

    await releaseReservedCredits({
      reservation,
      userId: input.userId,
      enterpriseId: input.enterpriseId,
      idempotencyKey: `writer-image:async:release:${input.taskId}`,
      reason: "writer_assets_failed",
    })
    await updateWriterAssetConversationStatus({ userId: input.userId, conversationId: input.conversationId, status: "failed" })
    return { ok: false, assets, status: "failed", provider: preferredProvider, model: getPreferredWriterImageModel(), error: "writer_assets_failed" }
  } catch (error) {
    await releaseReservedCredits({
      reservation,
      userId: input.userId,
      enterpriseId: input.enterpriseId,
      idempotencyKey: `writer-image:async:release:${input.taskId}`,
      reason: summarizeWriterAssetError(error),
    }).catch(() => null)
    await updateWriterAssetConversationStatus({ userId: input.userId, conversationId: input.conversationId, status: "failed" }).catch(() => null)
    throw error
  }
}
