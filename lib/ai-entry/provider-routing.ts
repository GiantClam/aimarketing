import { createOpenAI } from "@ai-sdk/openai"

export type AiEntryProviderId =
  | "deepseek"
  | "pptoken"
  | "openrouter"
  | "aiberm"
  | "crazyroute"
  | "enterprise-openai-compatible"
  | "enterprise-qwen-official"
  | "enterprise-minimax-official"
  | "enterprise-glm-official"
  | "enterprise-volcengine-official"

export type AiEntryProviderConfig = {
  id: AiEntryProviderId
  apiKey: string
  baseURL: string
  model: string
  headers?: Record<string, string>
}

type AiEntryProviderRuntime = {
  id: AiEntryProviderId
  model: string
  baseURL: string
  provider: ReturnType<typeof createOpenAI>
  stateIndex: number
}

type AiEntryProviderRoutingState = {
  activeIndex: number
  degradedAccessCount: number
}

type AiEntryExecutionError = {
  aiEntryRetryable?: boolean
}

type ExecuteAiEntryProviderParams = {
  provider: ReturnType<typeof createOpenAI>
  providerId: AiEntryProviderId
  model: string
  baseURL: string
  providerOrder: AiEntryProviderId[]
  attempt: number
  upgradeProbe: boolean
}

type ExecuteAiEntryOptions = {
  preferredProviderId?: AiEntryProviderId | null
  preferredModel?: string | null
  forcePreferredProvider?: boolean
  forceModelAcrossProviders?: boolean
  disableSameProviderModelFallback?: boolean
  directProviderFailoverOnError?: boolean
  providerConfigs?: AiEntryProviderConfig[]
}

type GlobalWithAiEntryRoutingState = typeof globalThis & {
  __aiEntryProviderRoutingStateV1__?: AiEntryProviderRoutingState
  __aiEntryProviderModelListCacheV1__?: Record<string, AiEntryProviderModelCacheEntry>
}

type AiEntryProviderModelCacheEntry = {
  expiresAt: number
  modelIds: string[]
}

type ProviderModelsApiItem = {
  id?: unknown
}

type ProviderModelsApiResponse = {
  data?: ProviderModelsApiItem[]
  models?: ProviderModelsApiItem[]
}

const DEFAULT_AIBERM_BASE_URL = "https://aiberm.com/v1"
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
const DEFAULT_PPTOKEN_BASE_URL = "https://api.pptoken.org/v1"
const DEFAULT_MODEL = "openai/gpt-5.4-mini"
const DEFAULT_PPTOKEN_MODEL = "gpt-5.6-sol"
const PROVIDER_MODEL_LIST_CACHE_TTL_MS = parsePositiveInt(
  process.env.AI_ENTRY_PROVIDER_MODEL_LIST_CACHE_TTL_MS,
  30 * 60 * 1000,
)
const PROVIDER_MODEL_LIST_TIMEOUT_MS = parsePositiveInt(
  process.env.AI_ENTRY_PROVIDER_MODEL_LIST_TIMEOUT_MS,
  6000,
)
const MAX_PROVIDER_MODEL_CANDIDATES = parsePositiveInt(
  process.env.AI_ENTRY_PROVIDER_MODEL_CANDIDATE_LIMIT,
  4,
)
const UPGRADE_AFTER_ACCESS = parsePositiveInt(
  process.env.AI_ENTRY_PROVIDER_UPGRADE_AFTER,
  10,
)

