const DEFAULT_LEAD_TOOL_MODEL =
  process.env.PPTOKEN_MODEL || process.env.AI_ENTRY_PPTOKEN_MODEL || "openai/gpt-4.1-mini"
const DEFAULT_PPT_PREVIEW_MODEL = "deepseek-v4-pro"
const DEFAULT_PPT_RUNTIME_SLIDE_MODEL = "gpt-5.4"
const DEFAULT_PPT_RUNTIME_FALLBACK_MODEL = "MiniMax-M2.7-highspeed"
const DEFAULT_PPT_RUNTIME_FALLBACK_PROVIDER = "minimax"
const DEFAULT_PPT_PREVIEW_RUNTIME = "frontend-slides-agent"
const DEFAULT_PPT_EXPORT_RUNTIME = "ppt-master-agent"
const DEFAULT_PPT_EXECUTION_TRANSPORT = "local"
const DEFAULT_PPT_WORKER_PREVIEW_POLL_INTERVAL_MS = 2000
const DEFAULT_PPT_WORKER_PREVIEW_TIMEOUT_MS = 90 * 60 * 1000
const DEFAULT_PPT_WORKER_PREVIEW_MAX_ATTEMPTS = 2
const DEFAULT_PPT_WORKER_PREVIEW_RETRY_DELAY_MS = 3000
const DEFAULT_PPT_MASTER_SLIDE_TIMEOUT_MS = 12 * 60 * 1000
const MIN_PPT_MASTER_PPTOKEN_GPT54_SLIDE_TIMEOUT_MS = 6 * 60 * 1000
const DEFAULT_PRODUCTION_PPT_WORKER_BASE_URL = "https://ppt-master-worker-production.up.railway.app"

function pickFirstNonEmpty(values: Array<string | undefined>, fallback: string) {
  for (const value of values) {
    const normalized = value?.trim()
    if (normalized) return normalized
  }

  return fallback
}

export function getLeadToolPreviewModel(slug: string) {
  if (slug === "ai-ppt-preview") {
    return pickFirstNonEmpty(
      [process.env.LEAD_TOOLS_PPT_PREVIEW_MODEL, process.env.LEAD_TOOLS_PREVIEW_MODEL],
      DEFAULT_PPT_PREVIEW_MODEL,
    )
  }

  if (slug === "ai-seo-meta-generator") {
    return pickFirstNonEmpty(
      [process.env.LEAD_TOOLS_SEO_PREVIEW_MODEL, process.env.LEAD_TOOLS_PREVIEW_MODEL],
      DEFAULT_LEAD_TOOL_MODEL,
    )
  }

  return pickFirstNonEmpty([process.env.LEAD_TOOLS_PREVIEW_MODEL], DEFAULT_LEAD_TOOL_MODEL)
}

export function getLeadToolFinalModel(slug: string) {
  if (slug === "ai-ppt-preview") {
    return pickFirstNonEmpty(
      [process.env.LEAD_TOOLS_PPT_FINAL_MODEL, process.env.LEAD_TOOLS_FINAL_MODEL],
      DEFAULT_LEAD_TOOL_MODEL,
    )
  }

  if (slug === "ai-seo-meta-generator") {
    return pickFirstNonEmpty(
      [process.env.LEAD_TOOLS_SEO_FINAL_MODEL, process.env.LEAD_TOOLS_FINAL_MODEL],
      DEFAULT_LEAD_TOOL_MODEL,
    )
  }

  return pickFirstNonEmpty([process.env.LEAD_TOOLS_FINAL_MODEL], DEFAULT_LEAD_TOOL_MODEL)
}

export function getLeadToolPptPreviewRuntime(slug: string) {
  if (slug === "ai-ppt-preview") {
    const explicitRuntime = process.env.LEAD_TOOLS_PPT_PREVIEW_RUNTIME?.trim() || process.env.LEAD_TOOLS_PREVIEW_RUNTIME?.trim()
    if (explicitRuntime) return explicitRuntime
    if (getPptWorkerBaseUrl()) return "ppt-master-agent"
    return DEFAULT_PPT_PREVIEW_RUNTIME
  }

  return pickFirstNonEmpty([process.env.LEAD_TOOLS_PREVIEW_RUNTIME], DEFAULT_PPT_PREVIEW_RUNTIME)
}

