import type { AppLocale } from "@/lib/i18n/config"
import {
  getLocalizedPlatformCapabilities,
  type LocalizedCapabilityDescriptor,
  type PlatformCatalogSurface,
} from "@/lib/platform/catalog"
import type { PlatformRuntimeSnapshot } from "@/lib/platform/runtime"

function getRuntimeModeLabel(
  locale: AppLocale,
  mode: PlatformRuntimeSnapshot["tasks"][number]["mode"],
) {
  if (locale === "zh") {
    return {
      interactive: "交互式运行时",
      sync: "同步运行时",
      async: "异步任务运行时",
      hybrid: "混合式运行时",
      deferred: "后续实现运行时",
    }[mode]
  }

  return {
    interactive: "Interactive runtime",
    sync: "Synchronous runtime",
    async: "Async task runtime",
    hybrid: "Hybrid runtime",
    deferred: "Deferred runtime",
  }[mode]
}

function deriveBindingStatus(provider: PlatformRuntimeSnapshot["providers"][number]) {
  if (!provider.configured && provider.role === "planned") return "planned" as const
  if (provider.active || provider.role === "primary") return "active" as const
  if (provider.configured) return "fallback" as const
  return "planned" as const
}

function deriveCapabilityStatus(
  baseStatus: LocalizedCapabilityDescriptor["status"],
  task: PlatformRuntimeSnapshot["tasks"][number] | undefined,
  bindings: LocalizedCapabilityDescriptor["bindings"],
) {
  if (task && (!task.enabled || task.mode === "deferred")) {
    return "planned" as const
  }

  if (bindings.length > 0 && bindings.every((binding) => binding.status === "planned")) {
    return "planned" as const
  }

  if (baseStatus === "live") {
    return bindings.some((binding) => binding.status === "active") ? "live" : "beta"
  }

  return baseStatus
}

function deriveCapabilityHrefs(
  capability: LocalizedCapabilityDescriptor,
  task: PlatformRuntimeSnapshot["tasks"][number] | undefined,
) {
  if (!task || (task.enabled && task.mode !== "deferred")) {
    return {
      publicHref: capability.publicHref,
      workspaceHref: capability.workspaceHref,
    }
  }

  return {
    publicHref: "/capabilities",
    workspaceHref: "/dashboard/capabilities",
  }
}

export function resolveLocalizedPlatformCapabilitiesFromSnapshot(
  locale: AppLocale,
  surface: PlatformCatalogSurface,
  snapshot: PlatformRuntimeSnapshot,
) {
  return getLocalizedPlatformCapabilities(locale, surface).map<LocalizedCapabilityDescriptor>((capability) => {
    const task = snapshot.tasks.find((item) => item.capabilitySlug === capability.slug)
    const runtimeBindings = snapshot.providers
      .filter((provider) => provider.capabilitySlugs.includes(capability.slug))
      .map((provider) => ({
        provider: provider.id,
        status: deriveBindingStatus(provider),
        note: provider.notes[0] || (locale === "zh" ? "平台运行时提供商" : "Platform runtime provider"),
      }))

    const bindings = runtimeBindings.length > 0 ? runtimeBindings : capability.bindings
    const runtimeProofPoints = task
      ? [
          locale === "zh"
            ? `${getRuntimeModeLabel(locale, task.mode)} · ${task.runtimeId}`
            : `${getRuntimeModeLabel(locale, task.mode)} · ${task.runtimeId}`,
          ...(task.notes[0] ? [task.notes[0]] : []),
        ]
      : []

    const hrefs = deriveCapabilityHrefs(capability, task)

    return {
      ...capability,
      ...hrefs,
      status: deriveCapabilityStatus(capability.status, task, bindings),
      bindings,
      proofPoints: [...runtimeProofPoints, ...capability.proofPoints].slice(0, 4),
    }
  })
}
