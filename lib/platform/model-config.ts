export type EnterpriseModelCategory =
  | "text_generation"
  | "image_generation"
  | "video_generation"
  | "audio_generation"

export type EnterpriseTextModelProviderId =
  | "openai_compatible"
  | "qwen_official"
  | "minimax_official"
  | "glm_official"

export type EnterpriseImageModelProviderId =
  | "google_official"
  | "openai_official"
  | "openai_compatible"
  | "runninghub"

export type EnterpriseVideoModelProviderId =
  | "minimax_official"
  | "gemini_official"
  | "seedance_official"
  | "runninghub"

export type EnterpriseAudioModelProviderId = "minimax_official"

export type EnterpriseModelProviderId =
  | EnterpriseTextModelProviderId
  | EnterpriseImageModelProviderId
  | EnterpriseVideoModelProviderId
  | EnterpriseAudioModelProviderId

export type EnterpriseRunningHubImageRouteMode = "txt2img" | "img2img"

export type EnterpriseProviderRouteConfig = {
  routeId: string
  label: string
  mode: EnterpriseRunningHubImageRouteMode | null
  endpoint: string | null
  modelId: string | null
  enabled: boolean
  assignedUserIds: number[]
}

export type EnterpriseModelProviderConfig = {
  providerId: EnterpriseModelProviderId
  label: string
  modelId: string | null
  baseUrl: string | null
  apiKey: string | null
  apiKeyConfigured?: boolean
  clearApiKey?: boolean
  enabled: boolean
  assignedUserIds: number[]
  routes?: EnterpriseProviderRouteConfig[]
}

export type EnterpriseModelRouteAssignment = {
  routeId: string
  assignedUserIds: number[]
}

export type EnterpriseModelCategoryConfig = {
  category: EnterpriseModelCategory
  providers: EnterpriseModelProviderConfig[]
  routeAssignments: EnterpriseModelRouteAssignment[]
  selectedProviderId: EnterpriseModelProviderId | null
  selectedModelId: string | null
  defaultTxt2imgRouteId?: string | null
  defaultImg2imgRouteId?: string | null
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
    {
      providerId: "runninghub",
      providerLabel: "RunningHub",
      integrationLabel: "RunningHub API",
      models: ["seedream-v5-text-to-image", "seedream-v5-image-to-image"],
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
  audio_generation: [
    {
      providerId: "minimax_official",
      providerLabel: "MiniMax Audio",
      integrationLabel: "Official API",
      models: ["speech-2.8", "music-2.6", "voice-clone"],
    },
  ],
}

const DEFAULT_PROVIDER_BY_CATEGORY: Record<EnterpriseModelCategory, EnterpriseModelProviderId> = {
  text_generation: "openai_compatible",
  image_generation: "runninghub",
  video_generation: "runninghub",
  audio_generation: "minimax_official",
}

const RUNNINGHUB_IMAGE_ROUTE_MODES: EnterpriseRunningHubImageRouteMode[] = ["txt2img", "img2img"]
const RUNNINGHUB_DEFAULT_IMAGE_ROUTE_PRESETS: Record<
  EnterpriseRunningHubImageRouteMode,
  { label: string; endpoint: string; modelId: string }
> = {
  txt2img: {
    label: "RunningHub Seedream V5 Text to Image",
    endpoint: "/openapi/v2/seedream-v5-lite/text-to-image",
    modelId: "seedream-v5-text-to-image",
  },
  img2img: {
    label: "RunningHub Seedream V5 Image to Image",
    endpoint: "/openapi/v2/seedream-v5-lite/image-to-image",
    modelId: "seedream-v5-image-to-image",
  },
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
    clearApiKey: false,
    enabled: providerId === DEFAULT_PROVIDER_BY_CATEGORY[category],
    assignedUserIds: [],
  }
}

function normalizeAssignedUserIds(value: unknown) {
  if (!Array.isArray(value)) return []
  const uniqueIds = new Set<number>()
  for (const item of value) {
    const id = Number(item)
    if (!Number.isInteger(id) || id <= 0) continue
    uniqueIds.add(id)
  }
  return [...uniqueIds]
}

function normalizeRunningHubImageRouteMode(value: unknown): EnterpriseRunningHubImageRouteMode | null {
  return value === "txt2img" || value === "img2img" ? value : null
}

