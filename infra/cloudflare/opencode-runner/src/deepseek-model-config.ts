import type { OpenCodeProviderConfig } from "../../../../lib/ai-runtime/contracts"

export const DEEPSEEK_V4_FLASH_MAX_VARIANT = "max"

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
export function buildOpenCodeModelConfig(provider: OpenCodeProviderConfig) {
  return {
    name: provider.modelId,
    ...(isDeepSeekV4Flash(provider)
      ? {
          variants: {
            [DEEPSEEK_V4_FLASH_MAX_VARIANT]: {
              reasoningEffort: "max",
              body: { thinking: { type: "enabled" } },
            },
          },
        }
      : {}),
  }
}
