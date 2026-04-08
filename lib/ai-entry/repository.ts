import { and, desc, eq, lt, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { createRetryableDbErrorMatcher, withDbRetry } from "@/lib/db/retry"
import { conversations, messages } from "@/lib/db/schema"

const AI_ENTRY_CHAT_TITLE_PREFIX = "[ai-entry] "
const AI_ENTRY_CONSULTING_TITLE_PREFIX = "[ai-consulting] "
const AI_ENTRY_DEFAULT_TITLE = "New chat"
const AI_ENTRY_AUTO_TITLE_MAX_LENGTH = 60
const DB_RETRY_DELAYS_MS = [250, 750]

export type AiEntryConversationScope = "chat" | "consulting"

type AiEntryConversationRow = {
  id: number
  title: string
  currentModelId?: string | null
  createdAt?: Date | string | number | null
}

type AiEntryMessageRow = {
  id: number
  role: string
  content: string
  knowledge_source?: string | null
  created_at?: Date | string | number | null
}

export type AiEntryConversationSummary = {
  id: string
  name: string
  status: "normal"
  created_at: number
  updated_at: number
  current_model_id: string | null
}

export type AiEntryConversationPage = {
  data: AiEntryConversationSummary[]
  has_more: boolean
  limit: number
  next_cursor: string | null
}

export type AiEntryMessageRecord = {
  id: string
  conversation_id: string
  role: "user" | "assistant"
  content: string
  knowledge_source: null
  created_at: number
}

export type AiEntryMessagePage = {
  data: AiEntryMessageRecord[]
  limit: number
  has_more: boolean
  conversation: AiEntryConversationSummary | null
}

const isRetryableAiEntryDbError = createRetryableDbErrorMatcher()

async function withAiEntryDbRetry<T>(label: string, operation: () => Promise<T>) {
  return withDbRetry(label, operation, {
    retryDelaysMs: DB_RETRY_DELAYS_MS,
    isRetryable: isRetryableAiEntryDbError,
    logPrefix: "ai-entry.db.retry",
    exhaustedErrorPrefix: "ai_entry_db_retry_exhausted",
  })
}

function parsePositiveInt(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.floor(parsed)
}

function toEpochSeconds(value: Date | string | number | null | undefined) {
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000)
  }
  if (typeof value === "number") {
    if (value > 1_000_000_000_000) return Math.floor(value / 1000)
    if (value > 1_000_000_000) return Math.floor(value)
    const parsedDate = new Date(value)
    if (!Number.isNaN(parsedDate.getTime())) {
      return Math.floor(parsedDate.getTime() / 1000)
    }
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return Math.floor(parsed.getTime() / 1000)
    }
  }
  return Math.floor(Date.now() / 1000)
}

function stripTitlePrefix(title: string) {
  let normalized = title
  if (title.startsWith(AI_ENTRY_CHAT_TITLE_PREFIX)) {
    normalized = title.slice(AI_ENTRY_CHAT_TITLE_PREFIX.length)
  } else if (title.startsWith(AI_ENTRY_CONSULTING_TITLE_PREFIX)) {
    normalized = title.slice(AI_ENTRY_CONSULTING_TITLE_PREFIX.length)
  }
  return normalized.trim() || AI_ENTRY_DEFAULT_TITLE
}

function normalizeConversationName(name: string | null | undefined) {
  const normalized = String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
  return normalized || AI_ENTRY_DEFAULT_TITLE
}

function normalizeModelId(modelId: string | null | undefined) {
  const normalized = typeof modelId === "string" ? modelId.trim() : ""
  return normalized || null
}

function getTitlePrefix(scope: AiEntryConversationScope) {
  return scope === "consulting"
    ? AI_ENTRY_CONSULTING_TITLE_PREFIX
    : AI_ENTRY_CHAT_TITLE_PREFIX
}

function buildConversationTitle(
  name: string | null | undefined,
  scope: AiEntryConversationScope,
) {
  return `${getTitlePrefix(scope)}${normalizeConversationName(name)}`
}

function buildConversationTitleFromPrompt(
  prompt: string,
  scope: AiEntryConversationScope,
) {
  const normalizedPrompt = prompt
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, AI_ENTRY_AUTO_TITLE_MAX_LENGTH)
  return buildConversationTitle(normalizedPrompt || AI_ENTRY_DEFAULT_TITLE, scope)
}

function isGenericConversationTitle(title: string) {
  const normalized = stripTitlePrefix(title).toLowerCase()
  return (
    normalized === "new chat" ||
    normalized === "new conversation" ||
    normalized === "new session" ||
    normalized === "untitled" ||
    normalized === "untitled chat" ||
    normalized === "\u65b0\u4f1a\u8bdd" ||
    normalized === "\u65b0\u5efa\u4f1a\u8bdd" ||
    normalized === "new"
  )
}

