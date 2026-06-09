import { eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { businessWorkbenchStates } from "@/lib/db/schema"
import { createRetryableDbErrorMatcher, withDbRetry } from "@/lib/db/retry"
import { ensureEnterpriseAuthTables } from "@/lib/enterprise/server"
import { getAiEntryConversation } from "@/lib/ai-entry/repository"
import { getBusinessAgentConfigById } from "@/lib/platform/business-agents"
import {
  resolveWorkspaceBusinessSlug,
  type WorkspaceBusinessSlug,
} from "@/lib/platform/workspace-business"

export type BusinessWorkbenchStateTab = {
  id: string
  agentId: string
  conversationId: string | null
  draftSeed: string
  workspaceVersion: number
}

export type BusinessWorkbenchState = {
  currentViewSlug: WorkspaceBusinessSlug
  activeTabId: string | null
  tabs: BusinessWorkbenchStateTab[]
}

type BusinessWorkbenchConversationValidator = (
  tab: BusinessWorkbenchStateTab,
) => Promise<boolean>

const RETRY_DELAYS_MS = [250, 750] as const
const isRetryable = createRetryableDbErrorMatcher(["timeout exceeded"])

async function withBusinessWorkbenchDbRetry<T>(label: string, operation: () => Promise<T>) {
  return withDbRetry(label, operation, {
    retryDelaysMs: RETRY_DELAYS_MS,
    isRetryable,
    logPrefix: "platform.business-workbench-state.db.retry",
    exhaustedErrorPrefix: "platform_business_workbench_state_db_retry_exhausted",
  })
}

let ensureTablesPromise: Promise<void> | null = null

export async function ensureBusinessWorkbenchStateTables() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = (async () => {
      await ensureEnterpriseAuthTables()

      await withBusinessWorkbenchDbRetry("ensure-business-workbench-states-table", async () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_business_workbench_states" (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE,
            current_view_slug VARCHAR(64) NOT NULL DEFAULT 'content-growth',
            active_tab_id VARCHAR(160),
            tabs JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
      )

      await withBusinessWorkbenchDbRetry("ensure-business-workbench-states-user-unique-index", async () =>
        db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_business_workbench_states_user_idx"
          ON "AI_MARKETING_business_workbench_states"(user_id)
        `),
      )

      await withBusinessWorkbenchDbRetry("ensure-business-workbench-states-user-updated-index", async () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_business_workbench_states_user_updated_idx"
          ON "AI_MARKETING_business_workbench_states"(user_id, updated_at DESC)
        `),
      )
    })().catch((error) => {
      ensureTablesPromise = null
      throw error
    })
  }

  await ensureTablesPromise
}

function sanitizeTab(input: unknown): BusinessWorkbenchStateTab | null {
  const id = typeof (input as { id?: unknown })?.id === "string" ? (input as { id: string }).id.trim() : ""
  const agentId =
    typeof (input as { agentId?: unknown })?.agentId === "string"
      ? (input as { agentId: string }).agentId.trim()
      : ""

  if (!id || !agentId || !getBusinessAgentConfigById(agentId)) return null

  const conversationIdRaw =
    typeof (input as { conversationId?: unknown })?.conversationId === "string"
      ? (input as { conversationId: string }).conversationId.trim()
      : ""

  const draftSeed =
    typeof (input as { draftSeed?: unknown })?.draftSeed === "string"
      ? (input as { draftSeed: string }).draftSeed.slice(0, 2000)
      : ""

  const workspaceVersionRaw = (input as { workspaceVersion?: unknown })?.workspaceVersion
  const workspaceVersion =
    typeof workspaceVersionRaw === "number" && Number.isFinite(workspaceVersionRaw)
      ? Math.max(0, Math.trunc(workspaceVersionRaw))
      : 0

  return {
    id: id.slice(0, 160),
    agentId,
    conversationId: conversationIdRaw ? conversationIdRaw.slice(0, 160) : null,
    draftSeed,
    workspaceVersion,
  }
}

function dedupeTabsByAgent(tabs: BusinessWorkbenchStateTab[]) {
  const seen = new Set<string>()
  const deduped: BusinessWorkbenchStateTab[] = []

  for (const tab of tabs) {
    if (seen.has(tab.agentId)) continue
    seen.add(tab.agentId)
    deduped.push(tab)
  }

  return deduped
}

