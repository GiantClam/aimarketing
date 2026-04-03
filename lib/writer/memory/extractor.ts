import { saveWriterMemoryItem } from "@/lib/writer/memory/repository"
import type { WriterAgentType, WriterMemoryType } from "@/lib/writer/memory/types"

const WRITER_MEMORY_EXTRACT_ENABLED = process.env.WRITER_MEMORY_EXTRACT_ENABLED === "true"

const PREFERENCE_SIGNAL_PATTERN =
  /(?:记住|不要再|保持|以后都|固定用|always|remember|do not|don't|keep|avoid)/iu

function normalizeText(value: string) {
  return value.trim().replace(/\s+/gu, " ")
}

function clipText(value: string, maxChars: number) {
  const normalized = normalizeText(value)
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars - 3)}...`
}

export function shouldExtractWriterImplicitMemory(input: {
  enabled?: boolean
  outcome: "needs_clarification" | "draft_ready"
  explicitWritePerformed?: boolean
}) {
  const enabled = input.enabled ?? WRITER_MEMORY_EXTRACT_ENABLED
  if (!enabled) return false
  if (input.outcome !== "draft_ready") return false
  if (input.explicitWritePerformed) return false
  return true
}

export function detectWriterPreferenceSignal(query: string) {
  return PREFERENCE_SIGNAL_PATTERN.test(query)
}

export function deriveWriterImplicitMemoryItems(input: {
  query: string
  answer: string
  userId: number
  agentType: WriterAgentType
  conversationId?: number | null
  outcome: "needs_clarification" | "draft_ready"
  explicitWritePerformed?: boolean
  enabled?: boolean
}) {
  if (!shouldExtractWriterImplicitMemory({
    enabled: input.enabled,
    outcome: input.outcome,
    explicitWritePerformed: input.explicitWritePerformed,
  })) {
    return []
  }

  const query = normalizeText(input.query)
  if (!query) return []

  const hasPreferenceSignal = detectWriterPreferenceSignal(query)
  if (!hasPreferenceSignal) {
    return []
  }

  const type: WriterMemoryType = "feedback"
  return [
    {
      userId: input.userId,
      agentType: input.agentType,
      conversationId: input.conversationId ?? null,
      type,
      title: "Implicit preference from writing turn",
      content: clipText(query, 220),
      source: "implicit_extraction" as const,
      confidence: 0.62,
    },
  ]
}

export async function persistWriterImplicitMemoryFromTurn(
  input: Parameters<typeof deriveWriterImplicitMemoryItems>[0],
  saveFn: (item: (ReturnType<typeof deriveWriterImplicitMemoryItems>)[number]) => Promise<unknown> = saveWriterMemoryItem,
) {
  const candidates = deriveWriterImplicitMemoryItems(input)
  if (candidates.length === 0) {
    return {
      persisted: 0,
      skipped: true,
    }
  }

  for (const candidate of candidates) {
    await saveFn(candidate)
  }

  return {
    persisted: candidates.length,
    skipped: false,
  }
}
