import { and, desc, eq, lt, sql } from "drizzle-orm"

import {
  applyAiEntryConversationStateDelta,
  appendAiEntryRuntimeArtifactContext,
  createEmptyAiEntryConversationState,
  mergeAiEntryConversationState,
  setAiEntryRuntimeProjectSnapshot,
  type AiEntryConversationState,
} from "@/lib/ai-entry/conversation-state"
import type { RuntimeProjectSnapshot } from "@/lib/ai-runtime/contracts"
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
import {
  parseAiEntryTaskRunSummary,
  type AiEntryTaskRunSummary,
} from "@/lib/ai-entry/task-runs"

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
  last_message_at: number | null
  last_task_event_at: number | null
  has_unread: boolean
  unread_count: number
  has_running_ppt_task: boolean
  running_ppt_task_count: number
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
  task_runs: AiEntryTaskRunSummary[]
  pending_task: AiEntryPendingTaskSummary | null
}

export type AiEntryPendingTaskSummary = AiEntryTaskRunSummary

function normalizeConversationMetadata(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

function getAiEntryLastReadAssistantMessageId(metadata: unknown) {
  const normalized = normalizeConversationMetadata(metadata)
  const unreadState = normalizeConversationMetadata(normalized?.aiEntryUnreadState)
  return parsePositiveInt(unreadState?.lastReadAssistantMessageId) || null
}

function withAiEntryLastReadAssistantMessageId(metadata: unknown, lastReadAssistantMessageId: number) {
  const normalized = normalizeConversationMetadata(metadata) || {}
  const unreadState = normalizeConversationMetadata(normalized.aiEntryUnreadState) || {}
  return {
    ...normalized,
    aiEntryUnreadState: {
      ...unreadState,
      lastReadAssistantMessageId,
    },
  }
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

function parsePositiveInt(value: unknown) {
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
        result,
        created_at as "createdAt",
        updated_at as "updatedAt",
        started_at as "startedAt"
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
              result,
              created_at as "createdAt",
              updated_at as "updatedAt",
              started_at as "startedAt"
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
    result?: unknown
    createdAt?: Date | string | number | null
    updatedAt?: Date | string | number | null
    startedAt?: Date | string | number | null
  } | null>)[0]
  const summary = row
    ? parseAiEntryTaskRunSummary({
        id: row.id,
        status: row.status,
        payload: row.payload,
        result: row.result,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        startedAt: row.startedAt,
      })
    : null
  if (summary && (summary.status === "pending" || summary.status === "running")) return summary

  try {
    const runtimeResult = await withAiEntryDbRetry("find-ai-entry-pending-opencode-task-summary", () =>
      db.execute(sql`
        SELECT id, status, input_payload as "inputPayload", normalized_result as "normalizedResult",
          created_at as "createdAt", updated_at as "updatedAt", started_at as "startedAt", finished_at as "finishedAt"
        FROM "AI_MARKETING_platform_task_runs"
        WHERE user_id = ${input.userId} AND item_type = 'ai_entry_opencode'
          AND status IN ('queued', 'running')
          AND input_payload::jsonb ->> 'conversationId' = ${input.conversationId}
          ${input.agentId ? sql`AND input_payload::jsonb ->> 'agentId' = ${input.agentId}` : sql``}
        ORDER BY created_at DESC, id DESC LIMIT 1
      `),
    )
    const row = (runtimeResult.rows || [])[0] as Record<string, unknown> | undefined
    if (!row) return null
    return parseAiEntryTaskRunSummary({
      id: row.id,
      status: row.status,
      payload: { kind: "opencode_runtime", ...(row.inputPayload as Record<string, unknown> || {}), input: row.inputPayload || null },
      result: row.normalizedResult,
      createdAt: row.createdAt as Date | string | number | null,
      updatedAt: row.updatedAt as Date | string | number | null,
      startedAt: row.startedAt as Date | string | number | null,
      finishedAt: row.finishedAt as Date | string | number | null,
    })
  } catch (error) {
    console.warn("ai-entry.opencode.pending-task.lookup.failed", { message: error instanceof Error ? error.message : String(error) })
    return null
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
        result,
        created_at as "createdAt",
        updated_at as "updatedAt",
        started_at as "startedAt"
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
              result,
              created_at as "createdAt",
              updated_at as "updatedAt",
              started_at as "startedAt"
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
    result?: unknown
    createdAt?: Date | string | number | null
    updatedAt?: Date | string | number | null
    startedAt?: Date | string | number | null
  } | null>)[0]

  return row
    ? parseAiEntryTaskRunSummary({
        id: row.id,
        status: row.status,
        payload: row.payload,
        result: row.result,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        startedAt: row.startedAt,
      })
    : null
}

