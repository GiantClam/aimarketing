import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { unstable_cache } from "next/cache"
import { createHash } from "node:crypto"
import { ModelConfig } from "../types"

const DEFAULT_OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
const CACHE_TTL_SECONDS = Number.parseInt(
  process.env.MODELS_CACHE_TTL_SECONDS || "1800",
  10
)

type OpenRouterModel = {
  id: string
  name?: string
  description?: string
  context_length?: number
  architecture?: {
    input_modalities?: string[]
    output_modalities?: string[]
  }
  pricing?: {
    prompt?: string
    completion?: string
  }
  supported_parameters?: string[]
}

type OpenRouterModelsResponse = {
  data?: OpenRouterModel[]
}

function hashApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16)
}

function toNumberOrUndefined(value: string | undefined) {
  if (!value) return undefined
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function toPerMillion(value: number | undefined) {
  if (value === undefined) return undefined
  return value * 1_000_000
}

function inferBaseProviderId(modelId: string) {
  const [vendor] = modelId.split("/")
  if (!vendor) return "openrouter"
  return vendor.toLowerCase()
}

function inferIcon(baseProviderId: string) {
  const iconMap: Record<string, string> = {
    openai: "openai",
    anthropic: "claude",
    google: "google",
    xai: "xai",
    deepseek: "deepseek",
    mistral: "mistral",
    perplexity: "perplexity",
    meta: "meta",
  }
  return iconMap[baseProviderId] || "openrouter"
}

function mapOpenRouterModelToConfig(
  model: OpenRouterModel,
  apiKey: string
): ModelConfig {
  const baseProviderId = inferBaseProviderId(model.id)
  const inputCost = toPerMillion(toNumberOrUndefined(model.pricing?.prompt))
  const outputCost = toPerMillion(toNumberOrUndefined(model.pricing?.completion))
  const supports = new Set(model.supported_parameters || [])
  const inputModalities = model.architecture?.input_modalities || []

  return {
    id: `openrouter:${model.id}`,
    name: model.name || model.id,
    provider: "OpenRouter",
    providerId: "openrouter",
    modelFamily: "OpenRouter",
    baseProviderId,
    description: model.description,
    tags: ["dynamic", "cached", "openrouter"],
    contextWindow: model.context_length,
    inputCost,
    outputCost,
    priceUnit: "per 1M tokens",
    vision: inputModalities.includes("image") || inputModalities.includes("file"),
    tools: supports.has("tools") || supports.has("tool_choice"),
    audio: inputModalities.includes("audio"),
    reasoning: supports.has("reasoning") || supports.has("include_reasoning"),
    webSearch: supports.has("web_search"),
    openSource: false,
    speed: "Medium",
    intelligence: "High",
    website: "https://openrouter.ai",
    apiDocs: `https://openrouter.ai/${model.id}`,
    modelPage: `https://openrouter.ai/${model.id}`,
    icon: inferIcon(baseProviderId),
    apiSdk: (key?: string, opts?: { enableSearch?: boolean }) =>
      createOpenRouter({
        apiKey: key || apiKey,
        ...(opts?.enableSearch && {
          extraBody: {
            plugins: [{ id: "web", max_results: 3 }],
          },
        }),
      }).chat(model.id),
  }
}

async function fetchOpenRouterModelsUncached(
  apiKey: string
): Promise<ModelConfig[]> {
  const url =
    process.env.OPENROUTER_MODELS_URL?.trim() || DEFAULT_OPENROUTER_MODELS_URL

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`openrouter_models_fetch_failed:${response.status}`)
  }

  const payload = (await response.json()) as OpenRouterModelsResponse
  const rows = Array.isArray(payload.data) ? payload.data : []
  return rows
    .filter((item) => typeof item.id === "string" && item.id.length > 0)
    .map((item) => mapOpenRouterModelToConfig(item, apiKey))
}

export async function getCachedOpenRouterModels(
  apiKey?: string
): Promise<ModelConfig[]> {
  const resolvedKey = (apiKey || process.env.OPENROUTER_API_KEY || "").trim()
  if (!resolvedKey) return []

  const keyHash = hashApiKey(resolvedKey)
  const ttl = Number.isFinite(CACHE_TTL_SECONDS) ? CACHE_TTL_SECONDS : 1800
  const getCached = unstable_cache(
    async () => fetchOpenRouterModelsUncached(resolvedKey),
    ["models", "openrouter", keyHash],
    { revalidate: ttl, tags: ["models:openrouter"] }
  )

  return getCached()
}
