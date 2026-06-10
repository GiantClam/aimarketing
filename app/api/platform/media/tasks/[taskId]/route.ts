import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { hasFeatureAccess } from "@/lib/auth/guards"
import { queryMiniMaxAudioTask } from "@/lib/platform/minimax-audio"
import {
  hasRunningHubMediaTarget,
  isRunningHubConfiguredForTarget,
  queryRunningHubTask,
  type RunningHubMediaTarget,
} from "@/lib/platform/runninghub"
import { queryRunningHubVideoTask } from "@/lib/platform/runninghub-video"

export const runtime = "nodejs"

type MediaExecutionFeature = "image_design_generation" | "video_generation"

function resolveMediaExecutionFeature(mediaTarget: RunningHubMediaTarget | "ai-music"): MediaExecutionFeature {
  return mediaTarget === "ai-image" ? "image_design_generation" : "video_generation"
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await context.params
  const targetParam = new URL(request.url).searchParams.get("target")

  if (!targetParam || (!hasRunningHubMediaTarget(targetParam) && targetParam !== "ai-music")) {
    return NextResponse.json({ error: "invalid_media_target" }, { status: 400 })
  }
  const target = targetParam as RunningHubMediaTarget | "ai-music"

  const currentUser = await getSessionUser(request).catch(() => null)
  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  if (!hasFeatureAccess(currentUser, resolveMediaExecutionFeature(target))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (target === "ai-music") {
    const runId = Number(taskId)
    if (!Number.isFinite(runId) || runId <= 0) {
      return NextResponse.json({ error: "invalid_media_task_id" }, { status: 400 })
    }

    const result = await queryMiniMaxAudioTask({
      currentUser,
      runId,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      return NextResponse.json({ error: message || "minimax_audio_query_failed" }, { status: 502 })
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

  const result =
    target === "ai-video"
      ? await (async () => {
          const runId = Number(taskId)
          if (!Number.isFinite(runId) || runId <= 0) {
            return NextResponse.json({ error: "invalid_media_task_id" }, { status: 400 })
          }
          return queryRunningHubVideoTask({
            currentUser,
            runId,
          }).catch((error) => {
            const message = error instanceof Error ? error.message : String(error)
            return NextResponse.json({ error: message || "runninghub_video_query_failed" }, { status: 502 })
          })
        })()
      : await queryRunningHubTask(taskId).catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          return NextResponse.json({ error: message || "runninghub_query_failed" }, { status: 502 })
        })

  if (result instanceof NextResponse) {
    return result
  }

  return NextResponse.json({
    data:
      target === "ai-video"
        ? result
        : {
            taskId,
            mediaTarget: target,
            provider: "runninghub",
            ...result,
          },
  })
}
