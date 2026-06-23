import { getImageAssistantAvailability } from "@/lib/image-assistant/aiberm"
import { getMiniMaxAudioConfig, isMiniMaxAudioConfigured } from "@/lib/platform/minimax-audio"
import { getMiniMaxVideoConfig, isMiniMaxVideoConfigured } from "@/lib/platform/minimax-video"
import { DEFAULT_MINIMAX_VIDEO_MODEL } from "@/lib/platform/minimax-video-options"
import { getRunningHubConfig, hasRunningHubMediaExecution, isRunningHubConfiguredForTarget } from "@/lib/platform/runninghub"
import { isVideoGenerationEnabled } from "@/lib/runtime-features"
import type {
  PlatformProviderRuntime,
  PlatformRuntimeSnapshot,
  PlatformTaskRuntime,
} from "@/lib/platform/runtime"

export type PlatformMediaCapabilitySlug = "ai-image" | "ai-video" | "ai-music"

export type PlatformMediaCapabilityState = {
  capabilitySlug: PlatformMediaCapabilitySlug
  providers: PlatformProviderRuntime[]
  task: PlatformTaskRuntime | undefined
  runtimeStatus: "ready" | "deferred" | "runtime_disabled"
}

type PlatformMediaRuntimeBuildInput = {
  imageAvailability: ReturnType<typeof getImageAssistantAvailability>
  videoRuntimeEnabled: boolean
  runningHubConfig: ReturnType<typeof getRunningHubConfig>
  minimaxConfig: ReturnType<typeof getMiniMaxAudioConfig>
  minimaxVideoConfig?: ReturnType<typeof getMiniMaxVideoConfig>
}

