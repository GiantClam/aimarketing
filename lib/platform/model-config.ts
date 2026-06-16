export type EnterpriseModelCategory = "text_generation" | "image_generation" | "video_generation"

export type EnterpriseTextModelProviderId =
  | "openai_compatible"
  | "qwen_official"
  | "minimax_official"
  | "glm_official"

export type EnterpriseImageModelProviderId =
  | "google_official"
  | "openai_official"
  | "openai_compatible"

export type EnterpriseVideoModelProviderId =
  | "minimax_official"
  | "gemini_official"
  | "seedance_official"
  | "runninghub"

export type EnterpriseModelProviderId =
  | EnterpriseTextModelProviderId
  | EnterpriseImageModelProviderId
  | EnterpriseVideoModelProviderId

export type EnterpriseModelProviderConfig = {
  providerId: EnterpriseModelProviderId
  label: string
  modelId: string | null
  baseUrl: string | null
  apiKey: string | null
  apiKeyConfigured?: boolean
  enabled: boolean
}

export type EnterpriseModelCategoryConfig = {
  category: EnterpriseModelCategory
  providers: EnterpriseModelProviderConfig[]
  selectedProviderId: EnterpriseModelProviderId | null
  selectedModelId: string | null
}

export type EnterpriseModelConfiguration = Record<EnterpriseModelCategory, EnterpriseModelCategoryConfig>

export type SupportedModelDescriptor = {
  providerId: EnterpriseModelProviderId
  providerLabel: string
  integrationLabel: string
  models: string[]
}

const SUPPORTED_MODEL_CARDS: Record<EnterpriseModelCategory, SupportedModelDescriptor[]> = {
  text_generation: [
    {
      providerId: "openai_compatible",
      providerLabel: "OpenAI Compatible",
      integrationLabel: "Compatible API",
      models: ["硅基流动", "OpenRouter", "PPToken"],
    },
    {
      providerId: "qwen_official",
      providerLabel: "Qwen",
      integrationLabel: "Official API",
      models: ["Qwen 系列模型"],
    },
    {
      providerId: "minimax_official",
      providerLabel: "MiniMax",
      integrationLabel: "Official API",
      models: ["MiniMax 文本模型"],
    },
    {
      providerId: "glm_official",
      providerLabel: "GLM",
      integrationLabel: "Official API",
      models: ["GLM / ChatGLM 系列"],
    },
  ],
  image_generation: [
    {
      providerId: "google_official",
      providerLabel: "Google",
      integrationLabel: "Official API",
      models: ["Nanobanana2"],
    },
    {
      providerId: "openai_official",
      providerLabel: "OpenAI",
      integrationLabel: "Official API",
      models: ["gpt-image-2"],
    },
    {
      providerId: "openai_compatible",
      providerLabel: "OpenAI Compatible",
      integrationLabel: "Compatible API",
      models: ["兼容图片生成接口的 OpenAI 风格服务"],
    },
  ],
  video_generation: [
    {
      providerId: "minimax_official",
      providerLabel: "MiniMax 海螺",
      integrationLabel: "Official API",
      models: ["海螺视频模型"],
    },
    {
      providerId: "gemini_official",
      providerLabel: "Gemini",
      integrationLabel: "Official API",
      models: ["Veo 3.1"],
    },
    {
      providerId: "seedance_official",
      providerLabel: "Seedance",
      integrationLabel: "Official API",
      models: ["Seedance 视频模型"],
    },
    {
      providerId: "runninghub",
      providerLabel: "RunningHub",
      integrationLabel: "RunningHub API",
      models: ["RunningHub 视频工作流"],
    },
  ],
}

