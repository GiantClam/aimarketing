import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { hasFeatureAccess, hasFeatureAccessWithFallback } from "@/lib/auth/guards"
import {
  resolveEnterpriseAudioRuntimeForEnterprise,
  resolveEnterpriseVideoRuntimeForEnterprise,
} from "@/lib/platform/enterprise-runtime-config"
import { normalizePlatformMediaExecutionPayload } from "@/lib/platform/execute"
import { queryMiniMaxAudioTask } from "@/lib/platform/minimax-audio"
import {
  hasRunningHubMediaTarget,
  isRunningHubConfiguredForTarget,
  queryRunningHubTask,
  type RunningHubMediaTarget,
} from "@/lib/platform/runninghub"
import { queryRunningHubVideoTask } from "@/lib/platform/runninghub-video"

export const runtime = "nodejs"

type MediaExecutionFeature = "image_design_generation" | "video_generation" | "audio_generation"

function resolveMediaExecutionFeature(mediaTarget: RunningHubMediaTarget | "ai-music"): MediaExecutionFeature {
  if (mediaTarget === "ai-image") return "image_design_generation"
  if (mediaTarget === "ai-music") return "audio_generation"
  return "video_generation"
}

function buildMediaTaskResponse(input: {
  capabilitySlug: RunningHubMediaTarget | "ai-music"
  featureId?: string | null
  taskId: string
  data: Record<string, unknown>
}) {
  return (
    normalizePlatformMediaExecutionPayload({
      capabilitySlug: input.capabilitySlug,
      featureId: input.featureId,
      data: {
        taskId: input.taskId,
        ...input.data,
      },
    }) ?? { data: input.data }
  )
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

  const requiredFeature = resolveMediaExecutionFeature(target)
  const hasAccess =
    requiredFeature === "audio_generation"
      ? hasFeatureAccessWithFallback(currentUser, "audio_generation", "video_generation")
      : hasFeatureAccess(currentUser, requiredFeature)

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (target === "ai-music") {
    const enterpriseAudioRuntime = await resolveEnterpriseAudioRuntimeForEnterprise({
      enterpriseId: currentUser.enterpriseId,
    })
    if (
      currentUser.enterpriseStatus === "active" &&
      typeof currentUser.enterpriseId === "number" &&
      !enterpriseAudioRuntime
    ) {
      return NextResponse.json({ error: "minimax_not_configured" }, { status: 503 })
    }

    const runId = Number(taskId)
    if (!Number.isFinite(runId) || runId <= 0) {
      return NextResponse.json({ error: "invalid_media_task_id" }, { status: 400 })
    }

    const result = await queryMiniMaxAudioTask({
      currentUser,
      runId,
      config: enterpriseAudioRuntime?.config,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      return NextResponse.json({ error: message || "minimax_audio_query_failed" }, { status: 502 })
    })

    if (result instanceof NextResponse) {
      return result
    }

    return NextResponse.json(
      buildMediaTaskResponse({
        capabilitySlug: target,
        featureId: typeof result.requestedTarget === "string" ? result.requestedTarget : null,
        taskId: result.taskId,
        data: result as Record<string, unknown>,
      }),
    )
  }

  const enterpriseVideoRuntime =
    target === "ai-video"
      ? await resolveEnterpriseVideoRuntimeForEnterprise({
          enterpriseId: currentUser.enterpriseId,
        })
      : null

  if (
    target === "ai-video" &&
    currentUser.enterpriseStatus === "active" &&
    typeof currentUser.enterpriseId === "number" &&
    !enterpriseVideoRuntime
  ) {
    return NextResponse.json({ error: "runninghub_not_configured" }, { status: 503 })
  }

  if (!isRunningHubConfiguredForTarget(target, enterpriseVideoRuntime?.config)) {
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
            config: enterpriseVideoRuntime?.config,
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

  const responseData =
    target === "ai-video"
      ? (result as Record<string, unknown>)
      : ({
          taskId,
          mediaTarget: target,
          provider: "runninghub",
          ...result,
        } as Record<string, unknown>)

  return NextResponse.json(
    buildMediaTaskResponse({
      capabilitySlug: target,
      featureId: typeof responseData.requestedTarget === "string" ? responseData.requestedTarget : null,
      taskId: typeof responseData.taskId === "string" ? responseData.taskId : taskId,
      data: responseData,
    }),
  )
}
