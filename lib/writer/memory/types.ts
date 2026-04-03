const WRITER_MEMORY_TYPES = ["user", "feedback", "project", "reference"] as const
const WRITER_MEMORY_SOURCES = ["explicit_user", "implicit_extraction", "manual_edit"] as const
const WRITER_AGENT_TYPES = [
  "writer",
  "image",
  "brand-strategy",
  "growth",
  "company-search",
  "contact-mining",
] as const

export type WriterMemoryType = (typeof WRITER_MEMORY_TYPES)[number]
export type WriterMemorySource = (typeof WRITER_MEMORY_SOURCES)[number]
export type WriterAgentType = (typeof WRITER_AGENT_TYPES)[number]

export type WriterSoulCard = {
  agentType: WriterAgentType
  tone: string
  sentenceStyle: string
  tabooList: string[]
  lexicalHints: string[]
  confidence: number
  generatedAt: number
}

export type WriterSoulProfile = {
  id: number
  userId: number
  agentType: WriterAgentType
  tone: string
  sentenceStyle: string
  tabooList: string[]
  lexicalHints: string[]
  confidence: number
  version: string
  createdAt: Date | null
  updatedAt: Date | null
}

export type WriterMemoryItem = {
  id: number
  userId: number
  agentType: WriterAgentType
  conversationId: number | null
  type: WriterMemoryType
  title: string
  content: string
  confidence: number
  source: WriterMemorySource
  dedupFingerprint: string | null
  isDeleted: boolean
  lastUsedAt: Date | null
  deletedAt: Date | null
  createdAt: Date | null
  updatedAt: Date | null
}

export type WriterMemoryEventType =
  | "memory_upsert"
  | "memory_delete"
  | "soul_profile_upsert"
  | "soul_profile_delete"

export type SaveWriterMemoryInput = {
  userId: number
  agentType: WriterAgentType
  conversationId?: number | null
  type: WriterMemoryType
  title: string
  content: string
  confidence?: number | null
  source: WriterMemorySource
  dedupWindowMs?: number
}

export type WriterSoulProfilePatch = Partial<Pick<WriterSoulProfile, "tone" | "sentenceStyle" | "tabooList" | "lexicalHints" | "confidence" | "version">>

export type WriterAcceptedSample = {
  id: string
  content: string
  acceptedAt: number
}

export function parseMemoryType(raw: string | null | undefined): WriterMemoryType | null {
  if (!raw) return null
  const normalized = raw.trim() as WriterMemoryType
  return WRITER_MEMORY_TYPES.includes(normalized) ? normalized : null
}

export function parseMemorySource(raw: string | null | undefined): WriterMemorySource | null {
  if (!raw) return null
  const normalized = raw.trim() as WriterMemorySource
  return WRITER_MEMORY_SOURCES.includes(normalized) ? normalized : null
}

export function parseWriterAgentType(raw: string | null | undefined): WriterAgentType | null {
  if (!raw) return null
  const normalized = raw.trim() as WriterAgentType
  return WRITER_AGENT_TYPES.includes(normalized) ? normalized : null
}

function clampConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5
  return Math.max(0, Math.min(1, value))
}

function normalizeStringList(values: string[] | null | undefined, maxItems: number) {
  if (!Array.isArray(values)) return []
  const unique = new Set<string>()
  for (const value of values) {
    const normalized = String(value || "").trim()
    if (!normalized) continue
    unique.add(normalized)
    if (unique.size >= maxItems) break
  }
  return [...unique]
}

export function buildSoulCardInput(input: {
  agentType: WriterAgentType
  tone?: string | null
  sentenceStyle?: string | null
  tabooList?: string[] | null
  lexicalHints?: string[] | null
  confidence?: number | null
  generatedAt?: number | null
}): WriterSoulCard {
  const now = Date.now()
  const generatedAt = typeof input.generatedAt === "number" && Number.isFinite(input.generatedAt)
    ? Math.max(0, Math.floor(input.generatedAt))
    : now

  return {
    agentType: input.agentType,
    tone: String(input.tone || "").trim() || "adaptive",
    sentenceStyle: String(input.sentenceStyle || "").trim() || "clear and concise",
    tabooList: normalizeStringList(input.tabooList, 12),
    lexicalHints: normalizeStringList(input.lexicalHints, 20),
    confidence: clampConfidence(input.confidence),
    generatedAt,
  }
}

export const writerMemoryAllowlist = {
  agentTypes: WRITER_AGENT_TYPES,
  memoryTypes: WRITER_MEMORY_TYPES,
  memorySources: WRITER_MEMORY_SOURCES,
} as const
