import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { buildWriterAssetBlueprints, ensureWriterAssetOrder } from "@/lib/writer/assets"
import { normalizeWriterPlatform } from "@/lib/writer/config"
import { writerRequestJson } from "@/lib/writer/network"

export const runtime = "nodejs"
export const maxDuration = 60

const OPENROUTER_API_BASE = (process.env.OPENROUTER_API_BASE || process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "")
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY || ""
const OPENROUTER_REFERER =
  process.env.OPENROUTER_REFERER ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  "https://www.aimarketingsite.com"
const OPENROUTER_TITLE = process.env.OPENROUTER_TITLE || "AI Marketing Writer"
const WRITER_IMAGE_MODEL = process.env.WRITER_IMAGE_MODEL || "google/gemini-2.5-flash-image"

type OpenRouterImage = {
  imageUrl?: {
    url?: string
  }
  image_url?: {
    url?: string
  }
  url?: string
}

function extractOpenRouterImageData(response: any) {
  const images = (response?.choices?.[0]?.message?.images || []) as OpenRouterImage[]
  for (const image of images) {
    const url = image?.imageUrl?.url || image?.image_url?.url || image?.url || ""
    if (typeof url === "string" && url.startsWith("data:image")) {
      return url
    }
  }
  return null
}

function getAspectRatio(platform: string) {
  if (platform === "xiaohongshu") {
    return "3:4"
  }

  return "16:9"
}

async function generateOpenRouterImage(prompt: string, model: string, platform: string) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("openrouter_api_key_missing")
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
  }

  if (OPENROUTER_API_BASE.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = OPENROUTER_REFERER
    headers["X-Title"] = OPENROUTER_TITLE
  }

  const response = await writerRequestJson(
    `${OPENROUTER_API_BASE}/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        modalities: ["text", "image"],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Create an image of: ${prompt}`,
              },
            ],
          },
        ],
        image_config: {
          aspect_ratio: getAspectRatio(platform),
        },
        stream: false,
      }),
    },
    { attempts: 2, timeoutMs: 120_000 },
  )
  if (!response.ok) {
    const data = response.data as any
    throw new Error(data?.error?.message || `openrouter_image_http_${response.status}`)
  }

  const imageDataUrl = extractOpenRouterImageData(response.data)
  if (!imageDataUrl) {
    throw new Error("openrouter_image_missing")
  }

  return imageDataUrl
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

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY is required for writer image generation" }, { status: 503 })
    }

    const blueprints = buildWriterAssetBlueprints(markdown, platform)

    const assets = await Promise.all(
      blueprints.map(async (asset) => {
        return {
          ...asset,
          dataUrl: await generateOpenRouterImage(asset.prompt, WRITER_IMAGE_MODEL, platform),
          status: "ready" as const,
          provider: "openrouter" as const,
        }
      }),
    )

    return NextResponse.json({
      data: {
        provider: "openrouter",
        model: WRITER_IMAGE_MODEL,
        assets: ensureWriterAssetOrder(assets),
      },
    })
  } catch (error: any) {
    console.error("writer.assets.error", error)
    return NextResponse.json({ error: error.message || "writer_assets_failed" }, { status: 502 })
  }
}
