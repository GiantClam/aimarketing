import { getWriterSoulProfile, listWriterMemories } from "@/lib/writer/memory/repository"
import { rankWriterMemories } from "@/lib/writer/memory/retrieval"
import { composeWriterSoulCard, renderSoulCardForPrompt } from "@/lib/writer/memory/soul-card"
import type { WriterMemoryItem, WriterSoulProfile } from "@/lib/writer/memory/types"

const IMAGE_MEMORY_AGENT_TYPE = "image" as const

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

function buildMemoryContextLine(item: WriterMemoryItem) {
  const title = normalizeText(item.title)
  const content = normalizeText(item.content)
  const base = title ? `${title}: ${content}` : content
  return `- ${clipText(base, 180)}`
}

function buildImageMemoryContext(items: WriterMemoryItem[], maxChars = 900) {
  if (items.length === 0) return null
  const lines = ["Image memory hints:", ...items.map(buildMemoryContextLine)]
  return clipText(lines.join("\n"), maxChars)
}

export type ImageAssistantMemoryBridgeResult = {
  agentType: typeof IMAGE_MEMORY_AGENT_TYPE
  memoryContext: string | null
  soulCard: string | null
  memoryAppliedIds: number[]
}

type ImageAssistantMemoryBridgeDeps = {
  listMemories: typeof listWriterMemories
  getSoulProfile: typeof getWriterSoulProfile
}

const defaultBridgeDeps: ImageAssistantMemoryBridgeDeps = {
  listMemories: listWriterMemories,
  getSoulProfile: getWriterSoulProfile,
}

export async function resolveImageAssistantMemoryBridge(
  params: {
    userId: number
    prompt: string
    enabled?: boolean
    soulEnabled?: boolean
    maxItems?: number
    rankingLimit?: number
  },
  deps: ImageAssistantMemoryBridgeDeps = defaultBridgeDeps,
): Promise<ImageAssistantMemoryBridgeResult> {
  const memoryEnabled = params.enabled ?? parseBooleanEnv(process.env.WRITER_MEMORY_ENABLED, false)
  const soulEnabled = params.soulEnabled ?? parseBooleanEnv(process.env.WRITER_SOUL_ENABLED, false)
  if (!memoryEnabled) {
    return {
      agentType: IMAGE_MEMORY_AGENT_TYPE,
      memoryContext: null,
      soulCard: null,
      memoryAppliedIds: [],
    }
  }

  const maxItems =
    params.maxItems ?? parseIntegerEnv(process.env.WRITER_MEMORY_MAX_ITEMS_PER_USER_AGENT, 200, 1, 500)
  const rankingLimit = Math.max(1, Math.min(params.rankingLimit ?? 5, 10))

  const [profile, memoryItems] = await Promise.all([
    deps.getSoulProfile(params.userId, IMAGE_MEMORY_AGENT_TYPE).catch(() => null as WriterSoulProfile | null),
    deps
      .listMemories({
        userId: params.userId,
        agentType: IMAGE_MEMORY_AGENT_TYPE,
        limit: maxItems,
      })
      .catch(() => [] as WriterMemoryItem[]),
  ])

  const scopedItems = memoryItems.filter((item) => item.agentType === IMAGE_MEMORY_AGENT_TYPE && !item.isDeleted)
  const ranked = rankWriterMemories(params.prompt, scopedItems, {
    userId: params.userId,
    agentType: IMAGE_MEMORY_AGENT_TYPE,
    limit: rankingLimit,
  })
  const memoryContext = buildImageMemoryContext(ranked)
  const soulCard = soulEnabled
    ? renderSoulCardForPrompt(
        composeWriterSoulCard({
          agentType: IMAGE_MEMORY_AGENT_TYPE,
          profile,
          memories: ranked,
          recentAcceptedSamples: [],
        }),
        800,
      )
    : null

  return {
    agentType: IMAGE_MEMORY_AGENT_TYPE,
    memoryContext,
    soulCard,
    memoryAppliedIds: ranked.map((item) => item.id),
  }
}

export function renderImageMemoryInstructionBlock(input: {
  memoryContext?: string | null
  soulCard?: string | null
  maxChars?: number
}) {
  const sections = [normalizeText(input.soulCard), normalizeText(input.memoryContext)].filter(Boolean)
  if (!sections.length) return null
  const maxChars = Math.max(120, Math.min(input.maxChars ?? 1400, 3000))
  return clipText(sections.join("\n\n"), maxChars)
}

export function mergeImageAssistantExtraInstructions(input: {
  extraInstructions?: string | null
  memoryContext?: string | null
  soulCard?: string | null
}) {
  const base = normalizeText(input.extraInstructions)
  const memoryBlock = renderImageMemoryInstructionBlock({
    memoryContext: input.memoryContext,
    soulCard: input.soulCard,
  })

  if (!memoryBlock) return base || null
  if (!base) return memoryBlock
  return `${base}\n\n${memoryBlock}`
}
