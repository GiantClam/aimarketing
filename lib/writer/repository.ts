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
  type WriterTurnDiagnostics,
} from "@/lib/writer/types"

const WRITER_TITLE_PREFIX = "[writer] "
const DB_RETRY_DELAYS_MS = [250, 750]
const WRITER_CONVERSATIONS_TABLE = "AI_MARKETING_writer_conversations"
const WRITER_MESSAGES_TABLE = "AI_MARKETING_writer_messages"
const WRITER_CONVERSATIONS_UPDATED_INDEX = "AI_MARKETING_writer_conversations_user_updated_idx"
const WRITER_MESSAGES_ROLE_ID_INDEX = "AI_MARKETING_writer_messages_conversation_role_id_desc_idx"

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

type WriterSchemaStatus = {
  conversationsTableExists: boolean
  messagesTableExists: boolean
  conversationsUpdatedIndexExists: boolean
  messagesRoleIdIndexExists: boolean
  hasPlatformColumn: boolean
  hasModeColumn: boolean
  hasLanguageColumn: boolean
  hasStatusColumn: boolean
  hasImagesRequestedColumn: boolean
  hasDiagnosticsColumn: boolean
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

function parseTimestampCursor(rawValue: string | null | undefined) {
  const match = /^(\d+):(\d+)$/u.exec(String(rawValue || "").trim())
  if (!match) return null

  const rawTimestamp = Number.parseInt(match[1], 10)
  const id = Number.parseInt(match[2], 10)
  if (!Number.isFinite(rawTimestamp) || !Number.isFinite(id) || rawTimestamp <= 0 || id <= 0) {
    return null
  }

  const timestampMs = rawTimestamp >= 1_000_000_000_000 ? rawTimestamp : rawTimestamp * 1000
  return {
    timestamp: new Date(timestampMs),
    id,
  }
}

function buildTimestampCursor(value: Date | string | number | null | undefined, id: number | null | undefined) {
  if (!id || !Number.isFinite(id)) return null
  const date = value instanceof Date ? value : value ? new Date(value) : null
  const timestampMs = date && Number.isFinite(date.getTime()) ? date.getTime() : null
  if (!timestampMs) return null
  return `${timestampMs}:${id}`
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

async function readWriterSchemaStatus(): Promise<WriterSchemaStatus> {
  const result = await db.execute(sql`
    SELECT
      to_regclass(${`"${WRITER_CONVERSATIONS_TABLE}"`}) IS NOT NULL AS conversations_table_exists,
      to_regclass(${`"${WRITER_MESSAGES_TABLE}"`}) IS NOT NULL AS messages_table_exists,
      to_regclass(${`"${WRITER_CONVERSATIONS_UPDATED_INDEX}"`}) IS NOT NULL AS conversations_updated_index_exists,
      to_regclass(${`"${WRITER_MESSAGES_ROLE_ID_INDEX}"`}) IS NOT NULL AS messages_role_id_index_exists,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = ${WRITER_CONVERSATIONS_TABLE}
          AND column_name = 'platform'
      ) AS has_platform_column,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = ${WRITER_CONVERSATIONS_TABLE}
          AND column_name = 'mode'
      ) AS has_mode_column,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = ${WRITER_CONVERSATIONS_TABLE}
          AND column_name = 'language'
      ) AS has_language_column,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = ${WRITER_CONVERSATIONS_TABLE}
          AND column_name = 'status'
      ) AS has_status_column,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = ${WRITER_CONVERSATIONS_TABLE}
          AND column_name = 'images_requested'
      ) AS has_images_requested_column
      ,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = ${WRITER_MESSAGES_TABLE}
          AND column_name = 'diagnostics'
      ) AS has_diagnostics_column
  `)

  const row = (result.rows[0] ?? {}) as Record<string, unknown>

  return {
    conversationsTableExists: Boolean(row.conversations_table_exists),
    messagesTableExists: Boolean(row.messages_table_exists),
    conversationsUpdatedIndexExists: Boolean(row.conversations_updated_index_exists),
    messagesRoleIdIndexExists: Boolean(row.messages_role_id_index_exists),
    hasPlatformColumn: Boolean(row.has_platform_column),
    hasModeColumn: Boolean(row.has_mode_column),
    hasLanguageColumn: Boolean(row.has_language_column),
    hasStatusColumn: Boolean(row.has_status_column),
    hasImagesRequestedColumn: Boolean(row.has_images_requested_column),
    hasDiagnosticsColumn: Boolean(row.has_diagnostics_column),
  }
}

function isWriterSchemaReady(status: WriterSchemaStatus) {
  return (
    status.conversationsTableExists &&
    status.messagesTableExists &&
    status.conversationsUpdatedIndexExists &&
    status.messagesRoleIdIndexExists &&
    status.hasPlatformColumn &&
    status.hasModeColumn &&
    status.hasLanguageColumn &&
    status.hasStatusColumn &&
    status.hasImagesRequestedColumn &&
    status.hasDiagnosticsColumn
  )
}

async function applyWriterSchemaChanges(status: WriterSchemaStatus) {
  if (!status.conversationsTableExists) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "AI_MARKETING_writer_conversations" (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE,
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
  } else {
    if (!status.hasPlatformColumn) {
      await db.execute(sql`ALTER TABLE "AI_MARKETING_writer_conversations" ADD COLUMN IF NOT EXISTS platform VARCHAR(32) NOT NULL DEFAULT 'wechat'`)
    }
    if (!status.hasModeColumn) {
      await db.execute(sql`ALTER TABLE "AI_MARKETING_writer_conversations" ADD COLUMN IF NOT EXISTS mode VARCHAR(32) NOT NULL DEFAULT 'article'`)
    }
    if (!status.hasLanguageColumn) {
      await db.execute(sql`ALTER TABLE "AI_MARKETING_writer_conversations" ADD COLUMN IF NOT EXISTS language VARCHAR(32) NOT NULL DEFAULT 'auto'`)
    }
    if (!status.hasStatusColumn) {
      await db.execute(sql`ALTER TABLE "AI_MARKETING_writer_conversations" ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'drafting'`)
    }
    if (!status.hasImagesRequestedColumn) {
      await db.execute(sql`ALTER TABLE "AI_MARKETING_writer_conversations" ADD COLUMN IF NOT EXISTS images_requested BOOLEAN NOT NULL DEFAULT FALSE`)
    }
  }

  if (!status.conversationsUpdatedIndexExists) {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "AI_MARKETING_writer_conversations_user_updated_idx"
      ON "AI_MARKETING_writer_conversations" (user_id, updated_at DESC, id DESC)
    `)
  }

  if (!status.messagesTableExists) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "AI_MARKETING_writer_messages" (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES "AI_MARKETING_writer_conversations"(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        diagnostics JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `)
  } else if (!status.hasDiagnosticsColumn) {
    await db.execute(sql`ALTER TABLE "AI_MARKETING_writer_messages" ADD COLUMN IF NOT EXISTS diagnostics JSONB`)
  }

  if (!status.messagesRoleIdIndexExists) {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "AI_MARKETING_writer_messages_conversation_role_id_desc_idx"
      ON "AI_MARKETING_writer_messages" (conversation_id, role, id DESC)
    `)
  }
}

async function ensureWriterTables() {
  if (!writerTablesReadyPromise) {
    writerTablesReadyPromise = withDbRetry("ensure-writer-tables", async () => {
      const schemaStatus = await readWriterSchemaStatus()
      if (!isWriterSchemaReady(schemaStatus)) {
        await applyWriterSchemaChanges(schemaStatus)
        const finalSchemaStatus = await readWriterSchemaStatus()
        if (!isWriterSchemaReady(finalSchemaStatus)) {
          throw new Error("writer_schema_not_ready")
        }
      }
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

function normalizeConversationName(name: string) {
  return name.replace(/\s+/g, " ").trim().slice(0, 80) || "鏂板缓鏂囩珷"
}

function buildConversationTitleSafe(query: string) {
  const title = buildConversationTitle(query)
  return title === `${WRITER_TITLE_PREFIX}鏂板缓鏂囩珷` ? `${WRITER_TITLE_PREFIX}新建文章` : title
}

function normalizeConversationNameSafe(name: string) {
  const normalized = normalizeConversationName(name)
  return normalized === "閺傛澘缂撻弬鍥╃彿" ? "新建文章" : normalized
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
  diagnostics,
  platform,
  mode,
  language,
  status = "text_ready",
  imagesRequested = false,
}: {
  userId: number
  conversationId?: string | null
  query: string
  answer: string
  diagnostics?: WriterTurnDiagnostics | null
  platform: WriterPlatform
  mode: WriterMode
  language: WriterLanguage
  status?: WriterConversationStatus
  imagesRequested?: boolean
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
          title: buildConversationTitleSafe(query),
          platform,
          mode,
          language,
          status,
          imagesRequested,
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
          status,
          imagesRequested,
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
        diagnostics: diagnostics || null,
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

export async function listWriterConversations(
  userId: number,
  limit: number,
  cursor?: string | null,
): Promise<WriterConversationPage> {
  await ensureWriterTables()

  const safeLimit = Math.max(1, Math.min(limit, 100))
  const parsedCursor = parseTimestampCursor(cursor)
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
          parsedCursor
            ? sql`(
                ${writerConversations.updatedAt} < ${parsedCursor.timestamp}
                OR (${writerConversations.updatedAt} = ${parsedCursor.timestamp} AND ${writerConversations.id} < ${parsedCursor.id})
              )`
            : undefined,
        ),
      )
      .orderBy(desc(writerConversations.updatedAt), desc(writerConversations.id))
      .limit(safeLimit + 1),
  )

  const visibleRows = limitedRows.slice(0, safeLimit)
  const data = visibleRows.map((row) => mapConversation({ ...row, userId }))
  const lastVisibleRow = visibleRows.at(-1)
  const nextCursor =
    limitedRows.length > safeLimit && lastVisibleRow?.updatedAt
      ? buildTimestampCursor(lastVisibleRow.updatedAt, lastVisibleRow.id)
      : null

  return { data, has_more: limitedRows.length > safeLimit, limit: safeLimit, next_cursor: nextCursor }
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
        assistant.diagnostics AS assistant_diagnostics,
        assistant.created_at AS assistant_created_at,
        prompt.id AS user_id,
        prompt.content AS user_content,
        prompt.created_at AS user_created_at
      FROM "AI_MARKETING_writer_messages" AS assistant
      LEFT JOIN LATERAL (
        SELECT user_message.id, user_message.content, user_message.created_at
        FROM "AI_MARKETING_writer_messages" AS user_message
        WHERE user_message.conversation_id = assistant.conversation_id
          AND user_message.role = 'user'
          AND user_message.id < assistant.id
        ORDER BY user_message.id DESC
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
    assistant_diagnostics: WriterTurnDiagnostics | null
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
    diagnostics: row.assistant_diagnostics || null,
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

  const normalizedName = normalizeConversationNameSafe(name)

  await withDbRetry("rename-writer-conversation", () =>
    db
      .update(writerConversations)
      .set({
        title: `${WRITER_TITLE_PREFIX}${normalizedName}`,
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
    diagnostics: WriterTurnDiagnostics | null
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
    db
      .update(writerMessages)
      .set({
        content,
        ...(meta && "diagnostics" in meta ? { diagnostics: meta.diagnostics || null } : {}),
      })
      .where(eq(writerMessages.id, latestAssistant.id)),
  )

  await updateWriterConversationMeta(userId, conversationId, meta || { status: "text_ready" })
  return true
}

export async function updateWriterAssistantMessageById(
  userId: number,
  conversationId: string,
  messageId: string,
  content: string,
  meta?: Partial<{
    status: WriterConversationStatus
    imagesRequested: boolean
    language: WriterLanguage
    platform: WriterPlatform
    mode: WriterMode
    diagnostics: WriterTurnDiagnostics | null
  }>,
) {
  await ensureWriterTables()

  const conversation = await getWriterConversation(userId, conversationId)
  if (!conversation) {
    return false
  }

  const rawMessageId = messageId.trim()
  const prefixedMatch = /^assistant_(\d+)$/i.exec(rawMessageId)
  const parsedMessageId = Number.parseInt(prefixedMatch ? prefixedMatch[1] : rawMessageId, 10)
  if (!Number.isFinite(parsedMessageId) || parsedMessageId <= 0) {
    return false
  }

  const targetAssistantRows = await withDbRetry("select-writer-assistant-by-id", () =>
    db
      .select({ id: writerMessages.id })
      .from(writerMessages)
      .where(
        and(
          eq(writerMessages.id, parsedMessageId),
          eq(writerMessages.conversationId, conversation.id),
          eq(writerMessages.role, "assistant"),
        ),
      )
      .limit(1),
  )

  const targetAssistant = targetAssistantRows[0]
  if (!targetAssistant) {
    return false
  }

  await withDbRetry("update-writer-assistant-content-by-id", () =>
    db
      .update(writerMessages)
      .set({
        content,
        ...(meta && "diagnostics" in meta ? { diagnostics: meta.diagnostics || null } : {}),
      })
      .where(eq(writerMessages.id, targetAssistant.id)),
  )

  if (
    meta &&
    (typeof meta.status === "string" ||
      typeof meta.imagesRequested === "boolean" ||
      Boolean(meta.language) ||
      Boolean(meta.platform) ||
      Boolean(meta.mode))
  ) {
    await updateWriterConversationMeta(userId, conversationId, {
      ...(typeof meta.status === "string" ? { status: meta.status } : {}),
      ...(typeof meta.imagesRequested === "boolean" ? { imagesRequested: meta.imagesRequested } : {}),
      ...(meta.language ? { language: meta.language } : {}),
      ...(meta.platform ? { platform: meta.platform } : {}),
      ...(meta.mode ? { mode: meta.mode } : {}),
    })
  }

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
