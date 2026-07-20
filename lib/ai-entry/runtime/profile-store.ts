import type { RuntimeProfile } from "@/lib/ai-runtime/contracts"

function readBoolean(value: string | undefined, fallback: boolean) {
  const normalized = value?.trim().toLowerCase()
  // Vercel/CLI environment sync can materialize an unset optional variable as
  // an empty string. Treat that the same as unset so a blank context flag does
  // not silently disable an otherwise configured Railway runtime.
  if (!normalized) return fallback
  return normalized === "true"
}

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value || ""), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeUrl(value: string | undefined) {
  const normalized = value?.trim().replace(/\/+$/, "") || ""
  return normalized || null
}

function buildProfile(input: {
  env: Readonly<Record<string, string | undefined>>
  backend: "cloudflare-opencode-session" | "railway-opencode"
  deploymentMode: "saas-cloudflare-sandbox" | "saas-railway"
  enabled: boolean
  runnerUrl: string | null
  hasRunnerSecret: boolean
  timeoutEnvKey?: "CLOUDFLARE_OPENCODE_V2_TIMEOUT_MS" | "RAILWAY_OPENCODE_TIMEOUT_MS"
  maxArtifactsEnvKey?: "CLOUDFLARE_OPENCODE_MAX_ARTIFACTS" | "RAILWAY_OPENCODE_MAX_ARTIFACTS"
  maxArtifactBytesEnvKey?: "CLOUDFLARE_OPENCODE_MAX_ARTIFACT_BYTES" | "RAILWAY_OPENCODE_MAX_ARTIFACT_BYTES"
  maxArtifactTotalBytesEnvKey?: "CLOUDFLARE_OPENCODE_MAX_ARTIFACT_TOTAL_BYTES" | "RAILWAY_OPENCODE_MAX_ARTIFACT_TOTAL_BYTES"
}) : RuntimeProfile {
  const {
    env,
    backend,
    deploymentMode,
    enabled,
    runnerUrl,
    hasRunnerSecret,
    timeoutEnvKey = "RAILWAY_OPENCODE_TIMEOUT_MS",
    maxArtifactsEnvKey = "RAILWAY_OPENCODE_MAX_ARTIFACTS",
    maxArtifactBytesEnvKey = "RAILWAY_OPENCODE_MAX_ARTIFACT_BYTES",
    maxArtifactTotalBytesEnvKey = "RAILWAY_OPENCODE_MAX_ARTIFACT_TOTAL_BYTES",
  } = input
  const active = enabled && Boolean(runnerUrl) && hasRunnerSecret
  return {
    provider: active ? "opencode" : "ai-sdk-native",
    backend: active ? backend : "native",
    deploymentMode,
    enabled: active,
    asyncEnabled: readBoolean(env.AI_ENTRY_OPENCODE_ASYNC_ENABLED, false),
    sessionEnabled: readBoolean(env.AI_ENTRY_OPENCODE_SESSION_ENABLED, false),
    runnerUrl,
    timeoutMs: readPositiveInt(env[timeoutEnvKey], 3_600_000),
    maxOutputBytes: readPositiveInt(env.RAILWAY_OPENCODE_MAX_OUTPUT_BYTES, 512 * 1024),
    // Dashi presentation runs publish SVG QA assets alongside the final HTML,
    // PPTX, and manifest. Keep enough room for the deliverables instead of
    // allowing the asset list to crowd out the final files.
    maxArtifacts: readPositiveInt(env[maxArtifactsEnvKey], 24),
    maxArtifactBytes: readPositiveInt(env[maxArtifactBytesEnvKey], 2 * 1024 * 1024),
    maxArtifactTotalBytes: readPositiveInt(env[maxArtifactTotalBytesEnvKey], 16 * 1024 * 1024),
  }
}

export function resolveDefaultAgentRuntimeProfile(env: Readonly<Record<string, string | undefined>> = process.env): RuntimeProfile {
  const runtimeMode = env.AI_ENTRY_RUNTIME_MODE?.trim() || ""
  // Railway is the only supported OpenCode deployment. The legacy Cloudflare
  // values are accepted only by historical regression fixtures and never
  // selected by the default profile.
  const requestedBackend = env.AI_ENTRY_OPENCODE_BACKEND?.trim() || "railway-opencode"
  const railwayRuntime = requestedBackend === "railway-opencode"
  const runnerUrl = normalizeUrl(env.RAILWAY_OPENCODE_RUNTIME_URL)
  const hasRunnerSecret = Boolean(env.RAILWAY_OPENCODE_RUNTIME_TOKEN?.trim())
  const enabled =
    readBoolean(env.AI_ENTRY_SAAS_OPENCODE_ENABLED, false) &&
    (runtimeMode === "" || runtimeMode === "opencode-railway") &&
    railwayRuntime &&
    Boolean(runnerUrl) &&
    hasRunnerSecret

  const profile = buildProfile({
    env,
    backend: "railway-opencode",
    deploymentMode: "saas-railway",
    enabled,
    runnerUrl,
    hasRunnerSecret,
  })
  return profile
}