async function listAiEntryTaskRunSummaries(input: {
  userId: number
  conversationId: string
  agentId?: string | null
  limit?: number
}) {
  const safeLimit = Math.max(1, Math.min(input.limit || 10, 20))
  const result = await withAiEntryDbRetry("list-ai-entry-task-run-summaries", () =>
    db.execute(sql`
      SELECT
        id,
        status,
        payload,
        result,
        created_at as "createdAt",
        updated_at as "updatedAt",
        started_at as "startedAt"
      FROM "AI_MARKETING_tasks"
      WHERE user_id = ${input.userId}
        AND workflow_name = 'ai_entry_ppt_preview'
        AND payload IS NOT NULL
        AND payload::jsonb ->> 'kind' = 'ai_entry_ppt_preview'
        AND payload::jsonb ->> 'conversationId' = ${input.conversationId}
        ${input.agentId
          ? sql`AND payload::jsonb ->> 'agentId' = ${input.agentId}`
          : sql``}
      ORDER BY created_at DESC, id DESC
      LIMIT ${safeLimit}
    `),
  )

  const legacy = ((result.rows || []) as Array<{
    id?: unknown
    status?: unknown
    payload?: unknown
    result?: unknown
    createdAt?: Date | string | number | null
    updatedAt?: Date | string | number | null
    startedAt?: Date | string | number | null
  }>)
    .map((row) =>
      parseAiEntryTaskRunSummary({
        id: row.id,
        status: row.status,
        payload: row.payload,
        result: row.result,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        startedAt: row.startedAt,
      }),
    )
    .filter((item): item is AiEntryTaskRunSummary => Boolean(item))

  let runtime: AiEntryTaskRunSummary[] = []
  try {
    if (legacy.length === 0) {
    const runtimeResult = await withAiEntryDbRetry("list-ai-entry-opencode-task-run-summaries", () =>
      db.execute(sql`
        SELECT id, status, input_payload as "inputPayload", normalized_result as "normalizedResult",
          created_at as "createdAt", updated_at as "updatedAt", started_at as "startedAt", finished_at as "finishedAt"
        FROM "AI_MARKETING_platform_task_runs"
        WHERE user_id = ${input.userId}
          AND item_type = 'ai_entry_opencode'
          AND input_payload::jsonb ->> 'conversationId' = ${input.conversationId}
          ${input.agentId ? sql`AND input_payload::jsonb ->> 'agentId' = ${input.agentId}` : sql``}
        ORDER BY created_at DESC, id DESC LIMIT ${safeLimit}
      `),
    )
    runtime = ((runtimeResult.rows || []) as Array<Record<string, unknown>>)
      .map((row) => parseAiEntryTaskRunSummary({
        id: row.id,
        status: row.status,
        payload: { kind: "opencode_runtime", ...(row.inputPayload as Record<string, unknown> || {}), input: row.inputPayload || null },
        result: row.normalizedResult,
        createdAt: row.createdAt as Date | string | number | null,
        updatedAt: row.updatedAt as Date | string | number | null,
        startedAt: row.startedAt as Date | string | number | null,
        finishedAt: row.finishedAt as Date | string | number | null,
      }))
      .filter((item): item is AiEntryTaskRunSummary => Boolean(item))
    }
  } catch (error) {
    console.warn("ai-entry.opencode.task-runs.lookup.failed", { message: error instanceof Error ? error.message : String(error) })
  }

  return [...legacy, ...runtime]
    .sort((left, right) => right.updated_at - left.updated_at)
    .slice(0, safeLimit)
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
    metadata?: Record<string, unknown> | null
    createdAt: Date | string | number | null | undefined
    updatedAt?: Date | string | number | null | undefined
    latestMessageCreatedAt?: Date | string | number | null | undefined
  },
  decorations?: {
    assistantMessageIds?: number[]
    runningTaskCount?: number
    lastTaskEventAt?: Date | string | number | null | undefined
  },
): AiEntryConversationSummary {
  const createdAt = toEpochSeconds(row.createdAt)
  const lastMessageAt = row.latestMessageCreatedAt
    ? toEpochSeconds(row.latestMessageCreatedAt)
    : null
  const updatedAt = toEpochSeconds(row.updatedAt ?? row.latestMessageCreatedAt ?? row.createdAt)
  const assistantMessageIds = decorations?.assistantMessageIds || []
  const latestAssistantMessageId = assistantMessageIds.at(-1) || null
  const lastReadAssistantMessageId = getAiEntryLastReadAssistantMessageId(row.metadata)
  const unreadCount = assistantMessageIds.filter(
    (messageId) => !lastReadAssistantMessageId || messageId > lastReadAssistantMessageId,
  )
    .length
  const hasUnread = Boolean(
    latestAssistantMessageId &&
    unreadCount > 0,
  )
  const runningTaskCount = Math.max(0, decorations?.runningTaskCount || 0)
  const lastTaskEventAt = decorations?.lastTaskEventAt
    ? toEpochSeconds(decorations.lastTaskEventAt)
    : null
  return {
    id: String(row.id),
    name: stripTitlePrefix(row.title),
    status: "normal",
    created_at: createdAt,
    updated_at: updatedAt,
    current_model_id: normalizeModelId(row.currentModelId),
    last_message_at: lastMessageAt,
    last_task_event_at: lastTaskEventAt,
    has_unread: hasUnread,
    unread_count: unreadCount,
    has_running_ppt_task: runningTaskCount > 0,
    running_ppt_task_count: runningTaskCount,
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
        conversations.metadata,
        conversations.createdAt,
      )
      .orderBy(desc(sql`coalesce(max(${messages.createdAt}), ${conversations.createdAt})`), desc(conversations.id))
      .limit(safeLimit + 1),
  )

  const pageRows = rows.slice(0, safeLimit)
  const conversationIds = pageRows
    .map((row) => parsePositiveInt(row.id))
    .filter((id): id is number => Boolean(id))
  const conversationIdSql =
    conversationIds.length > 0
      ? sql.join(conversationIds.map((id) => sql`${id}`), sql`,`)
      : null
  const assistantMessageRows =
    conversationIdSql
      ? await withAiEntryDbRetry("list-ai-entry-conversations-assistant-messages", () =>
          db.execute(sql`
            SELECT
              conversation_id as "conversationId",
              id as "assistantMessageId"
            FROM "AI_MARKETING_messages"
            WHERE role = 'assistant'
              AND conversation_id IN (${conversationIdSql})
            ORDER BY conversation_id ASC, id ASC
          `),
        )
      : { rows: [] as unknown[] }
  const taskSummaryRows =
    conversationIdSql
      ? await withAiEntryDbRetry("list-ai-entry-conversations-task-summary", () =>
          db.execute(sql`
            SELECT
              payload::jsonb ->> 'conversationId' as "conversationId",
              count(*) FILTER (WHERE status IN ('pending', 'running')) as "runningTaskCount",
              max(updated_at) as "lastTaskEventAt"
            FROM "AI_MARKETING_tasks"
            WHERE user_id = ${userId}
              AND workflow_name = 'ai_entry_ppt_preview'
              AND payload IS NOT NULL
              AND payload::jsonb ->> 'kind' = 'ai_entry_ppt_preview'
              AND payload::jsonb ->> 'conversationId' IN (${conversationIdSql})
            GROUP BY payload::jsonb ->> 'conversationId'
          `),
        )
      : { rows: [] as unknown[] }

  const assistantMessageIdsByConversationId = new Map<string, number[]>()
  for (const row of assistantMessageRows.rows as Array<{ conversationId?: unknown; assistantMessageId?: unknown }>) {
    const conversationId = parsePositiveInt(row.conversationId)
    const assistantMessageId = parsePositiveInt(row.assistantMessageId)
    if (!conversationId || !assistantMessageId) continue
    const key = String(conversationId)
    const current = assistantMessageIdsByConversationId.get(key) || []
    current.push(assistantMessageId)
    assistantMessageIdsByConversationId.set(key, current)
  }

  const runningTaskCountMap = new Map<string, number>()
  const lastTaskEventAtMap = new Map<string, Date | string | number | null>()
  for (const row of taskSummaryRows.rows as Array<{ conversationId?: unknown; runningTaskCount?: unknown; lastTaskEventAt?: Date | string | number | null }>) {
    const conversationId = parsePositiveInt(row.conversationId)
    const runningTaskCount = parsePositiveInt(row.runningTaskCount) || 0
    if (!conversationId) continue
    const key = String(conversationId)
    runningTaskCountMap.set(key, runningTaskCount)
    lastTaskEventAtMap.set(key, row.lastTaskEventAt || null)
  }

  const data = pageRows.map((row) =>
    mapConversationSummary(
      {
        id: row.id,
        title: row.title,
        currentModelId: row.currentModelId,
        metadata: row.metadata,
        createdAt: row.createdAt || null,
        latestMessageCreatedAt: row.latestMessageCreatedAt || null,
      },
      {
        assistantMessageIds: assistantMessageIdsByConversationId.get(String(row.id)) || [],
        runningTaskCount: runningTaskCountMap.get(String(row.id)) || 0,
        lastTaskEventAt: lastTaskEventAtMap.get(String(row.id)) || null,
      },
    ),
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
  idempotencyKey?: string | null
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
  const idempotencyKey = typeof params.idempotencyKey === "string" && params.idempotencyKey.trim()
    ? params.idempotencyKey.trim().slice(0, 255)
    : null
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
      INSERT INTO ${messages} ("conversation_id", "role", "content", "idempotency_key")
      VALUES (${conversation.id}, ${params.role}, ${normalizedContent}, ${idempotencyKey})
      ON CONFLICT DO NOTHING
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
  const taskRuns = await listAiEntryTaskRunSummaries({
    userId,
    conversationId: String(conversation.id),
    agentId,
    limit: 10,
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

  const latestAssistantMessageId = [...data]
    .reverse()
    .map((message) => (message.role === "assistant" ? parsePositiveInt(message.id) : null))
    .find((messageId): messageId is number => Boolean(messageId))
  const lastTaskEventAt = [...taskRuns, ...(pendingTask ? [pendingTask] : [])]
    .reduce<number | null>((latest, taskRun) => {
      if (!taskRun) return latest
      return latest === null || taskRun.updated_at > latest ? taskRun.updated_at : latest
    }, null)
  if (
    latestAssistantMessageId &&
    latestAssistantMessageId !== getAiEntryLastReadAssistantMessageId(conversation.metadata)
  ) {
    await withAiEntryDbRetry("mark-ai-entry-conversation-read", () =>
      db
        .update(conversations)
        .set({
          metadata: withAiEntryLastReadAssistantMessageId(
            conversation.metadata,
            latestAssistantMessageId,
          ),
        })
        .where(eq(conversations.id, conversation.id)),
    )
  }

  return {
    data,
    limit: safeLimit,
    has_more: false,
    conversation_state: conversationState,
    task_runs: taskRuns,
    pending_task: pendingTask,
    conversation: mapConversationSummary(
      {
        id: conversation.id,
        title: conversation.title,
        currentModelId: conversation.currentModelId,
        metadata: withAiEntryLastReadAssistantMessageId(
          conversation.metadata,
          latestAssistantMessageId || getAiEntryLastReadAssistantMessageId(conversation.metadata) || 0,
        ),
        createdAt: conversation.createdAt,
      },
      {
        assistantMessageIds: data
          .map((message) => (message.role === "assistant" ? parsePositiveInt(message.id) : null))
          .filter((messageId): messageId is number => Boolean(messageId)),
        runningTaskCount: taskRuns.filter((taskRun) => taskRun.status === "pending" || taskRun.status === "running").length,
        lastTaskEventAt: lastTaskEventAt ? new Date(lastTaskEventAt * 1000) : null,
      },
    ),
  }
}

export async function recordAiEntryRuntimeArtifactContext(input: {
  userId: number
  conversationId: string
  artifact: {
    artifactId: number
    title: string
    kind: string
    summary: string
  }
  exportContext?: {
    previewSessionId: string
    selectedVariantKey?: string | null
  }
  scope?: AiEntryConversationScope
  agentId?: string | null
}) {
  const conversation = await getAiEntryConversation(input.userId, input.conversationId, input.scope || "chat", input.agentId)
  if (!conversation) return null
  const metadata = normalizeConversationMetadata(conversation.metadata) || {}
  const previousState = normalizeConversationMetadata(metadata.aiEntryConversationState)
  const nextState = appendAiEntryRuntimeArtifactContext({
    previousState,
    artifact: input.artifact,
    exportContext: input.exportContext,
  })
  await withAiEntryDbRetry("update-ai-entry-runtime-artifact-context", () =>
    db.update(conversations).set({
      metadata: {
        ...metadata,
        aiEntryConversationState: nextState,
      },
    }).where(eq(conversations.id, conversation.id)),
  )
  return nextState
}

export async function recordAiEntryRuntimeProjectSnapshot(input: {
  userId: number
  conversationId: string
  projectSnapshot: RuntimeProjectSnapshot
  scope?: AiEntryConversationScope
  agentId?: string | null
}) {
  const conversation = await getAiEntryConversation(input.userId, input.conversationId, input.scope || "chat", input.agentId)
  if (!conversation) return null
  const metadata = normalizeConversationMetadata(conversation.metadata) || {}
  const nextState = setAiEntryRuntimeProjectSnapshot({
    previousState: normalizeConversationMetadata(metadata.aiEntryConversationState),
    projectSnapshot: input.projectSnapshot,
  })
  await withAiEntryDbRetry("update-ai-entry-runtime-project-snapshot", () =>
    db.update(conversations).set({
      metadata: { ...metadata, aiEntryConversationState: nextState },
    }).where(eq(conversations.id, conversation.id)),
  )
  return nextState
}
