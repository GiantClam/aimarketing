import { minimaxAudioAdapter } from "@/lib/ai-runtime/adapters/minimax-audio"
import { minimaxVideoAdapter } from "@/lib/ai-runtime/adapters/minimax-video"
import { bailianImageAdapter } from "@/lib/ai-runtime/adapters/bailian-image"
import { bailianVideoAdapter } from "@/lib/ai-runtime/adapters/bailian-video"
import { openAiCompatibleImageAdapter } from "@/lib/ai-runtime/adapters/openai-compatible-image"
import { runninghubVideoAdapter } from "@/lib/ai-runtime/adapters/runninghub-video"
import {
  unsupportedGoogleAdapter,
  unsupportedOpenAiCompatibleAdapter,
  unsupportedOpenAiOfficialAdapter,
} from "@/lib/ai-runtime/adapters/unsupported"
import type { ModelCapability } from "@/lib/ai-runtime/capabilities"
import type { ModelProviderId, ProviderAdapter } from "@/lib/ai-runtime/types"
import { resolveWorkflowFeatures } from "@/lib/workflows/features"

const adapters: ProviderAdapter[] = [
  bailianImageAdapter,
  bailianVideoAdapter,
  minimaxAudioAdapter,
  minimaxVideoAdapter,
  runninghubVideoAdapter,
  openAiCompatibleImageAdapter,
  unsupportedOpenAiCompatibleAdapter,
  unsupportedOpenAiOfficialAdapter,
  unsupportedGoogleAdapter,
]

const adaptersByProvider = new Map<ModelProviderId, ProviderAdapter[]>()
for (const adapter of adapters) {
  const candidates = adaptersByProvider.get(adapter.provider) || []
  candidates.push(adapter)
  adaptersByProvider.set(adapter.provider, candidates)
}

export function getProviderAdapter(provider: ModelProviderId, capability?: ModelCapability) {
  const candidates = adaptersByProvider.get(provider) || []
  if (provider === "openai_compatible" && capability?.startsWith("image.")) {
    if (!resolveWorkflowFeatures().openAiImageAdapterV1) return null
  }
  if (capability) {
    return candidates.find((adapter) => adapter.capabilities?.includes(capability)) || null
  }
  return candidates[0] || null
}

export function listProviderAdapters() {
  return adapters.filter((adapter) => {
    if (adapter === openAiCompatibleImageAdapter) {
      return resolveWorkflowFeatures().openAiImageAdapterV1
    }
    return true
  })
}
