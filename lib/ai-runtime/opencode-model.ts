function normalize(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * The SaaS model catalog exposes provider-local display IDs, while OpenCode
 * resolves models using provider/model IDs. Keep the conversion at the
 * runtime boundary so native-provider requests keep their existing IDs.
 */
export function resolveOpenCodeModelHint(input: {
  providerId?: string | null
  modelId?: string | null
}) {
  const modelId = normalize(input.modelId)
  if (!modelId) return null

  const providerId = normalize(input.providerId).toLowerCase()
  // OpenRouter model IDs commonly contain a vendor slash (for example
  // x-ai/grok-4.5), but OpenCode still requires its provider prefix.
  if (providerId && modelId.startsWith(`${providerId}/`)) return modelId

  if (providerId === "openrouter") {
    return `openrouter/${modelId === "grok-4.5" ? "x-ai/grok-4.5" : modelId}`
  }

  if (modelId.includes("/")) return modelId

  if (providerId === "deepseek" || (providerId === "enterprise-openai-compatible" && /^deepseek(?:[-_.]|$)/iu.test(modelId))) {
    return `deepseek/${modelId}`
  }

  if (providerId === "pptoken" && /^grok(?:[-_.]|$)/iu.test(modelId)) {
    return `pptoken/${modelId}`
  }

  return modelId
}
