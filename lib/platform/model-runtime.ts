import { getDefaultModelId, findModelByCapabilityAndAlias, getModelDefinition } from "@/lib/ai-runtime/model-registry"
import { executeCapability } from "@/lib/ai-runtime/execute"
import { queryCapabilityTask } from "@/lib/ai-runtime/task-query"
import type { ModelCapability } from "@/lib/ai-runtime/capabilities"
import type { CapabilityRuntimeContext } from "@/lib/ai-runtime/types"
import type { EnterpriseAudioRuntimeConfig, EnterpriseVideoRuntimeConfig } from "@/lib/platform/enterprise-runtime-config"
import type { PlatformTaskRunRecord } from "@/lib/platform/task-run-store"

type MediaTarget = "ai-video" | "ai-music"
type MediaFeatureId =
  | "ai-music"
  | "voice-clone"
  | "voice-synthesis"
  | "text-to-video"
  | "image-to-video"
  | "digital-human"

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export function resolveMediaFeatureId(target: MediaTarget, value: unknown): MediaFeatureId {
  const normalized = normalizeText(value)
  if (target === "ai-music") {
    if (normalized === "voice-clone" || normalized === "voice-synthesis") return normalized
    return "ai-music"
  }
  if (normalized === "image-to-video" || normalized === "digital-human") return normalized
  return "text-to-video"
}

export function resolveCapabilityForMediaFeature(target: MediaTarget, featureId: MediaFeatureId): ModelCapability {
  if (target === "ai-music") {
    if (featureId === "voice-clone") return "audio.voice_clone"
    if (featureId === "voice-synthesis") return "audio.voice_synthesis"
    return "audio.generate"
  }
  if (featureId === "image-to-video") return "video.image_to_video"
  if (featureId === "digital-human") return "video.digital_human"
  return "video.text_to_video"
}

function resolvePreferredRuntimeModel(input: {
  capability: ModelCapability
  audioRuntime?: EnterpriseAudioRuntimeConfig | null
  videoRuntime?: EnterpriseVideoRuntimeConfig | null
}) {
  if (input.capability.startsWith("audio.")) {
    return normalizeText(input.audioRuntime?.model)
  }
  if (input.capability.startsWith("video.")) {
    return normalizeText(input.videoRuntime?.model)
  }
  return ""
}

export function resolveMediaModelId(input: {
  target: MediaTarget
  featureId: MediaFeatureId
  requestedModelId?: unknown
  requestedModel?: unknown
  audioRuntime?: EnterpriseAudioRuntimeConfig | null
  videoRuntime?: EnterpriseVideoRuntimeConfig | null
}) {
  const capability = resolveCapabilityForMediaFeature(input.target, input.featureId)
  const requestedCandidates = [
    normalizeText(input.requestedModelId),
    normalizeText(input.requestedModel),
    resolvePreferredRuntimeModel({
      capability,
      audioRuntime: input.audioRuntime,
      videoRuntime: input.videoRuntime,
    }),
  ].filter(Boolean)

  for (const candidate of requestedCandidates) {
    const model = findModelByCapabilityAndAlias({
      capability,
      value: candidate,
    })
    if (model) return model.id
  }

  const defaultModelId = getDefaultModelId(capability)
  if (!defaultModelId) {
    throw new Error("capability_default_model_missing")
  }
  return defaultModelId
}

export function buildRuntimeContext(input: {
  audioRuntime?: EnterpriseAudioRuntimeConfig | null
  videoRuntime?: EnterpriseVideoRuntimeConfig | null
}): CapabilityRuntimeContext {
  return {
    minimaxAudioConfig: input.audioRuntime?.config,
    minimaxVideoConfig: input.videoRuntime?.kind === "minimax" ? input.videoRuntime.config : undefined,
    runningHubConfig: input.videoRuntime?.kind === "runninghub" ? input.videoRuntime.config : undefined,
  }
}

export async function executeMediaCapability(input: {
  currentUser: { id: number; enterpriseId: number | null }
  target: MediaTarget
  featureId: MediaFeatureId
  modelId: string
  source: "capabilities" | "workflow" | "api"
  params: Record<string, unknown>
  audioRuntime?: EnterpriseAudioRuntimeConfig | null
  videoRuntime?: EnterpriseVideoRuntimeConfig | null
}) {
  const capability = resolveCapabilityForMediaFeature(input.target, input.featureId)
  return executeCapability({
    currentUser: input.currentUser,
    capability,
    modelId: input.modelId,
    input: input.params,
    source: input.source,
    runtimeContext: buildRuntimeContext({
      audioRuntime: input.audioRuntime,
      videoRuntime: input.videoRuntime,
    }),
  })
}

function resolveCapabilityFromRun(run: Pick<PlatformTaskRunRecord, "itemSlug">): ModelCapability | null {
  if (run.itemSlug === "voice-clone") return "audio.voice_clone"
  if (run.itemSlug === "voice-synthesis") return "audio.voice_synthesis"
  if (run.itemSlug === "ai-music") return "audio.generate"
  if (run.itemSlug === "image-to-video") return "video.image_to_video"
  if (run.itemSlug === "digital-human") return "video.digital_human"
  if (run.itemSlug === "text-to-video" || run.itemSlug === "ai-video") return "video.text_to_video"
  return null
}

function readRunCandidate(run: Pick<PlatformTaskRunRecord, "inputPayload" | "normalizedResult">, field: string) {
  const normalizedResult =
    run.normalizedResult && typeof run.normalizedResult === "object"
      ? (run.normalizedResult as Record<string, unknown>)
      : {}
  const inputPayload =
    run.inputPayload && typeof run.inputPayload === "object"
      ? (run.inputPayload as Record<string, unknown>)
      : {}

  return normalizedResult[field] ?? inputPayload[field] ?? null
}

export function resolveModelIdFromRun(input: {
  run: Pick<PlatformTaskRunRecord, "itemSlug" | "externalSystem" | "inputPayload" | "normalizedResult">
  audioRuntime?: EnterpriseAudioRuntimeConfig | null
  videoRuntime?: EnterpriseVideoRuntimeConfig | null
}) {
  const capability = resolveCapabilityFromRun(input.run)
  if (!capability) return null

  const candidates = [
    readRunCandidate(input.run, "modelId"),
    readRunCandidate(input.run, "model"),
    resolvePreferredRuntimeModel({
      capability,
      audioRuntime: input.audioRuntime,
      videoRuntime: input.videoRuntime,
    }),
  ]

  for (const candidate of candidates) {
    const model = findModelByCapabilityAndAlias({
      capability,
      value: candidate,
    })
    if (model) return model.id
  }

  if (input.run.externalSystem === "minimax" || input.run.externalSystem === "runninghub") {
    return getDefaultModelId(capability)
  }
  return null
}

export async function queryMediaCapabilityTask(input: {
  currentUser: { id: number; enterpriseId: number | null }
  runId: number
  modelId: string
  audioRuntime?: EnterpriseAudioRuntimeConfig | null
  videoRuntime?: EnterpriseVideoRuntimeConfig | null
}) {
  const model = getModelDefinition(input.modelId)
  if (!model) {
    throw new Error("capability_model_not_found")
  }
  return queryCapabilityTask({
    currentUser: input.currentUser,
    runId: input.runId,
    modelId: input.modelId,
    capability: model.capability,
    runtimeContext: buildRuntimeContext({
      audioRuntime: input.audioRuntime,
      videoRuntime: input.videoRuntime,
    }),
  })
}
