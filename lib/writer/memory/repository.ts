import { and, desc, eq, lt } from "drizzle-orm"

import { db } from "@/lib/db"
import { writerMemoryEvents, writerMemoryItems, writerSoulProfiles } from "@/lib/db/schema"
import { enforceWriterMemoryContentSafety, enforceWriterMemoryTitleSafety } from "@/lib/writer/memory/safety"
import { emitWriterMemoryTelemetry } from "@/lib/writer/memory/telemetry"
import {
  type SaveWriterMemoryInput,
  type WriterAgentType,
  type WriterMemoryEventType,
  type WriterMemoryItem,
  type WriterMemorySource,
  type WriterMemoryType,
  type WriterSoulProfile,
  type WriterSoulProfilePatch,
} from "@/lib/writer/memory/types"

const DEFAULT_LIST_LIMIT = 20
const MAX_LIST_LIMIT = 100
const DEFAULT_DEDUP_WINDOW_MS = 10 * 60 * 1000

type ListWriterMemoriesParams = {
  userId: number
  agentType: WriterAgentType
  type?: WriterMemoryType
  limit?: number
  cursor?: number | null
}

type AppendWriterMemoryEventInput = {
  userId: number
  agentType: WriterAgentType
  memoryItemId?: number | null
  eventType: WriterMemoryEventType
  payload?: Record<string, unknown> | null
}

type MemoryRow = typeof writerMemoryItems.$inferSelect
type SoulRow = typeof writerSoulProfiles.$inferSelect

type WriterMemoryRepositoryAdapter = {
  now: () => Date
  listMemoryItems: (params: ListWriterMemoriesParams) => Promise<WriterMemoryItem[]>
  getMemoryItemById: (params: { userId: number; agentType: WriterAgentType; memoryId: number }) => Promise<WriterMemoryItem | null>
  findRecentMemoryByScopeAndTitle: (params: {
    userId: number
    agentType: WriterAgentType
    type: WriterMemoryType
    title: string
  }) => Promise<WriterMemoryItem | null>
  insertMemoryItem: (input: Omit<WriterMemoryItem, "id">) => Promise<WriterMemoryItem>
  updateMemoryItem: (id: number, patch: Partial<WriterMemoryItem>) => Promise<WriterMemoryItem | null>
  softDeleteMemoryItem: (params: { userId: number; agentType: WriterAgentType; memoryId: number; now: Date }) => Promise<boolean>
  appendMemoryEvent: (input: AppendWriterMemoryEventInput & { createdAt: Date }) => Promise<void>
  getSoulProfile: (userId: number, agentType: WriterAgentType) => Promise<WriterSoulProfile | null>
  insertSoulProfile: (input: Omit<WriterSoulProfile, "id">) => Promise<WriterSoulProfile>
  updateSoulProfileById: (id: number, patch: Partial<WriterSoulProfile>) => Promise<WriterSoulProfile | null>
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/gu, " ")
}

function clampConfidence(value: number | null | undefined, fallback = 0.5) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(1, value))
}

function normalizeStringList(values: string[] | null | undefined, maxItems = 20) {
  if (!Array.isArray(values)) return []
  const unique = new Set<string>()
  for (const value of values) {
    const normalized = normalizeWhitespace(String(value || ""))
    if (!normalized) continue
    unique.add(normalized)
    if (unique.size >= maxItems) break
  }
  return [...unique]
}

function coerceArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || "").trim()).filter(Boolean)
}

