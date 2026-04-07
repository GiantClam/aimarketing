import { FREE_MODELS_IDS } from "../config"
import { claudeModels } from "./data/claude"
import { deepseekModels } from "./data/deepseek"
import { geminiModels } from "./data/gemini"
import { grokModels } from "./data/grok"
import { mistralModels } from "./data/mistral"
import { getOllamaModels, ollamaModels } from "./data/ollama"
import { openaiModels } from "./data/openai"
import { openrouterModels } from "./data/openrouter"
import { getCachedOpenRouterModels } from "./data/openrouter-remote"
import { perplexityModels } from "./data/perplexity"
import { ModelConfig } from "./types"

// Static models (always available)
const STATIC_MODELS: ModelConfig[] = [
  ...openaiModels,
  ...mistralModels,
  ...deepseekModels,
  ...claudeModels,
  ...grokModels,
  ...perplexityModels,
  ...geminiModels,
  ...ollamaModels, // Static fallback Ollama models
  ...openrouterModels,
]

// Dynamic models cache
let dynamicModelsCache: ModelConfig[] | null = null
let lastFetchTime = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

function mergeModelsById(models: ModelConfig[]) {
  const merged = new Map<string, ModelConfig>()
  for (const model of models) {
    merged.set(model.id, model)
  }
  return Array.from(merged.values())
}

// // Function to get all models including dynamically detected ones
export async function getAllModels(): Promise<ModelConfig[]> {
  const now = Date.now()

  // Use cache if it's still valid
  if (dynamicModelsCache && now - lastFetchTime < CACHE_DURATION) {
    return dynamicModelsCache
  }

  try {
    // Get dynamically detected Ollama models (includes enabled check internally)
    const detectedOllamaModels = await getOllamaModels()
    const remoteOpenRouterModels = await getCachedOpenRouterModels()

    // Combine static models (excluding static Ollama/OpenRouter models) with dynamic ones
    const staticModelsWithoutDynamicProviders = STATIC_MODELS.filter(
      (model) =>
        model.providerId !== "ollama" && model.providerId !== "openrouter"
    )

    dynamicModelsCache = mergeModelsById([
      ...staticModelsWithoutDynamicProviders,
      ...detectedOllamaModels,
      ...(remoteOpenRouterModels.length > 0
        ? remoteOpenRouterModels
        : openrouterModels),
    ])

    lastFetchTime = now
    return dynamicModelsCache
  } catch (error) {
    console.warn("Failed to load dynamic models, using static models:", error)
    return STATIC_MODELS
  }
}

export async function getModelsWithAccessFlags(): Promise<ModelConfig[]> {
  const models = await getAllModels()

  const freeModels = models
    .filter(
      (model) =>
        FREE_MODELS_IDS.includes(model.id) || model.providerId === "ollama"
    )
    .map((model) => ({
      ...model,
      accessible: true,
    }))

  const proModels = models
    .filter((model) => !freeModels.map((m) => m.id).includes(model.id))
    .map((model) => ({
      ...model,
      accessible: false,
    }))

  return [...freeModels, ...proModels]
}

export async function getModelsForProvider(
  provider: string,
  options?: { apiKey?: string }
): Promise<ModelConfig[]> {
  if (provider === "openrouter") {
    const remoteModels = await getCachedOpenRouterModels(options?.apiKey)
    const sourceModels = remoteModels.length > 0 ? remoteModels : openrouterModels
    return sourceModels.map((model) => ({
      ...model,
      accessible: true,
    }))
  }

  const providerModels = STATIC_MODELS
    .filter((model) => model.providerId === provider)
    .map((model) => ({
      ...model,
      accessible: true,
    }))

  return providerModels
}

// Function to get models based on user's available providers
export async function getModelsForUserProviders(
  providers: string[],
  options?: { providerApiKeys?: Record<string, string | undefined> }
): Promise<ModelConfig[]> {
  const providerModels = await Promise.all(
    providers.map((provider) =>
      getModelsForProvider(provider, {
        apiKey: options?.providerApiKeys?.[provider],
      })
    )
  )

  const flatProviderModels = providerModels.flat()

  return flatProviderModels
}

// Synchronous function to get model info for simple lookups
// This uses cached data if available, otherwise falls back to static models
export function getModelInfo(modelId: string): ModelConfig | undefined {
  // First check the cache if it exists
  if (dynamicModelsCache) {
    return dynamicModelsCache.find((model) => model.id === modelId)
  }

  // Fall back to static models for immediate lookup
  return STATIC_MODELS.find((model) => model.id === modelId)
}

// For backward compatibility - static models only
export const MODELS: ModelConfig[] = STATIC_MODELS

// Function to refresh the models cache
export function refreshModelsCache(): void {
  dynamicModelsCache = null
  lastFetchTime = 0
}