export function getLeadToolPptExportRuntime(slug: string) {
  if (slug === "ai-ppt-preview") {
    return pickFirstNonEmpty(
      [process.env.LEAD_TOOLS_PPT_EXPORT_RUNTIME, process.env.LEAD_TOOLS_EXPORT_RUNTIME],
      DEFAULT_PPT_EXPORT_RUNTIME,
    )
  }

  return pickFirstNonEmpty([process.env.LEAD_TOOLS_EXPORT_RUNTIME], DEFAULT_PPT_EXPORT_RUNTIME)
}

export function getLeadToolPptExecutionTransport() {
  const explicitTransport = process.env.LEAD_TOOLS_PPT_EXECUTION_TRANSPORT?.trim()
  if (explicitTransport) return explicitTransport
  if (getPptWorkerBaseUrl()) return "remote-worker"
  return DEFAULT_PPT_EXECUTION_TRANSPORT
}

export function getPptWorkerBaseUrl() {
  const configuredBaseUrl = process.env.PPT_WORKER_BASE_URL?.trim()
  if (configuredBaseUrl) return configuredBaseUrl

  // Vercel production must use the Railway worker. Without this default,
  // missing env configuration silently sends editable PPT requests into the
  // local runtime, which cannot access the ppt-master repository.
  if (process.env.VERCEL_ENV === "production") {
    return DEFAULT_PRODUCTION_PPT_WORKER_BASE_URL
  }

  return ""
}

export function getPptWorkerInternalToken() {
  return process.env.PPT_WORKER_INTERNAL_TOKEN?.trim() || ""
}

export function getPptWorkerRuntimeProfile() {
  const runtimeProfile = process.env.PPT_WORKER_RUNTIME_PROFILE?.trim()

  if (runtimeProfile === "railway-linux") {
    return runtimeProfile
  }

  const workerBaseUrl = getPptWorkerBaseUrl()
  if (workerBaseUrl) {
    try {
      const hostname = new URL(workerBaseUrl).hostname.toLowerCase()
      if (hostname.endsWith(".railway.app")) {
        return "railway-linux" as const
      }
    } catch {
      // Ignore malformed worker URLs and fall back to the default local profile.
    }
  }

  return "local-dev" as const
}

export function getPptWorkerPreviewPollIntervalMs() {
  return pickPositiveInt(
    [process.env.PPT_WORKER_PREVIEW_POLL_INTERVAL_MS],
    DEFAULT_PPT_WORKER_PREVIEW_POLL_INTERVAL_MS,
  )
}

export function getPptWorkerPreviewTimeoutMs() {
  return pickPositiveInt(
    [process.env.PPT_WORKER_PREVIEW_TIMEOUT_MS],
    DEFAULT_PPT_WORKER_PREVIEW_TIMEOUT_MS,
  )
}

export function getPptWorkerPreviewMaxAttempts() {
  return pickPositiveInt(
    [process.env.PPT_WORKER_PREVIEW_MAX_ATTEMPTS],
    DEFAULT_PPT_WORKER_PREVIEW_MAX_ATTEMPTS,
  )
}

export function getPptWorkerPreviewRetryDelayMs() {
  return pickPositiveInt(
    [process.env.PPT_WORKER_PREVIEW_RETRY_DELAY_MS],
    DEFAULT_PPT_WORKER_PREVIEW_RETRY_DELAY_MS,
  )
}

function normalizeEnvKeySegment(value: string | null | undefined) {
  return value?.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || ""
}

