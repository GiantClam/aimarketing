import type { OpenCodeProviderConfig } from "../../../../lib/ai-runtime/contracts.js"

/**
 * OpenCode defaults provider requests to five minutes. Native PPT turns can
 * spend longer than that in SVG rendering and quality checks, so the runtime
 * deadline must be the only timeout governing the model request.
 */
export const OPENCODE_PROVIDER_TIMEOUT = false as const

export function buildOpenCodeProviderOptions(provider: OpenCodeProviderConfig) {
  return {
    baseURL: provider.baseUrl,
    apiKey: provider.apiKey,
    timeout: OPENCODE_PROVIDER_TIMEOUT,
  }
}