/** Railway is intentionally opt-in for the editable PPT assistant only. */
export function resolveEditablePptRailwayRuntimeProfile(
  env: Readonly<Record<string, string | undefined>> = process.env,
): RuntimeProfile {
  const enabled = readBoolean(env.AI_ENTRY_PPT_RAILWAY_ENABLED, false) && readBoolean(env.AI_ENTRY_SAAS_OPENCODE_ENABLED, false)
  const runnerUrl = normalizeUrl(env.RAILWAY_OPENCODE_RUNTIME_URL)
  const hasRunnerSecret = Boolean(env.RAILWAY_OPENCODE_RUNTIME_TOKEN?.trim())
  return buildProfile({
    env,
    backend: "railway-opencode",
    deploymentMode: "saas-railway",
    enabled,
    runnerUrl,
    hasRunnerSecret,
  })
}

/**
 * Business Agents are long-lived interactive sessions. Keep this profile
 * separate from the editable-PPT opt-in so a business Agent can fail fast
 * when the Railway runtime is unavailable rather than switching execution
 * stacks.
 */
export function resolveBusinessAgentRailwayRuntimeProfile(
  env: Readonly<Record<string, string | undefined>> = process.env,
): RuntimeProfile {
  const enabled =
    readBoolean(env.AI_ENTRY_BUSINESS_AGENT_RAILWAY_ENABLED, true) &&
    readBoolean(env.AI_ENTRY_SAAS_OPENCODE_ENABLED, false)
  const runnerUrl = normalizeUrl(env.RAILWAY_OPENCODE_RUNTIME_URL)
  const hasRunnerSecret = Boolean(env.RAILWAY_OPENCODE_RUNTIME_TOKEN?.trim())
  const profile = buildProfile({
    env,
    backend: "railway-opencode",
    deploymentMode: "saas-railway",
    enabled,
    runnerUrl,
    hasRunnerSecret,
  })
  return { ...profile, sessionEnabled: profile.enabled }
}

/** The speaker-style PPT assistant runs the pinned dashi-ppt-skill in Cloudflare Sandbox. */
export function resolveDashiPptCloudflareRuntimeProfile(
  env: Readonly<Record<string, string | undefined>> = process.env,
): RuntimeProfile {
  const runtimeMode = env.AI_ENTRY_RUNTIME_MODE?.trim() || ""
  const enabled =
    readBoolean(env.AI_ENTRY_SAAS_OPENCODE_ENABLED, false) &&
    (runtimeMode === "" || runtimeMode === "opencode-cloudflare-sandbox")
  const profile = buildProfile({
    env,
    backend: "cloudflare-opencode-session",
    deploymentMode: "saas-cloudflare-sandbox",
    enabled,
    runnerUrl: normalizeUrl(env.CLOUDFLARE_OPENCODE_RUNNER_URL),
    hasRunnerSecret: Boolean(env.CLOUDFLARE_OPENCODE_RUNNER_HMAC_SECRET?.trim()),
    timeoutEnvKey: "CLOUDFLARE_OPENCODE_V2_TIMEOUT_MS",
    maxArtifactsEnvKey: "CLOUDFLARE_OPENCODE_MAX_ARTIFACTS",
    maxArtifactBytesEnvKey: "CLOUDFLARE_OPENCODE_MAX_ARTIFACT_BYTES",
    maxArtifactTotalBytesEnvKey: "CLOUDFLARE_OPENCODE_MAX_ARTIFACT_TOTAL_BYTES",
  })
  // V2 Cloudflare runs always use the durable session protocol. This is
  // independent of the optional async queue response mode.
  return { ...profile, sessionEnabled: profile.enabled }
}

export function isBusinessAgentId(agentId: string | null | undefined) {
  return typeof agentId === "string" && agentId.trim().startsWith("business-")
}

export function isAiEntryOpenCodeContextEnabled(env: Readonly<Record<string, string | undefined>> = process.env) {
  return readBoolean(env.AI_ENTRY_OPENCODE_CONTEXT_ENABLED, true)
}

export function isAiEntryOpenCodeArtifactContextEnabled(env: Readonly<Record<string, string | undefined>> = process.env) {
  return readBoolean(env.AI_ENTRY_OPENCODE_ARTIFACT_CONTEXT_ENABLED, true)
}

export function isAiEntryOpenCodeFixedToolGuardEnabled(env: Readonly<Record<string, string | undefined>> = process.env) {
  return readBoolean(env.AI_ENTRY_OPENCODE_FIXED_TOOL_GUARD_ENABLED, true)
}

export function isAiEntrySharedAgentRuntimeEnabled(
  agentId: string | null | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (!readBoolean(env.AI_ENTRY_SHARED_AGENT_RUNTIME_ENABLED, false)) return false
  if (env.AI_ENTRY_SHARED_AGENT_SCOPE?.trim().toLowerCase() === "business-prefix") {
    return isBusinessAgentId(agentId)
  }
  const allowed = (env.AI_ENTRY_SHARED_AGENT_ALLOWLIST || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  return allowed.length === 0 || (agentId ? allowed.includes(agentId) : false)
}

/**
 * Session preparation creates a durable, otherwise-empty conversation, so it
 * remains a separately gated optimization.  A shared runtime can therefore
 * be rolled out without creating containers merely because an Agent is
 * selected in the UI.
 */
export function isAiEntrySharedAgentPrewarmEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return readBoolean(env.SHARED_AGENT_PREWARM_ENABLED, false)
}

/**
 * OpenCode session preparation is a latency optimization for every session
 * capable chat, not only for shared Agents.  Keep the legacy shared-Agent
 * switch above for compatibility, but make the general switch explicit and
 * enabled by default when the session backend itself is enabled.
 */
export function isAiEntryOpenCodePrewarmEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return readBoolean(env.AI_ENTRY_OPENCODE_PREWARM_ENABLED, true)
}
