import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { executeImageProviderPlan, type ImageGenerationProvider } from "@/lib/image-generation/provider-orchestration"
import { buildPendingWriterAssets, ensureWriterAssetOrder, markWriterAssetsFailed } from "@/lib/writer/assets"
import {
  generateImageWithAiberm,
  generateImageWithOpenRouter,
  getOpenRouterImageModel,
  hasAibermApiKey,
  hasOpenRouterApiKey,
} from "@/lib/writer/aiberm"
import { normalizeWriterMode, normalizeWriterPlatform, WRITER_PLATFORM_CONFIG } from "@/lib/writer/config"
import {
  ensureWriterPromptDiversity,
  extractWriterPromptFocus,
} from "@/lib/writer/prompt-similarity"
import { updateWriterConversationMeta } from "@/lib/writer/repository"
import { writerRequestJson } from "@/lib/writer/network"
import { isWriterR2Available, uploadWriterImageToR2 } from "@/lib/writer/r2"

export const runtime = "nodejs"
export const maxDuration = 300

const GOOGLE_IMAGE_API_KEY =
  process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""
const WRITER_AIBERM_IMAGE_MODEL = process.env.WRITER_AIBERM_IMAGE_MODEL || "gemini-3.1-flash-image-preview"
const WRITER_GEMINI_IMAGE_MODEL = process.env.WRITER_GEMINI_IMAGE_MODEL || process.env.WRITER_IMAGE_MODEL || "gemini-3.1-flash-image-preview"
const WRITER_OPENROUTER_IMAGE_MODEL = getOpenRouterImageModel()
const WRITER_GEMINI_IMAGE_TIMEOUT_MS = Math.min(
  300_000,
  Math.max(30_000, Number.parseInt(process.env.WRITER_GEMINI_IMAGE_TIMEOUT_MS || "90000", 10) || 90_000),
)
const WRITER_PROMPT_DIVERSITY_MAX_ATTEMPTS = Math.max(
  1,
  Number.parseInt(process.env.WRITER_PROMPT_DIVERSITY_MAX_ATTEMPTS || "3", 10) || 3,
)
const WRITER_PROMPT_SIMILARITY_MAX = Math.max(
  0,
  Math.min(1, Number.parseFloat(process.env.WRITER_PROMPT_SIMILARITY_MAX || "0.82") || 0.82),
)
const WRITER_ENFORCE_PROMPT_DIVERSITY = process.env.WRITER_ENFORCE_PROMPT_DIVERSITY !== "false"
type WriterImageProvider = "aiberm" | "gemini" | "openrouter"
type WriterPlannedAsset = ReturnType<typeof buildPendingWriterAssets>[number]
type WriterGeneratedAsset = WriterPlannedAsset & {
  url: string
  status: "ready" | "failed"
  provider: "aiberm" | "gemini" | "openrouter" | "error"
  storageKey?: string
  contentType?: string
  error?: string
}

