import {
  type WriterAgentType,
  type WriterMemoryItem,
  type WriterMemoryType,
} from "@/lib/writer/memory/types"

type WriterTypeWeights = Record<WriterMemoryType, number>

export type RankedWriterMemory = WriterMemoryItem & {
  score: number
}

const DEFAULT_TYPE_WEIGHTS: WriterTypeWeights = {
  feedback: 1,
  user: 0.85,
  project: 0.7,
  reference: 0.55,
}

function tokenize(input: string) {
  const normalized = String(input || "").toLowerCase().trim()
  if (!normalized) return [] as string[]
  const latinTokens = normalized.split(/[^a-z0-9]+/u).filter(Boolean)
  const cjkTokens = normalized.match(/[\p{Script=Han}]{1,2}/gu) || []
  return [...new Set([...latinTokens, ...cjkTokens])]
}

function tokenOverlapScore(queryTokens: string[], memoryTokens: string[]) {
  if (queryTokens.length === 0 || memoryTokens.length === 0) return 0
  const set = new Set(memoryTokens)
  const matched = queryTokens.filter((token) => set.has(token)).length
  return matched / queryTokens.length
}

function recencyScore(updatedAt: Date | null, now: Date) {
  if (!updatedAt) return 0.3
  const ageMs = Math.max(0, now.getTime() - updatedAt.getTime())
  const ageDays = ageMs / (1000 * 60 * 60 * 24)
  return Math.exp(-ageDays / 30)
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function scoreMemory(
  queryTokens: string[],
  memory: WriterMemoryItem,
  now: Date,
  typeWeights: WriterTypeWeights,
) {
  const memoryTokens = tokenize(`${memory.title}\n${memory.content}`)
  const overlap = tokenOverlapScore(queryTokens, memoryTokens)
  const recency = recencyScore(memory.updatedAt, now)
  const confidence = clamp(memory.confidence)
  const typeWeight = typeWeights[memory.type] ?? 0.5

  // Weighted blend: relevance first, then recency/confidence/type.
  return overlap * 0.45 + recency * 0.2 + confidence * 0.2 + typeWeight * 0.15
}

function dedupeBySemanticKey(items: RankedWriterMemory[]) {
  const seen = new Set<string>()
  const deduped: RankedWriterMemory[] = []
  for (const item of items) {
    const key = `${item.agentType}|${item.type}|${item.title.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }
  return deduped
}

export function rankWriterMemories(
  query: string,
  items: WriterMemoryItem[],
  options?: {
    userId?: number
    agentType?: WriterAgentType
    limit?: number
    now?: Date
    typeWeights?: Partial<WriterTypeWeights>
  },
) {
  const now = options?.now || new Date()
  const limit = Math.max(1, Math.min(options?.limit || 5, 20))
  const weights = {
    ...DEFAULT_TYPE_WEIGHTS,
    ...(options?.typeWeights || {}),
  }
  const queryTokens = tokenize(query)

  const filtered = items.filter((item) =>
    !item.isDeleted &&
    (options?.userId ? item.userId === options.userId : true) &&
    (options?.agentType ? item.agentType === options.agentType : true)
  )

  const ranked = filtered
    .map((item) => ({
      ...item,
      score: scoreMemory(queryTokens, item, now, weights),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0)
    })

  return dedupeBySemanticKey(ranked).slice(0, limit)
}

export function selectWriterMemoryTopK(
  query: string,
  items: WriterMemoryItem[],
  options?: Parameters<typeof rankWriterMemories>[2],
) {
  return rankWriterMemories(query, items, options).map((item) => item as WriterMemoryItem)
}

