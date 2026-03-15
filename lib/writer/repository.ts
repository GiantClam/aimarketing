import { and, desc, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { writerConversations, writerMessages } from "@/lib/db/schema"
import {
  normalizeWriterLanguage,
  normalizeWriterMode,
  normalizeWriterPlatform,
  type WriterLanguage,
  type WriterMode,
  type WriterPlatform,
} from "@/lib/writer/config"
import {
  type WriterConversationPage,
  type WriterConversationStatus,
  type WriterConversationSummary,
  type WriterHistoryEntry,
  type WriterMessagePage,
} from "@/lib/writer/types"

const WRITER_TITLE_PREFIX = "[writer] "
const DB_RETRY_DELAYS_MS = [250, 750]

type WriterConversationRow = {
  id: number
  userId: number
  title: string
  platform: string
  mode: string
  language: string
  status: string
  imagesRequested: boolean
  createdAt: Date | null
  updatedAt: Date | null
}

type WriterConversationMeta = {
  platform: WriterPlatform
  mode: WriterMode
  language: WriterLanguage
  status: WriterConversationStatus
  imagesRequested: boolean
}

let writerTablesReadyPromise: Promise<void> | null = null

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function isRetryableDbError(error: unknown) {
  const message = getErrorMessage(error)
  const causeMessage =
    error && typeof error === "object" && "cause" in error ? getErrorMessage((error as { cause?: unknown }).cause) : ""
  const combined = `${message} ${causeMessage}`.toLowerCase()

  return (
    combined.includes("error connecting to database") ||
    combined.includes("fetch failed") ||
    combined.includes("connect timeout") ||
    combined.includes("und_err_connect_timeout")
  )
}

function toEpochSeconds(value: Date | string | number | null | undefined, fallbackSeconds: number) {
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000)
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return Math.floor(parsed.getTime() / 1000)
    }
  }

  return fallbackSeconds
}

async function withDbRetry<T>(label: string, operation: () => Promise<T>) {
  for (let attempt = 0; attempt <= DB_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!isRetryableDbError(error) || attempt === DB_RETRY_DELAYS_MS.length) {
        throw error
      }

      console.warn("writer.db.retry", {
        label,
        attempt: attempt + 1,
        message: getErrorMessage(error),
      })
      await sleep(DB_RETRY_DELAYS_MS[attempt])
    }
  }

  throw new Error(`writer_db_retry_exhausted:${label}`)
}

async function ensureWriterTables() {
  if (!writerTablesReadyPromise) {
    writerTablesReadyPromise = withDbRetry("ensure-writer-tables", async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS writer_conversations (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          platform VARCHAR(32) NOT NULL DEFAULT 'wechat',
          mode VARCHAR(32) NOT NULL DEFAULT 'article',
          language VARCHAR(32) NOT NULL DEFAULT 'auto',
          status VARCHAR(32) NOT NULL DEFAULT 'drafting',
          images_requested BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `)

      await db.execute(sql`ALTER TABLE writer_conversations ADD COLUMN IF NOT EXISTS platform VARCHAR(32) NOT NULL DEFAULT 'wechat'`)
      await db.execute(sql`ALTER TABLE writer_conversations ADD COLUMN IF NOT EXISTS mode VARCHAR(32) NOT NULL DEFAULT 'article'`)
      await db.execute(sql`ALTER TABLE writer_conversations ADD COLUMN IF NOT EXISTS language VARCHAR(32) NOT NULL DEFAULT 'auto'`)
      await db.execute(sql`ALTER TABLE writer_conversations ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'drafting'`)
      await db.execute(sql`ALTER TABLE writer_conversations ADD COLUMN IF NOT EXISTS images_requested BOOLEAN NOT NULL DEFAULT FALSE`)

      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS writer_conversations_user_created_idx
        ON writer_conversations (user_id, created_at DESC, id DESC)
      `)

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS writer_messages (
          id SERIAL PRIMARY KEY,
          conversation_id INTEGER NOT NULL REFERENCES writer_conversations(id) ON DELETE CASCADE,
          role VARCHAR(20) NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `)

      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS writer_messages_conversation_created_idx
        ON writer_messages (conversation_id, created_at ASC, id ASC)
      `)
    }).catch((error) => {
      writerTablesReadyPromise = null
      throw error
    })
  }

  await writerTablesReadyPromise
}

