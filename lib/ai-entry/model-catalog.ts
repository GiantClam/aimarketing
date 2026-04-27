import {
  getConfiguredAiEntryProviders,
  type AiEntryProviderConfig,
  type AiEntryProviderId,
} from "@/lib/ai-entry/provider-routing"
import {
  compareModelDisplayIdPreference,
  equivalentModelFingerprint,
  normalizeModelDisplayId,
  pickPreferredDisplayModelId,
  splitProviderModelId,
} from "@/lib/ai-entry/model-id-registry"
import {
  AI_ENTRY_NORMAL_DEFAULT_MODEL_HINT,
  normalizeModelFingerprint,
} from "@/lib/ai-entry/model-policy"

const CACHE_TTL_MS = 30 * 60 * 1000
const CATALOG_FILTER_CACHE_VERSION = "v4"
const PRIORITY_PROVIDER_FAMILIES = ["anthropic", "openai", "gemini"] as const
const ALLOWED_PROVIDER_FAMILIES = [
  "anthropic",
  "openai",
  "gemini",
  "qwen",
  "minimax",
  "glm",
  "kimi",
] as const
const ALLOWED_PROVIDER_FAMILY_SET = new Set<string>(ALLOWED_PROVIDER_FAMILIES)
const NON_CHAT_MODEL_HINTS = [
  "embedding",
  "embed-",
  "embed_",
  "rerank",
  "re-rank",
  "moderation",
  "whisper",
  "transcribe",
  "tts",
  "text-to-speech",
  "speech-to-text",
  "dall-e",
  "audio",
  "image",
  "stable-diffusion",
  "sdxl",
  "text-to-image",
  "image-generation",
  "video-generation",
  "sora",
] as const

const PROVIDER_FAMILY_ALIASES: Record<string, string> = {
  anthropic: "anthropic",
  claude: "anthropic",
  openai: "openai",
  google: "gemini",
  gemini: "gemini",
  deepmind: "gemini",
  qwen: "qwen",
  tongyi: "qwen",
  dashscope: "qwen",
  minimax: "minimax",
  abab: "minimax",
  glm: "glm",
  chatglm: "glm",
  zhipu: "glm",
  zhipuai: "glm",
  kimi: "kimi",
  moonshot: "kimi",
  moonshotai: "kimi",
  zai: "glm",
  xai: "xai",
  grok: "xai",
}

const PROVIDER_FAMILY_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Gemini",
  qwen: "Qwen",
  minimax: "MiniMax",
  glm: "GLM",
  kimi: "Kimi",
  xai: "xAI",
}

type AiEntryModelCache = {
  expiresAt: number
  value: AiEntryModelCatalog
}

type GlobalWithAiEntryModelCache = typeof globalThis & {
  __aiEntryModelCatalogCacheV2__?: Record<string, AiEntryModelCache>
}

export type AiEntryModelOption = {
  id: string
  name: string
  runtimeId?: string
  canonicalId?: string
  aliases?: string[]
}

export type AiEntryModelGroup = {
  family: string
  label: string
  models: AiEntryModelOption[]
}

export type AiEntryModelCatalog = {
  providerId: AiEntryProviderId | null
  providerBaseUrl: string | null
  selectedModelId: string | null
  models: AiEntryModelOption[]
  modelGroups: AiEntryModelGroup[]
  cached: boolean
  fetchedAt: number
  recentDays: number | null
  recentStrict: boolean
}

type AiEntryModelCatalogOptions = {
  onlyRecentDays?: number | null
  recentStrict?: boolean
}

type ModelApiItem = {
  id?: unknown
  name?: unknown
  created?: unknown
  owned_by?: unknown
  provider?: unknown
  type?: unknown
  modalities?: unknown
  modality?: unknown
  capabilities?: unknown
  architecture?: {
    modality?: unknown
    input_modalities?: unknown
    output_modalities?: unknown
  } | null
}

type ModelsApiResponse = {
  data?: ModelApiItem[]
  models?: ModelApiItem[]
}

type ParsedModel = {
  id: string
  name: string
  family: string
  createdAtMs: number | null
  isLikelyChat: boolean
}

type RecentFilterResult = {
  models: ParsedModel[]
}

function normalizeText(raw: unknown) {
  return typeof raw === "string" ? raw.trim() : ""
}