function parsePositiveInt(raw: string | undefined, fallback: number) {
  const parsed = Number.parseInt(raw || "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeText(raw: unknown) {
  if (typeof raw !== "string") return ""
  const trimmed = raw.trim()
  if (!trimmed) return ""

  const quoted = trimmed.match(/^(['"])([\s\S]*)\1$/)
  return quoted ? quoted[2].trim() : trimmed
}

function canonicalModelFingerprint(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function stripProviderPrefix(modelId: string) {
  const normalized = normalizeText(modelId)
  if (!normalized) return ""
  const slashIndex = normalized.indexOf("/")
  if (slashIndex <= 0 || slashIndex >= normalized.length - 1) return normalized
  return normalized.slice(slashIndex + 1).trim()
}

function inferProviderPrefixFromModel(modelId: string) {
  const text = `${modelId} ${stripProviderPrefix(modelId)}`.toLowerCase()
  if (text.includes("claude") || text.includes("anthropic")) return "anthropic"
  if (
    text.includes("gpt") ||
    text.includes("chatgpt") ||
    text.includes("openai") ||
    /\bo[1345]\b/.test(text)
  ) {
    return "openai"
  }
  if (text.includes("gemini") || text.includes("google")) return "google"
  if (text.includes("deepseek")) return "deepseek"
  if (text.includes("qwen") || text.includes("qwq")) return "qwen"
  if (text.includes("minimax") || text.includes("abab")) return "minimax"
  if (text.includes("glm") || text.includes("chatglm") || text.includes("zhipu")) return "zhipu"
  if (text.includes("kimi") || text.includes("moonshot")) return "moonshot"
  return ""
}

function isOpenAiFamilyModel(modelId: string) {
  return inferProviderPrefixFromModel(modelId) === "openai"
}

function buildEquivalentModelVariants(modelId: string) {
  const raw = normalizeText(modelId)
  if (!raw) return []
  const base = stripProviderPrefix(raw)

  const variants = new Set<string>()
  const add = (value: string) => {
    const normalized = normalizeText(value)
    if (!normalized) return
    variants.add(normalized)
  }

  add(raw)
  add(base)

  const baseDotVariant = base.replace(/(\d)-(\d)/g, "$1.$2")
  const baseDashVariant = base.replace(/(\d)\.(\d)/g, "$1-$2")
  add(baseDotVariant)
  add(baseDashVariant)

  const rawDotVariant = raw.replace(/(\d)-(\d)/g, "$1.$2")
  const rawDashVariant = raw.replace(/(\d)\.(\d)/g, "$1-$2")
  add(rawDotVariant)
  add(rawDashVariant)

  const inferredPrefix = inferProviderPrefixFromModel(raw)
  if (inferredPrefix) {
    add(`${inferredPrefix}/${base}`)
    add(`${inferredPrefix}/${baseDotVariant}`)
    add(`${inferredPrefix}/${baseDashVariant}`)
  }

  return [...variants]
}

function compareModelCandidatePreference(
  providerId: AiEntryProviderId,
  a: string,
  b: string,
) {
  const aHasPrefix = a.includes("/")
  const bHasPrefix = b.includes("/")
  if (aHasPrefix !== bHasPrefix) return aHasPrefix ? 1 : -1

  if (a.length !== b.length) return a.length - b.length
  return a.localeCompare(b, "en", { sensitivity: "base" })
}

function buildProviderModelCandidates(
  providerId: AiEntryProviderId,
  preferredModel: string,
) {
  const variants = buildEquivalentModelVariants(preferredModel)
  const dedupeByFingerprint = new Map<string, string>()
  for (const variant of variants) {
    const key = canonicalModelFingerprint(variant)
    if (!dedupeByFingerprint.has(key)) {
      dedupeByFingerprint.set(key, variant)
    }
  }

  const candidates = [...dedupeByFingerprint.values()]
  candidates.sort((a, b) => compareModelCandidatePreference(providerId, a, b))
  return candidates
}

function dedupeStringList(values: string[]) {
  const output: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = normalizeText(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
  }
  return output
}

function getProviderModelListCache() {
  const globalScope = globalThis as GlobalWithAiEntryRoutingState
  if (!globalScope.__aiEntryProviderModelListCacheV1__) {
    globalScope.__aiEntryProviderModelListCacheV1__ = {}
  }
  return globalScope.__aiEntryProviderModelListCacheV1__
}

function buildProviderModelCacheKey(config: AiEntryProviderConfig) {
  return `${config.id}:${config.baseURL}`
}

async function fetchProviderModelIds(config: AiEntryProviderConfig) {
  const baseURL = config.baseURL.replace(/\/+$/u, "")
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROVIDER_MODEL_LIST_TIMEOUT_MS)
  try {
    const response = await fetch(`${baseURL}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...(config.headers || {}),
      },
      cache: "no-store",
      signal: controller.signal,
    })

    if (!response.ok) {
      const raw = await response.text().catch(() => "")
      throw new Error(`provider_models_http_${response.status}:${raw.slice(0, 120)}`)
    }

    const payload =
      (await response.json().catch(() => null)) as ProviderModelsApiResponse | null
    const rawItems = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : []

    const ids = rawItems
      .map((item) => normalizeText(item?.id))
      .filter(Boolean)

    return dedupeStringList(ids)
  } finally {
    clearTimeout(timeout)
  }
}

async function getProviderModelIds(config: AiEntryProviderConfig) {
  const cache = getProviderModelListCache()
  const cacheKey = buildProviderModelCacheKey(config)
  const now = Date.now()
  const cached = cache[cacheKey]
  if (cached && cached.expiresAt > now) {
    return cached.modelIds
  }

  try {
    const fetched = await fetchProviderModelIds(config)
    cache[cacheKey] = {
      expiresAt: now + PROVIDER_MODEL_LIST_CACHE_TTL_MS,
      modelIds: fetched,
    }
    return fetched
  } catch (error) {
    if (cached?.modelIds?.length) {
      console.warn("ai-entry.provider.models.fetch.failed.stale", {
        provider: config.id,
        message: error instanceof Error ? error.message : String(error),
      })
      return cached.modelIds
    }
    throw error
  }
}

function buildModelFingerprints(modelId: string) {
  const raw = normalizeText(modelId)
  if (!raw) return []
  const base = stripProviderPrefix(raw)
  const values = [raw, base]
  return dedupeStringList(values.map((item) => canonicalModelFingerprint(item)))
}

function scoreModelCandidate(
  providerId: AiEntryProviderId,
  candidateModel: string,
  preferredModel: string,
) {
  const candidate = normalizeText(candidateModel)
  const preferred = normalizeText(preferredModel)
  if (!candidate || !preferred) return Number.NEGATIVE_INFINITY

  const candidateBase = stripProviderPrefix(candidate)
  const preferredBase = stripProviderPrefix(preferred)
  const candidateFingerprint = canonicalModelFingerprint(candidate)
  const preferredFingerprint = canonicalModelFingerprint(preferred)
  const candidateBaseFingerprint = canonicalModelFingerprint(candidateBase)
  const preferredBaseFingerprint = canonicalModelFingerprint(preferredBase)

  let score = 0
  if (candidate === preferred) score += 120
  if (candidateBase === preferredBase) score += 140
  if (candidateFingerprint === preferredFingerprint) score += 160
  if (candidateBaseFingerprint === preferredBaseFingerprint) score += 180
  if (!candidate.includes("/")) score += 10

  return score
}

async function resolveProviderMatchedModels(
  config: AiEntryProviderConfig,
  preferredModel: string,
) {
  let providerModelIds: string[]
  try {
    providerModelIds = await getProviderModelIds(config)
  } catch (error) {
    console.warn("ai-entry.provider.models.fetch.failed", {
      provider: config.id,
      message: error instanceof Error ? error.message : String(error),
    })
    return []
  }

  if (providerModelIds.length === 0) return []

  const preferredFingerprints = new Set<string>()
  for (const variant of buildEquivalentModelVariants(preferredModel)) {
    for (const fingerprint of buildModelFingerprints(variant)) {
      preferredFingerprints.add(fingerprint)
    }
  }

  const scored = providerModelIds
    .map((candidateModel) => {
      const fingerprints = buildModelFingerprints(candidateModel)
      const fuzzyMatched = fingerprints.some((item) => preferredFingerprints.has(item))
      if (!fuzzyMatched) {
        return {
          model: candidateModel,
          score: Number.NEGATIVE_INFINITY,
        }
      }
      return {
        model: candidateModel,
        score: scoreModelCandidate(config.id, candidateModel, preferredModel),
      }
    })
    .filter((item) => Number.isFinite(item.score))

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score
    return compareModelCandidatePreference(config.id, a.model, b.model)
  })

  return dedupeStringList(
    scored.slice(0, MAX_PROVIDER_MODEL_CANDIDATES).map((item) => item.model),
  )
}

function isProviderPolicyError(error: unknown) {
  if (!error || typeof error !== "object") return false
  const maybeStatus = (error as { statusCode?: unknown }).statusCode
  if (typeof maybeStatus === "number" && maybeStatus === 403) return true

  const message =
    (error as { message?: unknown }).message ||
    (error as { responseBody?: unknown }).responseBody
  const normalized = String(message || "").toLowerCase()
  if (!normalized) return false

  return (
    normalized.includes("terms of service") ||
    normalized.includes("prohibited") ||
    normalized.includes("policy")
  )
}

function resolveDegradeReason(error: unknown): "policy" | "retryable" | "nonretryable" {
  if (isProviderPolicyError(error)) return "policy"
  return isRetryableProviderError(error) ? "retryable" : "nonretryable"
}

function isRetryableProviderError(error: unknown) {
  return (error as AiEntryExecutionError | null | undefined)?.aiEntryRetryable !== false
}

function getRoutingState() {
  const globalScope = globalThis as GlobalWithAiEntryRoutingState
  if (!globalScope.__aiEntryProviderRoutingStateV1__) {
    globalScope.__aiEntryProviderRoutingStateV1__ = {
      activeIndex: 0,
      degradedAccessCount: 0,
    }
  }
  return globalScope.__aiEntryProviderRoutingStateV1__
}

function clampIndex(index: number, max: number) {
  return Math.min(Math.max(0, index), max)
}

function uniqueProviderOrder(providers: AiEntryProviderRuntime[]) {
  const order: AiEntryProviderId[] = []
  const seen = new Set<AiEntryProviderId>()
  for (const item of providers) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    order.push(item.id)
  }
  return order
}

function findRuntimeStartIndexByStateIndex(
  providers: AiEntryProviderRuntime[],
  stateIndex: number,
) {
  const exact = providers.findIndex((item) => item.stateIndex === stateIndex)
  if (exact >= 0) return exact

  const greater = providers.findIndex((item) => item.stateIndex > stateIndex)
  if (greater >= 0) return greater

  return 0
}

function findNextRuntimeIndex(params: {
  providers: AiEntryProviderRuntime[]
  currentIndex: number
  visited: Set<number>
  skipSameProvider: boolean
}) {
  const { providers, currentIndex, visited, skipSameProvider } = params
  if (providers.length === 0) return -1
  const currentProviderId = providers[currentIndex]?.id

  for (let offset = 1; offset <= providers.length; offset += 1) {
    const nextIndex = (currentIndex + offset) % providers.length
    if (visited.has(nextIndex)) continue
    if (skipSameProvider && providers[nextIndex]?.id === currentProviderId) continue
    return nextIndex
  }

  return -1
}

function getAiEntryDefaultModel() {
  return (
    normalizeText(process.env.AI_ENTRY_NORMAL_DEFAULT_MODEL) ||
    normalizeText(process.env.AI_ENTRY_MODEL) ||
    normalizeText(process.env.WRITER_TEXT_MODEL) ||
    DEFAULT_MODEL
  )
}

function getRawProviderConfigs(): AiEntryProviderConfig[] {
  const fallbackModel = getAiEntryDefaultModel()

  return [
    {
      id: "deepseek",
      apiKey:
        normalizeText(process.env.AI_ENTRY_DEEPSEEK_API_KEY) ||
        normalizeText(process.env.DEEPSEEK_API_KEY),
      baseURL:
        normalizeText(process.env.AI_ENTRY_DEEPSEEK_BASE_URL) ||
        normalizeText(process.env.DEEPSEEK_BASE_URL) ||
        DEFAULT_DEEPSEEK_BASE_URL,
      model:
        normalizeText(process.env.AI_ENTRY_DEEPSEEK_MODEL) ||
        normalizeText(process.env.DEEPSEEK_MODEL) ||
        fallbackModel,
    },
    {
      id: "pptoken",
      apiKey:
        normalizeText(process.env.AI_ENTRY_PPTOKEN_API_KEY) ||
        normalizeText(process.env.PPTOKEN_API_KEY),
      baseURL:
        normalizeText(process.env.AI_ENTRY_PPTOKEN_BASE_URL) ||
        normalizeText(process.env.PPTOKEN_BASE_URL) ||
        DEFAULT_PPTOKEN_BASE_URL,
      model:
        normalizeText(process.env.AI_ENTRY_PPTOKEN_MODEL) ||
        normalizeText(process.env.PPTOKEN_MODEL) ||
        DEFAULT_PPTOKEN_MODEL,
    },
    {
      id: "aiberm",
      apiKey:
        normalizeText(process.env.AI_ENTRY_AIBERM_API_KEY) ||
        normalizeText(process.env.AIBERM_API_KEY) ||
        normalizeText(process.env.WRITER_AIBERM_API_KEY),
      baseURL:
        normalizeText(process.env.AI_ENTRY_AIBERM_BASE_URL) ||
        normalizeText(process.env.AIBERM_BASE_URL) ||
        DEFAULT_AIBERM_BASE_URL,
      model: normalizeText(process.env.AI_ENTRY_AIBERM_MODEL) || fallbackModel,
    },
    {
      id: "crazyroute",
      apiKey:
        normalizeText(process.env.AI_ENTRY_CRAZYROUTE_API_KEY) ||
        normalizeText(process.env.CRAZYROUTE_API_KEY) ||
        normalizeText(process.env.AI_ENTRY_CRAZYROUTER_API_KEY) ||
        normalizeText(process.env.CRAZYROUTER_API_KEY),
      baseURL:
        normalizeText(process.env.AI_ENTRY_CRAZYROUTE_BASE_URL) ||
        normalizeText(process.env.CRAZYROUTE_BASE_URL) ||
        normalizeText(process.env.AI_ENTRY_CRAZYROUTER_BASE_URL) ||
        normalizeText(process.env.CRAZYROUTER_BASE_URL),
      model:
        normalizeText(process.env.AI_ENTRY_CRAZYROUTE_MODEL) ||
        normalizeText(process.env.AI_ENTRY_CRAZYROUTER_MODEL) ||
        normalizeText(process.env.CRAZYROUTER_MODEL) ||
        fallbackModel,
    },
  ]
}

export function getConfiguredAiEntryProviders() {
  return getRawProviderConfigs().filter((item) => item.apiKey && item.baseURL)
}

export function getAiEntryCurrentProviderConfig() {
  const providers = getConfiguredAiEntryProviders()
  if (providers.length === 0) return null
  const state = getRoutingState()
  const index = clampIndex(state.activeIndex, providers.length - 1)
  return providers[index]
}

async function buildProviderRuntimes(
  options?: ExecuteAiEntryOptions,
): Promise<AiEntryProviderRuntime[]> {
  const preferredProviderId = options?.preferredProviderId || null
  const preferredModel = normalizeText(options?.preferredModel || undefined)
  const forcePreferredProvider = Boolean(options?.forcePreferredProvider && preferredProviderId)
  const forceModelAcrossProviders = Boolean(
    options?.forceModelAcrossProviders && preferredModel,
  )
  const disableSameProviderModelFallback = Boolean(
    options?.disableSameProviderModelFallback,
  )

  const explicitProviderConfigs =
    Array.isArray(options?.providerConfigs) && options.providerConfigs.length > 0
      ? options.providerConfigs.filter((item) => item.apiKey && item.baseURL)
      : null

  let configs = explicitProviderConfigs || getConfiguredAiEntryProviders()
  if (configs.length === 0) return []

  const routingModel = preferredModel || getAiEntryDefaultModel()
  const allowPptoken = isOpenAiFamilyModel(routingModel)
  configs = configs.filter((item) =>
    allowPptoken ? true : item.id !== "pptoken",
  )
  if (configs.length === 0) return []

  if (preferredProviderId) {
    const preferred = configs.find((item) => item.id === preferredProviderId)
    if (preferred) {
      if (forcePreferredProvider) {
        configs = [preferred]
      } else {
        configs = [preferred, ...configs.filter((item) => item.id !== preferredProviderId)]
      }
    }
  }

  if (!explicitProviderConfigs) {
    const defaultOrder: AiEntryProviderId[] = allowPptoken
      ? ["pptoken", "deepseek", "aiberm", "crazyroute", "openrouter"]
      : ["deepseek", "aiberm", "crazyroute", "openrouter"]
    configs.sort((a, b) => {
      const aRank = defaultOrder.indexOf(a.id)
      const bRank = defaultOrder.indexOf(b.id)
      const normalizedARank = aRank === -1 ? defaultOrder.length : aRank
      const normalizedBRank = bRank === -1 ? defaultOrder.length : bRank
      return normalizedARank - normalizedBRank
    })
    if (preferredProviderId && !forcePreferredProvider) {
      const preferred = configs.find((item) => item.id === preferredProviderId)
      if (preferred) {
        configs = [preferred, ...configs.filter((item) => item.id !== preferredProviderId)]
      }
    }
  }

  const runtimes: AiEntryProviderRuntime[] = []
  for (let index = 0; index < configs.length; index += 1) {
    const item = configs[index]
    const providerClient = createOpenAI({
      apiKey: item.apiKey,
      baseURL: item.baseURL,
      headers: item.headers,
    })

    const selectedModel =
      preferredProviderId && item.id === preferredProviderId && preferredModel
        ? preferredModel
        : item.model

    let candidateModels: string[] = [selectedModel]
    if (forceModelAcrossProviders && preferredModel) {
      const matchedFromProviderCatalog = await resolveProviderMatchedModels(
        item,
        preferredModel,
      )
      candidateModels = dedupeStringList([
        ...matchedFromProviderCatalog,
        ...buildProviderModelCandidates(item.id, preferredModel),
      ])
    }

    for (const candidateModel of candidateModels) {
      runtimes.push({
        id: item.id,
        model: candidateModel,
        baseURL: item.baseURL,
        provider: providerClient,
        stateIndex: index,
      })
    }
  }

  if (preferredProviderId && preferredModel) {
    const preferredRuntimeIndex = runtimes.findIndex(
      (item) => item.id === preferredProviderId,
    )
    if (preferredRuntimeIndex >= 0) {
      const preferredRuntime = runtimes[preferredRuntimeIndex]
      const configuredDefaultModel = normalizeText(
        configs[preferredRuntime.stateIndex]?.model,
      )

      const shouldAddConfiguredFallbackModel =
        !disableSameProviderModelFallback &&
        configuredDefaultModel &&
        configuredDefaultModel !== preferredRuntime.model &&
        !runtimes.some(
          (item) =>
            item.id === preferredRuntime.id &&
            item.model === configuredDefaultModel &&
            item.stateIndex === preferredRuntime.stateIndex,
        )

      if (shouldAddConfiguredFallbackModel) {
        runtimes.splice(preferredRuntimeIndex + 1, 0, {
          ...preferredRuntime,
          model: configuredDefaultModel,
        })
      }
    }
  }

  return runtimes
}

export async function executeAiEntryWithProviderFailover<T>(
  execute: (params: ExecuteAiEntryProviderParams) => Promise<T>,
  options?: ExecuteAiEntryOptions,
) {
  const providers = await buildProviderRuntimes(options)
  if (providers.length === 0) {
    throw new Error(
      "No configured AI entry providers. Configure at least one AI entry runtime provider.",
    )
  }

  const providerOrder = uniqueProviderOrder(providers)
  const state = getRoutingState()
  const maxStateIndex = providers.reduce(
    (max, item) => Math.max(max, item.stateIndex),
    0,
  )
  state.activeIndex = clampIndex(state.activeIndex, maxStateIndex)

  const shouldTryUpgrade =
    !options?.preferredProviderId &&
    state.activeIndex > 0 &&
    state.degradedAccessCount >= UPGRADE_AFTER_ACCESS
  const explicitPreferredStartIndex = options?.preferredProviderId
    ? providers.findIndex((item) => item.id === options.preferredProviderId)
    : -1
  const startStateIndex = shouldTryUpgrade ? state.activeIndex - 1 : state.activeIndex
  const startIndex =
    explicitPreferredStartIndex >= 0
      ? explicitPreferredStartIndex
      : findRuntimeStartIndexByStateIndex(providers, startStateIndex)

  let lastError: unknown = null
  let attempt = 0
  let index = startIndex
  const visitedIndices = new Set<number>()

  while (!visitedIndices.has(index)) {
    visitedIndices.add(index)
    attempt += 1
    const candidate = providers[index]

    try {
      const result = await execute({
        provider: candidate.provider,
        providerId: candidate.id,
        model: candidate.model,
        baseURL: candidate.baseURL,
        providerOrder,
        attempt,
        upgradeProbe: shouldTryUpgrade && index === startIndex,
      })

      state.activeIndex = candidate.stateIndex
      state.degradedAccessCount =
        candidate.stateIndex === 0 ? 0 : state.degradedAccessCount + 1

      return {
        result,
        providerId: candidate.id,
        model: candidate.model,
        providerOrder,
      }
    } catch (error) {
      lastError = error
      const degradeReason = resolveDegradeReason(error)
      const nextIndex = findNextRuntimeIndex({
        providers,
        currentIndex: index,
        visited: visitedIndices,
        skipSameProvider:
          degradeReason === "policy" ||
          Boolean(options?.directProviderFailoverOnError),
      })
      const canFailover = nextIndex >= 0
      const nextCandidate = canFailover ? providers[nextIndex] : null
      state.activeIndex = clampIndex(
        nextCandidate?.stateIndex ?? candidate.stateIndex,
        maxStateIndex,
      )
      state.degradedAccessCount = 0

      console.warn("ai-entry.provider.degrade", {
        provider: candidate.id,
        model: candidate.model,
        nextProvider: nextCandidate?.id ?? null,
        nextModel: nextCandidate?.model ?? null,
        degradeReason,
        canFailover,
        message: error instanceof Error ? error.message : String(error),
      })

      if (!canFailover || !isRetryableProviderError(error)) {
        break
      }
      index = nextIndex
    }
  }

  throw lastError instanceof Error ? lastError : new Error("ai_entry_provider_failed")
}