function uniqueNotes(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function getImageProviderRole(provider: string) {
  if (provider === "pptoken" || provider === "aiberm") return "primary"
  if (provider === "crazyroute") return "fallback"
  return "planned"
}

export function isPlatformMediaCapabilitySlug(value: string): value is PlatformMediaCapabilitySlug {
  return value === "ai-image" || value === "ai-video" || value === "ai-music"
}

export function buildPlatformMediaRuntimeEntries() {
  return buildPlatformMediaRuntimeEntriesFromState({
    imageAvailability: getImageAssistantAvailability(),
    videoRuntimeEnabled: isVideoGenerationEnabled(),
    runningHubConfig: getRunningHubConfig(),
    minimaxConfig: getMiniMaxAudioConfig(),
    minimaxVideoConfig: getMiniMaxVideoConfig(),
  })
}

export function buildPlatformMediaRuntimeEntriesFromState(input: PlatformMediaRuntimeBuildInput) {
  const { imageAvailability, videoRuntimeEnabled, runningHubConfig, minimaxConfig } = input
  const minimaxVideoConfig = input.minimaxVideoConfig ?? getMiniMaxVideoConfig()
  const runningHubImageConfigured = isRunningHubConfiguredForTarget("ai-image", runningHubConfig)
  const runningHubVideoConfigured = isRunningHubConfiguredForTarget("ai-video", runningHubConfig)
  const minimaxAudioConfigured = isMiniMaxAudioConfigured(minimaxConfig)
  const minimaxVideoConfigured = isMiniMaxVideoConfigured(minimaxVideoConfig)
  const mediaRuntimeEnabled = hasRunningHubMediaExecution(runningHubConfig) || minimaxVideoConfigured || minimaxAudioConfigured

  const providers: PlatformProviderRuntime[] = [
    {
      id: imageAvailability.provider,
      scope: "image",
      configured: imageAvailability.enabled,
      active: imageAvailability.enabled,
      model: `${imageAvailability.models.highQuality} / ${imageAvailability.models.lowCost}`,
      baseURL: null,
      role: getImageProviderRole(imageAvailability.provider),
      capabilitySlugs: ["ai-image"],
      notes: uniqueNotes([
        imageAvailability.reason ? `Image runtime reason: ${imageAvailability.reason}.` : "Image runtime is ready.",
        "Current image flows run through the image-assistant execution path.",
      ]),
    },
    {
      id: "runninghub-image",
      scope: "image",
      configured: runningHubImageConfigured,
      active: false,
      model: null,
      baseURL: runningHubConfig.baseUrl,
      role: runningHubImageConfigured ? "fallback" : "planned",
      capabilitySlugs: ["ai-image", "runninghub-media"],
      notes: [
        runningHubImageConfigured
          ? "Configured in the shared media runtime, but no longer the primary execution path for AI image capability."
          : "Reserved as the target image provider in the shared media runtime.",
        "AI image capability now resolves through the governed image-assistant runtime.",
      ],
    },
    {
      id: "minimax-video",
      scope: "video",
      configured: minimaxVideoConfigured,
      active: minimaxVideoConfigured,
      model: DEFAULT_MINIMAX_VIDEO_MODEL,
      baseURL: minimaxVideoConfig.baseUrl,
      role: minimaxVideoConfigured ? "primary" : "planned",
      capabilitySlugs: ["ai-video"],
      notes: [
        minimaxVideoConfigured
          ? "Configured as the default MiniMax Hailuo video provider for text-to-video and image-to-video."
          : "Reserved as the default video provider until LEAD_TOOLS_MINIMAX_API_KEY is configured.",
        "Video generation uses the official MiniMax video_generation, query/video_generation, and files/retrieve APIs.",
      ],
    },
    {
      id: "runninghub-video",
      scope: "video",
      configured: runningHubVideoConfigured,
      active: !minimaxVideoConfigured && runningHubVideoConfigured,
      model: null,
      baseURL: runningHubConfig.baseUrl,
      role: runningHubVideoConfigured ? (minimaxVideoConfigured ? "fallback" : "primary") : "planned",
      capabilitySlugs: ["ai-video", "runninghub-media"],
      notes: [
        runningHubVideoConfigured
          ? "Configured as the shared RunningHub video workflow provider."
          : "Reserved as the target video provider in the shared media runtime.",
        runningHubVideoConfigured
          ? "RunningHub remains available for workflow-backed video tasks such as digital human and video enhancement."
          : "Current video entry still relies on the existing dashboard/video workflow.",
      ],
    },
    {
      id: "minimax-audio",
      scope: "audio",
      configured: minimaxAudioConfigured,
      active: minimaxAudioConfigured,
      model: "speech-2.8 / music-2.6",
      baseURL: minimaxConfig.baseUrl,
      role: minimaxAudioConfigured ? "primary" : "planned",
      capabilitySlugs: ["ai-music"],
      notes: [
        minimaxAudioConfigured
          ? "Configured as the unified MiniMax audio provider for music generation, voice clone, and speech synthesis."
          : "Reserved as the target audio provider in the shared media runtime.",
        minimaxAudioConfigured
          ? "Audio capability can execute through the MiniMax media adapter."
          : "Audio capability stays deferred until the MiniMax API credentials are configured.",
      ],
    },
  ]

  const tasks: PlatformTaskRuntime[] = [
    {
      id: "ai-image-runtime",
      capabilitySlug: "ai-image",
      title: "AI image assistant queue",
      mode: "async",
      enabled: imageAvailability.enabled,
      runtimeId: "image-assistant",
      statuses: ["queued", "running", "succeeded", "failed", "cancelled"],
      notes: [
        "Image generation defaults to the async assistant queue for stability.",
        "Governed enterprise image providers resolve through the same image-assistant runtime path.",
      ],
    },
    {
      id: "ai-video-runtime",
      capabilitySlug: "ai-video",
      title: "AI video workspace",
      mode: minimaxVideoConfigured || runningHubVideoConfigured || videoRuntimeEnabled ? "async" : "deferred",
      enabled: minimaxVideoConfigured || runningHubVideoConfigured || videoRuntimeEnabled,
      runtimeId: minimaxVideoConfigured ? "minimax-video" : runningHubVideoConfigured ? "runninghub-video" : "dashboard-video",
      statuses: ["queued", "running", "succeeded", "failed", "cancelled"],
      notes: [
        minimaxVideoConfigured
          ? "Text-to-video and image-to-video execute through the official MiniMax Hailuo video API."
          : runningHubVideoConfigured
            ? "Video routes can execute through the shared RunningHub media adapter."
          : "Video routes are protected by workspace permission checks.",
        minimaxVideoConfigured
          ? "MiniMax is the default video model; RunningHub remains a workflow fallback when configured."
          : runningHubVideoConfigured
            ? "Platform media execution is configured for video tasks."
          : videoRuntimeEnabled
            ? "Video runtime is enabled in the current environment."
            : "Video runtime is currently disabled by runtime flags.",
      ],
    },
    {
      id: "ai-music-runtime",
      capabilitySlug: "ai-music",
      title: "AI audio runtime",
      mode: minimaxAudioConfigured ? "hybrid" : "deferred",
      enabled: minimaxAudioConfigured,
      runtimeId: minimaxAudioConfigured ? "minimax-audio" : "planned-music",
      statuses: ["queued", "running", "succeeded", "failed", "cancelled"],
      notes: [
        minimaxAudioConfigured
          ? "MiniMax powers AI music, voice clone, and async speech synthesis inside the shared media workspace."
          : "Audio runtime stays deferred until LEAD_TOOLS_MINIMAX_API_KEY and LEAD_TOOLS_MINIMAX_BASE_URL are configured.",
        "Audio access prefers the audio_generation entitlement and falls back to video_generation for backward compatibility.",
        minimaxAudioConfigured
          ? "The public AI music entry and dashboard workspace both route to the same MiniMax adapter."
          : "The workspace stays visible, but submissions remain blocked until the MiniMax runtime is configured.",
      ],
    },
  ]

  return {
    providers,
    tasks,
    mediaRuntimeEnabled,
    runningHubImageConfigured,
    runningHubVideoConfigured,
    runningHubMusicConfigured: false,
  }
}

export function getPlatformMediaCapabilityStateFromSnapshot(
  snapshot: PlatformRuntimeSnapshot,
  capabilitySlug: PlatformMediaCapabilitySlug,
): PlatformMediaCapabilityState {
  const providers = snapshot.providers.filter(
    (provider) =>
      (provider.scope === "image" || provider.scope === "video" || provider.scope === "audio") &&
      provider.capabilitySlugs.includes(capabilitySlug),
  )
  const task = snapshot.tasks.find((item) => item.capabilitySlug === capabilitySlug)

  if (task?.mode === "deferred") {
    return {
      capabilitySlug,
      providers,
      task,
      runtimeStatus: "deferred",
    }
  }

  if (task && !task.enabled) {
    return {
      capabilitySlug,
      providers,
      task,
      runtimeStatus: "runtime_disabled",
    }
  }

  if (!task && providers.every((provider) => provider.role === "planned" && !provider.configured)) {
    return {
      capabilitySlug,
      providers,
      task,
      runtimeStatus: "deferred",
    }
  }

  return {
    capabilitySlug,
    providers,
    task,
    runtimeStatus: "ready",
  }
}
