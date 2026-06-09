import { getAiEntryCurrentProviderConfig, getConfiguredAiEntryProviders } from "@/lib/ai-entry/provider-routing"
import { FEATURE_KEYS, type FeatureKey } from "@/lib/enterprise/constants"
import {
  allowLeadToolMockFallback,
  getLeadToolFinalModel,
  getLeadToolPptExportRuntime,
  getLeadToolPptPreviewRuntime,
  getLeadToolPreviewModel,
} from "@/lib/lead-tools/config"
import { hasLeadToolGenerationProvider } from "@/lib/lead-tools/generation"
import { buildPlatformMediaRuntimeEntries } from "@/lib/platform/media-runtime"
import { isVideoGenerationEnabled, isWebsiteGenerationEnabled } from "@/lib/runtime-features"
import { getWriterSkillsAvailability } from "@/lib/writer/skills"

export type PlatformTaskRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"

export type PlatformProviderRuntime = {
  id: string
  scope: "text" | "image" | "video" | "audio" | "agent" | "tooling"
  configured: boolean
  active: boolean
  model: string | null
  baseURL: string | null
  role: "primary" | "fallback" | "planned"
  capabilitySlugs: string[]
  notes: string[]
}

export type PlatformTaskRuntime = {
  id: string
  capabilitySlug: string
  title: string
  mode: "interactive" | "sync" | "async" | "hybrid" | "deferred"
  enabled: boolean
  runtimeId: string
  statuses: PlatformTaskRunStatus[]
  notes: string[]
}

export type PlatformEntitlementRuntime = {
  feature: FeatureKey
  runtimeEnabled: boolean
  accessModel: "enterprise_permission" | "enterprise_admin" | "public_then_login"
  capabilitySlugs: string[]
  notes: string[]
}

export type PlatformRuntimeSnapshot = {
  generatedAt: string
  activeTextProvider: string | null
  providers: PlatformProviderRuntime[]
  tasks: PlatformTaskRuntime[]
  entitlements: PlatformEntitlementRuntime[]
}

