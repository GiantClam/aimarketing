import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { buildWriterAssetBlueprints, ensureWriterAssetOrder } from "@/lib/writer/assets"
import { normalizeWriterPlatform } from "@/lib/writer/config"
import { writerRequestJson } from "@/lib/writer/network"

export const runtime = "nodejs"
export const maxDuration = 60

const GOOGLE_AI_API_KEY =
  process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""
const WRITER_IMAGE_MODEL = process.env.WRITER_IMAGE_MODEL || "gemini-3.1-flash-image-preview"

function getAspectRatio(platform: string) {
  if (platform === "xiaohongshu") {
    return "3:4"
  }

  return "16:9"
}

function extractGeminiImageData(response: any) {
  const candidates = Array.isArray(response?.candidates) ? response.candidates : []
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
    for (const part of parts) {
      const inlineData = part?.inlineData || part?.inline_data
      const mimeType = inlineData?.mimeType || inlineData?.mime_type || "image/png"
      const data = inlineData?.data || ""
      if (typeof data === "string" && data.trim()) {
        return `data:${mimeType};base64,${data}`
      }
    }
  }
  return null
}

async function generateGeminiImage(prompt: string, model: string, platform: string) {
  if (!GOOGLE_AI_API_KEY) {
    throw new Error("google_ai_api_key_missing")
  }

  const response = await writerRequestJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      GOOGLE_AI_API_KEY,
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
            parts: [
              {
                text: `${prompt}。输出适合 ${getAspectRatio(platform)} 比例的图片。`,
              },
            ],
          },
        ],
      }),
    },
    { attempts: 2, timeoutMs: 120_000 },
  )
  if (!response.ok) {
    const data = response.data as any
    throw new Error(data?.error?.message || `gemini_image_http_${response.status}`)
  }

  const imageDataUrl = extractGeminiImageData(response.data)
  if (!imageDataUrl) {
    throw new Error("gemini_image_missing")
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

    if (!GOOGLE_AI_API_KEY) {
      return NextResponse.json({ error: "GOOGLE_AI_API_KEY is required for writer image generation" }, { status: 503 })
    }

    const blueprints = buildWriterAssetBlueprints(markdown, platform)
    const assets = []
    for (const asset of blueprints) {
      assets.push({
        ...asset,
        dataUrl: await generateGeminiImage(asset.prompt, WRITER_IMAGE_MODEL, platform),
        status: "ready" as const,
        provider: "nanobanana" as const,
      })
    }

    return NextResponse.json({
      data: {
        provider: "nanobanana",
        model: WRITER_IMAGE_MODEL,
        assets: ensureWriterAssetOrder(assets),
      },
    })
  } catch (error: any) {
    console.error("writer.assets.error", error)
    return NextResponse.json({ error: error.message || "writer_assets_failed" }, { status: 502 })
  }
}
