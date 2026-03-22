import { NextRequest, NextResponse } from "next/server"

import { enqueueAssistantTask, ensureImageAssistantSessionForTask } from "@/lib/assistant-async"
import { requireSessionUser } from "@/lib/auth/guards"
import { runImageAssistantConversationTurn } from "@/lib/image-assistant/service"
import type { ImageAssistantGuidedSelection } from "@/lib/image-assistant/types"
import { createRateLimitResponse, getRequestIp } from "@/lib/server/rate-limit"

export const runtime = "nodejs"
export const maxDuration = 300

const IMAGE_ASSISTANT_REFERENCE_NOT_FOUND_ERRORS = new Set([
  "image_assistant_session_not_found",
  "image_assistant_version_not_found",
  "image_assistant_asset_not_found",
  "image_assistant_canvas_document_not_found",
])

function normalizeGuidedSelection(input: unknown): ImageAssistantGuidedSelection | null {
  if (!input || typeof input !== "object") return null
  const candidate = input as Record<string, unknown>
  const sourceMessageId =
    typeof candidate.source_message_id === "string" && candidate.source_message_id.trim()
      ? candidate.source_message_id.trim()
      : null
  const questionId =
    typeof candidate.question_id === "string" && candidate.question_id.trim() ? candidate.question_id.trim() : null
  const optionId =
    typeof candidate.option_id === "string" && candidate.option_id.trim() ? candidate.option_id.trim() : null

  if (!sourceMessageId && !questionId && !optionId) {
    return null
  }

  return {
    source_message_id: sourceMessageId,
    question_id: questionId,
    option_id: optionId,
  }
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
    const guidedSelection = normalizeGuidedSelection(body?.guidedSelection)
    const shouldRunDirectBriefTurn = Boolean(guidedSelection && guidedSelection.question_id && guidedSelection.question_id !== "resolution")
    const shouldRunDirectConversationTurn = shouldRunDirectBriefTurn || !guidedSelection

    if (shouldRunDirectConversationTurn) {
      const directResult = await runImageAssistantConversationTurn({
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
        guidedSelection,
      })

      return NextResponse.json({
        data: {
          accepted: true,
          direct: true,
          session_id: sessionId,
          outcome: directResult.outcome,
          version_id: directResult.version_id,
          follow_up_message_id: directResult.follow_up_message_id,
        },
      })
    }

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
        guidedSelection,
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