function parseCreatedAtMs(raw: unknown) {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw > 1_000_000_000_000 ? raw : raw * 1000
  }

  if (typeof raw === "string") {
    const asNumber = Number.parseInt(raw.trim(), 10)
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return asNumber > 1_000_000_000_000 ? asNumber : asNumber * 1000
    }

    const parsedAt = Date.parse(raw)
    if (Number.isFinite(parsedAt)) return parsedAt
  }

  return null
}

function normalizeFamilyToken(raw: unknown) {
  const normalized = normalizeText(raw).toLowerCase().replace(/[^a-z0-9]+/g, "")
  if (!normalized) return ""
  const aliased = PROVIDER_FAMILY_ALIASES[normalized]
  if (aliased) return aliased
  if (ALLOWED_PROVIDER_FAMILY_SET.has(normalized)) return normalized
  return ""
}

function inferFamilyFromLooseText(raw: unknown) {
  const text = normalizeText(raw).toLowerCase()
  if (!text) return ""

  const compact = text.replace(/[^a-z0-9]+/g, "")
  const tokens = text.split(/[^a-z0-9]+/g).filter(Boolean)
  for (const token of [...tokens, compact]) {
    const mapped = PROVIDER_FAMILY_ALIASES[token]
    if (mapped) return mapped
  }

  if (
    /\b(anthropic|claude)\b/.test(text) ||
    compact.startsWith("claude")
  ) {
    return "anthropic"
  }
  if (
    /\b(openai|chatgpt|gpt|o1|o3|o4|o5)\b/.test(text) ||
    compact.startsWith("gpt") ||
    compact.startsWith("o1") ||
    compact.startsWith("o3") ||
    compact.startsWith("o4") ||
    compact.startsWith("o5")
  ) {
    return "openai"
  }
  if (
    /\b(google|gemini)\b/.test(text) ||
    compact.startsWith("gemini")
  ) {
    return "gemini"
  }
  if (
    /\b(qwen|qwq|tongyi|dashscope)\b/.test(text) ||
    compact.startsWith("qwen") ||
    compact.startsWith("qwq")
  ) {
    return "qwen"
  }
  if (
    /\b(minimax|abab|hailuo)\b/.test(text) ||
    compact.startsWith("minimax") ||
    compact.startsWith("abab")
  ) {
    return "minimax"
  }
  if (
    /\b(glm|chatglm|zhipu|zhipuai|z-ai|zai)\b/.test(text) ||
    compact.startsWith("glm") ||
    compact.includes("chatglm")
  ) {
    return "glm"
  }
  if (
    /\b(kimi|moonshot|moonshotai)\b/.test(text) ||
    compact.startsWith("kimi") ||
    compact.startsWith("moonshot")
  ) {
    return "kimi"
  }

  return ""
}

function inferProviderFamily(item: ModelApiItem, id: string) {
  const byProvider = normalizeFamilyToken(item.provider)
  if (byProvider) return byProvider

  const byOwner = normalizeFamilyToken(item.owned_by)
  if (byOwner) return byOwner

  const prefix = id.includes("/") ? id.split("/")[0] : id.split(":")[0]
  const byPrefix = normalizeFamilyToken(prefix)
  if (byPrefix) return byPrefix

  const byName = normalizeFamilyToken(item.name)
  if (byName) return byName

  const byLooseHint =
    inferFamilyFromLooseText(item.provider) ||
    inferFamilyFromLooseText(item.owned_by) ||
    inferFamilyFromLooseText(id) ||
    inferFamilyFromLooseText(prefix) ||
    inferFamilyFromLooseText(item.name)
  if (byLooseHint) return byLooseHint

  return "other"
}

function normalizeModalities(raw: unknown): string[] {
  if (typeof raw === "string") {
    return raw
      .split(/[,\s>/|-]+/g)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  }

  if (Array.isArray(raw)) {
    return raw
      .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
      .filter(Boolean)
  }

  if (raw && typeof raw === "object") {
    const values = Object.values(raw as Record<string, unknown>).flatMap((value) =>
      normalizeModalities(value),
    )
    return values
  }

  return []
}

function includesAnyHint(text: string, hints: readonly string[]) {
  return hints.some((hint) => text.includes(hint))
}

