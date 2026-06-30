import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { hasFeatureAccess, hasFeatureAccessWithFallback } from "@/lib/auth/guards"
import { estimateVideoGenerationCredits } from "@/lib/billing/costing"
import {
  releaseReservedCredits,
  reserveFeatureCredits,
  type BillingReservation,
} from "@/lib/billing/runtime"
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
import { isMiniMaxVideoConfigured } from "@/lib/platform/minimax-video"
import {
  executeMediaCapability,
  resolveMediaFeatureId,
  resolveMediaModelId,
} from "@/lib/platform/model-runtime"
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
import {
  attachPendingVideoBillingToRun,
  settleVideoBillingForRunId,
} from "@/lib/platform/video-billing-settlement"

export const runtime = "nodejs"

type MediaExecutionFeature = "image_design_generation" | "video_generation" | "audio_generation"
type MediaRouteUser = {
  id: number
  enterpriseId: number | null
}
type VideoBillingState = {
  reservation: BillingReservation | null
  estimate: ReturnType<typeof estimateVideoGenerationCredits>
}

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

function readVideoDurationSeconds(params: Record<string, unknown>, payload: Record<string, unknown>): string | number | null {
  const value = params.duration ?? payload.duration ?? params.durationSeconds ?? payload.durationSeconds ?? null
  return typeof value === "string" || typeof value === "number" ? value : null
}

function readVideoResolution(params: Record<string, unknown>, payload: Record<string, unknown>) {
  const value = params.resolution ?? payload.resolution
  return typeof value === "string" ? value : null
}

function resolveVideoBillingProvider(modelId: string | null | undefined, fallback: "minimax" | "runninghub") {
  if (modelId?.startsWith("runninghub:")) return "runninghub"
  if (modelId?.startsWith("minimax:")) return "minimax"
  return fallback
}

async function reserveVideoCreditsForSubmission(input: {
  currentUser: MediaRouteUser
  featureId: string
  provider: "minimax" | "runninghub"
  modelId?: string | null
  params: Record<string, unknown>
  payload: Record<string, unknown>
}) {
  const estimate = estimateVideoGenerationCredits({
    featureId: input.featureId,
    durationSeconds: readVideoDurationSeconds(input.params, input.payload),
    resolution: readVideoResolution(input.params, input.payload),
    provider: input.provider,
    model: input.modelId || null,
  })
  const reservation = await reserveFeatureCredits({
    userId: input.currentUser.id,
    enterpriseId: input.currentUser.enterpriseId,
    featureKey: estimate.featureKey,
    amount: estimate.credits,
    idempotencyKey: `video-generation:${input.currentUser.id}:${input.featureId}:${Date.now()}:reserve`,
    metadata: {
      route: "platform.media.run",
      featureId: input.featureId,
      estimate,
    },
  })

  return { reservation, estimate }
}

async function releaseVideoCreditsForSubmission(input: {
  billing: VideoBillingState | null
  currentUser: MediaRouteUser
  idempotencyScope: string
  reason: string
}) {
  if (!input.billing) return null
  return releaseReservedCredits({
    reservation: input.billing.reservation,
    userId: input.currentUser.id,
    enterpriseId: input.currentUser.enterpriseId,
    idempotencyKey: `video-generation:${input.currentUser.id}:${input.idempotencyScope}:${Date.now()}:release`,
    reason: input.reason,
  })
}

