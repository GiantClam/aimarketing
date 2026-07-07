import { and, desc, eq, lt, sql } from "drizzle-orm"

import {
  applyAiEntryConversationStateDelta,
  createEmptyAiEntryConversationState,
  mergeAiEntryConversationState,
  type AiEntryConversationState,
} from "@/lib/ai-entry/conversation-state"
import { db } from "@/lib/db"
import { createRetryableDbErrorMatcher, withDbRetry } from "@/lib/db/retry"
import { conversations, messages } from "@/lib/db/schema"
import {
  pickPreferredDisplayModelId,
  stripProviderPrefix,
} from "@/lib/ai-entry/model-id-registry"
import {
  parseAiEntryModelSelection,
  serializeAiEntryModelSelection,
} from "@/lib/ai-entry/model-selection"
import { extractQueuedPptBackgroundTaskContext } from "@/lib/ai-entry/ppt-tool-result-message"

const AI_ENTRY_CHAT_TITLE_PREFIX = "[ai-entry] "
const AI_ENTRY_CONSULTING_TITLE_PREFIX = "[ai-consulting] "
const AI_ENTRY_AGENT_PREFIX = "[agent:"
const AI_ENTRY_DEFAULT_TITLE = "New chat"
const AI_ENTRY_AUTO_TITLE_MAX_LENGTH = 60
const DB_RETRY_DELAYS_MS = [250, 750]

export type AiEntryConversationScope = "chat" | "consulting"

type AiEntryConversationRow = {
  id: number
  title: string
  currentModelId?: string | null
  metadata?: Record<string, unknown> | null
  createdAt?: Date | string | number | null
  latestMessageCreatedAt?: Date | string | number | null
}

type AiEntryMessageRow = {
  id: number
  role: string
  content: string
  knowledge_source?: string | null
  createdAt?: Date | string | number | null
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
  conversation_state: AiEntryConversationState
  pending_task: AiEntryPendingTaskSummary | null
}

export type AiEntryPendingTaskSummary = {
  task_id: string
  status: "pending" | "running" | "success" | "failed"
  task_type: string | null
  conversation_id: string | null
  agent_id: string | null
  created_at: number
}

