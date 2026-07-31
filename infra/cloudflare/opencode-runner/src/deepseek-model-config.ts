import type { OpenCodeProviderConfig } from "../../../../lib/ai-runtime/contracts"

export const DEEPSEEK_V4_FLASH_MAX_VARIANT = "max"
export type DeepSeekReasoningEffort = "auto" | "none" | "low" | "high" | "max"

export function isDeepSeekV4Flash(provider: OpenCodeProviderConfig) {
  // The platform also exposes this model through the enterprise
  // OpenAI-compatible route. The model ID, not the provider label, is the
  // stable signal that DeepSeek's reasoning_effort contract applies.
  return provider.modelId === "deepseek-v4-flash"
}

/**
 * DeepSeek V4 exposes max reasoning through OpenCode's model variant layer.
 * The body override keeps thinking mode explicit for the OpenAI-compatible
 * provider instead of relying on its default.
 */
export function buildOpenCodeModelConfig(
  provider: OpenCodeProviderConfig,
  reasoningEffort: DeepSeekReasoningEffort = "auto",
) {
  const variant = reasoningEffort === "auto" ? DEEPSEEK_V4_FLASH_MAX_VARIANT : reasoningEffort
  const thinking = reasoningEffort === "none" ? "disabled" : "enabled"
  return {
    name: provider.modelId,
    ...(isDeepSeekV4Flash(provider)
      ? {
          variants: {
            [variant]: {
              ...(variant !== "none" ? { reasoningEffort: variant } : {}),
              body: { thinking: { type: thinking } },
            },
          },
        }
      : {}),
  }
}
