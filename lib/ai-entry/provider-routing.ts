import { createOpenAI } from "@ai-sdk/openai"

export type AiEntryProviderId = "aiberm" | "crazyroute" | "openrouter"

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
}

type GlobalWithAiEntryRoutingState = typeof globalThis & {
  __aiEntryProviderRoutingStateV1__?: AiEntryProviderRoutingState
}

const DEFAULT_AIBERM_BASE_URL = "https://aiberm.com/v1"
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
const DEFAULT_MODEL = "google/gemini-2.5-flash"
const UPGRADE_AFTER_ACCESS = parsePositiveInt(
  process.env.AI_ENTRY_PROVIDER_UPGRADE_AFTER,
  10,
)

function parsePositiveInt(raw: string | undefined, fallback: number) {
  const parsed = Number.parseInt(raw || "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeText(raw: string | undefined) {
  return typeof raw === "string" ? raw.trim() : ""
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

function getAiEntryDefaultModel() {
  return (
    normalizeText(process.env.AI_ENTRY_MODEL) ||
    normalizeText(process.env.WRITER_TEXT_MODEL) ||
    DEFAULT_MODEL
  )
}

function getRawProviderConfigs(): AiEntryProviderConfig[] {
  const fallbackModel = getAiEntryDefaultModel()
  const openRouterAppUrl =
    normalizeText(process.env.AI_ENTRY_OPENROUTER_APP_URL) ||
    normalizeText(process.env.OPENROUTER_APP_URL)
  const openRouterAppName =
    normalizeText(process.env.AI_ENTRY_OPENROUTER_APP_NAME) ||
    normalizeText(process.env.OPENROUTER_APP_NAME) ||
    "AI Marketing"

  return [
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
    {
      id: "openrouter",
      apiKey:
        normalizeText(process.env.AI_ENTRY_OPENROUTER_API_KEY) ||
        normalizeText(process.env.OPENROUTER_API_KEY),
      baseURL:
        normalizeText(process.env.AI_ENTRY_OPENROUTER_BASE_URL) ||
        normalizeText(process.env.OPENROUTER_BASE_URL) ||
        DEFAULT_OPENROUTER_BASE_URL,
      model:
        normalizeText(process.env.AI_ENTRY_OPENROUTER_MODEL) ||
        normalizeText(process.env.OPENROUTER_TEXT_MODEL) ||
        fallbackModel,
      headers: {
        ...(openRouterAppUrl ? { "HTTP-Referer": openRouterAppUrl } : {}),
        ...(openRouterAppName ? { "X-Title": openRouterAppName } : {}),
      },
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

function buildProviderRuntimes(options?: ExecuteAiEntryOptions): AiEntryProviderRuntime[] {
  const preferredProviderId = options?.preferredProviderId || null
  const preferredModel = normalizeText(options?.preferredModel || undefined)
  const forcePreferredProvider = Boolean(options?.forcePreferredProvider && preferredProviderId)
  const forceModelAcrossProviders = Boolean(
    options?.forceModelAcrossProviders && preferredModel,
  )
  const disableSameProviderModelFallback = Boolean(
    options?.disableSameProviderModelFallback,
  )

  let configs = getConfiguredAiEntryProviders()
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

  const runtimes = configs.map((item, index) => ({
    id: item.id,
    model: forceModelAcrossProviders
      ? preferredModel
      : preferredProviderId && item.id === preferredProviderId && preferredModel
        ? preferredModel
        : item.model,
    baseURL: item.baseURL,
    provider: createOpenAI({
      apiKey: item.apiKey,
      baseURL: item.baseURL,
      headers: item.headers,
    }),
    stateIndex: index,
  }))

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
  const providers = buildProviderRuntimes(options)
  if (providers.length === 0) {
    throw new Error(
      "No configured AI entry providers. Configure at least one of: aiberm, crazyroute, openrouter.",
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
  const startStateIndex = shouldTryUpgrade ? state.activeIndex - 1 : state.activeIndex
  const startIndex = findRuntimeStartIndexByStateIndex(providers, startStateIndex)

  let lastError: unknown = null
  let attempt = 0

  for (let index = startIndex; index < providers.length; index += 1) {
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
      const hasLowerPriorityProvider = index + 1 < providers.length
      const nextCandidate = hasLowerPriorityProvider ? providers[index + 1] : null
      state.activeIndex = clampIndex(
        nextCandidate?.stateIndex ?? candidate.stateIndex,
        maxStateIndex,
      )
      state.degradedAccessCount = 0

      if (!hasLowerPriorityProvider || !isRetryableProviderError(error)) {
        break
      }

      const nextProvider = providers[index + 1]
      console.warn("ai-entry.provider.degrade", {
        provider: candidate.id,
        model: candidate.model,
        nextProvider: nextProvider.id,
        nextModel: nextProvider.model,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  throw lastError instanceof Error ? lastError : new Error("ai_entry_provider_failed")
}