function buildWriterImageProviderPlan() {
  const plan: WriterImageProvider[] = []
  if (hasAibermApiKey()) {
    plan.push("aiberm")
  }
  if (hasOpenRouterApiKey()) {
    plan.push("openrouter")
  }
  if (GOOGLE_IMAGE_API_KEY) {
    plan.push("gemini")
  }
  return plan
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

function extractInlineImageData(parts: Array<{ inlineData?: { mimeType?: string; data?: string } }> | undefined) {
  if (!Array.isArray(parts)) return ""

  for (const part of parts) {
    const mimeType = typeof part?.inlineData?.mimeType === "string" ? part.inlineData.mimeType : ""
    const data = typeof part?.inlineData?.data === "string" ? part.inlineData.data : ""
    if (mimeType.startsWith("image/") && data) {
      return `data:${mimeType};base64,${data}`
    }
  }

  return ""
}

async function generateGeminiImage(prompt: string, aspectRatio: string) {
  if (shouldUseWriterE2EFixtures()) {
    return createFixtureImageDataUrl(prompt, aspectRatio)
  }

  if (!GOOGLE_IMAGE_API_KEY) {
    throw new Error("google_image_api_key_missing")
  }

  const response = await writerRequestJson<{
    error?: { message?: string }
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>
  }>(
    `https://generativelanguage.googleapis.com/v1beta/models/${WRITER_GEMINI_IMAGE_MODEL}:generateContent?key=${encodeURIComponent(
      GOOGLE_IMAGE_API_KEY,
    )}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          imageConfig: {
            aspectRatio,
            imageSize: "1K",
          },
          thinkingConfig: {
            thinkingLevel: "MINIMAL",
          },
        },
        tools: [
          {
            googleSearch: {
              searchTypes: {
                webSearch: {},
              },
            },
          },
        ],
      }),
    },
    { attempts: 4, timeoutMs: WRITER_GEMINI_IMAGE_TIMEOUT_MS },
  )

  if (!response.ok) {
    throw new Error(response.data?.error?.message || response.text || "google_image_request_failed")
  }

  if (response.data?.error?.message) {
    throw new Error(response.data.error.message)
  }

  const dataUrl = extractInlineImageData(response.data?.candidates?.[0]?.content?.parts)
  if (!dataUrl) {
    throw new Error("google_image_missing")
  }

  return dataUrl
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
      provider: "gemini" as const,
      model: WRITER_GEMINI_IMAGE_MODEL,
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
      aiberm: async () => ({
        dataUrl: await generateImageWithAiberm(prompt, WRITER_AIBERM_IMAGE_MODEL, aspectRatio),
        model: WRITER_AIBERM_IMAGE_MODEL,
      }),
      gemini: async () => ({
        dataUrl: await generateGeminiImage(prompt, aspectRatio),
        model: WRITER_GEMINI_IMAGE_MODEL,
      }),
      openrouter: async () => ({
        dataUrl: await generateImageWithOpenRouter(prompt, WRITER_OPENROUTER_IMAGE_MODEL, aspectRatio),
        model: WRITER_OPENROUTER_IMAGE_MODEL,
      }),
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
    provider: provider as "aiberm" | "gemini" | "openrouter",
  }
}

function getPreferredWriterImageProvider() {
  const plan = buildWriterImageProviderPlan()
  if (plan.includes("aiberm")) return "aiberm" as const
  if (plan.includes("gemini")) return "gemini" as const
  return "openrouter" as const
}

function getPreferredWriterImageModel() {
  return getWriterImageModelForProvider(getPreferredWriterImageProvider())
}

function getWriterImageModelForProvider(provider: "aiberm" | "gemini" | "openrouter") {
  if (provider === "aiberm") return WRITER_AIBERM_IMAGE_MODEL
  if (provider === "gemini") return WRITER_GEMINI_IMAGE_MODEL
  return WRITER_OPENROUTER_IMAGE_MODEL
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
    status: "ready" | "failed"
    url: string
    provider: "aiberm" | "gemini" | "openrouter" | "error"
  }>,
) {
  const successfulAsset = assets.find(
    (asset): asset is { status: "ready"; url: string; provider: "aiberm" | "gemini" | "openrouter" } =>
      asset.status === "ready" &&
      Boolean(asset.url) &&
      (asset.provider === "aiberm" || asset.provider === "gemini" || asset.provider === "openrouter"),
  )

  return successfulAsset?.provider || getPreferredWriterImageProvider()
}

function createWriterAssetSseResponse(
  run: (emit: (event: Record<string, unknown>) => void) => Promise<void>,
) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      try {
        await run(emit)
      } catch (error) {
        emit({
          event: "error",
          error: error instanceof Error ? error.message : "writer_assets_failed",
        })
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        controller.close()
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

    if (conversationId) {
      try {
        await updateWriterConversationMeta(auth.user.id, conversationId, {
          status: "image_generating",
          imagesRequested: true,
        })
      } catch (dbError) {
        console.warn("writer.assets.db_update_generating_failed", { conversationId, error: dbError instanceof Error ? dbError.message : String(dbError) })
      }
    }

    if (baseProviderPlan.length === 0) {
      const errorMessage = "AIBERM_API_KEY, GOOGLE_AI_API_KEY, or OPENROUTER_API_KEY is required for writer image generation"
      const failedAssets = ensureWriterAssetOrder(markWriterAssetsFailed(plannedAssets, errorMessage), platform, mode)
      if (conversationId) {
        try {
          await updateWriterConversationMeta(auth.user.id, conversationId, {
            status: "failed",
            imagesRequested: true,
          })
        } catch (dbError) { console.warn("writer.assets.db_update_failed", dbError instanceof Error ? dbError.message : String(dbError)) }
      }
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
      if (conversationId) {
        try {
          await updateWriterConversationMeta(auth.user.id, conversationId, {
            status: "failed",
            imagesRequested: true,
          })
        } catch (dbError) { console.warn("writer.assets.db_update_failed", dbError instanceof Error ? dbError.message : String(dbError)) }
      }
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

        if (conversationId) {
          try {
            await updateWriterConversationMeta(auth.user.id, conversationId, {
              status: successCount > 0 ? "ready" : "failed",
              imagesRequested: true,
            })
          } catch (dbError) {
            console.warn("writer.assets.db_update_after_stream_failed", {
              conversationId,
              error: dbError instanceof Error ? dbError.message : String(dbError),
            })
          }
        }

        emit({
          event: "done",
          ok: successCount > 0,
          ...(successCount > 0 ? {} : { error: "writer_assets_failed" }),
          data: donePayload,
        })
      })
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
      if (conversationId) {
        try {
          await updateWriterConversationMeta(auth.user.id, conversationId, {
            status: "failed",
            imagesRequested: true,
          })
        } catch (dbError) {
          console.warn("writer.assets.db_update_failed", dbError instanceof Error ? dbError.message : String(dbError))
        }
      }

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

    if (conversationId) {
      try {
        await updateWriterConversationMeta(auth.user.id, conversationId, {
          status: "ready",
          imagesRequested: true,
        })
      } catch (dbError) {
        console.warn("writer.assets.db_update_ready_failed", {
          conversationId,
          error: dbError instanceof Error ? dbError.message : String(dbError),
        })
      }
    }

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
