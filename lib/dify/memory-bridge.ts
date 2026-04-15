import { normalizeLeadHunterAdvisorType } from "@/lib/lead-hunter/types"
import { getWriterSoulProfile, listWriterMemories } from "@/lib/writer/memory/repository"
import { rankWriterMemories } from "@/lib/writer/memory/retrieval"
import { composeWriterSoulCard, renderSoulCardForPrompt } from "@/lib/writer/memory/soul-card"
import type { WriterAgentType, WriterMemoryItem, WriterSoulProfile } from "@/lib/writer/memory/types"

function parseBooleanEnv(raw: string | undefined, fallback = false) {
  if (typeof raw !== "string") return fallback
  return raw.trim().toLowerCase() === "true"
}

function parseIntegerEnv(raw: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(raw || "", 10)
  const value = Number.isFinite(parsed) ? parsed : fallback
  return Math.max(min, Math.min(max, value))
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function clipText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`
}

function buildDifyMemoryContext(items: WriterMemoryItem[], maxChars = 1000) {
  if (!items.length) return null
  const lines = [
    "Agent memory context:",
    ...items.map((item) => {
      const title = normalizeText(item.title)
      const content = normalizeText(item.content)
      return `- ${clipText(title ? `${title}: ${content}` : content, 180)}`
    }),
  ]
  return clipText(lines.join("\n"), maxChars)
}

export function mapAdvisorTypeToWriterAgentType(advisorType: string | null | undefined): WriterAgentType | null {
  const normalizedLeadHunterType = normalizeLeadHunterAdvisorType(advisorType)
  if (normalizedLeadHunterType) {
    if (normalizedLeadHunterType === "lead-hunter") {
      // Reuse company-search memory lane for the lead-hunter profile entry.
      return "company-search"
    }
    return normalizedLeadHunterType
  }
  if (advisorType === "brand-strategy" || advisorType === "growth") {
    return advisorType
  }
  return null
}

export type DifyMemoryBridgeResult = {
  agentType: WriterAgentType | null
  memoryContext: string | null
  soulCard: string | null
  memoryAppliedIds: number[]
}

type DifyMemoryBridgeDeps = {
  listMemories: typeof listWriterMemories
  getSoulProfile: typeof getWriterSoulProfile
}

const defaultDeps: DifyMemoryBridgeDeps = {
  listMemories: listWriterMemories,
  getSoulProfile: getWriterSoulProfile,
}

export async function buildDifyMemoryBridge(
  params: {
    userId: number
    advisorType: string
    query: string
    enabled?: boolean
    soulEnabled?: boolean
    maxItems?: number
    rankingLimit?: number
  },
  deps: DifyMemoryBridgeDeps = defaultDeps,
): Promise<DifyMemoryBridgeResult> {
  const agentType = mapAdvisorTypeToWriterAgentType(params.advisorType)
  const memoryEnabled = params.enabled ?? parseBooleanEnv(process.env.WRITER_MEMORY_ENABLED, false)
  const soulEnabled = params.soulEnabled ?? parseBooleanEnv(process.env.WRITER_SOUL_ENABLED, false)

  if (!agentType || !memoryEnabled) {
    return {
      agentType,
      memoryContext: null,
      soulCard: null,
      memoryAppliedIds: [],
    }
  }

  const maxItems =
    params.maxItems ?? parseIntegerEnv(process.env.WRITER_MEMORY_MAX_ITEMS_PER_USER_AGENT, 200, 1, 500)
  const rankingLimit = Math.max(1, Math.min(params.rankingLimit ?? 5, 10))

  const [profile, memoryItems] = await Promise.all([
    deps.getSoulProfile(params.userId, agentType).catch(() => null as WriterSoulProfile | null),
    deps
      .listMemories({
        userId: params.userId,
        agentType,
        limit: maxItems,
      })
      .catch(() => [] as WriterMemoryItem[]),
  ])

  const scopedItems = memoryItems.filter((item) => item.agentType === agentType && !item.isDeleted)
  const ranked = rankWriterMemories(params.query, scopedItems, {
    userId: params.userId,
    agentType,
    limit: rankingLimit,
  })
  const memoryContext = buildDifyMemoryContext(ranked)
  const soulCard = soulEnabled
    ? renderSoulCardForPrompt(
        composeWriterSoulCard({
          agentType,
          profile,
          memories: ranked,
          recentAcceptedSamples: [],
        }),
        900,
      )
    : null

  return {
    agentType,
    memoryContext,
    soulCard,
    memoryAppliedIds: ranked.map((item) => item.id),
  }
}

export function toDifyMemoryInputs(bridge: DifyMemoryBridgeResult) {
  return {
    ...(bridge.memoryContext ? { memory_context: bridge.memoryContext } : {}),
    ...(bridge.soulCard ? { soul_card: bridge.soulCard } : {}),
    ...(bridge.memoryAppliedIds.length ? { memory_applied_ids: bridge.memoryAppliedIds.join(",") } : {}),
    ...(bridge.agentType ? { memory_agent_type: bridge.agentType } : {}),
  } satisfies Record<string, unknown>
}

export function mergeDifyInputsWithMemoryBridge(
  baseInputs: Record<string, unknown> | null | undefined,
  bridge: DifyMemoryBridgeResult,
) {
  const memoryInputs = toDifyMemoryInputs(bridge)
  const normalizedBaseInputs = (baseInputs || {}) as Record<string, unknown>
  if (!Object.keys(memoryInputs).length) {
    return { ...normalizedBaseInputs }
  }
  return {
    ...normalizedBaseInputs,
    ...memoryInputs,
  } as Record<string, unknown>
}
