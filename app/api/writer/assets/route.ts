import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
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
import { buildPendingWriterAssets, ensureWriterAssetOrder, markWriterAssetsFailed } from "@/lib/writer/assets"
import { normalizeWriterMode, normalizeWriterPlatform, WRITER_PLATFORM_CONFIG } from "@/lib/writer/config"
import {
  ensureWriterPromptDiversity,
  extractWriterPromptFocus,
} from "@/lib/writer/prompt-similarity"
import { updateWriterConversationMeta } from "@/lib/writer/repository"
import { isWriterR2Available, uploadWriterImageToR2 } from "@/lib/writer/r2"

export const runtime = "nodejs"
export const maxDuration = 300

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
type WriterImageProvider = OpenAiCompatibleImageProviderId
type WriterPlannedAsset = ReturnType<typeof buildPendingWriterAssets>[number]
type WriterGeneratedAsset = WriterPlannedAsset & {
  url: string
  status: "ready" | "failed"
  provider: WriterImageProvider | "error"
  storageKey?: string
  contentType?: string
  error?: string
}

function buildWriterImageProviderPlan() {
  return buildImageAssistantProviderPlan() as WriterImageProvider[]
}

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

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function createFixtureImageDataUrl(prompt: string, aspectRatio: string) {
  const title = escapeSvgText(prompt.slice(0, 56).trim() || "Writer Asset")
  const subtitle = escapeSvgText(`Aspect ${aspectRatio}`)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="100%" stop-color="#1d4ed8"/>
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#bg)"/>
      <rect x="70" y="70" width="1460" height="760" rx="36" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)"/>
      <text x="120" y="220" fill="#ffffff" font-size="44" font-family="Arial, sans-serif" font-weight="700">${title}</text>
      <text x="120" y="290" fill="rgba(255,255,255,0.76)" font-size="26" font-family="Arial, sans-serif">${subtitle}</text>
      <text x="120" y="780" fill="rgba(255,255,255,0.7)" font-size="24" font-family="Arial, sans-serif">AI Marketing Writer Test Fixture</text>
    </svg>
  `.trim()

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
}

function shouldUseWriterE2EFixtures() {
  if (process.env.WRITER_E2E_FIXTURES === "true") {
    console.warn("writer.assets.fixtures_disabled", {
      reason: "writer_e2e_fixtures_forbidden_for_generation",
    })
  }
  return false
}

async function generateWriterImageWithProvider(params: {
  provider: WriterImageProvider
  prompt: string
  aspectRatio: string
  signal?: AbortSignal
}) {
  if (shouldUseWriterE2EFixtures()) {
    return {
      dataUrl: createFixtureImageDataUrl(params.prompt, params.aspectRatio),
      model: getWriterImageModelForProvider(params.provider),
    }
  }

  const config = getOpenAiCompatibleImageProviderConfig(params.provider)
  if (!config) {
    throw new Error(`writer_${params.provider}_api_key_missing`)
  }

  const result = await generateImagesWithOpenAiCompatibleProvider({
    config,
    prompt: params.prompt,
    taskType: "generate",
    candidateCount: 1,
    sizePreset: params.aspectRatio === "3:4" ? "3:4" : params.aspectRatio === "16:9" ? "16:9" : "1:1",
    resolution: "1K",
    signal: params.signal,
  })

  const dataUrl = result.images[0]
  if (!dataUrl) {
    throw new Error(`writer_${params.provider}_image_missing`)
  }

  return {
    dataUrl,
    model: result.model || config.model,
  }
}

async function generateWriterImage(
  prompt: string,
  aspectRatio: string,
  options?: {
    providerPlan?: WriterImageProvider[]
    onProviderFailure?: (input: {
      provider: WriterImageProvider
      nextProvider: WriterImageProvider | null
      error: unknown
    }) => void
  },
) {
  if (shouldUseWriterE2EFixtures()) {
    return {
      dataUrl: createFixtureImageDataUrl(prompt, aspectRatio),
      provider: "aiberm" as const,
      model: WRITER_IMAGE_DEFAULT_MODEL,
    }
  }

  const providerPlan = (
    options?.providerPlan && options.providerPlan.length > 0
      ? options.providerPlan
      : buildWriterImageProviderPlan()
  ) as ImageGenerationProvider[]

  console.log("writer.assets.provider_plan", { providerPlan, aspectRatio })

  const { provider, result } = await executeImageProviderPlan({
    providerPlan,
    handlers: {
      pptoken: async () => generateWriterImageWithProvider({ provider: "pptoken", prompt, aspectRatio }),
      aiberm: async () => generateWriterImageWithProvider({ provider: "aiberm", prompt, aspectRatio }),
      crazyroute: async () => generateWriterImageWithProvider({ provider: "crazyroute", prompt, aspectRatio }),
    },
    onProviderFailure: ({ provider, nextProvider, error }) => {
      console.warn(`writer.assets.${provider}_fallback`, {
        message: error instanceof Error ? error.message : `${provider}_image_failed`,
        nextProvider,
      })
      options?.onProviderFailure?.({
        provider: provider as WriterImageProvider,
        nextProvider: (nextProvider as WriterImageProvider | null) || null,
        error,
      })
    },
  })

  return {
    ...result,
    provider: provider as WriterImageProvider,
  }
}

function getPreferredWriterImageProvider() {
  const plan = buildWriterImageProviderPlan()
  return plan[0] || "aiberm"
}

function getPreferredWriterImageModel() {
  return getWriterImageModelForProvider(getPreferredWriterImageProvider())
}

function getWriterImageModelForProvider(provider: WriterImageProvider) {
  return getOpenAiCompatibleImageProviderConfig(provider)?.model || WRITER_IMAGE_DEFAULT_MODEL
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
    const cause = error.cause as { message?: string; code?: string; name?: string } | undefined
    return {
      name: error.name,
      message: error.message || "writer_asset_failed",
      stack: error.stack?.split("\n").slice(0, 8).join("\n"),
      cause:
        cause && typeof cause === "object"
          ? {
              name: cause.name,
              message: cause.message,
              code: cause.code,
            }
          : undefined,
    }
  }

  return {
    name: "UnknownError",
    message: typeof error === "string" ? error : "writer_asset_failed",
    stack: undefined,
    cause: undefined,
  }
}

function resolveWriterImageProvider(
  assets: Array<{
    status: "ready" | "failed" | "loading"
    url: string
    provider: WriterImageProvider | "loading" | "error"
  }>,
) {
  const successfulAsset = assets.find(
    (asset): asset is { status: "ready"; url: string; provider: WriterImageProvider } =>
      asset.status === "ready" && Boolean(asset.url) && asset.provider !== "error",
  )

  return successfulAsset?.provider || getPreferredWriterImageProvider()
}

async function updateWriterAssetConversationStatus(input: {
  userId: number
  conversationId: string | null
  status: "image_generating" | "ready" | "failed"
}) {
  if (!input.conversationId) {
    return
  }

  try {
    await updateWriterConversationMeta(input.userId, input.conversationId, {
      status: input.status,
      imagesRequested: true,
    })
  } catch (dbError) {
    console.warn(`writer.assets.db_update_${input.status}_failed`, {
      conversationId: input.conversationId,
      error: dbError instanceof Error ? dbError.message : String(dbError),
    })
  }
}

function createWriterAssetSseResponse(
  run: (emit: (event: Record<string, unknown>) => void) => Promise<void>,
) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let streamClosed = false

      const emit = (event: Record<string, unknown>) => {
        if (streamClosed) return false
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          return true
        } catch (error) {
          if (error instanceof Error && /controller is already closed/i.test(error.message)) {
            streamClosed = true
            return false
          }
          throw error
        }
      }

      try {
        await run(emit)
      } catch (error) {
        emit({
          event: "error",
          error: error instanceof Error ? error.message : "writer_assets_failed",
        })
      } finally {
        if (!streamClosed) {
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"))
          } catch (error) {
            if (error instanceof Error && /controller is already closed/i.test(error.message)) {
              streamClosed = true
            } else {
              console.warn("writer.assets.done_emit_failed", error)
            }
          }
        }
        if (!streamClosed) {
          streamClosed = true
          try {
            controller.close()
          } catch (error) {
            if (!(error instanceof Error && /controller is already closed/i.test(error.message))) {
              console.warn("writer.assets.stream_close_failed", error)
            }
          }
        }
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

async function reserveWriterImageCredits(input: {
  userId: number
  enterpriseId?: number | null
  provider: WriterImageProvider
  imageCount: number
  idempotencyKey: string
  conversationId: string | null
}) {
  const estimate = estimateWriterImageCredits(input.provider, Math.max(1, input.imageCount))
  return reserveFeatureCredits({
    userId: input.userId,
    enterpriseId: input.enterpriseId,
    featureKey: estimate.featureKey,
    amount: estimate.credits,
    idempotencyKey: input.idempotencyKey,
    metadata: {
      route: "writer.assets",
      conversationId: input.conversationId,
      source: estimate.source,
      ...estimate.metadata,
    },
  })
}

async function finalizeWriterImageCredits(input: {
  reservation: BillingReservation | null
  userId: number
  enterpriseId?: number | null
  provider: WriterImageProvider
  successCount: number
  idempotencyKey: string
  conversationId: string | null
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
    metadata: {
      route: "writer.assets",
      conversationId: input.conversationId,
      successCount: input.successCount,
    },
  })
}

async function releaseWriterImageCredits(input: {
  reservation: BillingReservation | null
  userId: number
  enterpriseId?: number | null
  idempotencyKey: string
  reason: string
}) {
  return releaseReservedCredits({
    reservation: input.reservation,
    userId: input.userId,
    enterpriseId: input.enterpriseId,
    idempotencyKey: input.idempotencyKey,
    reason: input.reason,
  })
}

async function generateWriterAssetsBatch(input: {
  plannedAssets: WriterPlannedAsset[]
  platform: ReturnType<typeof normalizeWriterPlatform>
  conversationId: string | null
  userId: number
  providerPlan: WriterImageProvider[]
  onAsset?: (event: { index: number; total: number; asset: WriterGeneratedAsset; assets: WriterGeneratedAsset[] }) => void
}) {
  const assets: WriterGeneratedAsset[] = []
  const acceptedPromptFocuses: Array<{ assetId: string; focus: string }> = []
  const temporarilyDegradedProviders = new Set<WriterImageProvider>()
  const total = input.plannedAssets.length

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
        : {
            prompt: asset.prompt,
            focus: extractWriterPromptFocus(asset.prompt),
            attempt: 1,
            similarTo: null as string | null,
            similarity: null as number | null,
          }
      if (promptGuard.attempt > 1) {
        console.warn("writer.assets.prompt_diversity_retry", {
          assetId: asset.id,
          attempt: promptGuard.attempt,
          similarTo: promptGuard.similarTo,
          similarity: promptGuard.similarity,
          threshold: WRITER_PROMPT_SIMILARITY_MAX,
        })
      }
      console.log("writer.assets.generating", {
        assetId: asset.id,
        platform: input.platform,
        aspectRatio: WRITER_PLATFORM_CONFIG[input.platform].imageAspectRatio,
      })
      const preferredProviderPlan = input.providerPlan.filter((provider) => !temporarilyDegradedProviders.has(provider))
      const effectiveProviderPlan = preferredProviderPlan.length > 0 ? preferredProviderPlan : input.providerPlan
      const generated = await generateWriterImage(promptGuard.prompt, WRITER_PLATFORM_CONFIG[input.platform].imageAspectRatio, {
        providerPlan: effectiveProviderPlan,
        onProviderFailure: ({ provider, error, nextProvider }) => {
          if (provider === "aiberm" && isTemporaryProviderError(error)) {
            temporarilyDegradedProviders.add("aiberm")
            console.warn("writer.assets.provider_temporarily_degraded", {
              provider,
              nextProvider,
              message: error instanceof Error ? error.message : String(error),
            })
          }
        },
      })
      console.log("writer.assets.generated", {
        assetId: asset.id,
        provider: generated.provider,
        dataUrlLength: generated.dataUrl.length,
        promptAttempt: promptGuard.attempt,
      })
      let uploaded
      try {
        uploaded = await uploadWriterImageToR2({
          userId: input.userId,
          conversationId: input.conversationId,
          assetId: asset.id,
          dataUrl: generated.dataUrl,
        })
      } catch (error) {
        const summary = summarizeWriterAssetError(error)
        console.error("writer.assets.upload_failed", {
          assetId: asset.id,
          provider: generated.provider,
          ...summary,
        })
        throw error
      }

      const nextAsset: WriterGeneratedAsset = {
        ...asset,
        url: uploaded.url,
        storageKey: uploaded.storageKey,
        contentType: uploaded.contentType,
        status: "ready",
        provider: generated.provider,
      }
      assets.push(nextAsset)
      acceptedPromptFocuses.push({
        assetId: asset.id,
        focus: promptGuard.focus,
      })
      input.onAsset?.({ index: assets.length, total, asset: nextAsset, assets: [...assets] })
    } catch (error: unknown) {
      const summary = summarizeWriterAssetError(error)
      console.error("writer.assets.asset_failed", {
        assetId: asset.id,
        prompt: asset.prompt.slice(0, 100),
        ...summary,
      })

      const failedAsset: WriterGeneratedAsset = {
        ...asset,
        url: "",
        status: "failed",
        provider: "error",
        error: summary.message,
      }
      assets.push(failedAsset)
      input.onAsset?.({ index: assets.length, total, asset: failedAsset, assets: [...assets] })
    }
  }

  return assets
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }

    const body = await request.json()
    const streamMode = body?.stream === true || body?.stream === "true"
    const markdown = typeof body?.markdown === "string" ? body.markdown : ""
    const platform = normalizeWriterPlatform(body?.platform)
    const mode = normalizeWriterMode(platform, body?.mode)
    const conversationId = typeof body?.conversationId === "string" ? body.conversationId : null
    const plannedAssets = buildPendingWriterAssets(markdown, platform, mode)
    const baseProviderPlan = buildWriterImageProviderPlan()

    await updateWriterAssetConversationStatus({
      userId: auth.user.id,
      conversationId,
      status: "image_generating",
    })

    if (baseProviderPlan.length === 0) {
      const errorMessage = "Configure at least one writer image provider: pptoken, aiberm, crazyroute."
      const failedAssets = ensureWriterAssetOrder(markWriterAssetsFailed(plannedAssets, errorMessage), platform, mode)
      await updateWriterAssetConversationStatus({ userId: auth.user.id, conversationId, status: "failed" })
      if (streamMode) {
        return createWriterAssetSseResponse(async (emit) => {
          emit({ event: "start", total: failedAssets.length })
          for (let index = 0; index < failedAssets.length; index += 1) {
            emit({ event: "asset", index: index + 1, total: failedAssets.length, asset: failedAssets[index], assets: failedAssets.slice(0, index + 1) })
          }
          emit({
            event: "done",
            ok: false,
            error: errorMessage,
            data: {
              provider: getPreferredWriterImageProvider(),
              model: getPreferredWriterImageModel(),
              assets: failedAssets,
            },
          })
        })
      }

      return NextResponse.json(
        {
          data: {
            provider: getPreferredWriterImageProvider(),
            model: getPreferredWriterImageModel(),
            assets: failedAssets,
          },
          error: errorMessage,
        },
        { status: 503 },
      )
    }

    if (!isWriterR2Available()) {
      const errorMessage = "writer_r2_config_missing"
      const failedAssets = ensureWriterAssetOrder(markWriterAssetsFailed(plannedAssets, errorMessage), platform, mode)
      await updateWriterAssetConversationStatus({ userId: auth.user.id, conversationId, status: "failed" })
      if (streamMode) {
        return createWriterAssetSseResponse(async (emit) => {
          emit({ event: "start", total: failedAssets.length })
          for (let index = 0; index < failedAssets.length; index += 1) {
            emit({ event: "asset", index: index + 1, total: failedAssets.length, asset: failedAssets[index], assets: failedAssets.slice(0, index + 1) })
          }
          emit({
            event: "done",
            ok: false,
            error: errorMessage,
            data: {
              provider: getPreferredWriterImageProvider(),
              model: getPreferredWriterImageModel(),
              assets: failedAssets,
            },
          })
        })
      }

      return NextResponse.json(
        {
          data: {
            provider: getPreferredWriterImageProvider(),
            model: getPreferredWriterImageModel(),
            assets: failedAssets,
          },
          error: errorMessage,
        },
        { status: 503 },
      )
    }

    if (streamMode) {
      return createWriterAssetSseResponse(async (emit) => {
        emit({ event: "start", total: plannedAssets.length })
        const preferredProvider = getPreferredWriterImageProvider()
        let creditReservation: BillingReservation | null = null
        let creditFinalized = false
        try {
          if (plannedAssets.length > 0) {
            try {
              creditReservation = await reserveWriterImageCredits({
                userId: auth.user.id,
                enterpriseId: auth.user.enterpriseId,
                provider: preferredProvider,
                imageCount: plannedAssets.length,
                idempotencyKey: `writer-image:stream:reserve:${auth.user.id}:${conversationId || "new"}:${Date.now()}`,
                conversationId,
              })
            } catch (billingError) {
              if (billingError instanceof Error && billingError.message === "insufficient_credits") {
                await updateWriterAssetConversationStatus({ userId: auth.user.id, conversationId, status: "failed" })
                emit({
                  event: "done",
                  ok: false,
                  error: "insufficient_credits",
                  data: {
                    provider: preferredProvider,
                    model: getWriterImageModelForProvider(preferredProvider),
                    assets: ensureWriterAssetOrder(
                      markWriterAssetsFailed(plannedAssets, "insufficient_credits"),
                      platform,
                      mode,
                    ),
                  },
                })
                return
              }
              throw billingError
            }
          }

          const generatedAssets = await generateWriterAssetsBatch({
            plannedAssets,
            platform,
            conversationId,
            userId: auth.user.id,
            providerPlan: baseProviderPlan,
            onAsset: ({ index, total, asset, assets }) => {
              emit({
                event: "asset",
                index,
                total,
                asset,
                assets: ensureWriterAssetOrder(assets, platform, mode),
              })
            },
          })

          const orderedAssets = ensureWriterAssetOrder(generatedAssets, platform, mode)
          const successCount = orderedAssets.filter((asset) => asset.status === "ready" && asset.url).length
          const resolvedProvider = resolveWriterImageProvider(orderedAssets)
          const donePayload = {
            provider: resolvedProvider,
            model: getWriterImageModelForProvider(resolvedProvider),
            assets: orderedAssets,
          }

          await updateWriterAssetConversationStatus({
            userId: auth.user.id,
            conversationId,
            status: successCount > 0 ? "ready" : "failed",
          })

          if (successCount > 0) {
            await finalizeWriterImageCredits({
              reservation: creditReservation,
              userId: auth.user.id,
              enterpriseId: auth.user.enterpriseId,
              provider: resolvedProvider,
              successCount,
              idempotencyKey: `writer-image:stream:debit:${auth.user.id}:${conversationId || "new"}:${Date.now()}`,
              conversationId,
            }).then(() => {
              creditFinalized = true
            }).catch((billingError) => {
              console.warn("writer.assets.billing.finalize_failed", {
                conversationId,
                message: billingError instanceof Error ? billingError.message : String(billingError),
              })
            })
          } else {
            await releaseWriterImageCredits({
              reservation: creditReservation,
              userId: auth.user.id,
              enterpriseId: auth.user.enterpriseId,
              idempotencyKey: `writer-image:stream:release:${auth.user.id}:${conversationId || "new"}:${Date.now()}`,
              reason: "writer_assets_failed",
            })
          }

          emit({
            event: "done",
            ok: successCount > 0,
            ...(successCount > 0 ? {} : { error: "writer_assets_failed" }),
            data: donePayload,
          })
        } catch (error) {
          if (!creditFinalized) {
            await releaseWriterImageCredits({
              reservation: creditReservation,
              userId: auth.user.id,
              enterpriseId: auth.user.enterpriseId,
              idempotencyKey: `writer-image:stream:release:${auth.user.id}:${conversationId || "new"}:${Date.now()}`,
              reason: error instanceof Error ? error.message : "writer_assets_failed",
            }).catch((billingError) => {
              console.warn("writer.assets.billing.release_failed", {
                conversationId,
                message: billingError instanceof Error ? billingError.message : String(billingError),
              })
            })
          }
          await updateWriterAssetConversationStatus({ userId: auth.user.id, conversationId, status: "failed" })
          throw error
        }
      })
    }

    const preferredProvider = getPreferredWriterImageProvider()
    let creditReservation: BillingReservation | null = null
    try {
      if (plannedAssets.length > 0) {
        creditReservation = await reserveWriterImageCredits({
          userId: auth.user.id,
          enterpriseId: auth.user.enterpriseId,
          provider: preferredProvider,
          imageCount: plannedAssets.length,
          idempotencyKey: `writer-image:reserve:${auth.user.id}:${conversationId || "new"}:${Date.now()}`,
          conversationId,
        })
      }
    } catch (billingError) {
      if (billingError instanceof Error && billingError.message === "insufficient_credits") {
        await updateWriterAssetConversationStatus({ userId: auth.user.id, conversationId, status: "failed" })
        return NextResponse.json({ error: "insufficient_credits" }, { status: 402 })
      }
      throw billingError
    }

    const generatedAssets = await generateWriterAssetsBatch({
      plannedAssets,
      platform,
      conversationId,
      userId: auth.user.id,
      providerPlan: baseProviderPlan,
    })
    const orderedAssets = ensureWriterAssetOrder(generatedAssets, platform, mode)
    const successCount = orderedAssets.filter((asset) => asset.status === "ready" && asset.url).length
    const resolvedProvider = resolveWriterImageProvider(orderedAssets)

    if (successCount === 0) {
      await releaseWriterImageCredits({
        reservation: creditReservation,
        userId: auth.user.id,
        enterpriseId: auth.user.enterpriseId,
        idempotencyKey: `writer-image:release:${auth.user.id}:${conversationId || "new"}:${Date.now()}`,
        reason: "writer_assets_failed",
      }).catch((billingError) => {
        console.warn("writer.assets.billing.release_failed", {
          conversationId,
          message: billingError instanceof Error ? billingError.message : String(billingError),
        })
      })
      await updateWriterAssetConversationStatus({ userId: auth.user.id, conversationId, status: "failed" })

      return NextResponse.json(
        {
          data: {
            provider: resolvedProvider,
            model: getWriterImageModelForProvider(resolvedProvider),
            assets: orderedAssets,
          },
          error: "writer_assets_failed",
        },
        { status: 502 },
      )
    }

    await finalizeWriterImageCredits({
      reservation: creditReservation,
      userId: auth.user.id,
      enterpriseId: auth.user.enterpriseId,
      provider: resolvedProvider,
      successCount,
      idempotencyKey: `writer-image:debit:${auth.user.id}:${conversationId || "new"}:${Date.now()}`,
      conversationId,
    }).catch((billingError) => {
      console.warn("writer.assets.billing.finalize_failed", {
        conversationId,
        message: billingError instanceof Error ? billingError.message : String(billingError),
      })
    })

    await updateWriterAssetConversationStatus({ userId: auth.user.id, conversationId, status: "ready" })

    return NextResponse.json({
      data: {
        provider: resolvedProvider,
        model: getWriterImageModelForProvider(resolvedProvider),
        assets: orderedAssets,
      },
    })
  } catch (error: any) {
    console.error("writer.assets.error", error)
    return NextResponse.json({ error: error.message || "writer_assets_failed" }, { status: 502 })
  }
}
