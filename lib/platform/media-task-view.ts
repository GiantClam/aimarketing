import {
  normalizePlatformMediaExecutionPayload,
  type PlatformMediaExecutionResult,
} from "@/lib/platform/execute"
import type { PlatformTaskRunRecord } from "@/lib/platform/task-run-store"

const AUDIO_FEATURES = new Set(["ai-music", "voice-clone", "voice-synthesis"])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function getProvider(result: Record<string, unknown>, externalSystem: string | null) {
  return typeof result.provider === "string" && result.provider.trim()
    ? result.provider
    : externalSystem?.trim() || (result.requestedTarget === "ai-music" ? "minimax" : "runninghub")
}

export function serializePlatformMediaTask(
  run: Pick<PlatformTaskRunRecord, "id" | "itemSlug" | "status" | "externalSystem" | "normalizedResult">,
): SerializedPlatformMediaTask {
  const featureId = run.itemSlug.trim()
  const capabilitySlug = AUDIO_FEATURES.has(featureId) ? "ai-music" : "ai-video"
  const normalizedResult = asRecord(run.normalizedResult)
  const normalized = normalizePlatformMediaExecutionPayload({
    capabilitySlug,
    featureId,
    data: {
      ...normalizedResult,
      runId: run.id,
      taskId: String(run.id),
      provider: getProvider(normalizedResult, run.externalSystem),
      status: run.status,
    },
  })

  if (!normalized) {
    return {
      runId: run.id,
      taskId: String(run.id),
      capabilitySlug,
      featureId,
      provider: getProvider(normalizedResult, run.externalSystem),
      status: run.status === "succeeded" ? "succeeded" : run.status === "failed" || run.status === "cancelled" ? "failed" : "running",
      results: [],
      detailPath: `/api/platform/media/tasks/${run.id}?target=${capabilitySlug}`,
      mediaTarget: capabilitySlug,
      requestedTarget: featureId,
      endpoint: null,
      extra: null,
      raw: null,
    }
  }

  return {
    ...normalized.data,
    runId: run.id,
    taskId: String(run.id),
    featureId,
    detailPath: `/api/platform/media/tasks/${run.id}?target=${capabilitySlug}`,
    mediaTarget: normalized.data.mediaTarget || capabilitySlug,
  }
}

export type SerializedPlatformMediaTask = Omit<
  PlatformMediaExecutionResult["data"],
  "runId" | "taskId" | "capabilitySlug" | "featureId" | "detailPath" | "mediaTarget"
> & {
  runId: number
  taskId: string
  capabilitySlug: string
  featureId: string
  detailPath: string
  mediaTarget: string
}
