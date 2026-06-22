import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { hasFeatureAccess, hasFeatureAccessWithFallback } from "@/lib/auth/guards"
import type { OpenAiCompatibleImageProviderId } from "@/lib/image-assistant/openai-compatible-image"
import { normalizePlatformMediaExecutionPayload } from "@/lib/platform/execute"
import {
  resolveEnterpriseAudioRuntimeForUser,
  resolveEnterpriseVideoRuntimeForUser,
} from "@/lib/platform/enterprise-runtime-config"
import {
  canUserAccessGovernedMediaRoute,
  resolveGovernedImageAssistantSelectionForUser,
} from "@/lib/platform/model-governance"
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
import {
  executeRunningHubVideoFeature,
  resolveRunningHubVideoFeatureId,
} from "@/lib/platform/runninghub-video"

export const runtime = "nodejs"

type MediaExecutionFeature = "image_design_generation" | "video_generation" | "audio_generation"

function normalizeAction(value: string | null) {
  return value?.trim().toLowerCase() || "execute"
}

function resolveMediaExecutionFeature(
  mediaTarget: RunningHubMediaTarget | "ai-music",
  action: string,
): MediaExecutionFeature {
  if (mediaTarget === "ai-image") return "image_design_generation"
  if (mediaTarget === "ai-video") return "video_generation"
  if (mediaTarget === "ai-music") return "audio_generation"

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

function resolveRunningHubImageRouteMode(action: string) {
  if (action === "edit" || action === "edit-image") {
    return "img2img" as const
  }
  return "txt2img" as const
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function hasReferenceLikeInput(value: unknown) {
  return Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim().length > 0)
}

function buildMediaExecutionResponse(input: {
  capabilitySlug: RunningHubMediaTarget | "ai-music"
  featureId?: string | null
  data: Record<string, unknown>
}) {
  return (
    normalizePlatformMediaExecutionPayload({
      capabilitySlug: input.capabilitySlug,
      featureId: input.featureId,
      data: input.data,
    }) ?? { data: input.data }
  )
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

  const requiredFeature = resolveMediaExecutionFeature(target, action)
  const hasAccess =
    requiredFeature === "audio_generation"
      ? hasFeatureAccessWithFallback(currentUser, "audio_generation", "video_generation")
      : hasFeatureAccess(currentUser, requiredFeature)

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const routeAccessAllowed =
    target === "ai-image"
      ? await canUserAccessGovernedMediaRoute({
          user: currentUser,
          routeId: "runninghub-image",
          category: "image_generation",
        })
      : target === "ai-video"
        ? await canUserAccessGovernedMediaRoute({
            user: currentUser,
            routeId: "runninghub-video",
            category: "video_generation",
          })
        : await canUserAccessGovernedMediaRoute({
            user: currentUser,
            routeId: "minimax-audio",
            category: "audio_generation",
          })

  if (!routeAccessAllowed) {
    return NextResponse.json({ error: "model_access_denied" }, { status: 403 })
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const imageRouteMode = resolveRunningHubImageRouteMode(action)
  const governedImageSelection =
    target === "ai-image"
      ? await resolveGovernedImageAssistantSelectionForUser({
          user: currentUser,
          modelOptionId: normalizeOptionalText(payload.modelOptionId),
          providerLock: normalizeOptionalText(payload.providerLock) as OpenAiCompatibleImageProviderId | null,
          model: normalizeOptionalText(payload.model),
          taskType: imageRouteMode === "img2img" ? "edit" : "generate",
          hasReferenceInput:
            hasReferenceLikeInput(payload.referenceAssetIds) ||
            hasReferenceLikeInput(payload.referenceUrls),
        })
          .catch(() => null)
      : null
  const enterpriseImageRuntime =
    target === "ai-image" ? governedImageSelection?.enterpriseRuntime ?? null : null
  const enterpriseAudioRuntime =
    target === "ai-music"
      ? await resolveEnterpriseAudioRuntimeForUser({
          user: currentUser,
        })
      : null
  const enterpriseVideoRuntime =
    target === "ai-video"
      ? await resolveEnterpriseVideoRuntimeForUser({
          user: currentUser,
        })
      : null

  if (target === "ai-music") {
    if (
      currentUser.enterpriseStatus === "active" &&
      typeof currentUser.enterpriseId === "number" &&
      !enterpriseAudioRuntime
    ) {
      return NextResponse.json({ error: "minimax_not_configured" }, { status: 503 })
    }

    if (!isMiniMaxAudioConfigured(enterpriseAudioRuntime?.config)) {
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
      config: enterpriseAudioRuntime?.config,
      defaultModel: enterpriseAudioRuntime?.model || null,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      return NextResponse.json({ error: message || "minimax_audio_execute_failed" }, { status: 502 })
    })

    if (result instanceof NextResponse) {
      return result
    }

    return NextResponse.json(
      buildMediaExecutionResponse({
        capabilitySlug: target,
        featureId,
        data: result as Record<string, unknown>,
      }),
    )
  }

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
    !enterpriseVideoRuntime
  ) {
    return NextResponse.json({ error: "runninghub_not_configured" }, { status: 503 })
  }

  const runningHubConfig =
    target === "ai-image"
      ? enterpriseImageRuntime?.kind === "runninghub"
        ? enterpriseImageRuntime.config
        : undefined
      : enterpriseVideoRuntime?.config

  if (!isRunningHubConfiguredForTarget(target, runningHubConfig)) {
    return NextResponse.json({ error: "runninghub_not_configured" }, { status: 503 })
  }

  const params =
    payload.params && typeof payload.params === "object" ? (payload.params as Record<string, unknown>) : payload

  const result =
    target === "ai-video"
      ? await executeRunningHubVideoFeature({
          currentUser,
          featureId: resolveRunningHubVideoFeatureId(payload.featureId) || "text-to-video",
          params: {
            ...params,
            prompt:
              (typeof params.prompt === "string" && params.prompt.trim()) ||
              (typeof payload.prompt === "string" && payload.prompt.trim()) ||
              "",
            platformAction: action,
          },
          config: enterpriseVideoRuntime?.config,
        }).catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          return NextResponse.json({ error: message || "runninghub_video_execute_failed" }, { status: 502 })
        })
      : await submitRunningHubTask({
          mediaTarget: target,
          payload: {
            ...payload,
            platformAction: action,
            userId: currentUser.id,
            enterpriseId: currentUser.enterpriseId,
          },
          config: runningHubConfig,
        }).catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          return NextResponse.json({ error: message || "runninghub_submit_failed" }, { status: 502 })
        })

  if (result instanceof NextResponse) {
    return result
  }

  return NextResponse.json(
    buildMediaExecutionResponse({
      capabilitySlug: target,
      featureId: typeof payload.featureId === "string" ? payload.featureId : null,
      data: result as Record<string, unknown>,
    }),
  )
}