function inferLikelyChat(item: ModelApiItem, id: string, name: string) {
  const joined = `${id} ${name}`.toLowerCase()
  if (includesAnyHint(joined, NON_CHAT_MODEL_HINTS)) return false

  const typeValue = normalizeText(item.type).toLowerCase()
  if (typeValue) {
    if (includesAnyHint(typeValue, NON_CHAT_MODEL_HINTS)) return false
    if (
      typeValue.includes("chat") ||
      typeValue.includes("text") ||
      typeValue.includes("language") ||
      typeValue.includes("completion")
    ) {
      return true
    }
  }

  const modalities = [
    ...normalizeModalities(item.modalities),
    ...normalizeModalities(item.modality),
    ...normalizeModalities(item.capabilities),
    ...normalizeModalities(item.architecture?.modality),
    ...normalizeModalities(item.architecture?.input_modalities),
    ...normalizeModalities(item.architecture?.output_modalities),
  ]

  if (modalities.length > 0) {
    const hasText = modalities.some((item) => item.includes("text"))
    if (!hasText) return false
    return true
  }

  return true
}

function normalizeRawModels(payload: ModelsApiResponse | null | undefined) {
  const rawArray = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : []

  const models: ParsedModel[] = []
  const dedupe = new Set<string>()

  for (const item of rawArray) {
    const id = normalizeText(item?.id)
    if (!id || dedupe.has(id)) continue
    dedupe.add(id)

    const name = normalizeText(item?.name) || id
    models.push({
      id,
      name,
      family: inferProviderFamily(item || {}, id),
      createdAtMs: parseCreatedAtMs(item?.created),
      isLikelyChat: inferLikelyChat(item || {}, id, name),
    })
  }

  return models
}

function compareModels(a: ParsedModel, b: ParsedModel) {
  const byName = a.name.localeCompare(b.name, "en", { sensitivity: "base" })
  if (byName !== 0) return byName
  return a.id.localeCompare(b.id, "en", { sensitivity: "base" })
}

function toModelOption(
  model: ParsedModel & { runtimeId?: string; canonicalId?: string; aliases?: string[] },
): AiEntryModelOption {
  return {
    id: model.id,
    name: model.name,
    ...(typeof model.runtimeId === "string" && model.runtimeId
      ? { runtimeId: model.runtimeId }
      : {}),
    ...(model.canonicalId ? { canonicalId: model.canonicalId } : {}),
    ...(Array.isArray(model.aliases) && model.aliases.length > 0
      ? { aliases: model.aliases }
      : {}),
  }
}

function toFamilyLabel(family: string) {
  if (PROVIDER_FAMILY_LABELS[family]) return PROVIDER_FAMILY_LABELS[family]
  if (!family || family === "other") return "Other"
  return family.charAt(0).toUpperCase() + family.slice(1)
}

function buildModelGroups(models: ParsedModel[]) {
  const bucket = new Map<string, ParsedModel[]>()
  for (const model of models) {
    const group = bucket.get(model.family)
    if (group) {
      group.push(model)
    } else {
      bucket.set(model.family, [model])
    }
  }

  const families = [...bucket.keys()]
  const prioritized = PRIORITY_PROVIDER_FAMILIES.filter((family) =>
    bucket.has(family),
  )
  const others = families
    .filter((family) => !PRIORITY_PROVIDER_FAMILIES.includes(family as (typeof PRIORITY_PROVIDER_FAMILIES)[number]))
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
  const orderedFamilies = [...prioritized, ...others]

  const groups: AiEntryModelGroup[] = []
  const flattened: AiEntryModelOption[] = []

  for (const family of orderedFamilies) {
    const groupModels = [...(bucket.get(family) || [])].sort(compareModels)
    const options = groupModels.map(toModelOption)
    groups.push({
      family,
      label: toFamilyLabel(family),
      models: options,
    })
    flattened.push(...options)
  }

  return {
    groups,
    flattened,
  }
}

function getRecentDays(options?: AiEntryModelCatalogOptions) {
  if (typeof options?.onlyRecentDays === "number") {
    return options.onlyRecentDays > 0 ? Math.floor(options.onlyRecentDays) : null
  }
  if (options?.onlyRecentDays === null) return null
  return null
}

function getRecentStrict(options?: AiEntryModelCatalogOptions) {
  if (typeof options?.recentStrict === "boolean") return options.recentStrict
  return false
}

function applyRecentFilter(
  models: ParsedModel[],
  recentDays: number | null,
  recentStrict: boolean,
  now: number,
): RecentFilterResult {
  if (!recentDays) return { models }
  const cutoff = now - recentDays * 24 * 60 * 60 * 1000

  return {
    models: models.filter((model) => {
      if (!model.createdAtMs) return !recentStrict
      return model.createdAtMs >= cutoff
    }),
  }
}

function filterAllowedFamilyModels(models: ParsedModel[]) {
  return models.filter((model) => ALLOWED_PROVIDER_FAMILY_SET.has(model.family))
}

