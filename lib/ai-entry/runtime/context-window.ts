export const DEFAULT_RUNTIME_CONTEXT_BYTES = 80 * 1024
export const MAX_RUNTIME_CONTEXT_BYTES = 92 * 1024
export const DEFAULT_RUNTIME_RECENT_MESSAGES = 4
export const MAX_RUNTIME_TOOL_OUTPUT_CHARS = 2_000
export const MAX_RUNTIME_SUMMARY_CHARS = 12_000

export function contextByteLength(value: unknown) {
  return new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).byteLength
}

export function clipRuntimeContextText(value: string, maxChars: number) {
  const normalized = value.trim()
  if (normalized.length <= maxChars) return normalized
  const marker = "\n...[context clipped]...\n"
  const available = Math.max(0, maxChars - marker.length)
  const head = Math.ceil(available * 0.6)
  const tail = Math.max(0, available - head)
  return `${normalized.slice(0, head)}${marker}${normalized.slice(-tail)}`.slice(0, maxChars)
}

export function resolveRuntimeContextBytes(value: number | undefined, fallback = DEFAULT_RUNTIME_CONTEXT_BYTES) {
  const requested = Number.isFinite(value) && (value || 0) > 0 ? Math.floor(value as number) : fallback
  return Math.min(Math.max(requested, 1), MAX_RUNTIME_CONTEXT_BYTES)
}

export function buildRuntimeContextWindow<T extends { role: string; content: string }>(input: {
  currentMessage: T
  historicalMessages: T[]
  supplementalMessages?: T[]
  summaryMessage?: T | null
  maxBytes: number
  serialize: (messages: T[]) => number
}) {
  const supplementalMessages = input.supplementalMessages || []
  const selected = [...supplementalMessages, ...input.historicalMessages, ...(input.summaryMessage ? [input.summaryMessage] : [])]
  const fits = () => input.serialize([...selected, input.currentMessage]) <= input.maxBytes

  // Historical messages are the first lossy layer. Keep the current turn,
  // system rules, summary, and platform metadata until the hard boundary is hit.
  while (!fits()) {
    const index = selected.findIndex((message) => input.historicalMessages.includes(message))
    if (index < 0) break
    selected.splice(index, 1)
  }

  return { selected, fits }
}
