const CUSTOM_AGENT_RUNTIME_PREFIX = "custom-agent:"

export function buildCustomAgentRuntimeId(agentId: number) {
  return `${CUSTOM_AGENT_RUNTIME_PREFIX}${agentId}`
}

export function parseCustomAgentRuntimeId(value: string | null | undefined) {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  if (!normalized.startsWith(CUSTOM_AGENT_RUNTIME_PREFIX)) return null
  const numeric = Number(normalized.slice(CUSTOM_AGENT_RUNTIME_PREFIX.length))
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

export function isCustomAgentRuntimeId(value: string | null | undefined): value is string {
  return parseCustomAgentRuntimeId(value) !== null
}
