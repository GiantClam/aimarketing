import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { buildPendingWriterAssets, ensureWriterAssetOrder, markWriterAssetsFailed } from "@/lib/writer/assets"
import { normalizeWriterMode, normalizeWriterPlatform } from "@/lib/writer/config"
import { writerRequestJson } from "@/lib/writer/network"
import { isWriterR2Available, uploadWriterImageToR2 } from "@/lib/writer/r2"

export const runtime = "nodejs"
export const maxDuration = 300

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ""
const OPENROUTER_API_BASE = (process.env.OPENROUTER_API_BASE || "https://openrouter.ai/api/v1").replace(/\/$/, "")
const OPENROUTER_REFERER = process.env.OPENROUTER_REFERER || "https://www.aimarketingsite.com"
const OPENROUTER_TITLE = process.env.OPENROUTER_TITLE || "AI Marketing Writer"
const WRITER_IMAGE_MODEL = process.env.WRITER_IMAGE_MODEL || "google/gemini-2.5-flash-image"
const WRITER_IMAGE_FALLBACK_MODEL = process.env.WRITER_IMAGE_FALLBACK_MODEL || "google/gemini-3-pro-image-preview"

function buildOpenRouterHeaders() {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
  }

  if (OPENROUTER_API_BASE.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = OPENROUTER_REFERER
    headers["X-Title"] = OPENROUTER_TITLE
  }

  return headers
}

function extractDataUrl(imageLike: unknown) {
  if (!imageLike) {
    return ""
  }

  if (typeof imageLike === "string") {
    return imageLike.startsWith("data:image") ? imageLike : ""
  }

  if (typeof imageLike === "object") {
    const imageUrl = (imageLike as { image_url?: { url?: string } }).image_url?.url || ""
    return imageUrl.startsWith("data:image") ? imageUrl : ""
  }

  return ""
}

function extractOpenRouterImageData(payload: any) {
  const choices = Array.isArray(payload?.choices) ? payload.choices : []
  for (const choice of choices) {
    const message = choice?.message
    const images = Array.isArray(message?.images) ? message.images : []
    for (const image of images) {
      const dataUrl = extractDataUrl(image)
      if (dataUrl) {
        return dataUrl
      }
    }
  }

  return ""
}

async function generateOpenRouterImage(prompt: string, model = WRITER_IMAGE_MODEL) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("openrouter_api_key_missing")
  }

  const response = await writerRequestJson(
    `${OPENROUTER_API_BASE}/chat/completions`,
    {
      method: "POST",
      headers: buildOpenRouterHeaders(),
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: `Create an image of: ${prompt}` }],
      }),
    },
    { attempts: 3, timeoutMs: 120_000 },
  )

  if (!response.ok) {
    const data = response.data as any
    throw new Error(data?.error?.message || `openrouter_image_http_${response.status}`)
  }

  const dataUrl = extractOpenRouterImageData(response.data)
  if (!dataUrl) {
    const content = (response.data?.choices?.[0]?.message?.content as string | null) || ""
    throw new Error(content || "openrouter_image_missing")
  }

  return dataUrl
}

async function generateImageWithRetry(prompt: string) {
  try {
    return await generateOpenRouterImage(prompt, WRITER_IMAGE_MODEL)
  } catch (primaryError) {
    if (!WRITER_IMAGE_FALLBACK_MODEL || WRITER_IMAGE_FALLBACK_MODEL === WRITER_IMAGE_MODEL) {
      throw primaryError
    }
    return await generateOpenRouterImage(prompt, WRITER_IMAGE_FALLBACK_MODEL)
  }
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

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        {
          data: {
            provider: "nanobanana",
            model: WRITER_IMAGE_MODEL,
            assets: ensureWriterAssetOrder(markWriterAssetsFailed(plannedAssets, "OPENROUTER_API_KEY is required for writer image generation"), platform, mode),
          },
          error: "OPENROUTER_API_KEY is required for writer image generation",
        },
        { status: 503 },
      )
    }

    if (!isWriterR2Available()) {
      return NextResponse.json(
        {
          data: {
            provider: "nanobanana",
            model: WRITER_IMAGE_MODEL,
            assets: ensureWriterAssetOrder(markWriterAssetsFailed(plannedAssets, "writer_r2_config_missing"), platform, mode),
          },
          error: "writer_r2_config_missing",
        },
        { status: 503 },
      )
    }

    const assets = await Promise.all(
      plannedAssets.map(async (asset) => {
        try {
          const dataUrl = await generateImageWithRetry(asset.prompt)
          const uploaded = await uploadWriterImageToR2({
            userId: auth.user.id,
            conversationId,
            assetId: asset.id,
            dataUrl,
          })
          return {
            ...asset,
            url: uploaded.url,
            storageKey: uploaded.storageKey,
            contentType: uploaded.contentType,
            status: "ready" as const,
            provider: "nanobanana" as const,
          }
        } catch (error: any) {
          return {
            ...asset,
            url: "",
            status: "failed" as const,
            provider: "error" as const,
            error: error?.message || "writer_asset_failed",
          }
        }
      }),
    )

    const successCount = assets.filter((asset) => asset.status === "ready" && asset.url).length
    if (successCount === 0) {
      return NextResponse.json(
        {
          data: {
            provider: "nanobanana",
            model: WRITER_IMAGE_MODEL,
            assets: ensureWriterAssetOrder(assets, platform, mode),
          },
          error: "writer_assets_failed",
        },
        { status: 200 },
      )
    }

    return NextResponse.json({
      data: {
        provider: "nanobanana",
        model: WRITER_IMAGE_MODEL,
        assets: ensureWriterAssetOrder(assets, platform, mode),
      },
    })
  } catch (error: any) {
    console.error("writer.assets.error", error)
    return NextResponse.json({ error: error.message || "writer_assets_failed" }, { status: 502 })
  }
}
