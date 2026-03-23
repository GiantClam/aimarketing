import { NextRequest, NextResponse } from "next/server"

import { enqueueAssistantTask, ensureImageAssistantSessionForTask } from "@/lib/assistant-async"
import { requireSessionUser } from "@/lib/auth/guards"
import { looksLikeReferenceEditIntent } from "@/lib/image-assistant/intent"
import { getImageAssistantSessionDetail, listImageAssistantVersions } from "@/lib/image-assistant/repository"
import { runImageAssistantConversationTurn } from "@/lib/image-assistant/service"
import { getFallbackReferenceAssetIdsFromVersions, shouldUseImplicitEditMode } from "@/lib/image-assistant/turn-routing"
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

function normalizeReferenceAssetIds(input: unknown) {
  if (!Array.isArray(input)) return []
  return input.filter((value): value is string => typeof value === "string")
}

async function resolveImplicitReferenceAssetIds(input: {
  userId: number
  sessionId: string
  selectedVersionId?: string | null
  currentVersionId?: string | null
}) {
  const versions = await listImageAssistantVersions(input.userId, input.sessionId, { limit: 12 })
  return getFallbackReferenceAssetIdsFromVersions({
    versions,
    selectedVersionId: input.selectedVersionId || null,
    currentVersionId: input.currentVersionId || null,
  })
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

    const { sessionId, session } = await ensureImageAssistantSessionForTask({
      userId: auth.user.id,
      enterpriseId: auth.user.enterpriseId,
      sessionId: typeof body?.sessionId === "string" ? body.sessionId : null,
      title: prompt.trim() || (typeof brief?.goal === "string" ? brief.goal : "image design"),
    })
    const guidedSelection = normalizeGuidedSelection(body?.guidedSelection)
    const parentVersionId = typeof body?.parentVersionId === "string" ? body.parentVersionId : null
    const explicitReferenceAssetIds = normalizeReferenceAssetIds(body?.referenceAssetIds)
    const isLikelyReferenceEditPrompt = looksLikeReferenceEditIntent({
      prompt,
      taskType: null,
      referenceCount: explicitReferenceAssetIds.length || undefined,
    })
    const implicitReferenceAssetIds =
      !explicitReferenceAssetIds.length && isLikelyReferenceEditPrompt
        ? await resolveImplicitReferenceAssetIds({
            userId: auth.user.id,
            sessionId,
            selectedVersionId: parentVersionId,
            currentVersionId: session.current_version_id || null,
          })
        : []
    const shouldPromoteToEdit = shouldUseImplicitEditMode({
      requestedKind: "generate",
      prompt,
      guidedSelection,
      explicitReferenceCount: explicitReferenceAssetIds.length,
      fallbackReferenceCount: implicitReferenceAssetIds.length,
    })
    const effectiveTaskType = shouldPromoteToEdit ? "edit" : "generate"
    const effectiveReferenceAssetIds = (explicitReferenceAssetIds.length
      ? explicitReferenceAssetIds
      : implicitReferenceAssetIds) as string[]
    const effectiveWorkflowName = shouldPromoteToEdit ? "image_turn_edit" : "image_turn_generate"

    if (shouldPromoteToEdit) {
      console.info("image-assistant.generate.promoted_to_edit", {
        sessionId,
        parentVersionId,
        currentVersionId: session.current_version_id || null,
        referenceAssetCount: effectiveReferenceAssetIds.length,
      })
    }

    // Prefer direct execution by default for low-latency UX.
    // Async mode remains as an explicit fallback for long-running scenarios.
    const shouldRunDirectConversationTurn = body?.preferAsync !== true

    if (shouldRunDirectConversationTurn) {
      const directResult = await runImageAssistantConversationTurn({
        userId: auth.user.id,
        enterpriseId: auth.user.enterpriseId,
        requestIp: getRequestIp(req),
        sessionId,
        prompt,
        brief,
        taskType: effectiveTaskType,
        referenceAssetIds: effectiveReferenceAssetIds,
        candidateCount: Number.isFinite(body?.candidateCount) ? Number(body.candidateCount) : 1,
        sizePreset: typeof body?.sizePreset === "string" ? body.sizePreset : null,
        resolution: typeof body?.resolution === "string" ? body.resolution : null,
        parentVersionId,
        guidedSelection,
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
      workflowName: effectiveWorkflowName,
      payload: {
        kind: "image_turn",
        userId: auth.user.id,
        enterpriseId: auth.user.enterpriseId,
        requestIp: getRequestIp(req),
        sessionId,
        prompt,
        brief,
        taskType: effectiveTaskType,
        referenceAssetIds: effectiveReferenceAssetIds,
        candidateCount: Number.isFinite(body?.candidateCount) ? Number(body.candidateCount) : 1,
        sizePreset: typeof body?.sizePreset === "string" ? body.sizePreset : null,
        resolution: typeof body?.resolution === "string" ? body.resolution : null,
        parentVersionId,
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
