import type {
  AiEntryProviderConfig,
  AiEntryProviderId,
} from "@/lib/ai-entry/provider-routing"

export function mergeEnterpriseTextProviderConfigs(params: {
  enterpriseProviderConfigs: AiEntryProviderConfig[]
  platformProviderConfigs: AiEntryProviderConfig[]
}) {
  const merged = new Map<AiEntryProviderId, AiEntryProviderConfig>()

  for (const provider of params.enterpriseProviderConfigs) {
    merged.set(provider.id, provider)
  }

  // Keep env-configured providers executable when the catalog exposes them
  // alongside the enterprise-selected default.
  for (const provider of params.platformProviderConfigs) {
    if (!merged.has(provider.id)) {
      merged.set(provider.id, provider)
    }
  }

  return [...merged.values()]
}