function parseCursor(rawCursor: string | null | undefined) {
  const parsed = Number.parseInt(String(rawCursor || "").trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

function buildCursor(id: number) {
  if (!Number.isFinite(id) || id <= 0) return null
  return String(Math.floor(id))
}

function mapConversationSummary(
  row: {
    id: number
    title: string
    currentModelId?: string | null
    createdAt: Date | string | number | null | undefined
    updatedAt?: Date | string | number | null | undefined
  },
): AiEntryConversationSummary {
  const createdAt = toEpochSeconds(row.createdAt)
  const updatedAt = toEpochSeconds(row.updatedAt ?? row.createdAt)
  return {
    id: String(row.id),
    name: stripTitlePrefix(row.title),
    status: "normal",
    created_at: createdAt,
    updated_at: updatedAt,
    current_model_id: normalizeModelId(row.currentModelId),
  }
}

export async function getAiEntryConversation(
  userId: number,
  conversationId: string | number | null | undefined,
  scope: AiEntryConversationScope = "chat",
) {
  const parsedConversationId = parsePositiveInt(conversationId)
  if (!parsedConversationId) return null
  const titlePrefix = getTitlePrefix(scope)

  const rows = await withAiEntryDbRetry("get-ai-entry-conversation", () =>
    db
      .select({
        id: conversations.id,
        title: conversations.title,
        currentModelId: conversations.currentModelId,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, parsedConversationId),
          eq(conversations.userId, userId),
          sql`${conversations.title} LIKE ${`${titlePrefix}%`}`,
        ),
      )
      .limit(1),
  )

  const row = rows[0] as AiEntryConversationRow | undefined
  return row || null
}

export async function createAiEntryConversation(
  userId: number,
  title?: string | null,
  currentModelId?: string | null,
  scope: AiEntryConversationScope = "chat",
) {
  const normalizedModelId = normalizeModelId(currentModelId)
  const rows = await withAiEntryDbRetry("create-ai-entry-conversation", () =>
    db
      .insert(conversations)
      .values({
        userId,
        title: buildConversationTitle(title || AI_ENTRY_DEFAULT_TITLE, scope),
        currentModelId: normalizedModelId,
      })
      .returning({
        id: conversations.id,
        title: conversations.title,
        currentModelId: conversations.currentModelId,
        createdAt: conversations.createdAt,
      }),
  )

  const created = rows[0]
  if (!created) {
    throw new Error("ai_entry_create_conversation_failed")
  }

  return mapConversationSummary({
    id: created.id,
    title: created.title,
    currentModelId: created.currentModelId,
    createdAt: created.createdAt || null,
  })
}

export async function getLatestAiEntryConversationModelId(
  userId: number,
  scope: AiEntryConversationScope = "chat",
) {
  const titlePrefix = getTitlePrefix(scope)
  const rows = await withAiEntryDbRetry("get-latest-ai-entry-conversation-model", () =>
    db
      .select({
        currentModelId: conversations.currentModelId,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, userId),
          sql`${conversations.title} LIKE ${`${titlePrefix}%`}`,
          sql`${conversations.currentModelId} IS NOT NULL`,
          sql`length(trim(${conversations.currentModelId})) > 0`,
        ),
      )
      .orderBy(desc(conversations.id))
      .limit(1),
  )

  const latestModelId = normalizeModelId(rows[0]?.currentModelId)
  return latestModelId || null
}

export async function ensureAiEntryConversation(
  userId: number,
  conversationId: string | number | null | undefined,
  fallbackTitle?: string,
  currentModelId?: string | null,
  scope: AiEntryConversationScope = "chat",
) {
  const normalizedModelId = normalizeModelId(currentModelId)
  const existing = await getAiEntryConversation(userId, conversationId, scope)
  if (existing) {
    if (normalizedModelId && normalizedModelId !== normalizeModelId(existing.currentModelId)) {
      await withAiEntryDbRetry("set-ai-entry-conversation-model", () =>
        db
          .update(conversations)
          .set({ currentModelId: normalizedModelId })
          .where(eq(conversations.id, existing.id)),
      )
    }

    return mapConversationSummary({
      id: existing.id,
      title: existing.title,
      currentModelId: normalizedModelId || existing.currentModelId || null,
      createdAt: existing.createdAt || null,
    })
  }

  return createAiEntryConversation(
    userId,
    fallbackTitle || AI_ENTRY_DEFAULT_TITLE,
    normalizedModelId,
    scope,
  )
}

export async function listAiEntryConversations(
  userId: number,
  limit: number,
  cursor?: string | null,
  scope: AiEntryConversationScope = "chat",
): Promise<AiEntryConversationPage> {
  const safeLimit = Math.max(1, Math.min(limit, 50))
  const parsedCursor = parseCursor(cursor)
  const titlePrefix = getTitlePrefix(scope)

  const rows = await withAiEntryDbRetry("list-ai-entry-conversations", () =>
    db
      .select({
        id: conversations.id,
        title: conversations.title,
        currentModelId: conversations.currentModelId,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, userId),
          sql`${conversations.title} LIKE ${`${titlePrefix}%`}`,
          parsedCursor ? lt(conversations.id, parsedCursor) : undefined,
        ),
      )
      .orderBy(desc(conversations.id))
      .limit(safeLimit + 1),
  )

  const pageRows = rows.slice(0, safeLimit)
  const data = pageRows.map((row) =>
    mapConversationSummary({
      id: row.id,
      title: row.title,
      currentModelId: row.currentModelId,
      createdAt: null,
      updatedAt: null,
    }),
  )

  const hasMore = rows.length > safeLimit
  const nextCursor = hasMore
    ? buildCursor(pageRows.at(-1)?.id || 0)
    : null

  return {
    data,
    has_more: hasMore,
    limit: safeLimit,
    next_cursor: nextCursor,
  }
}