function pickOptionalPositiveInt(values: Array<string | undefined>) {
  for (const value of values) {
    const parsed = Number.parseInt(value?.trim() || "", 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }

  return null
}

function resolveConfiguredPptMasterSlideTimeout(params?: { provider?: string | null; model?: string | null }) {
  const providerKey = normalizeEnvKeySegment(params?.provider)
  const modelKey = normalizeEnvKeySegment(params?.model)

  const providerModelTimeout = pickOptionalPositiveInt([
    providerKey && modelKey ? process.env[`PPT_MASTER_SLIDE_TIMEOUT_MS_${providerKey}_${modelKey}`] : undefined,
  ])
  if (providerModelTimeout) {
    return {
      value: providerModelTimeout,
      source: "provider-model" as const,
    }
  }

  const providerTimeout = pickOptionalPositiveInt([
    providerKey ? process.env[`PPT_MASTER_SLIDE_TIMEOUT_MS_${providerKey}`] : undefined,
  ])
  if (providerTimeout) {
    return {
      value: providerTimeout,
      source: "provider" as const,
    }
  }

  const globalTimeout = pickOptionalPositiveInt([
    process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_TIMEOUT_MS,
    process.env.PPT_MASTER_SLIDE_TIMEOUT_MS,
  ])
  if (globalTimeout) {
    return {
      value: globalTimeout,
      source: "global" as const,
    }
  }

  return {
    value: null,
    source: null,
  }
}

function getPptMasterKnownTimeoutFloor(params?: { provider?: string | null; model?: string | null }) {
  const provider = params?.provider?.trim().toLowerCase() || ""
  const model = params?.model?.trim() || ""

  if (provider === "pptoken" && model === "gpt-5.4") {
    return MIN_PPT_MASTER_PPTOKEN_GPT54_SLIDE_TIMEOUT_MS
  }

  return 0
}

export function resolvePptMasterSlideTimeoutMs(params?: { provider?: string | null; model?: string | null }) {
  const configured = resolveConfiguredPptMasterSlideTimeout(params)
  const floor = getPptMasterKnownTimeoutFloor(params)

  if (configured.source === "provider-model" || configured.source === "provider") {
    return configured.value ?? DEFAULT_PPT_MASTER_SLIDE_TIMEOUT_MS
  }

  if (configured.source === "global") {
    return Math.max(configured.value ?? DEFAULT_PPT_MASTER_SLIDE_TIMEOUT_MS, floor)
  }

  if (floor > 0) {
    return Math.max(DEFAULT_PPT_MASTER_SLIDE_TIMEOUT_MS, floor)
  }

  return DEFAULT_PPT_MASTER_SLIDE_TIMEOUT_MS
}

export function getPptMasterSlideTimeoutMs() {
  return resolvePptMasterSlideTimeoutMs()
}

export function allowPptMasterEmergencyFallback() {
  return process.env.PPT_MASTER_ALLOW_EMERGENCY_FALLBACK === "true"
}

export function getLeadToolPptRuntimeSlideModel() {
  return pickFirstNonEmpty(
    [process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL],
    DEFAULT_PPT_RUNTIME_SLIDE_MODEL,
  )
}

export function getLeadToolPptRuntimeSlideProvider() {
  const provider = process.env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER?.trim().toLowerCase()

  if (
    provider === "deepseek" ||
    provider === "pptoken" ||
    provider === "minimax" ||
    provider === "stepfun" ||
    provider === "glm" ||
    provider === "writer"
  ) {
    return provider
  }

  return ""
}

export function allowLeadToolPptRuntimeProviderFallback() {
  return process.env.LEAD_TOOLS_PPT_RUNTIME_FALLBACK_ENABLED !== "false"
}

export function getLeadToolPptRuntimeFallbackModel() {
  return pickFirstNonEmpty(
    [process.env.LEAD_TOOLS_PPT_RUNTIME_FALLBACK_MODEL],
    DEFAULT_PPT_RUNTIME_FALLBACK_MODEL,
  )
}

export function getLeadToolPptRuntimeFallbackProvider() {
  const provider = process.env.LEAD_TOOLS_PPT_RUNTIME_FALLBACK_PROVIDER?.trim().toLowerCase()
  return provider === "minimax" ? provider : DEFAULT_PPT_RUNTIME_FALLBACK_PROVIDER
}

export function getLeadToolPptPreviewProvider() {
  const provider = process.env.LEAD_TOOLS_PPT_PREVIEW_PROVIDER?.trim().toLowerCase()

  if (
    provider === "deepseek" ||
    provider === "pptoken" ||
    provider === "minimax" ||
    provider === "stepfun" ||
    provider === "glm" ||
    provider === "writer"
  ) {
    return provider
  }

  return ""
}

export function allowLeadToolMockFallback() {
  if (process.env.LEAD_TOOLS_ALLOW_MOCK_FALLBACK === "true") return true
  return process.env.NODE_ENV !== "production"
}

function pickPositiveInt(values: Array<string | undefined>, fallback: number) {
  for (const value of values) {
    const parsed = Number.parseInt(value?.trim() || "", 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }

  return fallback
}