function uniqueNotes(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function buildEntitlementNotes(feature: FeatureKey) {
  if (feature === "video_generation") {
    return [
      "Protected by enterprise permission checks in dashboard routes.",
      "Runtime can be disabled globally with NEXT_PUBLIC_ENABLE_VIDEO_GENERATION.",
    ]
  }

  if (feature === "website_generation") {
    return [
      "Kept behind a runtime feature flag before broader rollout.",
      "Used as a platform expansion slot for future public and enterprise flows.",
    ]
  }

  return [
    "Enterprise admins inherit access automatically.",
    "Non-admin workspace users rely on explicit per-feature permissions.",
  ]
}

function getEntitlementCapabilitySlugs(feature: FeatureKey) {
  if (feature === "expert_advisor") {
    return ["ai-chat", "agent-platform"] as string[]
  }

  if (feature === "customer_profile_entry") {
    return ["agent-platform", "knowledge-base"] as string[]
  }

  if (feature === "copywriting_generation") {
    return ["content-repurpose", "campaign-launch"] as string[]
  }

  if (feature === "image_design_generation") {
    return ["ai-image", "visual-ad-pipeline"] as string[]
  }

  if (feature === "video_generation") {
    return ["ai-video", "ai-music", "visual-ad-pipeline"] as string[]
  }

  if (feature === "website_generation") {
    return [] as string[]
  }

  return [] as string[]
}

export function getPlatformRuntimeSnapshot(): PlatformRuntimeSnapshot {
  const aiEntryProviders = getConfiguredAiEntryProviders()
  const activeAiEntryProvider = getAiEntryCurrentProviderConfig()
  const writerAvailability = getWriterSkillsAvailability()
  const leadToolProviderAvailable = hasLeadToolGenerationProvider()
  const videoRuntimeEnabled = isVideoGenerationEnabled()
  const mediaRuntime = buildPlatformMediaRuntimeEntries()

  const providers: PlatformProviderRuntime[] = [
    ...aiEntryProviders.map((provider) => ({
      id: provider.id,
      scope: "text" as const,
      configured: true,
      active: activeAiEntryProvider?.id === provider.id,
      model: provider.model,
      baseURL: provider.baseURL,
      role:
        provider.id === "pptoken" || provider.id === "openrouter"
          ? ("primary" as const)
          : ("fallback" as const),
      capabilitySlugs: ["ai-chat", "agent-platform"],
      notes: uniqueNotes([
        provider.id === "pptoken"
          ? "Preferred text route for OpenAI-family traffic."
          : provider.id === "openrouter"
            ? "Primary multi-family text route in the shared platform provider layer."
            : "Available as provider failover in ai-entry routing.",
      ]),
    })),
    {
      id: `writer:${writerAvailability.provider}`,
      scope: "text",
      configured: writerAvailability.enabled,
      active: writerAvailability.enabled,
      model: null,
      baseURL: null,
      role: writerAvailability.enabled ? "primary" : "fallback",
      capabilitySlugs: ["content-repurpose", "agent-platform"],
      notes: uniqueNotes([
        `Writer provider status: ${writerAvailability.reason}.`,
        writerAvailability.webResearchEnabled ? "Writer web research is enabled." : "Writer web research is disabled.",
        writerAvailability.requiresWebResearch ? "Writer runtime requires web research support." : "Writer runtime can operate without web research.",
      ]),
    },
    {
      id: "lead-tools",
      scope: "tooling",
      configured: leadToolProviderAvailable,
      active: leadToolProviderAvailable,
      model: `${getLeadToolPreviewModel("ai-ppt-preview")} → ${getLeadToolFinalModel("ai-ppt-preview")}`,
      baseURL: null,
      role: leadToolProviderAvailable ? "primary" : "fallback",
      capabilitySlugs: ["ai-ppt", "ai-chat", "campaign-launch"],
      notes: uniqueNotes([
        `PPT preview runtime: ${getLeadToolPptPreviewRuntime("ai-ppt-preview")}.`,
        `PPT export runtime: ${getLeadToolPptExportRuntime("ai-ppt-preview")}.`,
        allowLeadToolMockFallback() ? "Mock fallback is still allowed in the current environment." : "Mock fallback is disabled.",
      ]),
    },
    ...mediaRuntime.providers,
  ]

  const tasks: PlatformTaskRuntime[] = [
    {
      id: "ai-chat-runtime",
      capabilitySlug: "ai-chat",
      title: "AI chat workspace",
      mode: "interactive",
      enabled: aiEntryProviders.length > 0,
      runtimeId: "ai-entry",
      statuses: ["running", "succeeded", "failed", "cancelled"],
      notes: [
        "Streams directly through ai-entry provider routing.",
        "Acts as the shared execution surface for advisor and agent flows.",
      ],
    },
    {
      id: "ai-ppt-preview-runtime",
      capabilitySlug: "ai-ppt",
      title: "AI PPT preview and export",
      mode: "hybrid",
      enabled: true,
      runtimeId: getLeadToolPptPreviewRuntime("ai-ppt-preview"),
      statuses: ["running", "succeeded", "failed"],
      notes: [
        "Preview is available before login; export stays behind authentication.",
        `Export runtime currently resolves to ${getLeadToolPptExportRuntime("ai-ppt-preview")}.`,
      ],
    },
    {
      id: "campaign-launch-runtime",
      capabilitySlug: "campaign-launch",
      title: "Campaign launch workflow",
      mode: "hybrid",
      enabled: true,
      runtimeId: getLeadToolPptPreviewRuntime("ai-ppt-preview"),
      statuses: ["running", "succeeded", "failed"],
      notes: [
        "Bridges public launch workflows into the shared AI PPT preview and export path.",
        "Reuses the existing lead-tools runtime instead of introducing a second campaign workflow backend.",
      ],
    },
    {
      id: "content-repurpose-runtime",
      capabilitySlug: "content-repurpose",
      title: "Content repurpose workflow",
      mode: "async",
      enabled: writerAvailability.enabled,
      runtimeId: `writer:${writerAvailability.provider}`,
      statuses: ["queued", "running", "succeeded", "failed", "cancelled"],
      notes: [
        "Reuses the writer async queue for rewrite, social, SEO, and multi-format repurpose tasks.",
        writerAvailability.enabled
          ? "Writer runtime is available for execution."
          : `Writer runtime unavailable: ${writerAvailability.reason}.`,
      ],
    },
    {
      id: "knowledge-base-runtime",
      capabilitySlug: "knowledge-base",
      title: "Knowledge hub",
      mode: "interactive",
      enabled: true,
      runtimeId: "knowledge-base-hub",
      statuses: ["succeeded"],
      notes: [
        "Acts as a governed workspace front door for enterprise knowledge and advisor context.",
        "Keeps governance and knowledge navigation on the shared platform shell.",
      ],
    },
    {
      id: "visual-ad-pipeline-runtime",
      capabilitySlug: "visual-ad-pipeline",
      title: "Visual ad pipeline",
      mode: mediaRuntime.mediaRuntimeEnabled ? "async" : "deferred",
      enabled: mediaRuntime.mediaRuntimeEnabled,
      runtimeId: mediaRuntime.mediaRuntimeEnabled ? "runninghub-media" : "planned",
      statuses: ["queued", "running", "succeeded", "failed", "cancelled"],
      notes: [
        mediaRuntime.mediaRuntimeEnabled
          ? "Shared image and video workflow execution is available through the platform media adapter."
          : "Reserved as the shared image and video workflow layer until unified media execution lands.",
      ],
    },
    ...mediaRuntime.tasks,
    {
      id: "sentiment-monitoring-runtime",
      capabilitySlug: "public-relations-agent",
      title: "Sentiment monitoring",
      mode: "deferred",
      enabled: false,
      runtimeId: "planned",
      statuses: ["queued", "running", "succeeded", "failed", "cancelled"],
      notes: [
        "UI and registry entry exist, but runtime implementation is intentionally deferred.",
      ],
    },
    {
      id: "video-remake-runtime",
      capabilitySlug: "video-ops-agent",
      title: "Video remake and hot-video search",
      mode: "deferred",
      enabled: false,
      runtimeId: "planned",
      statuses: ["queued", "running", "succeeded", "failed", "cancelled"],
      notes: [
        "Reserved as a future enterprise/video operations module without a fake runtime today.",
      ],
    },
  ]

  const entitlements: PlatformEntitlementRuntime[] = FEATURE_KEYS.map((feature) => ({
    feature,
    runtimeEnabled: feature === "website_generation" ? isWebsiteGenerationEnabled() : feature === "video_generation" ? videoRuntimeEnabled : true,
    accessModel:
      feature === "website_generation"
        ? "enterprise_admin"
        : feature === "video_generation"
          ? "enterprise_permission"
          : feature === "customer_profile_entry" || feature === "expert_advisor" || feature === "copywriting_generation" || feature === "image_design_generation"
            ? "enterprise_permission"
            : "public_then_login",
    capabilitySlugs: getEntitlementCapabilitySlugs(feature),
    notes: buildEntitlementNotes(feature),
  }))

  return {
    generatedAt: new Date().toISOString(),
    activeTextProvider: activeAiEntryProvider?.id || null,
    providers,
    tasks,
    entitlements,
  }
}
