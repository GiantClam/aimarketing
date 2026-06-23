import type {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  CapabilityTaskQueryRequest,
  CapabilityTaskQueryResult,
  ModelDefinition,
  ModelProviderId,
  ProviderAdapter,
  ProviderConfigContext,
} from "@/lib/ai-runtime/types"

function buildUnsupported(provider: ModelProviderId): ProviderAdapter {
  const unsupported = async (_input: CapabilityExecutionRequest | CapabilityTaskQueryRequest, model: ModelDefinition) => {
    throw new Error(`${provider}_runtime_not_implemented:${model.id}`)
  }

  return {
    provider,
    isConfigured(_input: ProviderConfigContext) {
      return true
    },
    execute(input: CapabilityExecutionRequest, model: ModelDefinition): Promise<CapabilityExecutionResult> {
      return unsupported(input, model) as Promise<CapabilityExecutionResult>
    },
    query(input: CapabilityTaskQueryRequest, model: ModelDefinition): Promise<CapabilityTaskQueryResult> {
      return unsupported(input, model) as Promise<CapabilityTaskQueryResult>
    },
  }
}

export const unsupportedOpenAiCompatibleAdapter = buildUnsupported("openai_compatible")
export const unsupportedOpenAiOfficialAdapter = buildUnsupported("openai_official")
export const unsupportedGoogleAdapter = buildUnsupported("google_official")
