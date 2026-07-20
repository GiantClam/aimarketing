/**
 * OpenCode provider IDs are configuration keys, not the platform's provider
 * IDs. OpenCode accepts underscores in those keys consistently, while IDs
 * containing hyphens can make the server exit before it exposes its API.
 * Keep the platform ID unchanged at the request boundary, and use this stable
 * runtime key everywhere we build OpenCode config or select a model.
 */
export function providerRuntimeKey(providerId: string) {
  const normalized = providerId.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
  if (!normalized) throw new Error("runtime_provider_id_required")
  return { configKey: normalized, envKey: `${normalized.toUpperCase()}_API_KEY` }
}