const DEFAULT_PROVIDER_BY_CATEGORY: Record<EnterpriseModelCategory, EnterpriseModelProviderId> = {
  text_generation: "openai_compatible",
  image_generation: "openai_official",
  video_generation: "runninghub",
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

function normalizeProviderId(
  category: EnterpriseModelCategory,
  value: unknown,
): EnterpriseModelProviderId {
  const normalized = typeof value === "string" ? value.trim() : ""
  const allowed = new Set(SUPPORTED_MODEL_CARDS[category].map((item) => item.providerId))
  return allowed.has(normalized as EnterpriseModelProviderId)
    ? (normalized as EnterpriseModelProviderId)
    : DEFAULT_PROVIDER_BY_CATEGORY[category]
}

function buildDefaultProviderConfig(
  category: EnterpriseModelCategory,
  providerId: EnterpriseModelProviderId,
): EnterpriseModelProviderConfig {
  const descriptor = SUPPORTED_MODEL_CARDS[category].find((item) => item.providerId === providerId)
  return {
    providerId,
    label: descriptor?.providerLabel || providerId,
    modelId: null,
    baseUrl: null,
    apiKey: null,
    apiKeyConfigured: false,
    enabled: providerId === DEFAULT_PROVIDER_BY_CATEGORY[category],
  }
}

export function getSupportedModelCards(category: EnterpriseModelCategory) {
  return SUPPORTED_MODEL_CARDS[category].map((item) => ({
    ...item,
    models: [...item.models],
  }))
}

export function buildDefaultEnterpriseModelConfiguration(): EnterpriseModelConfiguration {
  return {
    text_generation: {
      category: "text_generation",
      providers: SUPPORTED_MODEL_CARDS.text_generation.map((item) =>
        buildDefaultProviderConfig("text_generation", item.providerId),
      ),
      selectedProviderId: DEFAULT_PROVIDER_BY_CATEGORY.text_generation,
      selectedModelId: null,
    },
    image_generation: {
      category: "image_generation",
      providers: SUPPORTED_MODEL_CARDS.image_generation.map((item) =>
        buildDefaultProviderConfig("image_generation", item.providerId),
      ),
      selectedProviderId: DEFAULT_PROVIDER_BY_CATEGORY.image_generation,
      selectedModelId: null,
    },
    video_generation: {
      category: "video_generation",
      providers: SUPPORTED_MODEL_CARDS.video_generation.map((item) =>
        buildDefaultProviderConfig("video_generation", item.providerId),
      ),
      selectedProviderId: DEFAULT_PROVIDER_BY_CATEGORY.video_generation,
      selectedModelId: null,
    },
  }
}

export function normalizeEnterpriseModelConfiguration(input: unknown): EnterpriseModelConfiguration {
  const defaults = buildDefaultEnterpriseModelConfiguration()
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {}

  for (const category of Object.keys(defaults) as EnterpriseModelCategory[]) {
    const rawCategory = record[category]
    const categoryRecord =
      rawCategory && typeof rawCategory === "object" ? (rawCategory as Record<string, unknown>) : {}
    const selectedProviderId = normalizeProviderId(category, categoryRecord.selectedProviderId)
    const selectedModelId = normalizeOptionalText(categoryRecord.selectedModelId, 255)
    const rawProviders = Array.isArray(categoryRecord.providers) ? categoryRecord.providers : []
    const providerMap = new Map<EnterpriseModelProviderId, EnterpriseModelProviderConfig>()

    for (const descriptor of SUPPORTED_MODEL_CARDS[category]) {
      providerMap.set(
        descriptor.providerId,
        buildDefaultProviderConfig(category, descriptor.providerId),
      )
    }

    for (const rawProvider of rawProviders) {
      const providerRecord =
        rawProvider && typeof rawProvider === "object" ? (rawProvider as Record<string, unknown>) : {}
      const providerId = normalizeProviderId(category, providerRecord.providerId)
      const nextValue: EnterpriseModelProviderConfig = {
        providerId,
        label:
          normalizeOptionalText(providerRecord.label, 120) ||
          providerMap.get(providerId)?.label ||
          providerId,
        modelId: normalizeOptionalText(providerRecord.modelId, 255),
        baseUrl: normalizeOptionalText(providerRecord.baseUrl, 1000),
        apiKey: normalizeOptionalText(providerRecord.apiKey, 2000),
        apiKeyConfigured: Boolean(providerRecord.apiKeyConfigured),
        enabled: Boolean(providerRecord.enabled),
      }
      providerMap.set(providerId, nextValue)
    }

    defaults[category] = {
      category,
      providers: SUPPORTED_MODEL_CARDS[category].map((item) => ({
        ...providerMap.get(item.providerId)!,
      })),
      selectedProviderId,
      selectedModelId,
    }
  }

  return defaults
}

export function mergeEnterpriseModelConfigurationSecrets(params: {
  existing: EnterpriseModelConfiguration
  incoming: EnterpriseModelConfiguration
}) {
  const merged = buildDefaultEnterpriseModelConfiguration()

  for (const category of Object.keys(merged) as EnterpriseModelCategory[]) {
    const existingCategory = params.existing[category]
    const incomingCategory = params.incoming[category]
    const existingProviders = new Map(
      existingCategory.providers.map((provider) => [provider.providerId, provider]),
    )

    merged[category] = {
      ...incomingCategory,
      providers: incomingCategory.providers.map((provider) => ({
        ...provider,
        apiKey:
          provider.apiKey ||
          existingProviders.get(provider.providerId)?.apiKey ||
          null,
        apiKeyConfigured: Boolean(
          provider.apiKey ||
            existingProviders.get(provider.providerId)?.apiKey ||
            provider.apiKeyConfigured,
        ),
      })),
    }
  }

  return merged
}

export function redactEnterpriseModelConfigurationSecrets(
  config: EnterpriseModelConfiguration,
): EnterpriseModelConfiguration {
  const redacted = buildDefaultEnterpriseModelConfiguration()

  for (const category of Object.keys(redacted) as EnterpriseModelCategory[]) {
    redacted[category] = {
      ...config[category],
      providers: config[category].providers.map((provider) => ({
        ...provider,
        apiKey: null,
        apiKeyConfigured: Boolean(provider.apiKey || provider.apiKeyConfigured),
      })),
    }
  }

  return redacted
}