function canonicalDuplicateKey(id: string) {
  const parsed = splitProviderModelId(id)
  return equivalentModelFingerprint(parsed ? parsed.suffix : id)
}

function filterProviderPrefixedDuplicates(models: ParsedModel[]) {
  const bareModelFamilyById = new Map<string, Set<string>>()
  for (const model of models) {
    if (splitProviderModelId(model.id)) continue
    const key = canonicalDuplicateKey(model.id)
    const families = bareModelFamilyById.get(key) || new Set<string>()
    families.add(model.family)
    bareModelFamilyById.set(key, families)
  }

  return models.filter((model) => {
    const parsed = splitProviderModelId(model.id)
    if (!parsed) return true

    const prefixFamily =
      normalizeFamilyToken(parsed.prefix) || inferFamilyFromLooseText(parsed.prefix)
    if (!prefixFamily || prefixFamily !== model.family) return true

    const bareFamilies = bareModelFamilyById.get(canonicalDuplicateKey(parsed.suffix))
    if (!bareFamilies || bareFamilies.size === 0) return true

    return !bareFamilies.has(model.family)
  })
}

function compareModelDedupPreference(a: ParsedModel, b: ParsedModel) {
  return compareModelDisplayIdPreference(a.id, b.id)
}

function pickPreferredEquivalentModel(a: ParsedModel, b: ParsedModel) {
  const byPreference = compareModelDedupPreference(a, b)
  if (byPreference < 0) return a
  if (byPreference > 0) return b

  const aHasBetterName = a.name !== a.id
  const bHasBetterName = b.name !== b.id
  if (aHasBetterName !== bHasBetterName) {
    return aHasBetterName ? a : b
  }

  return a
}

function dedupeEquivalentModelIds(models: ParsedModel[]) {
  const bestByKey = new Map<string, ParsedModel>()
  const aliasesByKey = new Map<string, Set<string>>()
  for (const model of models) {
    const key = `${model.family}:${canonicalDuplicateKey(model.id)}`
    const aliasSet = aliasesByKey.get(key) || new Set<string>()
    aliasSet.add(model.id)
    aliasesByKey.set(key, aliasSet)
    const previous = bestByKey.get(key)
    if (!previous) {
      bestByKey.set(key, model)
      continue
    }
    bestByKey.set(key, pickPreferredEquivalentModel(previous, model))
  }

  return [...bestByKey.entries()].map(([key, model]) => {
    const aliases = [
      ...new Set(
        [...(aliasesByKey.get(key) || new Set<string>())]
          .flatMap((item) => {
            const normalized = normalizeModelDisplayId(item)
            return normalized ? [item, normalized] : [item]
          })
          .filter(Boolean),
      ),
    ]
    const displayId = pickPreferredDisplayModelId([model.id, ...aliases]) || model.id
    return {
      ...model,
      id: displayId,
      name: displayId,
      runtimeId: model.id,
      canonicalId: canonicalDuplicateKey(model.id),
      aliases,
    }
  })
}

function parseVersionAfterToken(
  text: string,
  token: "gpt" | "gemini" | "claude",
) {
  const regex = new RegExp(`${token}[^0-9]{0,16}(\\d+)(?:[._-](\\d+))?`, "i")
  const matched = regex.exec(text)
  if (!matched) return null

  const major = Number.parseInt(matched[1] || "", 10)
  const minor = Number.parseInt(matched[2] || "0", 10)
  if (!Number.isFinite(major)) return null
  return {
    major,
    minor: Number.isFinite(minor) ? minor : 0,
  }
}

function versionAtLeast(
  version: { major: number; minor: number },
  minMajor: number,
  minMinor: number,
) {
  if (version.major > minMajor) return true
  if (version.major < minMajor) return false
  return version.minor >= minMinor
}

function isClaudeTierVariant(text: string) {
  if (/\b(sonnet|opus|haiku)\b/.test(text)) return true
  const compact = text.replace(/[^a-z0-9]+/g, "")
  return (
    compact.includes("sonnet") ||
    compact.includes("opus") ||
    compact.includes("haiku")
  )
}

function isSupportedClaudeVersion(version: { major: number; minor: number }) {
  return version.major === 4 && (version.minor === 5 || version.minor === 6)
}