export function sanitizeBusinessWorkbenchStateInput(input: unknown): BusinessWorkbenchState {
  const rawCurrentViewSlug =
    typeof (input as { currentViewSlug?: unknown })?.currentViewSlug === "string"
      ? (input as { currentViewSlug: string }).currentViewSlug
      : null
  const currentViewSlug = resolveWorkspaceBusinessSlug(rawCurrentViewSlug)

  const rawTabs = Array.isArray((input as { tabs?: unknown[] })?.tabs) ? (input as { tabs: unknown[] }).tabs : []
  const tabs = dedupeTabsByAgent(
    rawTabs
    .map((tab) => sanitizeTab(tab))
    .filter((tab): tab is BusinessWorkbenchStateTab => Boolean(tab))
    .slice(0, 24),
  )

  const rawActiveTabId =
    typeof (input as { activeTabId?: unknown })?.activeTabId === "string"
      ? (input as { activeTabId: string }).activeTabId.trim()
      : ""

  const activeTabId = tabs.some((tab) => tab.id === rawActiveTabId) ? rawActiveTabId : tabs[0]?.id || null

  return {
    currentViewSlug,
    activeTabId,
    tabs,
  }
}

function isSameBusinessWorkbenchState(
  left: BusinessWorkbenchState | null,
  right: BusinessWorkbenchState | null,
) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export async function validateBusinessWorkbenchStateConversations(
  state: BusinessWorkbenchState,
  validator: BusinessWorkbenchConversationValidator,
): Promise<BusinessWorkbenchState> {
  const validatedTabs = await Promise.all(
    state.tabs.map(async (tab) => {
      if (!tab.conversationId) return tab
      const isValid = await validator(tab)
      if (isValid) return tab
      return {
        ...tab,
        conversationId: null,
      }
    }),
  )

  return {
    ...state,
    tabs: validatedTabs,
  }
}

async function validateBusinessWorkbenchStateForUser(
  userId: number,
  state: BusinessWorkbenchState,
) {
  return validateBusinessWorkbenchStateConversations(state, async (tab) => {
    if (!tab.conversationId) return true
    const conversation = await getAiEntryConversation(userId, tab.conversationId, "chat", tab.agentId)
    return Boolean(conversation)
  })
}

function normalizeRecord(row: typeof businessWorkbenchStates.$inferSelect | undefined | null): BusinessWorkbenchState | null {
  if (!row) return null
  return sanitizeBusinessWorkbenchStateInput({
    currentViewSlug: row.currentViewSlug,
    activeTabId: row.activeTabId,
    tabs: row.tabs,
  })
}

export async function getBusinessWorkbenchState(userId: number) {
  await ensureBusinessWorkbenchStateTables()
  const rows = await withBusinessWorkbenchDbRetry("business-workbench-state.select", async () =>
    db
      .select()
      .from(businessWorkbenchStates)
      .where(eq(businessWorkbenchStates.userId, userId))
      .limit(1),
  )
  const normalized = normalizeRecord(rows[0])
  if (!normalized) return null
  const validated = await validateBusinessWorkbenchStateForUser(userId, normalized)

  if (rows[0] && !isSameBusinessWorkbenchState(normalized, validated)) {
    await withBusinessWorkbenchDbRetry("business-workbench-state.read-repair", async () =>
      db
        .update(businessWorkbenchStates)
        .set({
          currentViewSlug: validated.currentViewSlug,
          activeTabId: validated.activeTabId,
          tabs: validated.tabs,
          updatedAt: new Date(),
        })
        .where(eq(businessWorkbenchStates.id, rows[0].id)),
    )
  }

  return validated
}

export async function upsertBusinessWorkbenchState(userId: number, input: unknown) {
  await ensureBusinessWorkbenchStateTables()
  const state = await validateBusinessWorkbenchStateForUser(
    userId,
    sanitizeBusinessWorkbenchStateInput(input),
  )

  const rows = await withBusinessWorkbenchDbRetry("business-workbench-state.select-for-upsert", async () =>
    db
      .select()
      .from(businessWorkbenchStates)
      .where(eq(businessWorkbenchStates.userId, userId))
      .limit(1),
  )

  const existing = rows[0]
  if (!existing) {
    const [created] = await withBusinessWorkbenchDbRetry("business-workbench-state.insert", async () =>
      db
        .insert(businessWorkbenchStates)
        .values({
          userId,
          currentViewSlug: state.currentViewSlug,
          activeTabId: state.activeTabId,
          tabs: state.tabs,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning(),
    )
    return normalizeRecord(created)
  }

  const [updated] = await withBusinessWorkbenchDbRetry("business-workbench-state.update", async () =>
    db
      .update(businessWorkbenchStates)
      .set({
        currentViewSlug: state.currentViewSlug,
        activeTabId: state.activeTabId,
        tabs: state.tabs,
        updatedAt: new Date(),
      })
      .where(eq(businessWorkbenchStates.id, existing.id))
      .returning(),
  )

  return normalizeRecord(updated)
}
