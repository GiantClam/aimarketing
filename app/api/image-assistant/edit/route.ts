import { NextRequest, NextResponse } from "next/server"

import { enqueueAssistantTask, ensureImageAssistantSessionForTask } from "@/lib/assistant-async"
import { requireSessionUser } from "@/lib/auth/guards"
import { getImageAssistantSessionDetail, listImageAssistantAssets } from "@/lib/image-assistant/repository"
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

async function hasActualEditContext(input: {
  userId: number
  sessionId: string
  referenceAssetIds: string[]
  snapshotAssetId: string | null
  maskAssetId: string | null
}) {
  if (input.snapshotAssetId || input.maskAssetId) {
    return true
  }

  if (!input.referenceAssetIds.length) {
    return false
  }

  const referencedAssets = await listImageAssistantAssets(input.userId, input.sessionId, {
    assetIds: input.referenceAssetIds,
    limit: input.referenceAssetIds.length,
  })
  if (!referencedAssets.length) {
    return false
  }

  const editContextAssetTypes = new Set(["reference", "generated", "canvas_snapshot", "mask"])
  return referencedAssets.some((asset) => editContextAssetTypes.has(asset.asset_type))
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
      title: prompt.trim() || (typeof brief?.goal === "string" ? brief.goal : "image edit"),
    })
    const referenceAssetIds = Array.isArray(body?.referenceAssetIds)
      ? (body.referenceAssetIds as unknown[]).filter((value: unknown): value is string => typeof value === "string")
      : []
    const snapshotAssetId = typeof body?.snapshotAssetId === "string" ? body.snapshotAssetId : null
    const maskAssetId = typeof body?.maskAssetId === "string" ? body.maskAssetId : null
    const shouldKeepEditMode = await hasActualEditContext({
      userId: auth.user.id,
      sessionId,
      referenceAssetIds,
      snapshotAssetId,
      maskAssetId,
    })
    const workflowName = shouldKeepEditMode ? "image_turn_edit" : "image_turn_generate"
    const taskType = shouldKeepEditMode ? "edit" : "generate"

    if (!shouldKeepEditMode) {
      console.info("image-assistant.edit.normalized_to_generate", {
        sessionId,
        referenceAssetCount: referenceAssetIds.length,
      })
    }

    const shouldRunDirectConversationTurn = body?.preferAsync !== true

    if (shouldRunDirectConversationTurn) {
      const directResult = await runImageAssistantConversationTurn({
        userId: auth.user.id,
        enterpriseId: auth.user.enterpriseId,
        requestIp: getRequestIp(req),
        sessionId,
        prompt,
        brief,
        taskType,
        referenceAssetIds,
        candidateCount: Number.parseInt(String(body?.candidateCount || "1"), 10),
        sizePreset: typeof body?.sizePreset === "string" ? body.sizePreset : null,
        resolution: typeof body?.resolution === "string" ? body.resolution : null,
        parentVersionId: typeof body?.parentVersionId === "string" ? body.parentVersionId : null,
        guidedSelection: normalizeGuidedSelection(body?.guidedSelection),
      })

      const directDetailMode = directResult.outcome === "needs_clarification" ? "summary" : "content"
      const directSessionDetail = await getImageAssistantSessionDetail(auth.user.id, sessionId, {
        includeMessages: true,
        includeVersions: directDetailMode !== "summary",
        includeAssets: directDetailMode !== "summary",
        includeCanvas: false,
        messageLimit: directDetailMode === "summary" ? 16 : 12,
        versionLimit: directDetailMode === "summary" ? undefined : 6,
        assetLimit: directDetailMode === "summary" ? undefined : 24,
      })

      return NextResponse.json({
        data: {
          accepted: true,
          direct: true,
          session_id: sessionId,
          outcome: directResult.outcome,
          version_id: directResult.version_id,
          follow_up_message_id: directResult.follow_up_message_id,
          detail_mode: directDetailMode,
          detail_snapshot: directSessionDetail,
        },
      })
    }

    const task = await enqueueAssistantTask({
      userId: auth.user.id,
      workflowName,
      payload: {
        kind: "image_turn",
        userId: auth.user.id,
        enterpriseId: auth.user.enterpriseId,
        requestIp: getRequestIp(req),
        sessionId,
        prompt,
        brief,
        taskType,
        referenceAssetIds,
        candidateCount: Number.parseInt(String(body?.candidateCount || "1"), 10),
        sizePreset: typeof body?.sizePreset === "string" ? body.sizePreset : null,
        resolution: typeof body?.resolution === "string" ? body.resolution : null,
        parentVersionId: typeof body?.parentVersionId === "string" ? body.parentVersionId : null,
        guidedSelection: normalizeGuidedSelection(body?.guidedSelection),
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
    console.error("image-assistant.edit.error", error)
    return NextResponse.json({ error: error.message || "edit_failed" }, { status: 500 })
  }
}
