import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { hasFeatureAccess } from "@/lib/auth/guards"
import {
  executeMiniMaxAudioFeature,
  isMiniMaxAudioConfigured,
  resolveMiniMaxFeatureId,
} from "@/lib/platform/minimax-audio"
import {
  hasRunningHubMediaTarget,
  isRunningHubConfiguredForTarget,
  submitRunningHubTask,
  type RunningHubMediaTarget,
} from "@/lib/platform/runninghub"

export const runtime = "nodejs"

type MediaExecutionFeature = "image_design_generation" | "video_generation"

function normalizeAction(value: string | null) {
  return value?.trim().toLowerCase() || "execute"
}

function resolveMediaExecutionFeature(
  mediaTarget: RunningHubMediaTarget | "ai-music",
  action: string,
): MediaExecutionFeature {
  if (mediaTarget === "ai-image") return "image_design_generation"
  if (mediaTarget === "ai-video") return "video_generation"
  if (mediaTarget === "ai-music") return "video_generation"

  if (
    action === "generate" ||
    action === "generate-image" ||
    action === "edit" ||
    action === "edit-image" ||
    action === "export" ||
    action === "export-image"
  ) {
    return "image_design_generation"
  }

  return "video_generation"
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const targetParam = url.searchParams.get("target")
  const action = normalizeAction(url.searchParams.get("action"))

  if (!targetParam || (!hasRunningHubMediaTarget(targetParam) && targetParam !== "ai-music")) {
    return NextResponse.json({ error: "invalid_media_target" }, { status: 400 })
  }
  const target = targetParam as RunningHubMediaTarget | "ai-music"

  const currentUser = await getSessionUser(request).catch(() => null)
  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  if (!hasFeatureAccess(currentUser, resolveMediaExecutionFeature(target, action))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>

  if (target === "ai-music") {
    if (!isMiniMaxAudioConfigured()) {
      return NextResponse.json({ error: "minimax_not_configured" }, { status: 503 })
    }

    const featureId =
      resolveMiniMaxFeatureId(payload.featureId) ||
      (action === "voice-synthesis"
        ? "voice-synthesis"
        : action === "voice-clone"
          ? "voice-clone"
          : "ai-music")

    const result = await executeMiniMaxAudioFeature({
      currentUser,
      featureId,
      params: payload.params && typeof payload.params === "object" ? (payload.params as Record<string, unknown>) : payload,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      return NextResponse.json({ error: message || "minimax_audio_execute_failed" }, { status: 502 })
    })

    if (result instanceof NextResponse) {
      return result
    }

    return NextResponse.json({
      data: result,
    })
  }

  if (!isRunningHubConfiguredForTarget(target)) {
    return NextResponse.json({ error: "runninghub_not_configured" }, { status: 503 })
  }

  const result = await submitRunningHubTask({
    mediaTarget: target,
    payload: {
      ...payload,
      platformAction: action,
      userId: currentUser.id,
      enterpriseId: currentUser.enterpriseId,
    },
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message || "runninghub_submit_failed" }, { status: 502 })
  })

  if (result instanceof NextResponse) {
    return result
  }

  return NextResponse.json({
    data: result,
  })
}
