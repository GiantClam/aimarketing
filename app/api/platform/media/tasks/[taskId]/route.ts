import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { hasFeatureAccess, hasFeatureAccessWithFallback } from "@/lib/auth/guards"
import {
  resolveEnterpriseAudioRuntimeForUser,
  resolveEnterpriseVideoRuntimeForUser,
} from "@/lib/platform/enterprise-runtime-config"
import { normalizePlatformMediaExecutionPayload } from "@/lib/platform/execute"
import { isMiniMaxAudioConfigured } from "@/lib/platform/minimax-audio"
import { isMiniMaxVideoConfigured } from "@/lib/platform/minimax-video"
import {
  queryMediaCapabilityTask,
  resolveModelIdFromRun,
} from "@/lib/platform/model-runtime"
import { resolveGovernedImageAssistantSelectionForUser } from "@/lib/platform/model-governance"
import {
  hasRunningHubMediaTarget,
  isRunningHubConfiguredForTarget,
  queryRunningHubTask,
  type RunningHubMediaTarget,
} from "@/lib/platform/runninghub"
import { queryRunningHubVideoTask } from "@/lib/platform/runninghub-video"
import { getPlatformTaskRun } from "@/lib/platform/task-run-store"

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

  const governedImageSelection =
    target === "ai-image"
      ? await resolveGovernedImageAssistantSelectionForUser({
          user: currentUser,
          taskType: "generate",
        }).catch(() => null)
      : null
  const enterpriseImageRuntime =
    target === "ai-image" ? governedImageSelection?.enterpriseRuntime ?? null : null

  if (target === "ai-music") {
    const enterpriseAudioRuntime = await resolveEnterpriseAudioRuntimeForUser({
      user: currentUser,
    })
    if (!enterpriseAudioRuntime && !isMiniMaxAudioConfigured()) {
      return NextResponse.json({ error: "minimax_not_configured" }, { status: 503 })
    }

    const runId = Number(taskId)
    if (!Number.isFinite(runId) || runId <= 0) {
      return NextResponse.json({ error: "invalid_media_task_id" }, { status: 400 })
    }

    const run = await getPlatformTaskRun(runId)
    if (!run) {
      return NextResponse.json({ error: "platform_media_task_not_found" }, { status: 404 })
    }

    const modelId = resolveModelIdFromRun({
      run,
      audioRuntime: enterpriseAudioRuntime,
    })
    if (!modelId) {
      return NextResponse.json({ error: "capability_model_not_found" }, { status: 404 })
    }

    const result = await queryMediaCapabilityTask({
      currentUser,
      runId,
      modelId,
      audioRuntime: enterpriseAudioRuntime,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      return NextResponse.json({ error: message || "capability_query_failed" }, { status: 502 })
    })

    if (result instanceof NextResponse) {
      return result
    }

    return NextResponse.json(
      buildMediaTaskResponse({
        capabilitySlug: target,
        featureId: typeof result.payload.requestedTarget === "string" ? result.payload.requestedTarget : null,
        taskId: typeof result.payload.taskId === "string" ? result.payload.taskId : String(runId),
        data: result.payload,
      }),
    )
  }

  const enterpriseVideoRuntime =
    target === "ai-video"
      ? await resolveEnterpriseVideoRuntimeForUser({
          user: currentUser,
        })
      : null

  if (
    target === "ai-image" &&
    currentUser.enterpriseStatus === "active" &&
    typeof currentUser.enterpriseId === "number" &&
    !enterpriseImageRuntime
  ) {
    return NextResponse.json({ error: "runninghub_not_configured" }, { status: 503 })
  }

  if (
    target === "ai-video" &&
    currentUser.enterpriseStatus === "active" &&
    typeof currentUser.enterpriseId === "number" &&
    !enterpriseVideoRuntime &&
    !isMiniMaxVideoConfigured()
  ) {
    return NextResponse.json({ error: "minimax_not_configured" }, { status: 503 })
  }

  const numericVideoRunId = target === "ai-video" ? Number(taskId) : NaN
  const videoRun =
    Number.isFinite(numericVideoRunId) && numericVideoRunId > 0
      ? await getPlatformTaskRun(numericVideoRunId)
      : null

  if (target === "ai-video" && videoRun) {
    const modelId = resolveModelIdFromRun({
      run: videoRun,
      videoRuntime: enterpriseVideoRuntime,
    })

    if (modelId) {
      const result = await queryMediaCapabilityTask({
        currentUser,
        runId: videoRun.id,
        modelId,
        videoRuntime: enterpriseVideoRuntime,
      }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        return NextResponse.json({ error: message || "capability_query_failed" }, { status: 502 })
      })

      if (result instanceof NextResponse) {
        return result
      }

      return NextResponse.json(
        buildMediaTaskResponse({
          capabilitySlug: target,
          featureId: typeof result.payload.requestedTarget === "string" ? result.payload.requestedTarget : null,
          taskId: typeof result.payload.taskId === "string" ? result.payload.taskId : taskId,
          data: result.payload,
        }),
      )
    }
  }

  const runningHubConfig =
    target === "ai-image"
      ? enterpriseImageRuntime?.kind === "runninghub"
        ? enterpriseImageRuntime.config
        : undefined
      : enterpriseVideoRuntime?.kind === "runninghub"
        ? enterpriseVideoRuntime.config
        : undefined

  if (!isRunningHubConfiguredForTarget(target, runningHubConfig)) {
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
            config: runningHubConfig,
          }).catch((error) => {
            const message = error instanceof Error ? error.message : String(error)
            return NextResponse.json({ error: message || "runninghub_video_query_failed" }, { status: 502 })
          })
        })()
      : await queryRunningHubTask(taskId, runningHubConfig).catch((error) => {
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