function isHighTierDisplayModel(input: { id: string; name: string }) {
  const text = `${input.id} ${input.name}`.toLowerCase()

  if (text.includes("claude")) {
    if (!isClaudeTierVariant(text)) return false
    const version = parseVersionAfterToken(text, "claude")
    return Boolean(version && isSupportedClaudeVersion(version))
  }

  if (text.includes("gemini")) {
    const version = parseVersionAfterToken(text, "gemini")
    return Boolean(version && versionAtLeast(version, 3, 0))
  }

  if (text.includes("gpt")) {
    const version = parseVersionAfterToken(text, "gpt")
    return Boolean(version && versionAtLeast(version, 5, 3))
  }

  return false
}

function filterHighTierDisplayModels(models: ParsedModel[]) {
  return models.filter((model) =>
    isHighTierDisplayModel({
      id: model.id,
      name: model.name,
    }),
  )
}

function pickPreferredNormalChatModelId(models: AiEntryModelOption[]) {
  const explicitDefault = normalizeText(process.env.AI_ENTRY_NORMAL_DEFAULT_MODEL)
  const preferenceHints = [
    explicitDefault,
    normalizeText(process.env.AI_ENTRY_NORMAL_FAST_MODEL),
    AI_ENTRY_NORMAL_DEFAULT_MODEL_HINT,
  ].filter(Boolean)

  const scoreModel = (model: AiEntryModelOption, hint: string) => {
    const candidateFingerprint = normalizeModelFingerprint(
      [
        model.id,
        model.name,
        model.runtimeId,
        model.canonicalId,
        ...(Array.isArray(model.aliases) ? model.aliases : []),
      ]
        .filter(Boolean)
        .join(" "),
    )
    const hintFingerprint = normalizeModelFingerprint(hint)
    if (!hintFingerprint || !candidateFingerprint.includes(hintFingerprint)) return null

    let score = 0
    if (!candidateFingerprint.includes("thinking")) score += 100
    if (!model.id.includes("/")) score += 10
    if (!model.id.includes(".")) score += 5
    score -= model.id.length / 100
    return score
  }

  for (const hint of preferenceHints) {
    const candidates = models
      .map((model) => {
        const score = scoreModel(model, hint)
        return score === null ? null : { model, score }
      })
      .filter((item): item is { model: AiEntryModelOption; score: number } =>
        Boolean(item),
      )
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score
        return a.model.id.localeCompare(b.model.id, "en", { sensitivity: "base" })
      })
    if (candidates[0]?.model.id) return candidates[0].model.id
  }

  const nonThinking = models.find((model) => {
    const fingerprint = normalizeModelFingerprint(`${model.id} ${model.name}`)
    return !fingerprint.includes("thinking")
  })
  return nonThinking?.id || models[0]?.id || null
}

function buildFallbackCatalog(
  provider: AiEntryProviderConfig | null,
  cached: boolean,
  recentDays: number | null,
  recentStrict: boolean,
): AiEntryModelCatalog {
  const fallbackId = normalizeText(provider?.model)
  const fallbackFamily = fallbackId
    ? inferProviderFamily({ id: fallbackId, name: fallbackId }, fallbackId)
    : "other"
  const fallbackIsHighTier = fallbackId
    ? isHighTierDisplayModel({ id: fallbackId, name: fallbackId })
    : false
  const models =
    fallbackId && ALLOWED_PROVIDER_FAMILY_SET.has(fallbackFamily) && fallbackIsHighTier
      ? [{ id: fallbackId, name: fallbackId, runtimeId: fallbackId }]
      : []
  const modelGroups: AiEntryModelGroup[] =
    models.length > 0
      ? [
          {
            family: fallbackFamily,
            label: toFamilyLabel(fallbackFamily),
            models,
          },
        ]
      : []

  return {
    providerId: provider?.id || null,
    providerBaseUrl: provider?.baseURL || null,
    selectedModelId: models[0]?.id || null,
    models,
    modelGroups,
    cached,
    fetchedAt: Date.now(),
    recentDays,
    recentStrict,
  }
}

