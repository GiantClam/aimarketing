import { and, asc, desc, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { writerConversations, writerMessages } from "@/lib/db/schema"
import {
  DEFAULT_WRITER_LANGUAGE,
  normalizeWriterLanguage,
  normalizeWriterMode,
  normalizeWriterPlatform,
  type WriterLanguage,
  type WriterMode,
  type WriterPlatform,
} from "@/lib/writer/config"

const WRITER_TITLE_PREFIX = "[writer] "
const DB_RETRY_DELAYS_MS = [250, 750]

type WriterConversationStatus = "drafting" | "text_ready" | "image_generating" | "ready" | "failed"

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

type WriterMockConversation = {
  id: string
  name: string
  status: WriterConversationStatus
  platform: WriterPlatform
  mode: WriterMode
  language: WriterLanguage
  images_requested: boolean
  created_at: number
  updated_at: number
}

type WriterMockMessage = {
  id: string
  conversation_id: string
  query: string
  answer: string
  inputs: {
    contents: string
  }
  created_at: number
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

function mapConversation(row: WriterConversationRow): WriterMockConversation {
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

async function requireWriterConversation(userId: number, conversationId: string) {
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

export async function appendWriterMockConversation({
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
    const existingConversation = await requireWriterConversation(userId, targetConversationId)
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

  return { conversationId: targetConversationId }
}

export async function listWriterMockConversations(userId: number, limit: number) {
  await ensureWriterTables()

  const rows = await withDbRetry("list-writer-conversations", () =>
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
      .where(eq(writerConversations.userId, userId))
      .orderBy(desc(writerConversations.updatedAt), desc(writerConversations.id)),
  )

  const filteredRows = rows.filter((row) => row.title.startsWith(WRITER_TITLE_PREFIX)).slice(0, limit)
  const data = filteredRows.map((row) => mapConversation({ ...row, userId })) as WriterMockConversation[]

  return { data, has_more: rows.length > filteredRows.length, limit }
}

export async function listWriterMockMessages(userId: number, conversationId: string, limit: number) {
  await ensureWriterTables()

  const conversation = await requireWriterConversation(userId, conversationId)
  if (!conversation) {
    return { data: [] as WriterMockMessage[], limit, conversation: null }
  }

  const parsedConversationId = Number.parseInt(conversationId, 10)
  const rows = await withDbRetry("list-writer-messages", () =>
    db
      .select({
        id: writerMessages.id,
        role: writerMessages.role,
        content: writerMessages.content,
        createdAt: writerMessages.createdAt,
      })
      .from(writerMessages)
      .where(eq(writerMessages.conversationId, parsedConversationId))
      .orderBy(asc(writerMessages.createdAt), asc(writerMessages.id)),
  )

  const pairs: WriterMockMessage[] = []
  let currentUserMessage: { query: string; createdAt: Date | null } | null = null

  for (const row of rows) {
    if (row.role === "user") {
      currentUserMessage = { query: row.content, createdAt: row.createdAt ?? null }
      continue
    }

    if (!currentUserMessage) continue

    pairs.push({
      id: String(row.id),
      conversation_id: conversationId,
      query: currentUserMessage.query,
      answer: row.content,
      inputs: { contents: currentUserMessage.query },
      created_at: currentUserMessage.createdAt
        ? Math.floor(currentUserMessage.createdAt.getTime() / 1000)
        : Math.floor(Date.now() / 1000),
    })
    currentUserMessage = null
  }

  return {
    data: pairs.reverse().slice(0, limit),
    limit,
    has_more: pairs.length > limit,
    conversation: mapConversation(conversation),
  }
}

export async function renameWriterMockConversation(userId: number, conversationId: string, name: string) {
  await ensureWriterTables()

  const conversation = await requireWriterConversation(userId, conversationId)
  if (!conversation) {
    return false
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

  return true
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

  const conversation = await requireWriterConversation(userId, conversationId)
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

export async function updateWriterMockLatestAssistantMessage(
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

  const conversation = await requireWriterConversation(userId, conversationId)
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

export async function deleteWriterMockConversation(userId: number, conversationId: string) {
  await ensureWriterTables()

  const conversation = await requireWriterConversation(userId, conversationId)
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

function buildSseEvent(payload: Record<string, unknown>) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

export function createWriterMockStream({
  answer,
  conversationId,
  taskId,
}: {
  answer: string
  conversationId: string
  taskId: string
}) {
  const encoder = new TextEncoder()
  const splitIndex = Math.max(1, Math.floor(answer.length * 0.55))
  const chunks = [answer.slice(0, splitIndex), answer.slice(splitIndex)].filter(Boolean)

  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(
            buildSseEvent({
              event: "message",
              task_id: taskId,
              conversation_id: conversationId,
              answer: chunk,
            }),
          ),
        )
      }

      controller.enqueue(
        encoder.encode(
          buildSseEvent({
            event: "message_end",
            task_id: taskId,
            conversation_id: conversationId,
          }),
        ),
      )
      controller.close()
    },
  })
}
