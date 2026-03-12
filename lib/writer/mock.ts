import { and, asc, desc, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { writerConversations, writerMessages } from "@/lib/db/schema"
import { WRITER_PLATFORM_CONFIG, type WriterMode, type WriterPlatform } from "@/lib/writer/config"

const WRITER_TITLE_PREFIX = "[writer] "
const DB_RETRY_DELAYS_MS = [250, 750]

type WriterMockConversation = {
  id: string
  name: string
  status: string
  created_at: number
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
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `)

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
        createdAt: writerConversations.createdAt,
      })
      .from(writerConversations)
      .where(and(eq(writerConversations.id, parsedConversationId), eq(writerConversations.userId, userId)))
      .limit(1),
  )

  const row = rows[0]
  if (!row || !row.title.startsWith(WRITER_TITLE_PREFIX)) {
    return null
  }

  return row
}

function buildArticleDraft(query: string, platform: WriterPlatform) {
  const config = WRITER_PLATFORM_CONFIG[platform]

  return [
    `# ${config.shortLabel} 选题草稿：${query.slice(0, 24) || "高转化图文"}`,
    "",
    "![封面图](writer-asset://cover)",
    "",
    "## 摘要",
    `围绕“${query}”先给出结论，再拆解方法、案例与可执行动作，保证内容拿来就能继续编辑发布。`,
    "",
    "## 核心观点",
    "![章节配图](writer-asset://section-1)",
    `1. ${config.shortLabel} 更适合从鲜明观点切入，而不是先铺很长的背景。`,
    "2. 正文要让读者尽快拿到方法、案例和下一步动作。",
    "3. 配图要服务信息表达，而不是只做装饰。",
    "",
    "## 方法拆解",
    "![章节配图](writer-asset://section-2)",
    "先用一个强钩子定义问题，再给出 3 个可执行步骤，最后补充常见误区和行动建议。",
    "",
    "## 实操建议",
    "可以把正文拆成“问题判断 / 方法框架 / 真实案例 / 发布建议”四段，方便后续继续压缩或扩写。",
    "",
    "## 图片说明",
    `- 封面图：${config.shortLabel} 平台风格封面，主标题突出主题，比例 ${config.imageAspectRatio}。`,
    "- 配图 1：用信息图解释核心框架。",
    "- 配图 2：用案例卡片或对比图突出方法落地。",
    "",
    "## 发布建议",
    `发布前检查语气是否符合 ${config.shortLabel} 用户语境，并将图片占位符替换为已下载素材。`,
  ].join("\n")
}

function buildThreadDraft(query: string, platform: WriterPlatform) {
  const config = WRITER_PLATFORM_CONFIG[platform]

  return [
    `# ${config.shortLabel} 线程草稿：${query.slice(0, 24) || "高转化主题"}`,
    "",
    "![封面图](writer-asset://cover)",
    "",
    "## 发布建议",
    "- 开头一句必须是判断或反常识结论。",
    "- 每一段只讲一个重点，便于逐条发布。",
    "- 结尾补一个行动号召或提问，拉高互动。",
    "",
    "## 线程正文",
    "### 01",
    `大多数人写“${query}”时先堆信息，但真正有效的做法是先给出最强观点。`,
    "",
    "### 02",
    "读者愿意继续看，不是因为你写得长，而是因为每一段都让他更接近一个明确答案。",
    "",
    "### 03",
    "一个稳妥框架是：强钩子 -> 关键洞察 -> 例子 -> 方法 -> CTA。",
    "",
    "### 04",
    "如果要放图片，优先使用解释观点的图，而不是与正文关系弱的装饰图。",
    "",
    "### 05",
    "写完后删掉套话，把每一段压缩到能单独成立的程度，转发率通常会更高。",
    "",
    "### 06",
    `如果你愿意，我还可以继续把这套 ${config.shortLabel} 线程拆成更适合发布的最终版本。`,
    "",
    "## 图片说明",
    `- 封面图：${config.shortLabel} 线程封面，突出一个判断。`,
    "- 配图 1：观点拆解图。",
    "- 配图 2：案例对比图。",
  ].join("\n")
}

export function buildWriterMockDraft(query: string, platform: WriterPlatform, mode: WriterMode) {
  return mode === "thread" ? buildThreadDraft(query, platform) : buildArticleDraft(query, platform)
}

export async function appendWriterMockConversation({
  userId,
  conversationId,
  query,
  answer,
}: {
  userId: number
  conversationId?: string | null
  query: string
  answer: string
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
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: writerConversations.id }),
    )

    targetConversationId = String(createdConversation[0].id)
  } else {
    const existingConversationId = targetConversationId
    await withDbRetry("touch-writer-conversation", () =>
      db
        .update(writerConversations)
        .set({ updatedAt: new Date() })
        .where(eq(writerConversations.id, Number.parseInt(existingConversationId, 10))),
    )
  }

  const ensuredConversationId = targetConversationId ?? ""
  const parsedConversationId = Number.parseInt(ensuredConversationId, 10)
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

  return { conversationId: ensuredConversationId }
}

export async function listWriterMockConversations(userId: number, limit: number) {
  await ensureWriterTables()

  const rows = await withDbRetry("list-writer-conversations", () =>
    db
      .select({
        id: writerConversations.id,
        title: writerConversations.title,
        createdAt: writerConversations.createdAt,
      })
      .from(writerConversations)
      .where(eq(writerConversations.userId, userId))
      .orderBy(desc(writerConversations.updatedAt), desc(writerConversations.id)),
  )

  const filteredRows = rows.filter((row) => row.title.startsWith(WRITER_TITLE_PREFIX)).slice(0, limit)
  const data: WriterMockConversation[] = filteredRows.map((row) => ({
    id: String(row.id),
    name: normalizeTitle(row.title),
    status: "completed",
    created_at: row.createdAt ? Math.floor(row.createdAt.getTime() / 1000) : Math.floor(Date.now() / 1000),
  }))

  return { data, has_more: rows.length > filteredRows.length, limit }
}

export async function listWriterMockMessages(userId: number, conversationId: string, limit: number) {
  await ensureWriterTables()

  const conversation = await requireWriterConversation(userId, conversationId)
  if (!conversation) {
    return { data: [] as WriterMockMessage[], limit }
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
  let currentUserMessage:
    | {
        id: number
        query: string
        createdAt: Date | null
      }
    | null = null

  for (const row of rows) {
    if (row.role === "user") {
      currentUserMessage = {
        id: row.id,
        query: row.content,
        createdAt: row.createdAt ?? null,
      }
      continue
    }

    if (!currentUserMessage) {
      continue
    }

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

  return { data: pairs.reverse().slice(0, limit), limit, has_more: pairs.length > limit }
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
