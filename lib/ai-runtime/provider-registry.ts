import { minimaxAudioAdapter } from "@/lib/ai-runtime/adapters/minimax-audio"
import { minimaxVideoAdapter } from "@/lib/ai-runtime/adapters/minimax-video"
import { runninghubVideoAdapter } from "@/lib/ai-runtime/adapters/runninghub-video"
import {
  unsupportedGoogleAdapter,
  unsupportedOpenAiCompatibleAdapter,
  unsupportedOpenAiOfficialAdapter,
} from "@/lib/ai-runtime/adapters/unsupported"
import type { ModelProviderId, ProviderAdapter } from "@/lib/ai-runtime/types"

const adapters: ProviderAdapter[] = [
  minimaxAudioAdapter,
  minimaxVideoAdapter,
  runninghubVideoAdapter,
  unsupportedOpenAiCompatibleAdapter,
  unsupportedOpenAiOfficialAdapter,
  unsupportedGoogleAdapter,
]

const adaptersByProvider = new Map<ModelProviderId, ProviderAdapter>(
  adapters.map((adapter) => [adapter.provider, adapter]),
)

export function getProviderAdapter(provider: ModelProviderId) {
  return adaptersByProvider.get(provider) || null
}

export function listProviderAdapters() {
  return [...adapters]
}