async function attachVideoBillingOrRelease(input: {
  runId: number | null
  billing: VideoBillingState | null
  currentUser: MediaRouteUser
  featureId: string
  provider?: string | null
  model?: string | null
  metadata?: Record<string, unknown> | null
}) {
  const attached = await attachPendingVideoBillingToRun({
    runId: input.runId,
    currentUser: input.currentUser,
    billing: input.billing,
    featureId: input.featureId,
    provider: input.provider,
    model: input.model,
    metadata: input.metadata,
  }).catch((error) => {
    console.warn("platform.media.video.billing.attach_failed", {
      featureId: input.featureId,
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  })

  if (!attached && input.billing?.reservation) {
    await releaseVideoCreditsForSubmission({
      billing: input.billing,
      currentUser: input.currentUser,
      idempotencyScope: input.featureId,
      reason: "video_billing_attach_failed",
    }).catch((error) => {
      console.warn("platform.media.video.billing.release_failed", {
        featureId: input.featureId,
        reason: "video_billing_attach_failed",
        message: error instanceof Error ? error.message : String(error),
      })
    })
  }

  return attached
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

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const routeAccessAllowed =
    target === "ai-image"
      ? await canUserAccessGovernedMediaRoute({
          user: currentUser,
          routeId: "runninghub-image",
          category: "image_generation",
        })
      : target === "ai-video"
        ? (await canUserAccessGovernedMediaRoute({
            user: currentUser,
            routeId: "minimax-video",
            category: "video_generation",
          })) ||
          (await canUserAccessGovernedMediaRoute({
            user: currentUser,
            routeId: "runninghub-video",
            category: "video_generation",
          }))
        : await canUserAccessGovernedMediaRoute({
            user: currentUser,
            routeId: "minimax-audio",
            category: "audio_generation",
          })

  if (!routeAccessAllowed) {
    return NextResponse.json({ error: "model_access_denied" }, { status: 403 })
  }

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

  const runningHubConfig =
    target === "ai-image"
      ? enterpriseImageRuntime?.kind === "runninghub"
        ? enterpriseImageRuntime.config
        : undefined
      : enterpriseVideoRuntime?.kind === "runninghub"
        ? enterpriseVideoRuntime.config
        : undefined

  const params =
    payload.params && typeof payload.params === "object" ? (payload.params as Record<string, unknown>) : payload

  if (target === "ai-music") {
    const featureId = resolveMediaFeatureId(target, payload.featureId || action)
    const modelId = resolveMediaModelId({
      target,
      featureId,
      requestedModelId: payload.modelId,
      requestedModel: params.model ?? payload.model,
      audioRuntime: enterpriseAudioRuntime,
    })

    const result = await executeMediaCapability({
      currentUser,
      target,
      featureId,
      modelId,
      source: "api",
      params: {
        ...params,
        platformAction: action,
      },
      audioRuntime: enterpriseAudioRuntime,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      return NextResponse.json({ error: message || "capability_execute_failed" }, { status: 502 })
    })

    if (result instanceof NextResponse) {
      return result
    }

    return NextResponse.json(
      buildMediaExecutionResponse({
        capabilitySlug: target,
        featureId,
        data: result.payload,
      }),
    )
  }

  if (target === "ai-video") {
    const legacyRunningHubFeatureId = resolveRunningHubVideoFeatureId(payload.featureId)
    if (legacyRunningHubFeatureId === "video-enhance") {
      const runningHubVideoConfig = enterpriseVideoRuntime?.kind === "runninghub" ? enterpriseVideoRuntime.config : undefined
      if (!isRunningHubConfiguredForTarget(target, runningHubVideoConfig)) {
        return NextResponse.json({ error: "runninghub_not_configured" }, { status: 503 })
      }
      let videoBilling: VideoBillingState
      try {
        videoBilling = await reserveVideoCreditsForSubmission({
          currentUser,
          featureId: legacyRunningHubFeatureId,
          provider: "runninghub",
          modelId: typeof params.model === "string" ? params.model : typeof payload.model === "string" ? payload.model : null,
          params,
          payload,
        })
      } catch (error) {
        if (error instanceof Error && error.message === "insufficient_credits") {
          return NextResponse.json({ error: "insufficient_credits" }, { status: 402 })
        }
        throw error
      }

      const legacyResult = await executeRunningHubVideoFeature({
        currentUser,
        featureId: legacyRunningHubFeatureId,
        params: {
          ...params,
          prompt:
            (typeof params.prompt === "string" && params.prompt.trim()) ||
            (typeof payload.prompt === "string" && payload.prompt.trim()) ||
            "",
          platformAction: action,
        },
        config: runningHubVideoConfig,
      }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        return NextResponse.json({ error: message || "runninghub_video_execute_failed" }, { status: 502 })
      })

      if (legacyResult instanceof NextResponse) {
        await releaseVideoCreditsForSubmission({
          billing: videoBilling,
          currentUser,
          idempotencyScope: legacyRunningHubFeatureId,
          reason: "video_submit_failed",
        }).catch((error) => {
          console.warn("platform.media.video.billing.release_failed", {
            featureId: legacyRunningHubFeatureId,
            message: error instanceof Error ? error.message : String(error),
          })
        })
        return legacyResult
      }

      const legacyRunId = Number(legacyResult.taskId)
      const attachedBilling = await attachVideoBillingOrRelease({
        runId: Number.isFinite(legacyRunId) ? legacyRunId : null,
        currentUser,
        billing: videoBilling,
        featureId: legacyRunningHubFeatureId,
        provider: "runninghub",
        model: typeof params.model === "string" ? params.model : typeof payload.model === "string" ? payload.model : null,
        metadata: {
          route: "platform.media.run",
          featureId: legacyRunningHubFeatureId,
          taskId: typeof legacyResult.taskId === "string" ? legacyResult.taskId : null,
        },
      })
      if (attachedBilling && (legacyResult.status === "SUCCESS" || legacyResult.status === "FAILED")) {
        await settleVideoBillingForRunId(Number.isFinite(legacyRunId) ? legacyRunId : null).catch((error) => {
          console.warn("platform.media.video.billing.settle_failed", {
            featureId: legacyRunningHubFeatureId,
            message: error instanceof Error ? error.message : String(error),
          })
        })
      }

      return NextResponse.json(
        buildMediaExecutionResponse({
          capabilitySlug: target,
          featureId: legacyRunningHubFeatureId,
          data: legacyResult as Record<string, unknown>,
        }),
      )
    }

    const featureId = resolveMediaFeatureId(target, payload.featureId)
    const modelId = resolveMediaModelId({
      target,
      featureId,
      requestedModelId: payload.modelId,
      requestedModel: params.model ?? payload.model,
      videoRuntime: enterpriseVideoRuntime,
    })
    const videoBilling = await reserveVideoCreditsForSubmission({
      currentUser,
      featureId,
      provider: resolveVideoBillingProvider(modelId, enterpriseVideoRuntime?.kind === "runninghub" ? "runninghub" : "minimax"),
      modelId,
      params,
      payload,
    }).catch((error) => {
      if (error instanceof Error && error.message === "insufficient_credits") {
        return NextResponse.json({ error: "insufficient_credits" }, { status: 402 })
      }
      throw error
    })
    if (videoBilling instanceof NextResponse) {
      return videoBilling
    }

    const result = await executeMediaCapability({
      currentUser,
      target,
      featureId,
      modelId,
      source: "api",
      params: {
        ...params,
        prompt:
          (typeof params.prompt === "string" && params.prompt.trim()) ||
          (typeof payload.prompt === "string" && payload.prompt.trim()) ||
          "",
        platformAction: action,
      },
      videoRuntime: enterpriseVideoRuntime,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      return NextResponse.json({ error: message || "capability_execute_failed" }, { status: 502 })
    })

    if (result instanceof NextResponse) {
      await releaseVideoCreditsForSubmission({
        billing: videoBilling,
        currentUser,
        idempotencyScope: featureId,
        reason: "video_submit_failed",
      }).catch((error) => {
        console.warn("platform.media.video.billing.release_failed", {
          featureId,
          message: error instanceof Error ? error.message : String(error),
        })
      })
      return result
    }

    const resultTask = result.mode === "async" ? result.task : null
    const payloadRunId = typeof result.payload?.taskId === "string" ? Number(result.payload.taskId) : null
    const resultRunId =
      typeof resultTask?.localRunId === "number"
        ? resultTask.localRunId
        : payloadRunId && Number.isFinite(payloadRunId)
          ? payloadRunId
          : null
    const attachedBilling = await attachVideoBillingOrRelease({
      runId: resultRunId,
      currentUser,
      billing: videoBilling,
      featureId,
      provider: typeof result.provider === "string" ? result.provider : videoBilling.estimate.provider,
      model: typeof result.modelId === "string" ? result.modelId : modelId,
      metadata: {
        route: "platform.media.run",
        featureId,
        taskId:
          typeof result.payload?.taskId === "string"
            ? result.payload.taskId
            : typeof resultTask?.providerTaskId === "string"
              ? resultTask.providerTaskId
              : null,
      },
    })
    if (attachedBilling && (result.status === "succeeded" || result.status === "failed")) {
      await settleVideoBillingForRunId(resultRunId).catch((error) => {
        console.warn("platform.media.video.billing.settle_failed", {
          featureId,
          message: error instanceof Error ? error.message : String(error),
        })
      })
    }

    return NextResponse.json(
      buildMediaExecutionResponse({
        capabilitySlug: target,
        featureId,
        data: result.payload,
      }),
    )
  }

  if (!isRunningHubConfiguredForTarget(target, runningHubConfig)) {
    return NextResponse.json({ error: "runninghub_not_configured" }, { status: 503 })
  }

  const result =
    target === "ai-image"
      ? await submitRunningHubTask({
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
      : await executeRunningHubVideoFeature({
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
          config: runningHubConfig,
        }).catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          return NextResponse.json({ error: message || "runninghub_video_execute_failed" }, { status: 502 })
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