function normalizeTitle(title: string) {
  return title.startsWith(WRITER_TITLE_PREFIX) ? title.slice(WRITER_TITLE_PREFIX.length) : title
}

function buildConversationTitle(query: string) {
  const normalized = query.replace(/\s+/g, " ").trim().slice(0, 60)
  return `${WRITER_TITLE_PREFIX}${normalized || "新建文章"}`
}

function normalizeConversationMeta(row: Pick<WriterConversationRow, "platform" | "mode" | "language" | "status" | "imagesRequested">): WriterConversationMeta {
  return {
    platform: normalizeWriterPlatform(row.platform),
    mode: normalizeWriterMode(normalizeWriterPlatform(row.platform), row.mode),
    language: normalizeWriterLanguage(row.language),
    status: (row.status as WriterConversationStatus) || "drafting",
    imagesRequested: Boolean(row.imagesRequested),
  }
}

function mapConversation(row: WriterConversationRow): WriterConversationSummary {
  const meta = normalizeConversationMeta(row)
  return {
    id: String(row.id),
    name: normalizeTitle(row.title),
    status: meta.status,
    platform: meta.platform,
    mode: meta.mode,
    language: meta.language,
    images_requested: meta.imagesRequested,
    created_at: row.createdAt ? Math.floor(row.createdAt.getTime() / 1000) : Math.floor(Date.now() / 1000),
    updated_at: row.updatedAt ? Math.floor(row.updatedAt.getTime() / 1000) : Math.floor(Date.now() / 1000),
  }
}

export async function getWriterConversation(userId: number, conversationId: string) {
  await ensureWriterTables()

  const parsedConversationId = Number.parseInt(conversationId, 10)
  if (!Number.isFinite(parsedConversationId) || parsedConversationId <= 0) {
    return null
  }

  const rows = await withDbRetry("require-writer-conversation", () =>
    db
      .select({
        id: writerConversations.id,
        userId: writerConversations.userId,
        title: writerConversations.title,
        platform: writerConversations.platform,
        mode: writerConversations.mode,
        language: writerConversations.language,
        status: writerConversations.status,
        imagesRequested: writerConversations.imagesRequested,
        createdAt: writerConversations.createdAt,
        updatedAt: writerConversations.updatedAt,
      })
      .from(writerConversations)
      .where(and(eq(writerConversations.id, parsedConversationId), eq(writerConversations.userId, userId)))
      .limit(1),
  )

  const row = rows[0]
  if (!row || !row.title.startsWith(WRITER_TITLE_PREFIX)) {
    return null
  }

  return row satisfies WriterConversationRow
}

export async function appendWriterConversation({
  userId,
  conversationId,
  query,
  answer,
  platform,
  mode,
  language,
}: {
  userId: number
  conversationId?: string | null
  query: string
  answer: string
  platform: WriterPlatform
  mode: WriterMode
  language: WriterLanguage
}) {
  await ensureWriterTables()

  let targetConversationId = conversationId ?? null

  if (targetConversationId) {
    const existingConversation = await getWriterConversation(userId, targetConversationId)
    if (!existingConversation) {
      targetConversationId = null
    }
  }

  if (!targetConversationId) {
    const createdConversation = await withDbRetry("insert-writer-conversation", () =>
      db
        .insert(writerConversations)
        .values({
          userId,
          title: buildConversationTitle(query),
          platform,
          mode,
          language,
          status: "text_ready",
          imagesRequested: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: writerConversations.id }),
    )

    targetConversationId = String(createdConversation[0].id)
  } else {
    const existingConversationId = Number.parseInt(targetConversationId, 10)
    await withDbRetry("touch-writer-conversation", () =>
      db
        .update(writerConversations)
        .set({
          platform,
          mode,
          language,
          status: "text_ready",
          imagesRequested: false,
          updatedAt: new Date(),
        })
        .where(eq(writerConversations.id, existingConversationId)),
    )
  }

  const parsedConversationId = Number.parseInt(targetConversationId, 10)
  await withDbRetry("insert-writer-messages", () =>
    db.insert(writerMessages).values([
      {
        conversationId: parsedConversationId,
        role: "user",
        content: query,
        createdAt: new Date(),
      },
      {
        conversationId: parsedConversationId,
        role: "assistant",
        content: answer,
        createdAt: new Date(),
      },
    ]),
  )

  const persistedConversation = await getWriterConversation(userId, targetConversationId)
  if (!persistedConversation) {
    throw new Error("writer_conversation_persist_failed")
  }

  return {
    conversationId: targetConversationId,
    conversation: mapConversation(persistedConversation),
  }
}