async function fetchProviderModels(provider: AiEntryProviderConfig) {
  const response = await fetch(`${provider.baseURL.replace(/\/+$/u, "")}/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
      ...(provider.headers || {}),
    },
    cache: "no-store",
  })

  if (!response.ok) {
    const raw = await response.text().catch(() => "")
    throw new Error(`ai_entry_models_http_${response.status}:${raw.slice(0, 120)}`)
  }

  const payload = (await response.json().catch(() => null)) as ModelsApiResponse | null
  return normalizeRawModels(payload)
}

function createCacheKey(
  providers: AiEntryProviderConfig[],
  recentDays: number | null,
  recentStrict: boolean,
) {
  if (providers.length === 0) {
    return `none|cache:${CATALOG_FILTER_CACHE_VERSION}|recent:${recentDays ?? "none"}|strict:${recentStrict ? "1" : "0"}`
  }
  const providerSignature = providers.map((item) => `${item.id}:${item.baseURL}`).join("|")
  return `${providerSignature}|cache:${CATALOG_FILTER_CACHE_VERSION}|recent:${recentDays ?? "none"}|strict:${recentStrict ? "1" : "0"}`
}

export async function getAiEntryModelCatalog(options?: AiEntryModelCatalogOptions) {
  const globalScope = globalThis as GlobalWithAiEntryModelCache
  const now = Date.now()
  const recentDays = getRecentDays(options)
  const recentStrict = getRecentStrict(options)
  const providers = getConfiguredAiEntryProviders()

  const cacheStore = globalScope.__aiEntryModelCatalogCacheV2__ || {}
  globalScope.__aiEntryModelCatalogCacheV2__ = cacheStore
  const cacheKey = createCacheKey(providers, recentDays, recentStrict)
  const cached = cacheStore[cacheKey]
  if (cached && cached.expiresAt > now) {
    return {
      ...cached.value,
      cached: true,
    }
  }

  if (providers.length === 0) {
    const empty = buildFallbackCatalog(null, false, recentDays, recentStrict)
    cacheStore[cacheKey] = {
      expiresAt: now + CACHE_TTL_MS,
      value: empty,
    }
    return empty
  }

  let lastError: unknown = null
  for (const provider of providers) {
    try {
      const fetchedModels = await fetchProviderModels(provider)
      const configuredDefaultModel = provider.model.trim()

      const modelsWithDefault = [...fetchedModels]
      const hasConfiguredDefaultInList =
        configuredDefaultModel.length > 0 &&
        modelsWithDefault.some((item) => item.id === configuredDefaultModel)
      if (!hasConfiguredDefaultInList && configuredDefaultModel) {
        modelsWithDefault.push({
          id: configuredDefaultModel,
          name: configuredDefaultModel,
          family: inferProviderFamily(
            { id: configuredDefaultModel, name: configuredDefaultModel },
            configuredDefaultModel,
          ),
          createdAtMs: null,
          isLikelyChat: true,
        })
      }

      const chatModels = modelsWithDefault.filter(
        (model) => model.isLikelyChat || model.id === configuredDefaultModel,
      )
      const allowedChatModels = filterHighTierDisplayModels(
        dedupeEquivalentModelIds(
          filterProviderPrefixedDuplicates(filterAllowedFamilyModels(chatModels)),
        ),
      )
      const recentFiltered = applyRecentFilter(
        allowedChatModels,
        recentDays,
        recentStrict,
        now,
      )
      const shouldFallbackToUnfiltered =
        Boolean(recentDays) &&
        !recentStrict &&
        recentFiltered.models.length === 0 &&
        allowedChatModels.length > 0
      const effectiveModels = shouldFallbackToUnfiltered
        ? allowedChatModels
        : recentFiltered.models
      const grouped = buildModelGroups(effectiveModels)

      if (shouldFallbackToUnfiltered) {
        console.warn("ai-entry.models.recent-filter.empty.fallback", {
          provider: provider.id,
          recentDays,
        })
      }

      if (grouped.flattened.length === 0) {
        console.warn("ai-entry.models.provider.empty", {
          provider: provider.id,
        })
        continue
      }

      const selectedModelId =
        pickPreferredNormalChatModelId(grouped.flattened) || null

      const value: AiEntryModelCatalog = {
        providerId: provider.id,
        providerBaseUrl: provider.baseURL,
        selectedModelId,
        models: grouped.flattened,
        modelGroups: grouped.groups,
        cached: false,
        fetchedAt: now,
        recentDays,
        recentStrict,
      }

      cacheStore[cacheKey] = {
        expiresAt: now + CACHE_TTL_MS,
        value,
      }
      return value
    } catch (error) {
      lastError = error
      console.warn("ai-entry.models.fetch.failed", {
        provider: provider.id,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (lastError) {
    console.warn("ai-entry.models.providers.unavailable", {
      attemptedProviders: providers.map((item) => item.id),
      message: lastError instanceof Error ? lastError.message : String(lastError),
    })
  }

  const fallback = buildFallbackCatalog(providers[0] || null, false, recentDays, recentStrict)
  cacheStore[cacheKey] = {
    expiresAt: now + CACHE_TTL_MS,
    value: fallback,
  }
  return fallback
}
