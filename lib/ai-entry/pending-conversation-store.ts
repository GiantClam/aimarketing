type PendingConversationEnvelope<T> = {
  savedAt: number
  messages: T[]
}

export const AI_ENTRY_PENDING_CONVERSATION_MAX_AGE_MS = 2 * 60 * 1000

function isValidSavedAt(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

export function buildPendingConversationEnvelope<T>(
  messages: T[],
  options?: { now?: number },
): PendingConversationEnvelope<T> {
  return {
    savedAt: options?.now ?? Date.now(),
    messages: Array.isArray(messages) ? messages : [],
  }
}

export function readFreshPendingConversationMessages<T>(
  value: unknown,
  options?: {
    now?: number
    maxAgeMs?: number
  },
) {
  const now = options?.now ?? Date.now()
  const maxAgeMs = options?.maxAgeMs ?? AI_ENTRY_PENDING_CONVERSATION_MAX_AGE_MS

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return []
  }

  const envelope = value as {
    savedAt?: unknown
    messages?: unknown
  }

  if (!isValidSavedAt(envelope.savedAt) || !Array.isArray(envelope.messages)) {
    return []
  }

  const savedAt = envelope.savedAt as number
  const ageMs = now - savedAt
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeMs) {
    return []
  }

  return envelope.messages as T[]
}