export async function listWriterConversations(userId: number, limit: number): Promise<WriterConversationPage> {
  await ensureWriterTables()

  const safeLimit = Math.max(1, Math.min(limit, 100))
  const limitedRows = await withDbRetry("list-writer-conversations", () =>
    db
      .select({
        id: writerConversations.id,
        title: writerConversations.title,
        platform: writerConversations.platform,
        mode: writerConversations.mode,
        language: writerConversations.language,
        status: writerConversations.status,
        imagesRequested: writerConversations.imagesRequested,
        createdAt: writerConversations.createdAt,
        updatedAt: writerConversations.updatedAt,
      })
      .from(writerConversations)
      .where(
        and(
          eq(writerConversations.userId, userId),
          sql`${writerConversations.title} LIKE ${`${WRITER_TITLE_PREFIX}%`}`,
        ),
      )
      .orderBy(desc(writerConversations.updatedAt), desc(writerConversations.id))
      .limit(safeLimit + 1),
  )

  const visibleRows = limitedRows.slice(0, safeLimit)
  const data = visibleRows.map((row) => mapConversation({ ...row, userId }))

  return { data, has_more: limitedRows.length > safeLimit, limit: safeLimit }
}

export async function listWriterMessages(
  userId: number,
  conversationId: string,
  limit: number,
  cursor?: string | null,
): Promise<WriterMessagePage> {
  await ensureWriterTables()

  const conversation = await getWriterConversation(userId, conversationId)
  if (!conversation) {
    return { data: [], limit, has_more: false, next_cursor: null, conversation: null }
  }

  const parsedConversationId = Number.parseInt(conversationId, 10)
  const safeLimit = Math.max(1, Math.min(limit, 100))
  const parsedCursor = cursor ? Number.parseInt(cursor, 10) : Number.NaN
  const nextCursorFilter = Number.isFinite(parsedCursor) && parsedCursor > 0
  const rows = await withDbRetry("list-writer-messages", () =>
    db.execute(sql`
      SELECT
        assistant.id AS assistant_id,
        assistant.content AS assistant_content,
        assistant.created_at AS assistant_created_at,
        prompt.id AS user_id,
        prompt.content AS user_content,
        prompt.created_at AS user_created_at
      FROM writer_messages AS assistant
      LEFT JOIN LATERAL (
        SELECT user_message.id, user_message.content, user_message.created_at
        FROM writer_messages AS user_message
        WHERE user_message.conversation_id = assistant.conversation_id
          AND user_message.role = 'user'
          AND (
            user_message.created_at < assistant.created_at
            OR (user_message.created_at = assistant.created_at AND user_message.id < assistant.id)
          )
        ORDER BY user_message.created_at DESC, user_message.id DESC
        LIMIT 1
      ) AS prompt ON TRUE
      WHERE assistant.conversation_id = ${parsedConversationId}
        AND assistant.role = 'assistant'
        ${nextCursorFilter ? sql`AND assistant.id < ${parsedCursor}` : sql``}
      ORDER BY assistant.id DESC
      LIMIT ${safeLimit + 1}
    `),
  )

  const resultRows = rows.rows as Array<{
    assistant_id: number
    assistant_content: string
    assistant_created_at: Date | null
    user_id: number | null
    user_content: string | null
    user_created_at: Date | null
  }>

  const visibleRows = resultRows.slice(0, safeLimit).reverse()
  const fallbackSeconds = Math.floor(Date.now() / 1000)
  const data: WriterHistoryEntry[] = visibleRows.map((row) => ({
    id: String(row.assistant_id),
    conversation_id: conversationId,
    query: row.user_content || "",
    answer: row.assistant_content || "",
    inputs: { contents: row.user_content || "" },
    created_at: toEpochSeconds(row.user_created_at, toEpochSeconds(row.assistant_created_at, fallbackSeconds)),
  }))

  const hasMore = resultRows.length > safeLimit
  const nextCursor = hasMore ? String(resultRows[safeLimit - 1]?.assistant_id ?? "") : null

  return {
    data,
    limit: safeLimit,
    has_more: hasMore,
    next_cursor: nextCursor || null,
    conversation: mapConversation(conversation),
  }
}

