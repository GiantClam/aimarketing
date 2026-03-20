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
        ["usage_preset", "usage_label", "orientation", "resolution", "size_preset", "goal", "subject", "style", "composition", "constraints"].some(
          (key) => typeof brief[key] === "string" && brief[key].trim(),
        ) ||
        Boolean(brief?.ratio_confirmed),
    )
    if (!prompt.trim() && !hasBrief) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 })
    }

    const { sessionId } = await ensureImageAssistantSessionForTask({
      userId: auth.user.id,
      enterpriseId: auth.user.enterpriseId,
      sessionId: typeof body?.sessionId === "string" ? body.sessionId : null,
      title: prompt.trim() || (typeof brief?.goal === "string" ? brief.goal : "image design"),
    })
    const task = await enqueueAssistantTask({
      userId: auth.user.id,
      workflowName: "image_turn_generate",
      payload: {
        kind: "image_turn",
        userId: auth.user.id,
        enterpriseId: auth.user.enterpriseId,
        requestIp: getRequestIp(req),
        sessionId,
        prompt,
        brief,
        taskType: "generate",
        referenceAssetIds: Array.isArray(body?.referenceAssetIds) ? body.referenceAssetIds : [],
        candidateCount: Number.isFinite(body?.candidateCount) ? Number(body.candidateCount) : 1,
        sizePreset: typeof body?.sizePreset === "string" ? body.sizePreset : null,
        resolution: typeof body?.resolution === "string" ? body.resolution : null,
        parentVersionId: typeof body?.parentVersionId === "string" ? body.parentVersionId : null,
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
    console.error("image-assistant.generate.error", error)
    return NextResponse.json({ error: error.message || "generate_failed" }, { status: 500 })
  }
}
