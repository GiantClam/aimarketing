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
  return process.env.WRITER_E2E_FIXTURES === "true"
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
    { attempts: 4, timeoutMs: 180_000 },
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

async function generateWriterImage(prompt: string, aspectRatio: string) {
  if (shouldUseWriterE2EFixtures()) {
    return {
      dataUrl: createFixtureImageDataUrl(prompt, aspectRatio),
      provider: "gemini" as const,
      model: WRITER_GEMINI_IMAGE_MODEL,
    }
  }

  const providerPlan: ImageGenerationProvider[] = []
  if (hasAibermApiKey()) {
    providerPlan.push("aiberm")
  }
  if (hasOpenRouterApiKey()) {
    providerPlan.push("openrouter")
  }
  if (GOOGLE_IMAGE_API_KEY) {
    providerPlan.push("gemini")
  }
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
    },
  })

  return {
    ...result,
    provider: provider as "aiberm" | "gemini" | "openrouter",
  }
}

function getPreferredWriterImageProvider() {
  if (hasAibermApiKey()) return "aiberm" as const
  if (GOOGLE_IMAGE_API_KEY) return "gemini" as const
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

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }

    const body = await request.json()
    const markdown = typeof body?.markdown === "string" ? body.markdown : ""
    const platform = normalizeWriterPlatform(body?.platform)
    const mode = normalizeWriterMode(platform, body?.mode)
    const conversationId = typeof body?.conversationId === "string" ? body.conversationId : null
    const plannedAssets = buildPendingWriterAssets(markdown, platform, mode)

    if (conversationId) {
      await updateWriterConversationMeta(auth.user.id, conversationId, {
        status: "image_generating",
        imagesRequested: true,
      })
    }

    if (!hasAibermApiKey() && !GOOGLE_IMAGE_API_KEY && !hasOpenRouterApiKey()) {
      if (conversationId) {
        await updateWriterConversationMeta(auth.user.id, conversationId, {
          status: "failed",
          imagesRequested: true,
        })
      }
      return NextResponse.json(
        {
          data: {
            provider: getPreferredWriterImageProvider(),
            model: getPreferredWriterImageModel(),
            assets: ensureWriterAssetOrder(
              markWriterAssetsFailed(
                plannedAssets,
                "AIBERM_API_KEY, GOOGLE_AI_API_KEY, or OPENROUTER_API_KEY is required for writer image generation",
              ),
              platform,
              mode,
            ),
          },
          error: "AIBERM_API_KEY, GOOGLE_AI_API_KEY, or OPENROUTER_API_KEY is required for writer image generation",
        },
        { status: 503 },
      )
    }

    if (!isWriterR2Available()) {
      if (conversationId) {
        await updateWriterConversationMeta(auth.user.id, conversationId, {
          status: "failed",
          imagesRequested: true,
        })
      }
      return NextResponse.json(
        {
          data: {
            provider: getPreferredWriterImageProvider(),
            model: getPreferredWriterImageModel(),
            assets: ensureWriterAssetOrder(markWriterAssetsFailed(plannedAssets, "writer_r2_config_missing"), platform, mode),
          },
          error: "writer_r2_config_missing",
        },
        { status: 503 },
      )
    }

    const assets = [] as Array<(typeof plannedAssets)[number] & {
      url: string
      status: "ready" | "failed"
      provider: "aiberm" | "gemini" | "openrouter" | "error"
      storageKey?: string
      contentType?: string
      error?: string
    }>

    for (const asset of plannedAssets) {
      try {
        const generated = await generateWriterImage(asset.prompt, WRITER_PLATFORM_CONFIG[platform].imageAspectRatio)
        const uploaded = await uploadWriterImageToR2({
          userId: auth.user.id,
          conversationId,
          assetId: asset.id,
          dataUrl: generated.dataUrl,
        })

        assets.push({
          ...asset,
          url: uploaded.url,
          storageKey: uploaded.storageKey,
          contentType: uploaded.contentType,
          status: "ready",
          provider: generated.provider,
        })
      } catch (error: any) {
        console.warn("writer.assets.asset_failed", {
          assetId: asset.id,
          message: error?.message || "writer_asset_failed",
          cause:
            error?.cause && typeof error.cause === "object"
              ? {
                message: "message" in error.cause ? error.cause.message : undefined,
                code: "code" in error.cause ? error.cause.code : undefined,
              }
              : undefined,
        })

        assets.push({
          ...asset,
          url: "",
          status: "failed",
          provider: "error",
          error: error?.message || "writer_asset_failed",
        })
      }
    }

    const successCount = assets.filter((asset) => asset.status === "ready" && asset.url).length
    const resolvedProvider = resolveWriterImageProvider(assets)
    if (successCount === 0) {
      if (conversationId) {
        await updateWriterConversationMeta(auth.user.id, conversationId, {
          status: "failed",
          imagesRequested: true,
        })
      }
      return NextResponse.json(
        {
          data: {
            provider: resolvedProvider,
            model: getWriterImageModelForProvider(resolvedProvider),
            assets: ensureWriterAssetOrder(assets, platform, mode),
          },
          error: "writer_assets_failed",
        },
        { status: 200 },
      )
    }

    if (conversationId) {
      await updateWriterConversationMeta(auth.user.id, conversationId, {
        status: "ready",
        imagesRequested: true,
      })
    }

    return NextResponse.json({
      data: {
        provider: resolvedProvider,
        model: getWriterImageModelForProvider(resolvedProvider),
        assets: ensureWriterAssetOrder(assets, platform, mode),
      },
    })
  } catch (error: any) {
    console.error("writer.assets.error", error)
    return NextResponse.json({ error: error.message || "writer_assets_failed" }, { status: 502 })
  }
}