export async function renameWriterConversation(userId: number, conversationId: string, name: string) {
  await ensureWriterTables()

  const conversation = await getWriterConversation(userId, conversationId)
  if (!conversation) {
    return null
  }

  await withDbRetry("rename-writer-conversation", () =>
    db
      .update(writerConversations)
      .set({
        title: `${WRITER_TITLE_PREFIX}${name.trim() || "新建文章"}`,
        updatedAt: new Date(),
      })
      .where(eq(writerConversations.id, conversation.id)),
  )

  const updatedConversation = await getWriterConversation(userId, conversationId)
  return updatedConversation ? mapConversation(updatedConversation) : null
}

export async function updateWriterConversationMeta(
  userId: number,
  conversationId: string,
  meta: Partial<{
    platform: WriterPlatform
    mode: WriterMode
    language: WriterLanguage
    status: WriterConversationStatus
    imagesRequested: boolean
  }>,
) {
  await ensureWriterTables()

  const conversation = await getWriterConversation(userId, conversationId)
  if (!conversation) {
    return false
  }

  await withDbRetry("update-writer-conversation-meta", () =>
    db
      .update(writerConversations)
      .set({
        ...(meta.platform ? { platform: meta.platform } : {}),
        ...(meta.mode ? { mode: meta.mode } : {}),
        ...(meta.language ? { language: meta.language } : {}),
        ...(typeof meta.status === "string" ? { status: meta.status } : {}),
        ...(typeof meta.imagesRequested === "boolean" ? { imagesRequested: meta.imagesRequested } : {}),
        updatedAt: new Date(),
      })
      .where(eq(writerConversations.id, conversation.id)),
  )

  return true
}

export async function updateWriterLatestAssistantMessage(
  userId: number,
  conversationId: string,
  content: string,
  meta?: Partial<{
    status: WriterConversationStatus
    imagesRequested: boolean
    language: WriterLanguage
    platform: WriterPlatform
    mode: WriterMode
  }>,
) {
  await ensureWriterTables()

  const conversation = await getWriterConversation(userId, conversationId)
  if (!conversation) {
    return false
  }

  const latestAssistantRows = await withDbRetry("select-writer-latest-assistant", () =>
    db
      .select({ id: writerMessages.id })
      .from(writerMessages)
      .where(and(eq(writerMessages.conversationId, conversation.id), eq(writerMessages.role, "assistant")))
      .orderBy(desc(writerMessages.id))
      .limit(1),
  )

  const latestAssistant = latestAssistantRows[0]
  if (!latestAssistant) {
    return false
  }

  await withDbRetry("update-writer-assistant-content", () =>
    db.update(writerMessages).set({ content }).where(eq(writerMessages.id, latestAssistant.id)),
  )

  await updateWriterConversationMeta(userId, conversationId, meta || { status: "text_ready" })
  return true
}

export async function deleteWriterConversation(userId: number, conversationId: string) {
  await ensureWriterTables()

  const conversation = await getWriterConversation(userId, conversationId)
  if (!conversation) {
    return false
  }

  await withDbRetry("delete-writer-messages", () =>
    db.delete(writerMessages).where(eq(writerMessages.conversationId, conversation.id)),
  )
  await withDbRetry("delete-writer-conversation", () =>
    db.delete(writerConversations).where(eq(writerConversations.id, conversation.id)),
  )
  return true
}