export function buildRunningHubImageRouteId(mode: EnterpriseRunningHubImageRouteMode) {
  return `runninghub:${mode}:main`
}

export function getRunningHubImageRouteDefaultLabel(mode: EnterpriseRunningHubImageRouteMode) {
  return RUNNINGHUB_DEFAULT_IMAGE_ROUTE_PRESETS[mode].label
}

function inferRunningHubImageRouteMode(record: Record<string, unknown>) {
  const normalizedMode = normalizeRunningHubImageRouteMode(record.mode)
  if (normalizedMode) return normalizedMode
  const routeId = normalizeRouteId(record.routeId)
  if (routeId?.includes("img2img")) return "img2img"
  if (routeId?.includes("txt2img")) return "txt2img"
  return null
}

function buildDefaultRunningHubImageRoute(
  mode: EnterpriseRunningHubImageRouteMode,
  fallbackModelId?: string | null,
): EnterpriseProviderRouteConfig {
  const preset = RUNNINGHUB_DEFAULT_IMAGE_ROUTE_PRESETS[mode]
  return {
    routeId: buildRunningHubImageRouteId(mode),
    label: preset.label,
    mode,
    endpoint: preset.endpoint,
    modelId: fallbackModelId || preset.modelId,
    enabled: true,
    assignedUserIds: [],
  }
}

function normalizeProviderRoutes(params: {
  category: EnterpriseModelCategory
  providerId: EnterpriseModelProviderId
  routes: unknown
  fallbackModelId?: string | null
}) {
  if (!(params.category === "image_generation" && params.providerId === "runninghub")) {
    return undefined
  }

  const routeMap = new Map<EnterpriseRunningHubImageRouteMode, EnterpriseProviderRouteConfig>()
  for (const mode of RUNNINGHUB_IMAGE_ROUTE_MODES) {
    routeMap.set(mode, buildDefaultRunningHubImageRoute(mode, params.fallbackModelId))
  }

  const rawRoutes = Array.isArray(params.routes) ? params.routes : []
  for (const rawRoute of rawRoutes) {
    const routeRecord = rawRoute && typeof rawRoute === "object" ? (rawRoute as Record<string, unknown>) : {}
    const mode = inferRunningHubImageRouteMode(routeRecord)
    if (!mode) continue
    routeMap.set(mode, {
      routeId: normalizeRouteId(routeRecord.routeId) || buildRunningHubImageRouteId(mode),
      label: normalizeOptionalText(routeRecord.label, 120) || getRunningHubImageRouteDefaultLabel(mode),
      mode,
      endpoint: normalizeOptionalText(routeRecord.endpoint, 1000),
      modelId: normalizeOptionalText(routeRecord.modelId, 255) || params.fallbackModelId || null,
      enabled: typeof routeRecord.enabled === "boolean" ? routeRecord.enabled : true,
      assignedUserIds: normalizeAssignedUserIds(routeRecord.assignedUserIds),
    })
  }

  return RUNNINGHUB_IMAGE_ROUTE_MODES.map((mode) => ({ ...routeMap.get(mode)! }))
}

export function listRunningHubImageRoutes(
  provider: EnterpriseModelProviderConfig | null | undefined,
) {
  return (provider?.routes || [])
    .filter(
      (route): route is EnterpriseProviderRouteConfig =>
        route.mode === "txt2img" || route.mode === "img2img",
    )
    .map((route) => ({
      ...route,
      assignedUserIds: [...route.assignedUserIds],
    }))
}

function normalizeRunningHubDefaultRouteId(
  value: unknown,
  mode: EnterpriseRunningHubImageRouteMode,
  routes: EnterpriseProviderRouteConfig[] | undefined,
) {
  const normalized = normalizeRouteId(value)
  if (normalized && routes?.some((route) => route.mode === mode && route.routeId === normalized)) {
    return normalized
  }
  return routes?.find((route) => route.mode === mode)?.routeId || buildRunningHubImageRouteId(mode)
}

