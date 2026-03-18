import { NextRequest, NextResponse } from "next/server"

import { enqueueAssistantTask, ensureImageAssistantSessionForTask } from "@/lib/assistant-async"
import { requireSessionUser } from "@/lib/auth/guards"
import { createRateLimitResponse, getRequestIp } from "@/lib/server/rate-limit"

export const runtime = "nodejs"
export const maxDuration = 300

const IMAGE_ASSISTANT_REFERENCE_NOT_FOUND_ERRORS = new Set([
  "image_assistant_session_not_found",
  "image_assistant_version_not_found",
  "image_assistant_asset_not_found",
  "image_assistant_canvas_document_not_found",
])

function buildSelectionPrompt(input: {
  prompt: string
  annotationNotes?: string | null
  hasMaskAsset?: boolean
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
  const annotationNotes = typeof input.annotationNotes === "string" ? input.annotationNotes.trim() : ""
  const hasMaskAsset = Boolean(input.hasMaskAsset)
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
    return [prompt, annotationNotes].filter(Boolean).join("\n\n")
  }

  const right = Math.min(canvasWidth, bounds.x + bounds.width)
  const bottom = Math.min(canvasHeight, bounds.y + bounds.height)
  const leftPct = ((bounds.x / canvasWidth) * 100).toFixed(1)
  const topPct = ((bounds.y / canvasHeight) * 100).toFixed(1)
  const widthPct = ((bounds.width / canvasWidth) * 100).toFixed(1)
  const heightPct = ((bounds.height / canvasHeight) * 100).toFixed(1)

  return [
    prompt,
    annotationNotes ? `Canvas annotation notes:\n${annotationNotes}` : null,
    hasMaskAsset ? "A binary mask reference is attached. Treat the white mask area as the primary editable region." : null,
    "",
    "Apply the edit primarily inside the selected rectangular region only.",
    "Keep everything outside the selected region as unchanged as possible.",
    `Selected region pixels: left=${Math.round(bounds.x)}, top=${Math.round(bounds.y)}, right=${Math.round(right)}, bottom=${Math.round(bottom)}.`,
    `Selected region percent of canvas: left=${leftPct}%, top=${topPct}%, width=${widthPct}%, height=${heightPct}%.`,
  ]
    .filter(Boolean)
    .join("\n")
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser(req, "image_design_generation")
    if ("response" in auth) {
      return auth.response
    }

    const body = await req.json().catch(() => ({}))
    const prompt = typeof body?.prompt === "string" ? body.prompt : ""
    const brief = body?.brief && typeof body.brief === "object" ? body.brief : null
    const hasBrief = Boolean(
      brief &&
        ["goal", "subject", "style", "composition", "constraints"].some(
          (key) => typeof brief[key] === "string" && brief[key].trim(),
        ),
    )
    if (!prompt.trim() && !hasBrief) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 })
    }
    const selectionPrompt = buildSelectionPrompt({
      prompt: prompt || (typeof brief?.goal === "string" ? brief.goal : ""),
      annotationNotes: typeof body?.annotationNotes === "string" ? body.annotationNotes : null,
      hasMaskAsset: typeof body?.maskAssetId === "string" && body.maskAssetId.trim().length > 0,
      selectionBounds: body?.selectionBounds,
      canvasWidth: typeof body?.canvasWidth === "number" ? body.canvasWidth : Number(body?.canvasWidth || 0),
      canvasHeight: typeof body?.canvasHeight === "number" ? body.canvasHeight : Number(body?.canvasHeight || 0),
    })

    const referenceAssetIds = Array.from(new Set([
      ...(Array.isArray(body?.referenceAssetIds) ? body.referenceAssetIds : []),
      ...(typeof body?.snapshotAssetId === "string" ? [body.snapshotAssetId] : []),
      ...(typeof body?.maskAssetId === "string" ? [body.maskAssetId] : []),
    ]))

    console.info("image-assistant.canvas-snapshot-edit.request", {
      sessionId: typeof body?.sessionId === "string" ? body.sessionId : null,
      snapshotAssetId: typeof body?.snapshotAssetId === "string" ? body.snapshotAssetId : null,
      hasMaskAsset: typeof body?.maskAssetId === "string" && body.maskAssetId.trim().length > 0,
      selectionBounds: body?.selectionBounds || null,
      canvasWidth: typeof body?.canvasWidth === "number" ? body.canvasWidth : Number(body?.canvasWidth || 0),
      canvasHeight: typeof body?.canvasHeight === "number" ? body.canvasHeight : Number(body?.canvasHeight || 0),
      referenceAssetCount: referenceAssetIds.length,
    })

    const { sessionId } = await ensureImageAssistantSessionForTask({
      userId: auth.user.id,
      enterpriseId: auth.user.enterpriseId,
      sessionId: typeof body?.sessionId === "string" ? body.sessionId : null,
      title: prompt.trim() || (typeof brief?.goal === "string" ? brief.goal : "canvas edit"),
    })
    const task = await enqueueAssistantTask({
      userId: auth.user.id,
      workflowName: "image_turn_canvas_edit",
      payload: {
        kind: "image_turn",
        userId: auth.user.id,
        enterpriseId: auth.user.enterpriseId,
        requestIp: getRequestIp(req),
        sessionId,
        prompt,
        brief,
        taskType: "mask_edit",
        referenceAssetIds,
        candidateCount: Number.parseInt(String(body?.candidateCount || "1"), 10),
        sizePreset: typeof body?.sizePreset === "string" ? body.sizePreset : null,
        resolution: typeof body?.resolution === "string" ? body.resolution : null,
        parentVersionId: typeof body?.parentVersionId === "string" ? body.parentVersionId : null,
        extraInstructions: selectionPrompt && selectionPrompt !== prompt ? selectionPrompt : null,
        snapshotAssetId: typeof body?.snapshotAssetId === "string" ? body.snapshotAssetId : null,
        maskAssetId: typeof body?.maskAssetId === "string" ? body.maskAssetId : null,
        versionMeta: null,
      },
    })

    return NextResponse.json({ data: { accepted: true, task_id: String(task.id), session_id: sessionId } })
  } catch (error: any) {
    if (error?.message === "rate_limited") {
      return createRateLimitResponse("Too many image assistant requests", {
        ok: false,
        retryAfterSeconds: error.retryAfterSeconds || 60,
        remaining: 0,
        resetAt: Date.now() + (error.retryAfterSeconds || 60) * 1000,
      })
    }
    if (error?.message === "image_assistant_resource_exhausted") {
      return NextResponse.json({ error: error.message }, { status: 429 })
    }
    if (IMAGE_ASSISTANT_REFERENCE_NOT_FOUND_ERRORS.has(error?.message)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    console.error("image-assistant.canvas-snapshot-edit.error", error)
    return NextResponse.json({ error: error.message || "canvas_snapshot_edit_failed" }, { status: 500 })
  }
}
