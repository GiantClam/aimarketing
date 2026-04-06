import { and, desc, eq, lt, or } from "drizzle-orm"

import { db } from "@/lib/db"
import { leadHunterConversations, leadHunterMessages } from "@/lib/db/schema"
import { normalizeLeadHunterAdvisorType, type LeadHunterAdvisorType } from "@/lib/lead-hunter/types"

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

function isGenericConversationTitle(title: string | null | undefined) {
  const normalized = (title || "").replace(/\s+/g, " ").trim()
  if (!normalized) return true

  const lowered = normalized.toLowerCase()
  if (
    lowered === "new chat" ||
    lowered === "new conversation" ||
    lowered === "new session" ||
    lowered === "untitled" ||
    lowered === "untitled chat" ||
    lowered === "untitled conversation" ||
    lowered === "untitled session" ||
    lowered === "draft" ||
    lowered === DEFAULT_CONVERSATION_TITLE.toLowerCase() ||
    lowered === "\u65b0\u4f1a\u8bdd" ||
    lowered === "\u65b0\u5efa\u4f1a\u8bdd"
  ) {
    return true
  }

  return /^(?:new|untitled)\b/.test(lowered)
}

function resolveAdvisorType(advisorType: string | null | undefined): LeadHunterAdvisorType {
  const normalized = normalizeLeadHunterAdvisorType(advisorType)
  if (!normalized) {
    throw new Error("invalid_lead_hunter_advisor_type")
  }
  return normalized
}

export async function getLeadHunterConversation(
  userId: number,
  advisorType: string | null | undefined,
  conversationId: string | number | null | undefined,
) {
  const normalizedType = resolveAdvisorType(advisorType)
  const parsedConversationId = parsePositiveInt(conversationId)
  if (!parsedConversationId) {
    return null
  }

  const rows = await db
    .select()
    .from(leadHunterConversations)
    .where(
      and(
        eq(leadHunterConversations.id, parsedConversationId),
        eq(leadHunterConversations.userId, userId),
        eq(leadHunterConversations.advisorType, normalizedType),
      ),
    )
    .limit(1)

  return rows[0] || null
}

export async function createLeadHunterConversation(userId: number, advisorType: string | null | undefined, query: string) {
  const normalizedType = resolveAdvisorType(advisorType)

  const [row] = await db
    .insert(leadHunterConversations)
    .values({
      userId,
      advisorType: normalizedType,
      title: buildConversationTitle(query),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning()

  return row
}

export async function renameLeadHunterConversation(
  userId: number,
  advisorType: string | null | undefined,
  conversationId: string,
  name: string,
) {
  const normalizedType = resolveAdvisorType(advisorType)
  const conversation = await getLeadHunterConversation(userId, normalizedType, conversationId)
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

  return getLeadHunterConversation(userId, normalizedType, conversation.id)
}

export async function deleteLeadHunterConversation(
  userId: number,
  advisorType: string | null | undefined,
  conversationId: string,
) {
  const normalizedType = resolveAdvisorType(advisorType)
  const conversation = await getLeadHunterConversation(userId, normalizedType, conversationId)
  if (!conversation) {
    return false
  }

  await db.delete(leadHunterMessages).where(eq(leadHunterMessages.conversationId, conversation.id))
  await db.delete(leadHunterConversations).where(eq(leadHunterConversations.id, conversation.id))
  return true
}

export async function listLeadHunterConversations(
  userId: number,
  advisorType: string | null | undefined,
  lastId?: string | null,
  limit = 20,
) {
  const normalizedType = resolveAdvisorType(advisorType)
  const cappedLimit = Math.max(1, Math.min(limit, 50))
  const cursorConversation = lastId ? await getLeadHunterConversation(userId, normalizedType, lastId) : null

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
            eq(leadHunterConversations.advisorType, normalizedType),
            or(
              lt(leadHunterConversations.updatedAt, cursorConversation.updatedAt ?? new Date()),
              and(
                eq(leadHunterConversations.updatedAt, cursorConversation.updatedAt ?? new Date()),
                lt(leadHunterConversations.id, cursorConversation.id),
              ),
            ),
          )
        : and(eq(leadHunterConversations.userId, userId), eq(leadHunterConversations.advisorType, normalizedType)),
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

export async function listLeadHunterMessages(
  userId: number,
  advisorType: string | null | undefined,
  conversationId: string,
  firstId?: string | null,
  limit = 20,
) {
  const normalizedType = resolveAdvisorType(advisorType)
  const conversation = await getLeadHunterConversation(userId, normalizedType, conversationId)
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
  // Keep pagination query stable with DESC reads, but return timeline in chronological order.
  const chronologicalRows = [...pageRows].reverse()

  return {
    data: chronologicalRows.map((row) => ({
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

export async function appendLeadHunterMessage(
  userId: number,
  advisorType: string | null | undefined,
  conversationId: string,
  query: string,
  answer: string,
) {
  const normalizedType = resolveAdvisorType(advisorType)
  const conversation = await getLeadHunterConversation(userId, normalizedType, conversationId)
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
      title: isGenericConversationTitle(conversation.title) ? buildConversationTitle(query) : conversation.title,
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

export async function ensureLeadHunterConversation(
  userId: number,
  advisorType: string | null | undefined,
  conversationId: string | null | undefined,
  query: string,
) {
  const normalizedType = resolveAdvisorType(advisorType)
  const existing = await getLeadHunterConversation(userId, normalizedType, conversationId)
  if (existing) {
    return existing
  }

  return createLeadHunterConversation(userId, normalizedType, query)
}