function normalizeConversationMetadata(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null
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

function safeParseRecord(value: unknown) {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

async function findAiEntryPendingTaskSummary(input: {
  userId: number
  conversationId: string
  agentId?: string | null
}): Promise<AiEntryPendingTaskSummary | null> {
  const result = await withAiEntryDbRetry("find-ai-entry-pending-task-summary", () =>
    db.execute(sql`
      SELECT
        id,
        status,
        payload,
        created_at as "createdAt"
      FROM "AI_MARKETING_tasks"
      WHERE user_id = ${input.userId}
        AND workflow_name = 'ai_entry_ppt_preview'
        AND status IN ('pending', 'running')
        AND payload IS NOT NULL
        AND payload::jsonb ->> 'kind' = 'ai_entry_ppt_preview'
        AND payload::jsonb ->> 'conversationId' = ${input.conversationId}
        ${input.agentId
          ? sql`AND payload::jsonb ->> 'agentId' = ${input.agentId}`
          : sql``}
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `),
  )
  const fallbackResult =
    result.rows.length === 0 && input.agentId
      ? await withAiEntryDbRetry("find-ai-entry-pending-task-summary-fallback", () =>
          db.execute(sql`
            SELECT
              id,
              status,
              payload,
              created_at as "createdAt"
            FROM "AI_MARKETING_tasks"
            WHERE user_id = ${input.userId}
              AND workflow_name = 'ai_entry_ppt_preview'
              AND status IN ('pending', 'running')
              AND payload IS NOT NULL
              AND payload::jsonb ->> 'kind' = 'ai_entry_ppt_preview'
              AND payload::jsonb ->> 'conversationId' = ${input.conversationId}
            ORDER BY created_at DESC, id DESC
            LIMIT 1
          `),
        )
      : null

  const row = ((fallbackResult?.rows.length ? fallbackResult.rows : result.rows) as Array<{
    id?: unknown
    status?: unknown
    payload?: unknown
    createdAt?: Date | string | number | null
  } | null>)[0]
  if (!row) return null

  const taskId = parsePositiveInt(
    typeof row.id === "string" || typeof row.id === "number" ? row.id : null,
  )
  const status: AiEntryPendingTaskSummary["status"] | null =
    row.status === "pending" || row.status === "running" ? row.status : null
  if (!taskId || !status) return null

  const payloadRecord =
    typeof row.payload === "string" && row.payload.trim()
      ? (() => {
          try {
            return safeParseRecord(JSON.parse(row.payload))
          } catch {
            return null
          }
        })()
      : safeParseRecord(row.payload)

  return {
    task_id: String(taskId),
    status,
    task_type: "preview_ppt_deck",
    conversation_id:
      typeof payloadRecord?.conversationId === "string" && payloadRecord.conversationId.trim()
        ? payloadRecord.conversationId.trim()
        : input.conversationId,
    agent_id:
      typeof payloadRecord?.agentId === "string" && payloadRecord.agentId.trim()
        ? payloadRecord.agentId.trim()
        : input.agentId || null,
    created_at: toEpochSeconds(row.createdAt),
  }
}

async function findAiEntryRecoverableTaskSummary(input: {
  userId: number
  conversationId: string
  agentId?: string | null
  messages: AiEntryMessageRecord[]
}) {
  const latestQueuedContext = [...input.messages]
    .reverse()
    .map((message) =>
      message.role === "assistant"
        ? extractQueuedPptBackgroundTaskContext(message.content)
        : null,
    )
    .find((context): context is NonNullable<typeof context> => Boolean(context))

  const taskId = parsePositiveInt(latestQueuedContext?.taskId)
  if (!taskId) return null

  const result = await withAiEntryDbRetry("find-ai-entry-recoverable-task-summary", () =>
    db.execute(sql`
      SELECT
        id,
        status,
        payload,
        created_at as "createdAt"
      FROM "AI_MARKETING_tasks"
      WHERE id = ${taskId}
        AND user_id = ${input.userId}
        AND workflow_name = 'ai_entry_ppt_preview'
        AND payload IS NOT NULL
        AND payload::jsonb ->> 'kind' = 'ai_entry_ppt_preview'
        AND payload::jsonb ->> 'conversationId' = ${input.conversationId}
        ${input.agentId
          ? sql`AND payload::jsonb ->> 'agentId' = ${input.agentId}`
          : sql``}
      LIMIT 1
    `),
  )
  const fallbackResult =
    result.rows.length === 0 && input.agentId
      ? await withAiEntryDbRetry("find-ai-entry-recoverable-task-summary-fallback", () =>
          db.execute(sql`
            SELECT
              id,
              status,
              payload,
              created_at as "createdAt"
            FROM "AI_MARKETING_tasks"
            WHERE id = ${taskId}
              AND user_id = ${input.userId}
              AND workflow_name = 'ai_entry_ppt_preview'
              AND payload IS NOT NULL
              AND payload::jsonb ->> 'kind' = 'ai_entry_ppt_preview'
              AND payload::jsonb ->> 'conversationId' = ${input.conversationId}
            LIMIT 1
          `),
        )
      : null

  const row = ((fallbackResult?.rows.length ? fallbackResult.rows : result.rows) as Array<{
    id?: unknown
    status?: unknown
    payload?: unknown
    createdAt?: Date | string | number | null
  } | null>)[0]
  if (!row) return null

  const resolvedTaskId = parsePositiveInt(
    typeof row.id === "string" || typeof row.id === "number" ? row.id : null,
  )
  const status: AiEntryPendingTaskSummary["status"] | null =
    row.status === "pending" ||
    row.status === "running" ||
    row.status === "success" ||
    row.status === "failed"
      ? row.status
      : null
  if (!resolvedTaskId || !status) return null

  const payloadRecord =
    typeof row.payload === "string" && row.payload.trim()
      ? (() => {
          try {
            return safeParseRecord(JSON.parse(row.payload))
          } catch {
            return null
          }
        })()
      : safeParseRecord(row.payload)

  return {
    task_id: String(resolvedTaskId),
    status,
    task_type: "preview_ppt_deck",
    conversation_id:
      typeof payloadRecord?.conversationId === "string" && payloadRecord.conversationId.trim()
        ? payloadRecord.conversationId.trim()
        : input.conversationId,
    agent_id:
      typeof payloadRecord?.agentId === "string" && payloadRecord.agentId.trim()
        ? payloadRecord.agentId.trim()
        : input.agentId || null,
    created_at: toEpochSeconds(row.createdAt),
  }
}

function stripTitlePrefix(title: string) {
  let normalized = title
  if (title.startsWith(AI_ENTRY_CHAT_TITLE_PREFIX)) {
    normalized = title.slice(AI_ENTRY_CHAT_TITLE_PREFIX.length)
  } else if (title.startsWith(AI_ENTRY_CONSULTING_TITLE_PREFIX)) {
    normalized = title.slice(AI_ENTRY_CONSULTING_TITLE_PREFIX.length)
  }
  if (normalized.startsWith(AI_ENTRY_AGENT_PREFIX)) {
    const closingIndex = normalized.indexOf("] ")
    if (closingIndex >= 0) {
      normalized = normalized.slice(closingIndex + 2)
    }
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
  if (!normalized) return null
  const selection = parseAiEntryModelSelection(normalized)
  if (selection) {
    return (
      serializeAiEntryModelSelection({
        providerId: selection.providerId,
        modelId: selection.modelId,
      }) || normalized
    )
  }
  const canonical = pickPreferredDisplayModelId([
    normalized,
    stripProviderPrefix(normalized),
  ])
  return canonical || normalized
}

function normalizeAgentId(agentId: string | null | undefined) {
  const normalized = typeof agentId === "string" ? agentId.trim() : ""
  return normalized || null
}

function getScopeTitlePrefix(scope: AiEntryConversationScope) {
  return scope === "consulting"
    ? AI_ENTRY_CONSULTING_TITLE_PREFIX
    : AI_ENTRY_CHAT_TITLE_PREFIX
}

export function getAiEntryConversationTitleFilters(
  scope: AiEntryConversationScope,
  agentId?: string | null,
) {
  const scopePrefix = getScopeTitlePrefix(scope)
  const normalizedAgentId = normalizeAgentId(agentId)

  if (!normalizedAgentId) {
    return {
      titlePrefix: scopePrefix,
      excludeAgentPrefix: `${scopePrefix}${AI_ENTRY_AGENT_PREFIX}`,
    }
  }

  return {
    titlePrefix: `${scopePrefix}${AI_ENTRY_AGENT_PREFIX}${normalizedAgentId}] `,
    excludeAgentPrefix: null,
  }
}

function getTitlePrefix(
  scope: AiEntryConversationScope,
  agentId?: string | null,
) {
  return getAiEntryConversationTitleFilters(scope, agentId).titlePrefix
}

function buildConversationTitle(
  name: string | null | undefined,
  scope: AiEntryConversationScope,
  agentId?: string | null,
) {
  return `${getTitlePrefix(scope, agentId)}${normalizeConversationName(name)}`
}

function buildConversationTitleFromPrompt(
  prompt: string,
  scope: AiEntryConversationScope,
  agentId?: string | null,
) {
  const normalizedPrompt = prompt
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, AI_ENTRY_AUTO_TITLE_MAX_LENGTH)
  return buildConversationTitle(
    normalizedPrompt || AI_ENTRY_DEFAULT_TITLE,
    scope,
    agentId,
  )
}

export function resolveAiEntryConversationTitleUpdate(input: {
  currentTitle: string
  userPrompt: string
  existingMessageCount: number
  scope: AiEntryConversationScope
  agentId?: string | null
}) {
  const shouldRetitle =
    input.existingMessageCount === 0 ||
    isGenericConversationTitle(input.currentTitle)

  if (!shouldRetitle) return null

  return buildConversationTitleFromPrompt(
    input.userPrompt,
    input.scope,
    input.agentId,
  )
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
    latestMessageCreatedAt?: Date | string | number | null | undefined
  },
): AiEntryConversationSummary {
  const createdAt = toEpochSeconds(row.createdAt)
  const updatedAt = toEpochSeconds(row.updatedAt ?? row.latestMessageCreatedAt ?? row.createdAt)
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
  agentId?: string | null,
) {
  const parsedConversationId = parsePositiveInt(conversationId)
  if (!parsedConversationId) return null
  const { titlePrefix, excludeAgentPrefix } = getAiEntryConversationTitleFilters(scope, agentId)
  const scopeTitlePrefix = getScopeTitlePrefix(scope)

  const rows = await withAiEntryDbRetry("get-ai-entry-conversation", () =>
    db
      .select({
        id: conversations.id,
        title: conversations.title,
        currentModelId: conversations.currentModelId,
        metadata: conversations.metadata,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, parsedConversationId),
          eq(conversations.userId, userId),
          sql`${conversations.title} LIKE ${`${titlePrefix}%`}`,
          excludeAgentPrefix
            ? sql`${conversations.title} NOT LIKE ${`${excludeAgentPrefix}%`}`
            : undefined,
        ),
      )
      .limit(1),
  )

  const row = rows[0] as AiEntryConversationRow | undefined
  if (row) return row

  // Direct conversation opens should not lose history just because the current
  // route agent differs from the title prefix used when the conversation was created.
  const fallbackRows = await withAiEntryDbRetry("get-ai-entry-conversation-fallback", () =>
    db
      .select({
        id: conversations.id,
        title: conversations.title,
        currentModelId: conversations.currentModelId,
        metadata: conversations.metadata,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, parsedConversationId),
          eq(conversations.userId, userId),
          sql`${conversations.title} LIKE ${`${scopeTitlePrefix}%`}`,
        ),
      )
      .limit(1),
  )

  return (fallbackRows[0] as AiEntryConversationRow | undefined) || null
}