export function getDefaultRunningHubImageRoute(
  categoryConfig: EnterpriseModelCategoryConfig,
  mode: EnterpriseRunningHubImageRouteMode,
) {
  const provider = categoryConfig.providers.find((item) => item.providerId === "runninghub")
  const routes = listRunningHubImageRoutes(provider)
  const selectedRouteId =
    mode === "txt2img" ? categoryConfig.defaultTxt2imgRouteId : categoryConfig.defaultImg2imgRouteId
  return (
    routes.find((route) => route.routeId === selectedRouteId && route.mode === mode) ||
    routes.find((route) => route.mode === mode) ||
    null
  )
}

function normalizeRouteId(value: unknown) {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized ? normalized.slice(0, 120) : null
}

function normalizeRouteAssignments(value: unknown) {
  if (!Array.isArray(value)) return []

  const routeMap = new Map<string, EnterpriseModelRouteAssignment>()
  for (const item of value) {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
    const routeId = normalizeRouteId(record.routeId)
    if (!routeId) continue
    routeMap.set(routeId, {
      routeId,
      assignedUserIds: normalizeAssignedUserIds(record.assignedUserIds),
    })
  }

  return [...routeMap.values()]
}

export function getSupportedModelCards(category: EnterpriseModelCategory) {
  return SUPPORTED_MODEL_CARDS[category].map((item) => ({
    ...item,
    models: [...item.models],
  }))
}

export function isEnterpriseModelProviderBaseUrlRequired(
  providerId: EnterpriseModelProviderId,
) {
  return providerId === "openai_compatible"
}

export function shouldRequireEnterpriseProviderBaseUrl(
  provider:
    | Pick<EnterpriseModelProviderConfig, "providerId" | "modelId" | "apiKey" | "apiKeyConfigured">
    | null
    | undefined,
) {
  if (!provider || !isEnterpriseModelProviderBaseUrlRequired(provider.providerId)) {
    return false
  }

  return Boolean(
    provider.apiKey?.trim() ||
      provider.apiKeyConfigured ||
      provider.modelId?.trim(),
  )
}

export function buildDefaultEnterpriseModelConfiguration(): EnterpriseModelConfiguration {
  const defaultImageRunningHubRoutes = RUNNINGHUB_IMAGE_ROUTE_MODES.map((mode) =>
    buildDefaultRunningHubImageRoute(mode),
  )
  return {
    text_generation: {
      category: "text_generation",
      providers: SUPPORTED_MODEL_CARDS.text_generation.map((item) =>
        buildDefaultProviderConfig("text_generation", item.providerId),
      ),
      routeAssignments: [],
      selectedProviderId: DEFAULT_PROVIDER_BY_CATEGORY.text_generation,
      selectedModelId: null,
    },
    image_generation: {
      category: "image_generation",
      providers: SUPPORTED_MODEL_CARDS.image_generation.map((item) => {
        const provider = buildDefaultProviderConfig("image_generation", item.providerId)
        return item.providerId === "runninghub"
          ? {
              ...provider,
              routes: defaultImageRunningHubRoutes.map((route) => ({ ...route })),
            }
          : provider
      }),
      routeAssignments: [],
      selectedProviderId: DEFAULT_PROVIDER_BY_CATEGORY.image_generation,
      selectedModelId: null,
      defaultTxt2imgRouteId: buildRunningHubImageRouteId("txt2img"),
      defaultImg2imgRouteId: buildRunningHubImageRouteId("img2img"),
    },
    video_generation: {
      category: "video_generation",
      providers: SUPPORTED_MODEL_CARDS.video_generation.map((item) =>
        buildDefaultProviderConfig("video_generation", item.providerId),
      ),
      routeAssignments: [],
      selectedProviderId: DEFAULT_PROVIDER_BY_CATEGORY.video_generation,
      selectedModelId: null,
    },
    audio_generation: {
      category: "audio_generation",
      providers: SUPPORTED_MODEL_CARDS.audio_generation.map((item) =>
        buildDefaultProviderConfig("audio_generation", item.providerId),
      ),
      routeAssignments: [],
      selectedProviderId: DEFAULT_PROVIDER_BY_CATEGORY.audio_generation,
      selectedModelId: null,
    },
  }
}