function mapMemoryRow(row: MemoryRow): WriterMemoryItem {
  return {
    id: row.id,
    userId: row.userId,
    agentType: row.agentType as WriterAgentType,
    conversationId: row.conversationId ?? null,
    type: row.type as WriterMemoryType,
    title: row.title,
    content: row.content,
    confidence: clampConfidence(row.confidence),
    source: row.source as WriterMemorySource,
    dedupFingerprint: row.dedupFingerprint ?? null,
    isDeleted: Boolean(row.isDeleted),
    lastUsedAt: row.lastUsedAt ?? null,
    deletedAt: row.deletedAt ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

function mapSoulRow(row: SoulRow): WriterSoulProfile {
  return {
    id: row.id,
    userId: row.userId,
    agentType: row.agentType as WriterAgentType,
    tone: row.tone || "",
    sentenceStyle: row.sentenceStyle || "",
    tabooList: coerceArray(row.tabooList),
    lexicalHints: coerceArray(row.lexicalHints),
    confidence: clampConfidence(row.confidence),
    version: row.version || "v1",
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

function buildDedupFingerprint(type: WriterMemoryType, title: string) {
  return `${type}:${title.toLowerCase()}`
}

function createDbAdapter(): WriterMemoryRepositoryAdapter {
  return {
    now: () => new Date(),
    async listMemoryItems(params) {
      const limit = Math.max(1, Math.min(params.limit || DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT))
      const whereClause = and(
        eq(writerMemoryItems.userId, params.userId),
        eq(writerMemoryItems.agentType, params.agentType),
        params.type ? eq(writerMemoryItems.type, params.type) : undefined,
        eq(writerMemoryItems.isDeleted, false),
        params.cursor ? lt(writerMemoryItems.id, params.cursor) : undefined,
      )
      const rows = await db
        .select()
        .from(writerMemoryItems)
        .where(whereClause)
        .orderBy(desc(writerMemoryItems.updatedAt), desc(writerMemoryItems.id))
        .limit(limit)
      return rows.map(mapMemoryRow)
    },
    async getMemoryItemById(params) {
      const rows = await db
        .select()
        .from(writerMemoryItems)
        .where(
          and(
            eq(writerMemoryItems.id, params.memoryId),
            eq(writerMemoryItems.userId, params.userId),
            eq(writerMemoryItems.agentType, params.agentType),
          ),
        )
        .limit(1)
      return rows[0] ? mapMemoryRow(rows[0]) : null
    },
    async findRecentMemoryByScopeAndTitle(params) {
      const rows = await db
        .select()
        .from(writerMemoryItems)
        .where(
          and(
            eq(writerMemoryItems.userId, params.userId),
            eq(writerMemoryItems.agentType, params.agentType),
            eq(writerMemoryItems.type, params.type),
            eq(writerMemoryItems.title, params.title),
            eq(writerMemoryItems.isDeleted, false),
          ),
        )
        .orderBy(desc(writerMemoryItems.updatedAt), desc(writerMemoryItems.id))
        .limit(1)
      return rows[0] ? mapMemoryRow(rows[0]) : null
    },
    async insertMemoryItem(input) {
      const rows = await db
        .insert(writerMemoryItems)
        .values({
          userId: input.userId,
          agentType: input.agentType,
          conversationId: input.conversationId,
          type: input.type,
          title: input.title,
          content: input.content,
          confidence: input.confidence,
          source: input.source,
          dedupFingerprint: input.dedupFingerprint,
          isDeleted: input.isDeleted,
          lastUsedAt: input.lastUsedAt,
          deletedAt: input.deletedAt,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        })
        .returning()
      return mapMemoryRow(rows[0])
    },
    async updateMemoryItem(id, patch) {
      const rows = await db
        .update(writerMemoryItems)
        .set({
          ...(patch.title ? { title: patch.title } : {}),
          ...(patch.content ? { content: patch.content } : {}),
          ...(typeof patch.confidence === "number" ? { confidence: patch.confidence } : {}),
          ...(patch.source ? { source: patch.source } : {}),
          ...(patch.dedupFingerprint !== undefined ? { dedupFingerprint: patch.dedupFingerprint } : {}),
          ...(patch.isDeleted !== undefined ? { isDeleted: patch.isDeleted } : {}),
          ...(patch.lastUsedAt !== undefined ? { lastUsedAt: patch.lastUsedAt } : {}),
          ...(patch.deletedAt !== undefined ? { deletedAt: patch.deletedAt } : {}),
          ...(patch.updatedAt !== undefined ? { updatedAt: patch.updatedAt } : {}),
        })
        .where(eq(writerMemoryItems.id, id))
        .returning()
      return rows[0] ? mapMemoryRow(rows[0]) : null
    },
    async softDeleteMemoryItem(params) {
      const rows = await db
        .update(writerMemoryItems)
        .set({
          isDeleted: true,
          deletedAt: params.now,
          updatedAt: params.now,
        })
        .where(
          and(
            eq(writerMemoryItems.id, params.memoryId),
            eq(writerMemoryItems.userId, params.userId),
            eq(writerMemoryItems.agentType, params.agentType),
            eq(writerMemoryItems.isDeleted, false),
          ),
        )
        .returning({ id: writerMemoryItems.id })
      return rows.length > 0
    },
    async appendMemoryEvent(input) {
      await db.insert(writerMemoryEvents).values({
        userId: input.userId,
        agentType: input.agentType,
        memoryItemId: input.memoryItemId ?? null,
        eventType: input.eventType,
        payload: input.payload ?? null,
        createdAt: input.createdAt,
      })
    },
    async getSoulProfile(userId, agentType) {
      const rows = await db
        .select()
        .from(writerSoulProfiles)
        .where(and(eq(writerSoulProfiles.userId, userId), eq(writerSoulProfiles.agentType, agentType)))
        .limit(1)
      return rows[0] ? mapSoulRow(rows[0]) : null
    },
    async insertSoulProfile(input) {
      const rows = await db
        .insert(writerSoulProfiles)
        .values({
          userId: input.userId,
          agentType: input.agentType,
          tone: input.tone,
          sentenceStyle: input.sentenceStyle,
          tabooList: input.tabooList,
          lexicalHints: input.lexicalHints,
          confidence: input.confidence,
          version: input.version,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        })
        .returning()
      return mapSoulRow(rows[0])
    },
    async updateSoulProfileById(id, patch) {
      const rows = await db
        .update(writerSoulProfiles)
        .set({
          ...(patch.tone !== undefined ? { tone: patch.tone } : {}),
          ...(patch.sentenceStyle !== undefined ? { sentenceStyle: patch.sentenceStyle } : {}),
          ...(patch.tabooList !== undefined ? { tabooList: patch.tabooList } : {}),
          ...(patch.lexicalHints !== undefined ? { lexicalHints: patch.lexicalHints } : {}),
          ...(patch.confidence !== undefined ? { confidence: patch.confidence } : {}),
          ...(patch.version !== undefined ? { version: patch.version } : {}),
          ...(patch.updatedAt !== undefined ? { updatedAt: patch.updatedAt } : {}),
        })
        .where(eq(writerSoulProfiles.id, id))
        .returning()
      return rows[0] ? mapSoulRow(rows[0]) : null
    },
  }
}

export function createWriterMemoryRepository(adapter: WriterMemoryRepositoryAdapter = createDbAdapter()) {
  return {
    async getWriterSoulProfile(userId: number, agentType: WriterAgentType) {
      return adapter.getSoulProfile(userId, agentType)
    },
    async listWriterMemories(params: ListWriterMemoriesParams) {
      return adapter.listMemoryItems(params)
    },
    async getWriterMemoryItemById(params: { userId: number; agentType: WriterAgentType; memoryId: number }) {
      return adapter.getMemoryItemById(params)
    },
    async saveWriterMemoryItem(input: SaveWriterMemoryInput) {
      const title = enforceWriterMemoryTitleSafety(input.title)
      const content = enforceWriterMemoryContentSafety(input.content)

      const now = adapter.now()
      const dedupFingerprint = buildDedupFingerprint(input.type, title)
      const dedupWindowMs = Math.max(0, input.dedupWindowMs ?? DEFAULT_DEDUP_WINDOW_MS)
      const existing = await adapter.findRecentMemoryByScopeAndTitle({
        userId: input.userId,
        agentType: input.agentType,
        type: input.type,
        title,
      })

      if (existing && existing.updatedAt) {
        const ageMs = now.getTime() - existing.updatedAt.getTime()
        if (ageMs <= dedupWindowMs) {
          const incomingIsExplicit = input.source === "explicit_user"
          const existingIsExplicit = existing.source === "explicit_user"

          if (existingIsExplicit && !incomingIsExplicit) {
            return existing
          }

          const updated = await adapter.updateMemoryItem(existing.id, {
            content,
            confidence: clampConfidence(input.confidence, existing.confidence),
            source: input.source,
            dedupFingerprint,
            updatedAt: now,
          })

          if (!updated) {
            throw new Error("writer_memory_upsert_update_failed")
          }

          await adapter.appendMemoryEvent({
            userId: input.userId,
            agentType: input.agentType,
            memoryItemId: updated.id,
            eventType: "memory_upsert",
            payload: { mode: "update", source: input.source },
            createdAt: now,
          })
          emitWriterMemoryTelemetry(
            input.source === "explicit_user" ? "writer.memory.write.explicit" : "writer.memory.write.implicit",
            {
              agentType: input.agentType,
              source: input.source,
            },
          )
          return updated
        }
      }

      const created = await adapter.insertMemoryItem({
        userId: input.userId,
        agentType: input.agentType,
        conversationId: input.conversationId ?? null,
        type: input.type,
        title,
        content,
        confidence: clampConfidence(input.confidence),
        source: input.source,
        dedupFingerprint,
        isDeleted: false,
        lastUsedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      })

      await adapter.appendMemoryEvent({
        userId: input.userId,
        agentType: input.agentType,
        memoryItemId: created.id,
        eventType: "memory_upsert",
        payload: { mode: "insert", source: input.source },
        createdAt: now,
      })
      emitWriterMemoryTelemetry(
        input.source === "explicit_user" ? "writer.memory.write.explicit" : "writer.memory.write.implicit",
        {
          agentType: input.agentType,
          source: input.source,
        },
      )

      return created
    },
    async softDeleteWriterMemoryItem(params: { userId: number; agentType: WriterAgentType; memoryId: number }) {
      const now = adapter.now()
      const deleted = await adapter.softDeleteMemoryItem({ ...params, now })
      if (deleted) {
        await adapter.appendMemoryEvent({
          userId: params.userId,
          agentType: params.agentType,
          memoryItemId: params.memoryId,
          eventType: "memory_delete",
          createdAt: now,
          payload: { deleted: true },
        })
        emitWriterMemoryTelemetry("writer.memory.delete", {
          agentType: params.agentType,
        })
      }
      return deleted
    },
    async updateWriterMemoryItem(
      params: { userId: number; agentType: WriterAgentType; memoryId: number },
      patch: Partial<Pick<WriterMemoryItem, "type" | "title" | "content" | "confidence" | "source">>,
    ) {
      const existing = await adapter.getMemoryItemById(params)
      if (!existing || existing.isDeleted) return null

      const now = adapter.now()
      const nextType = patch.type ?? existing.type
      const nextTitle = patch.title !== undefined ? enforceWriterMemoryTitleSafety(patch.title) : existing.title
      const nextContent = patch.content !== undefined ? enforceWriterMemoryContentSafety(patch.content) : existing.content

      const updated = await adapter.updateMemoryItem(existing.id, {
        type: nextType,
        title: nextTitle,
        content: nextContent,
        confidence: patch.confidence !== undefined ? clampConfidence(patch.confidence, existing.confidence) : existing.confidence,
        source: patch.source ?? existing.source,
        dedupFingerprint: buildDedupFingerprint(nextType, nextTitle),
        updatedAt: now,
      })
      if (!updated) return null

      await adapter.appendMemoryEvent({
        userId: params.userId,
        agentType: params.agentType,
        memoryItemId: updated.id,
        eventType: "memory_upsert",
        payload: { mode: "patch" },
        createdAt: now,
      })
      emitWriterMemoryTelemetry("writer.memory.write.explicit", {
        agentType: params.agentType,
        source: patch.source || existing.source,
      })

      return updated
    },
    async appendWriterMemoryEvent(input: AppendWriterMemoryEventInput) {
      await adapter.appendMemoryEvent({ ...input, createdAt: adapter.now() })
    },
    async updateWriterSoulProfile(userId: number, agentType: WriterAgentType, patch: WriterSoulProfilePatch) {
      const now = adapter.now()
      const existing = await adapter.getSoulProfile(userId, agentType)
      const normalizedPatch: WriterSoulProfilePatch = {
        ...(patch.tone !== undefined ? { tone: normalizeWhitespace(patch.tone || "") } : {}),
        ...(patch.sentenceStyle !== undefined ? { sentenceStyle: normalizeWhitespace(patch.sentenceStyle || "") } : {}),
        ...(patch.tabooList !== undefined ? { tabooList: normalizeStringList(patch.tabooList, 12) } : {}),
        ...(patch.lexicalHints !== undefined ? { lexicalHints: normalizeStringList(patch.lexicalHints, 20) } : {}),
        ...(patch.version !== undefined ? { version: normalizeWhitespace(patch.version || "") || "v1" } : {}),
        ...(patch.confidence !== undefined ? { confidence: clampConfidence(patch.confidence) } : {}),
      }

      let profile: WriterSoulProfile
      if (!existing) {
        profile = await adapter.insertSoulProfile({
          userId,
          agentType,
          tone: normalizedPatch.tone || "",
          sentenceStyle: normalizedPatch.sentenceStyle || "",
          tabooList: normalizedPatch.tabooList || [],
          lexicalHints: normalizedPatch.lexicalHints || [],
          confidence: normalizedPatch.confidence ?? 0.5,
          version: normalizedPatch.version || "v1",
          createdAt: now,
          updatedAt: now,
        })
      } else {
        const updated = await adapter.updateSoulProfileById(existing.id, {
          ...normalizedPatch,
          updatedAt: now,
        })
        if (!updated) {
          throw new Error("writer_soul_profile_update_failed")
        }
        profile = updated
      }

      await adapter.appendMemoryEvent({
        userId,
        agentType,
        memoryItemId: null,
        eventType: "soul_profile_upsert",
        payload: { version: profile.version, confidence: profile.confidence },
        createdAt: now,
      })

      return profile
    },
  }
}

export function createInMemoryWriterMemoryRepository(seed?: {
  memoryItems?: WriterMemoryItem[]
  soulProfiles?: WriterSoulProfile[]
}) {
  let memoryItemId = Math.max(0, ...(seed?.memoryItems || []).map((item) => item.id)) + 1
  let soulProfileId = Math.max(0, ...(seed?.soulProfiles || []).map((item) => item.id)) + 1
  const memoryItems = [...(seed?.memoryItems || [])]
  const soulProfiles = [...(seed?.soulProfiles || [])]
  const events: Array<AppendWriterMemoryEventInput & { createdAt: Date }> = []

  const adapter: WriterMemoryRepositoryAdapter = {
    now: () => new Date(),
    async listMemoryItems(params) {
      const limit = Math.max(1, Math.min(params.limit || DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT))
      return memoryItems
        .filter((item) =>
          item.userId === params.userId &&
          item.agentType === params.agentType &&
          item.isDeleted === false &&
          (params.cursor ? item.id < params.cursor : true) &&
          (params.type ? item.type === params.type : true)
        )
        .sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0))
        .slice(0, limit)
    },
    async getMemoryItemById(params) {
      return (
        memoryItems.find((item) =>
          item.id === params.memoryId &&
          item.userId === params.userId &&
          item.agentType === params.agentType
        ) || null
      )
    },
    async findRecentMemoryByScopeAndTitle(params) {
      const rows = memoryItems
        .filter((item) =>
          item.userId === params.userId &&
          item.agentType === params.agentType &&
          item.type === params.type &&
          item.title === params.title &&
          item.isDeleted === false
        )
        .sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0))
      return rows[0] || null
    },
    async insertMemoryItem(input) {
      const item: WriterMemoryItem = { id: memoryItemId++, ...input }
      memoryItems.push(item)
      return item
    },
    async updateMemoryItem(id, patch) {
      const index = memoryItems.findIndex((item) => item.id === id)
      if (index < 0) return null
      memoryItems[index] = { ...memoryItems[index], ...patch }
      return memoryItems[index]
    },
    async softDeleteMemoryItem(params) {
      const item = memoryItems.find((candidate) =>
        candidate.id === params.memoryId &&
        candidate.userId === params.userId &&
        candidate.agentType === params.agentType &&
        candidate.isDeleted === false
      )
      if (!item) return false
      item.isDeleted = true
      item.deletedAt = params.now
      item.updatedAt = params.now
      return true
    },
    async appendMemoryEvent(input) {
      events.push(input)
    },
    async getSoulProfile(userId, agentType) {
      return soulProfiles.find((profile) => profile.userId === userId && profile.agentType === agentType) || null
    },
    async insertSoulProfile(input) {
      const profile: WriterSoulProfile = { id: soulProfileId++, ...input }
      soulProfiles.push(profile)
      return profile
    },
    async updateSoulProfileById(id, patch) {
      const index = soulProfiles.findIndex((profile) => profile.id === id)
      if (index < 0) return null
      soulProfiles[index] = { ...soulProfiles[index], ...patch }
      return soulProfiles[index]
    },
  }

  const repository = createWriterMemoryRepository(adapter)

  return {
    ...repository,
    __store: {
      memoryItems,
      soulProfiles,
      events,
    },
  }
}