export async function createAiEntryConversation(
  userId: number,
  title?: string | null,
  currentModelId?: string | null,
  scope: AiEntryConversationScope = "chat",
  agentId?: string | null,
) {
  const normalizedModelId = normalizeModelId(currentModelId)
  const rows = await withAiEntryDbRetry("create-ai-entry-conversation", () =>
    db
      .insert(conversations)
      .values({
        userId,
        title: buildConversationTitle(
          title || AI_ENTRY_DEFAULT_TITLE,
          scope,
          agentId,
        ),
        currentModelId: normalizedModelId,
        metadata: {
          aiEntryConversationState: createEmptyAiEntryConversationState(),
        },
      })
      .returning({
        id: conversations.id,
        title: conversations.title,
        currentModelId: conversations.currentModelId,
        metadata: conversations.metadata,
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
  agentId?: string | null,
) {
  const { titlePrefix, excludeAgentPrefix } = getAiEntryConversationTitleFilters(scope, agentId)
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
          excludeAgentPrefix
            ? sql`${conversations.title} NOT LIKE ${`${excludeAgentPrefix}%`}`
            : undefined,
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
  agentId?: string | null,
) {
  const normalizedModelId = normalizeModelId(currentModelId)
  const existing = await getAiEntryConversation(userId, conversationId, scope, agentId)
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
    agentId,
  )
}

export async function listAiEntryConversations(
  userId: number,
  limit: number,
  cursor?: string | null,
  scope: AiEntryConversationScope = "chat",
  agentId?: string | null,
): Promise<AiEntryConversationPage> {
  const safeLimit = Math.max(1, Math.min(limit, 50))
  const parsedCursor = parseCursor(cursor)
  const { titlePrefix, excludeAgentPrefix } = getAiEntryConversationTitleFilters(scope, agentId)

  const rows = await withAiEntryDbRetry("list-ai-entry-conversations", () =>
    db
      .select({
        id: conversations.id,
        title: conversations.title,
        currentModelId: conversations.currentModelId,
        metadata: conversations.metadata,
        createdAt: conversations.createdAt,
        latestMessageCreatedAt: sql<Date | null>`max(${messages.createdAt})`,
      })
      .from(conversations)
      .leftJoin(messages, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.userId, userId),
          sql`${conversations.title} LIKE ${`${titlePrefix}%`}`,
          excludeAgentPrefix
            ? sql`${conversations.title} NOT LIKE ${`${excludeAgentPrefix}%`}`
            : undefined,
          parsedCursor ? lt(conversations.id, parsedCursor) : undefined,
        ),
      )
      .groupBy(
        conversations.id,
        conversations.title,
        conversations.currentModelId,
        conversations.createdAt,
      )
      .orderBy(desc(sql`coalesce(max(${messages.createdAt}), ${conversations.createdAt})`), desc(conversations.id))
      .limit(safeLimit + 1),
  )

  const pageRows = rows.slice(0, safeLimit)
  const data = pageRows.map((row) =>
    mapConversationSummary({
      id: row.id,
      title: row.title,
      currentModelId: row.currentModelId,
      createdAt: row.createdAt || null,
      latestMessageCreatedAt: row.latestMessageCreatedAt || null,
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
  agentId?: string | null,
) {
  const conversation = await getAiEntryConversation(userId, conversationId, scope, agentId)
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
  agentId?: string | null,
) {
  const conversation = await getAiEntryConversation(userId, conversationId, scope, agentId)
  if (!conversation) {
    return null
  }

  const normalizedName = normalizeConversationName(name)

  await withAiEntryDbRetry("rename-ai-entry-conversation", () =>
    db
      .update(conversations)
      .set({
        title: buildConversationTitle(normalizedName, scope, agentId),
      })
      .where(eq(conversations.id, conversation.id)),
  )

  const updatedConversation = await getAiEntryConversation(
    userId,
    conversationId,
    scope,
    agentId,
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
  agentId?: string | null
}) {
  const userResult = await appendAiEntryMessage({
    userId: params.userId,
    conversationId: params.conversationId,
    role: "user",
    content: params.userPrompt,
    scope: params.scope,
    agentId: params.agentId,
  })

  await appendAiEntryMessage({
    userId: params.userId,
    conversationId: params.conversationId,
    role: "assistant",
    content: params.assistantMessage,
    scope: params.scope,
    agentId: params.agentId,
  })

  return userResult
}

export async function appendAiEntryMessage(params: {
  userId: number
  conversationId: string | number | null | undefined
  role: "user" | "assistant"
  content: string
  scope?: AiEntryConversationScope
  agentId?: string | null
}) {
  const scope = params.scope || "chat"
  const conversation = await getAiEntryConversation(
    params.userId,
    params.conversationId,
    scope,
    params.agentId,
  )
  if (!conversation) {
    return null
  }

  const normalizedContent = params.content.trim()
  if (!normalizedContent) {
    return mapConversationSummary({
      id: conversation.id,
      title: conversation.title,
      currentModelId: conversation.currentModelId,
      createdAt: conversation.createdAt,
    })
  }

  let nextTitle = conversation.title

  if (params.role === "user") {
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
    nextTitle =
      resolveAiEntryConversationTitleUpdate({
        currentTitle: conversation.title,
        userPrompt: normalizedContent,
        existingMessageCount,
        scope,
        agentId: params.agentId,
      }) || conversation.title
  }

  if (nextTitle !== conversation.title) {
    await withAiEntryDbRetry("retitle-ai-entry-conversation", () =>
      db
        .update(conversations)
          .set({
            title: nextTitle,
          })
        .where(eq(conversations.id, conversation.id)),
    )
  }

  await withAiEntryDbRetry(`insert-ai-entry-message:${params.role}`, () =>
    db.execute(sql`
      INSERT INTO ${messages} ("conversation_id", "role", "content")
      VALUES (${conversation.id}, ${params.role}, ${normalizedContent})
    `),
  )

  const previousState = normalizeConversationMetadata(conversation.metadata)?.aiEntryConversationState
  const nextConversationState = applyAiEntryConversationStateDelta({
    previousState,
    messageContent: normalizedContent,
  })
  const nextMetadata = {
    ...(normalizeConversationMetadata(conversation.metadata) || {}),
    aiEntryConversationState: nextConversationState,
  }

  await withAiEntryDbRetry("update-ai-entry-conversation-metadata", () =>
    db
      .update(conversations)
      .set({
        metadata: nextMetadata,
      })
      .where(eq(conversations.id, conversation.id)),
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
  agentId?: string | null,
): Promise<AiEntryMessagePage | null> {
  const conversation = await getAiEntryConversation(userId, conversationId, scope, agentId)
  if (!conversation) return null

  const safeLimit = Math.max(1, Math.min(limit, 500))
  const result = await withAiEntryDbRetry("list-ai-entry-messages", () =>
    db.execute(sql`
      SELECT
        m.id,
        m.role,
        m.content,
        m.created_at as "createdAt"
      FROM "AI_MARKETING_messages" m
      WHERE m.conversation_id = ${conversation.id}
      ORDER BY m.created_at ASC, m.id ASC
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
      created_at: toEpochSeconds(row.createdAt),
    }))
  const conversationState = mergeAiEntryConversationState({
    storedState: normalizeConversationMetadata(conversation.metadata)?.aiEntryConversationState,
    messageContents: data.map((message) => message.content),
  })
  let pendingTask = await findAiEntryPendingTaskSummary({
    userId,
    conversationId: String(conversation.id),
    agentId,
  })
  if (
    !pendingTask &&
    conversationState.ppt.phase !== "preview-ready" &&
    conversationState.ppt.phase !== "exported"
  ) {
    pendingTask = await findAiEntryRecoverableTaskSummary({
      userId,
      conversationId: String(conversation.id),
      agentId,
      messages: data,
    })
  }

  return {
    data,
    limit: safeLimit,
    has_more: false,
    conversation_state: conversationState,
    pending_task: pendingTask,
    conversation: mapConversationSummary({
      id: conversation.id,
      title: conversation.title,
      currentModelId: conversation.currentModelId,
      createdAt: conversation.createdAt,
    }),
  }
}
