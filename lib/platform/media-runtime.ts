import { getImageAssistantAvailability } from "@/lib/image-assistant/aiberm"
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
  })
}

export function buildPlatformMediaRuntimeEntriesFromState(input: PlatformMediaRuntimeBuildInput) {
  const { imageAvailability, videoRuntimeEnabled, runningHubConfig } = input
  const runningHubImageConfigured = isRunningHubConfiguredForTarget("ai-image", runningHubConfig)
  const runningHubVideoConfigured = isRunningHubConfiguredForTarget("ai-video", runningHubConfig)
  const runningHubMusicConfigured = isRunningHubConfiguredForTarget("ai-music", runningHubConfig)
  const mediaRuntimeEnabled = hasRunningHubMediaExecution(runningHubConfig)

  const providers: PlatformProviderRuntime[] = [
    {
      id: imageAvailability.provider,
      scope: "image",
      configured: imageAvailability.enabled,
      active: imageAvailability.enabled && !runningHubImageConfigured,
      model: `${imageAvailability.models.highQuality} / ${imageAvailability.models.lowCost}`,
      baseURL: null,
      role: runningHubImageConfigured ? "fallback" : getImageProviderRole(imageAvailability.provider),
      capabilitySlugs: ["ai-image"],
      notes: uniqueNotes([
        imageAvailability.reason ? `Image runtime reason: ${imageAvailability.reason}.` : "Image runtime is ready.",
        runningHubImageConfigured
          ? "Current image flows can be routed through RunningHub while the image-assistant runtime stays available as fallback."
          : "Current image flows still run through the existing image-assistant runtime.",
      ]),
    },
    {
      id: "runninghub-image",
      scope: "image",
      configured: runningHubImageConfigured,
      active: runningHubImageConfigured,
      model: null,
      baseURL: runningHubConfig.baseUrl,
      role: runningHubImageConfigured ? "primary" : "planned",
      capabilitySlugs: ["ai-image", "runninghub-media"],
      notes: [
        runningHubImageConfigured
          ? "Configured as the shared image provider in the unified media runtime."
          : "Reserved as the target image provider in the shared media runtime.",
        runningHubImageConfigured
          ? "Image capability can execute through the platform media adapter."
          : "Image capability still falls back to the existing image-assistant execution layer today.",
      ],
    },
    {
      id: "runninghub-video",
      scope: "video",
      configured: runningHubVideoConfigured,
      active: runningHubVideoConfigured,
      model: null,
      baseURL: runningHubConfig.baseUrl,
      role: runningHubVideoConfigured ? "primary" : "planned",
      capabilitySlugs: ["ai-video", "runninghub-media"],
      notes: [
        runningHubVideoConfigured
          ? "Configured as the shared video provider in the unified media runtime."
          : "Reserved as the target video provider in the shared media runtime.",
        runningHubVideoConfigured
          ? "Video capability can execute through the platform media adapter."
          : "Current video entry still relies on the existing dashboard/video workflow.",
      ],
    },
    {
      id: "runninghub-music",
      scope: "video",
      configured: runningHubMusicConfigured,
      active: runningHubMusicConfigured,
      model: null,
      baseURL: runningHubConfig.baseUrl,
      role: runningHubMusicConfigured ? "primary" : "planned",
      capabilitySlugs: ["ai-music"],
      notes: [
        runningHubMusicConfigured
          ? "Configured as the shared music provider in the unified media runtime."
          : "Reserved as the target music provider in the shared media runtime.",
        runningHubMusicConfigured
          ? "Music capability can execute through the platform media adapter."
          : "Music capability stays as an entry-only surface until the RunningHub music target is configured.",
      ],
    },
  ]

  const tasks: PlatformTaskRuntime[] = [
    {
      id: "ai-image-runtime",
      capabilitySlug: "ai-image",
      title: "AI image assistant queue",
      mode: "async",
      enabled: runningHubImageConfigured || imageAvailability.enabled,
      runtimeId: runningHubImageConfigured ? "runninghub-image" : "image-assistant",
      statuses: ["queued", "running", "succeeded", "failed", "cancelled"],
      notes: [
        runningHubImageConfigured
          ? "Image generation is now available through the shared RunningHub media adapter."
          : "Image generation defaults to the async assistant queue for stability.",
        runningHubImageConfigured
          ? "Image-assistant stays available as an implementation fallback when RunningHub is not configured."
          : "Direct execution still exists as an explicit opt-in path.",
      ],
    },
    {
      id: "ai-video-runtime",
      capabilitySlug: "ai-video",
      title: "AI video workspace",
      mode: runningHubVideoConfigured || videoRuntimeEnabled ? "async" : "deferred",
      enabled: runningHubVideoConfigured || videoRuntimeEnabled,
      runtimeId: runningHubVideoConfigured ? "runninghub-video" : "dashboard-video",
      statuses: ["queued", "running", "succeeded", "failed", "cancelled"],
      notes: [
        runningHubVideoConfigured
          ? "Video routes can execute through the shared RunningHub media adapter."
          : "Video routes are protected by workspace permission checks.",
        runningHubVideoConfigured
          ? "Platform media execution is configured for video tasks."
          : videoRuntimeEnabled
            ? "Video runtime is enabled in the current environment."
            : "Video runtime is currently disabled by runtime flags.",
      ],
    },
    {
      id: "ai-music-runtime",
      capabilitySlug: "ai-music",
      title: "AI music runtime",
      mode: runningHubMusicConfigured ? "async" : "deferred",
      enabled: runningHubMusicConfigured,
      runtimeId: runningHubMusicConfigured ? "runninghub-music" : "planned-music",
      statuses: ["queued", "running", "succeeded", "failed", "cancelled"],
      notes: [
        runningHubMusicConfigured
          ? "Music generation is available through the shared RunningHub media adapter."
          : "Music generation stays deferred until the RunningHub music endpoint is configured.",
        runningHubMusicConfigured
          ? "The public AI music entry can hand work into the shared media runtime."
          : "This phase ships the entry point first and keeps runtime wiring minimal.",
      ],
    },
  ]

  return {
    providers,
    tasks,
    mediaRuntimeEnabled,
    runningHubImageConfigured,
    runningHubVideoConfigured,
    runningHubMusicConfigured,
  }
}

export function getPlatformMediaCapabilityStateFromSnapshot(
  snapshot: PlatformRuntimeSnapshot,
  capabilitySlug: PlatformMediaCapabilitySlug,
): PlatformMediaCapabilityState {
  const providers = snapshot.providers.filter(
    (provider) =>
      (provider.scope === "image" || provider.scope === "video") &&
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
