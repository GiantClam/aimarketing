const SESSION_KEY_PATTERN = /^sess-[0-9a-f]{40}$/

function encodeHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function isAgentRuntimeSessionKey(value: string) {
  return SESSION_KEY_PATTERN.test(value)
}

export async function buildAgentRuntimeSessionKey(input: {
  enterpriseId: number | null
  userId: number
  conversationId: string | null
  agentId: string | null
}) {
  const raw = [
    "v2",
    input.enterpriseId ?? "personal",
    input.userId,
    input.conversationId ?? "new",
    input.agentId ?? "general",
  ].join(":")
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))
  return `sess-${encodeHex(new Uint8Array(digest)).slice(0, 40)}`
}