export async function deleteAiEntryConversation(
  userId: number,
  conversationId: string,
  scope: AiEntryConversationScope = "chat",
) {
  const conversation = await getAiEntryConversation(userId, conversationId, scope)
  if (!conversation) return false

  await withAiEntryDbRetry("delete-ai-entry-messages", () =>
    db.delete(messages).where(eq(messages.conversationId, conversation.id)),
  )
  await withAiEntryDbRetry("delete-ai-entry-conversation", () =>
    db.delete(conversations).where(eq(conversations.id, conversation.id)),
  )
  return true
}

export async function renameAiEntryConversation(
  userId: number,
  conversationId: string,
  name: string,
  scope: AiEntryConversationScope = "chat",
) {
  const conversation = await getAiEntryConversation(userId, conversationId, scope)
  if (!conversation) {
    return null
  }

  const normalizedName = normalizeConversationName(name)

  await withAiEntryDbRetry("rename-ai-entry-conversation", () =>
    db
      .update(conversations)
      .set({
        title: buildConversationTitle(normalizedName, scope),
      })
      .where(eq(conversations.id, conversation.id)),
  )

  const updatedConversation = await getAiEntryConversation(
    userId,
    conversationId,
    scope,
  )
  if (!updatedConversation) return null

  return mapConversationSummary({
    id: updatedConversation.id,
    title: updatedConversation.title,
    currentModelId: updatedConversation.currentModelId,
    createdAt: updatedConversation.createdAt,
  })
}

export async function appendAiEntryTurn(params: {
  userId: number
  conversationId: string | number | null | undefined
  userPrompt: string
  assistantMessage: string
  knowledgeSource: "industry_kb" | "personal_kb"
  scope?: AiEntryConversationScope
}) {
  const scope = params.scope || "chat"
  const conversation = await getAiEntryConversation(
    params.userId,
    params.conversationId,
    scope,
  )
  if (!conversation) {
    return null
  }

  const messageCountRows = await withAiEntryDbRetry("count-ai-entry-messages", () =>
    db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversation.id))
      .limit(1),
  )

  const existingMessageCount = Number(messageCountRows[0]?.count || 0)
  const shouldRetitle = existingMessageCount === 0 || isGenericConversationTitle(conversation.title)
  const nextTitle = shouldRetitle
    ? buildConversationTitleFromPrompt(params.userPrompt, scope)
    : conversation.title

  if (shouldRetitle) {
    await withAiEntryDbRetry("retitle-ai-entry-conversation", () =>
      db
        .update(conversations)
        .set({
          title: nextTitle,
        })
        .where(eq(conversations.id, conversation.id)),
    )
  }

  await withAiEntryDbRetry("insert-ai-entry-turn", () =>
    db.execute(sql`
      INSERT INTO ${messages} ("conversation_id", "role", "content")
      VALUES
        (${conversation.id}, ${"user"}, ${params.userPrompt}),
        (${conversation.id}, ${"assistant"}, ${params.assistantMessage})
    `),
  )

  return mapConversationSummary({
    id: conversation.id,
    title: nextTitle,
    currentModelId: conversation.currentModelId,
    createdAt: conversation.createdAt,
  })
}

export async function listAiEntryMessages(
  userId: number,
  conversationId: string,
  limit = 200,
  scope: AiEntryConversationScope = "chat",
): Promise<AiEntryMessagePage | null> {
  const conversation = await getAiEntryConversation(userId, conversationId, scope)
  if (!conversation) return null

  const safeLimit = Math.max(1, Math.min(limit, 500))
  const result = await withAiEntryDbRetry("list-ai-entry-messages", () =>
    db.execute(sql`
      SELECT
        m.id,
        m.role,
        m.content
      FROM "AI_MARKETING_messages" m
      WHERE m.conversation_id = ${conversation.id}
      ORDER BY m.id ASC
      LIMIT ${safeLimit}
    `),
  )

  const data = ((result.rows as AiEntryMessageRow[]) || [])
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({
      id: String(row.id),
      conversation_id: String(conversation.id),
      role: row.role as "user" | "assistant",
      content: row.content || "",
      knowledge_source: null,
      created_at: Math.floor(Date.now() / 1000),
    }))

  return {
    data,
    limit: safeLimit,
    has_more: false,
    conversation: mapConversationSummary({
      id: conversation.id,
      title: conversation.title,
      currentModelId: conversation.currentModelId,
      createdAt: conversation.createdAt,
    }),
  }
}

