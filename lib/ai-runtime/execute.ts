import { getDefaultModelId, getModelDefinition, validateAndNormalizeModelInput } from "@/lib/ai-runtime/model-registry"
import { getProviderAdapter } from "@/lib/ai-runtime/provider-registry"
import type { CapabilityExecutionRequest } from "@/lib/ai-runtime/types"
import type { ModelCapability } from "@/lib/ai-runtime/capabilities"

export function resolveModelIdForCapability(input: {
  capability: ModelCapability
  requestedModelId?: string | null
  requestedAlias?: string | null
}) {
  if (input.requestedModelId) return input.requestedModelId
  if (input.requestedAlias) return input.requestedAlias
  return getDefaultModelId(input.capability)
}

export async function executeCapability(input: CapabilityExecutionRequest) {
  const model = getModelDefinition(input.modelId)
  if (!model) {
    throw new Error("capability_model_not_found")
  }
  if (model.capability !== input.capability) {
    throw new Error("capability_model_mismatch")
  }
  const adapter = getProviderAdapter(model.provider, model.capability)
  if (!adapter) {
    throw new Error("capability_provider_adapter_not_found")
  }
  if (!adapter.isConfigured({ runtimeContext: input.runtimeContext })) {
    throw new Error(`${model.provider}_not_configured`)
  }

  const cleanInput = validateAndNormalizeModelInput(model, input.input)
  return adapter.execute(
    {
      ...input,
      input: cleanInput,
    },
    model,
  )
}