export function validateEnterpriseModelConfiguration(
  config: EnterpriseModelConfiguration,
) {
  for (const category of Object.keys(config) as EnterpriseModelCategory[]) {
    const categoryConfig = config[category]
    const selectedProviderId = categoryConfig.selectedProviderId
    if (!selectedProviderId) continue

    if (category === "image_generation" && selectedProviderId === "runninghub") {
      const txt2imgRoute = getDefaultRunningHubImageRoute(categoryConfig, "txt2img")
      const img2imgRoute = getDefaultRunningHubImageRoute(categoryConfig, "img2img")
      if (!txt2imgRoute) {
        throw new Error("runninghub_default_txt2img_route_required")
      }
      if (!img2imgRoute) {
        throw new Error("runninghub_default_img2img_route_required")
      }
    }

    if (!isEnterpriseModelProviderBaseUrlRequired(selectedProviderId)) continue

    const provider = categoryConfig.providers.find((item) => item.providerId === selectedProviderId)
    if (shouldRequireEnterpriseProviderBaseUrl(provider) && !provider?.baseUrl?.trim()) {
      throw new Error(`base_url_required:${category}:${selectedProviderId}`)
    }
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
        clearApiKey: Boolean(providerRecord.clearApiKey),
        enabled: Boolean(providerRecord.enabled),
        assignedUserIds: normalizeAssignedUserIds(providerRecord.assignedUserIds),
      }
      const normalizedRoutes = normalizeProviderRoutes({
        category,
        providerId,
        routes: providerRecord.routes,
        fallbackModelId: normalizeOptionalText(providerRecord.modelId, 255),
      })
      if (normalizedRoutes) {
        nextValue.routes = normalizedRoutes
      }
      providerMap.set(providerId, nextValue)
    }

    const runningHubProvider = providerMap.get("runninghub")
    const runningHubRoutes =
      category === "image_generation"
        ? normalizeProviderRoutes({
            category,
            providerId: "runninghub",
            routes: runningHubProvider?.routes,
            fallbackModelId: runningHubProvider?.modelId || null,
          })
        : undefined
    if (category === "image_generation" && runningHubProvider) {
      providerMap.set("runninghub", {
        ...runningHubProvider,
        routes: runningHubRoutes,
      })
    }

    const nextCategoryConfig: EnterpriseModelCategoryConfig = {
      category,
      providers: SUPPORTED_MODEL_CARDS[category].map((item) => ({
        ...providerMap.get(item.providerId)!,
      })),
      routeAssignments: normalizeRouteAssignments(categoryRecord.routeAssignments),
      selectedProviderId,
      selectedModelId,
    }
    if (category === "image_generation") {
      nextCategoryConfig.defaultTxt2imgRouteId = normalizeRunningHubDefaultRouteId(
        categoryRecord.defaultTxt2imgRouteId,
        "txt2img",
        runningHubRoutes,
      )
      nextCategoryConfig.defaultImg2imgRouteId = normalizeRunningHubDefaultRouteId(
        categoryRecord.defaultImg2imgRouteId,
        "img2img",
        runningHubRoutes,
      )
    }
    defaults[category] = nextCategoryConfig
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
        apiKey: provider.clearApiKey
          ? null
          : provider.apiKey ||
            existingProviders.get(provider.providerId)?.apiKey ||
            null,
        apiKeyConfigured: provider.clearApiKey
          ? false
          : Boolean(
              provider.apiKey ||
                existingProviders.get(provider.providerId)?.apiKey ||
                provider.apiKeyConfigured,
            ),
        assignedUserIds: [...provider.assignedUserIds],
        ...(provider.routes
          ? {
              routes: provider.routes.map((route) => ({
                ...route,
                assignedUserIds: [...route.assignedUserIds],
              })),
            }
          : {}),
      })),
      routeAssignments: incomingCategory.routeAssignments.map((assignment) => ({
        routeId: assignment.routeId,
        assignedUserIds: [...assignment.assignedUserIds],
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
        clearApiKey: false,
        assignedUserIds: [...provider.assignedUserIds],
        ...(provider.routes
          ? {
              routes: provider.routes.map((route) => ({
                ...route,
                assignedUserIds: [...route.assignedUserIds],
              })),
            }
          : {}),
      })),
      routeAssignments: config[category].routeAssignments.map((assignment) => ({
        routeId: assignment.routeId,
        assignedUserIds: [...assignment.assignedUserIds],
      })),
    }
  }

  return redacted
}
