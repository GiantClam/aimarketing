import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { createRateLimitResponse, getRequestIp } from "@/lib/server/rate-limit"
import { runImageAssistantJob } from "@/lib/image-assistant/service"

export const runtime = "nodejs"
export const maxDuration = 300

function buildSelectionPrompt(input: {
  prompt: string
  selectionBounds?: {
    x?: number
    y?: number
    width?: number
    height?: number
  } | null
  canvasWidth?: number | null
  canvasHeight?: number | null
}) {
  const prompt = input.prompt.trim()
  const bounds = input.selectionBounds
  const canvasWidth = Number(input.canvasWidth || 0)
  const canvasHeight = Number(input.canvasHeight || 0)

  if (
    !bounds ||
    typeof bounds.x !== "number" ||
    typeof bounds.y !== "number" ||
    typeof bounds.width !== "number" ||
    typeof bounds.height !== "number" ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    canvasWidth <= 0 ||
    canvasHeight <= 0
  ) {
    return prompt
  }

  const right = Math.min(canvasWidth, bounds.x + bounds.width)
  const bottom = Math.min(canvasHeight, bounds.y + bounds.height)
  const leftPct = ((bounds.x / canvasWidth) * 100).toFixed(1)
  const topPct = ((bounds.y / canvasHeight) * 100).toFixed(1)
  const widthPct = ((bounds.width / canvasWidth) * 100).toFixed(1)
  const heightPct = ((bounds.height / canvasHeight) * 100).toFixed(1)

  return [
    prompt,
    "",
    "Apply the edit primarily inside the selected rectangular region only.",
    "Keep everything outside the selected region as unchanged as possible.",
    `Selected region pixels: left=${Math.round(bounds.x)}, top=${Math.round(bounds.y)}, right=${Math.round(right)}, bottom=${Math.round(bottom)}.`,
    `Selected region percent of canvas: left=${leftPct}%, top=${topPct}%, width=${widthPct}%, height=${heightPct}%.`,
  ].join("\n")
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser(req, "image_design_generation")
    if ("response" in auth) {
      return auth.response
    }

    const body = await req.json().catch(() => ({}))
    const prompt = typeof body?.prompt === "string" ? body.prompt : ""
    if (!prompt.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 })
    }
    const finalPrompt = buildSelectionPrompt({
      prompt,
      selectionBounds: body?.selectionBounds,
      canvasWidth: typeof body?.canvasWidth === "number" ? body.canvasWidth : Number(body?.canvasWidth || 0),
      canvasHeight: typeof body?.canvasHeight === "number" ? body.canvasHeight : Number(body?.canvasHeight || 0),
    })

    const referenceAssetIds = [
      ...(Array.isArray(body?.referenceAssetIds) ? body.referenceAssetIds : []),
      ...(typeof body?.snapshotAssetId === "string" ? [body.snapshotAssetId] : []),
      ...(typeof body?.maskAssetId === "string" ? [body.maskAssetId] : []),
    ]

    const result = await runImageAssistantJob({
      userId: auth.user.id,
      enterpriseId: auth.user.enterpriseId,
      requestIp: getRequestIp(req),
      sessionId: typeof body?.sessionId === "string" ? body.sessionId : null,
      prompt: finalPrompt,
      taskType: "mask_edit",
      referenceAssetIds,
      candidateCount: Number.parseInt(String(body?.candidateCount || "1"), 10),
      sizePreset: typeof body?.sizePreset === "string" ? body.sizePreset : null,
      qualityMode: typeof body?.qualityMode === "string" ? body.qualityMode : null,
      parentVersionId: typeof body?.parentVersionId === "string" ? body.parentVersionId : null,
    })

    return NextResponse.json({ data: result })
  } catch (error: any) {
    if (error?.message === "rate_limited") {
      return createRateLimitResponse("Too many image assistant requests", {
        ok: false,
        retryAfterSeconds: error.retryAfterSeconds || 60,
        remaining: 0,
        resetAt: Date.now() + (error.retryAfterSeconds || 60) * 1000,
      })
    }
    console.error("image-assistant.canvas-snapshot-edit.error", error)
    return NextResponse.json({ error: error.message || "canvas_snapshot_edit_failed" }, { status: 500 })
  }
}
