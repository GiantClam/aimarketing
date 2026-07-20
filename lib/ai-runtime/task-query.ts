import { getModelDefinition } from "@/lib/ai-runtime/model-registry"
import { getProviderAdapter } from "@/lib/ai-runtime/provider-registry"
import type { CapabilityTaskQueryRequest } from "@/lib/ai-runtime/types"

export async function queryCapabilityTask(input: CapabilityTaskQueryRequest) {
  const model = getModelDefinition(input.modelId)
  if (!model) {
    throw new Error("capability_model_not_found")
  }
  const adapter = getProviderAdapter(model.provider, model.capability)
  if (!adapter?.query) {
    throw new Error("capability_provider_query_not_supported")
  }
  if (!adapter.isConfigured({ runtimeContext: input.runtimeContext })) {
    throw new Error(`${model.provider}_not_configured`)
  }
  return adapter.query(input, model)
}
