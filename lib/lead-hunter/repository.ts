import { and, desc, eq, lt, or } from "drizzle-orm"

import { db } from "@/lib/db"
import { leadHunterConversations, leadHunterMessages } from "@/lib/db/schema"

const DEFAULT_CONVERSATION_TITLE = "海外猎客搜索"

function parsePositiveInt(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }
  return Math.floor(parsed)
}

function toEpochSeconds(value: Date | string | number | null | undefined) {
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000)
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return Math.floor(parsed.getTime() / 1000)
    }
  }

  return Math.floor(Date.now() / 1000)
}

function buildConversationTitle(query: string) {
  const normalized = query.replace(/\s+/g, " ").trim()
  if (!normalized) return DEFAULT_CONVERSATION_TITLE
  return normalized.slice(0, 80)
}

export async function getLeadHunterConversation(userId: number, conversationId: string | number | null | undefined) {
  const parsedConversationId = parsePositiveInt(conversationId)
  if (!parsedConversationId) {
    return null
  }

  const rows = await db
    .select()
    .from(leadHunterConversations)
    .where(and(eq(leadHunterConversations.id, parsedConversationId), eq(leadHunterConversations.userId, userId)))
    .limit(1)

  return rows[0] || null
}

export async function createLeadHunterConversation(userId: number, query: string) {
  const [row] = await db
    .insert(leadHunterConversations)
    .values({
      userId,
      title: buildConversationTitle(query),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning()

  return row
}

export async function renameLeadHunterConversation(userId: number, conversationId: string, name: string) {
  const conversation = await getLeadHunterConversation(userId, conversationId)
  if (!conversation) {
    return null
  }

  await db
    .update(leadHunterConversations)
    .set({
      title: name.trim() || conversation.title,
      updatedAt: new Date(),
    })
    .where(eq(leadHunterConversations.id, conversation.id))

  return getLeadHunterConversation(userId, conversation.id)
}

export async function deleteLeadHunterConversation(userId: number, conversationId: string) {
  const conversation = await getLeadHunterConversation(userId, conversationId)
  if (!conversation) {
    return false
  }

  await db.delete(leadHunterMessages).where(eq(leadHunterMessages.conversationId, conversation.id))
  await db.delete(leadHunterConversations).where(eq(leadHunterConversations.id, conversation.id))
  return true
}

export async function listLeadHunterConversations(userId: number, lastId?: string | null, limit = 20) {
  const cappedLimit = Math.max(1, Math.min(limit, 50))
  const cursorConversation = lastId ? await getLeadHunterConversation(userId, lastId) : null

  const rows = await db
    .select({
      id: leadHunterConversations.id,
      title: leadHunterConversations.title,
      createdAt: leadHunterConversations.createdAt,
      updatedAt: leadHunterConversations.updatedAt,
    })
    .from(leadHunterConversations)
    .where(
      cursorConversation
        ? and(
            eq(leadHunterConversations.userId, userId),
            or(
              lt(leadHunterConversations.updatedAt, cursorConversation.updatedAt ?? new Date()),
              and(
                eq(leadHunterConversations.updatedAt, cursorConversation.updatedAt ?? new Date()),
                lt(leadHunterConversations.id, cursorConversation.id),
              ),
            ),
          )
        : eq(leadHunterConversations.userId, userId),
    )
    .orderBy(desc(leadHunterConversations.updatedAt), desc(leadHunterConversations.id))
    .limit(cappedLimit + 1)

  const hasMore = rows.length > cappedLimit
  const pageRows = hasMore ? rows.slice(0, cappedLimit) : rows

  return {
    data: pageRows.map((row) => ({
      id: String(row.id),
      name: row.title,
      status: "normal",
      created_at: toEpochSeconds(row.createdAt),
    })),
    has_more: hasMore,
    limit: cappedLimit,
  }
}

export async function listLeadHunterMessages(userId: number, conversationId: string, firstId?: string | null, limit = 20) {
  const conversation = await getLeadHunterConversation(userId, conversationId)
  if (!conversation) {
    return null
  }

  const cappedLimit = Math.max(1, Math.min(limit, 50))
  const firstMessageId = parsePositiveInt(firstId)

  const rows = await db
    .select({
      id: leadHunterMessages.id,
      conversationId: leadHunterMessages.conversationId,
      query: leadHunterMessages.query,
      answer: leadHunterMessages.answer,
      createdAt: leadHunterMessages.createdAt,
    })
    .from(leadHunterMessages)
    .where(
      firstMessageId
        ? and(eq(leadHunterMessages.conversationId, conversation.id), lt(leadHunterMessages.id, firstMessageId))
        : eq(leadHunterMessages.conversationId, conversation.id),
    )
    .orderBy(desc(leadHunterMessages.id))
    .limit(cappedLimit + 1)

  const hasMore = rows.length > cappedLimit
  const pageRows = hasMore ? rows.slice(0, cappedLimit) : rows

  return {
    data: pageRows.map((row) => ({
      id: String(row.id),
      conversation_id: String(row.conversationId),
      query: row.query,
      answer: row.answer,
      created_at: toEpochSeconds(row.createdAt),
    })),
    has_more: hasMore,
    limit: cappedLimit,
    first_id: firstId || null,
  }
}

export async function appendLeadHunterMessage(userId: number, conversationId: string, query: string, answer: string) {
  const conversation = await getLeadHunterConversation(userId, conversationId)
  if (!conversation) {
    return null
  }

  const [message] = await db
    .insert(leadHunterMessages)
    .values({
      conversationId: conversation.id,
      query,
      answer,
      createdAt: new Date(),
    })
    .returning()

  await db
    .update(leadHunterConversations)
    .set({
      updatedAt: new Date(),
      title: conversation.title || buildConversationTitle(query),
    })
    .where(eq(leadHunterConversations.id, conversation.id))

  return {
    id: String(message.id),
    conversation_id: String(conversation.id),
    query: message.query,
    answer: message.answer,
    created_at: toEpochSeconds(message.createdAt),
  }
}

export async function ensureLeadHunterConversation(userId: number, conversationId: string | null | undefined, query: string) {
  const existing = await getLeadHunterConversation(userId, conversationId)
  if (existing) {
    return existing
  }

  return createLeadHunterConversation(userId, query)
}