const writerMemoryRepository = createWriterMemoryRepository()

export async function getWriterSoulProfile(userId: number, agentType: WriterAgentType) {
  return writerMemoryRepository.getWriterSoulProfile(userId, agentType)
}

export async function listWriterMemories(params: ListWriterMemoriesParams) {
  return writerMemoryRepository.listWriterMemories(params)
}

export async function getWriterMemoryItemById(params: { userId: number; agentType: WriterAgentType; memoryId: number }) {
  return writerMemoryRepository.getWriterMemoryItemById(params)
}

export async function saveWriterMemoryItem(input: SaveWriterMemoryInput) {
  return writerMemoryRepository.saveWriterMemoryItem(input)
}

export async function updateWriterMemoryItem(
  params: { userId: number; agentType: WriterAgentType; memoryId: number },
  patch: Partial<Pick<WriterMemoryItem, "type" | "title" | "content" | "confidence" | "source">>,
) {
  return writerMemoryRepository.updateWriterMemoryItem(params, patch)
}

export async function softDeleteWriterMemoryItem(params: { userId: number; agentType: WriterAgentType; memoryId: number }) {
  return writerMemoryRepository.softDeleteWriterMemoryItem(params)
}

export async function appendWriterMemoryEvent(input: AppendWriterMemoryEventInput) {
  return writerMemoryRepository.appendWriterMemoryEvent(input)
}

export async function updateWriterSoulProfile(
  userId: number,
  agentType: WriterAgentType,
  patch: WriterSoulProfilePatch,
) {
  return writerMemoryRepository.updateWriterSoulProfile(userId, agentType, patch)
}
