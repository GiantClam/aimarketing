import { eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { businessMarketplaceSelections } from "@/lib/db/schema"
import { createRetryableDbErrorMatcher, withDbRetry } from "@/lib/db/retry"
import { ensureEnterpriseAuthTables } from "@/lib/enterprise/server"
import { getBusinessAgentConfigById } from "@/lib/platform/business-agents"
import { isExecutiveBusinessMenuAgentId } from "@/lib/platform/business-menu-builtin-agents"
import { isCustomAgentRuntimeId } from "@/lib/platform/custom-agent-runtime-id"
import { isImportedAgencyAgentId } from "@/lib/platform/imported-agency-agents"

export type BusinessMarketplaceSelection = {
  selectedAgentIds: string[]
}

export function isBusinessMarketplaceSelectableAgentId(value: string | null | undefined) {
  if (typeof value !== "string") return false
  const agentId = value.trim()
  if (!agentId) return false
  return Boolean(
    isImportedAgencyAgentId(agentId) ||
      getBusinessAgentConfigById(agentId) ||
      isExecutiveBusinessMenuAgentId(agentId) ||
      isCustomAgentRuntimeId(agentId),
  )
}

const RETRY_DELAYS_MS = [250, 750] as const
const isRetryable = createRetryableDbErrorMatcher(["timeout exceeded"])

async function withBusinessMarketplaceSelectionDbRetry<T>(label: string, operation: () => Promise<T>) {
  return withDbRetry(label, operation, {
    retryDelaysMs: RETRY_DELAYS_MS,
    isRetryable,
    logPrefix: "platform.business-marketplace-selection.db.retry",
    exhaustedErrorPrefix: "platform_business_marketplace_selection_db_retry_exhausted",
  })
}

let ensureTablesPromise: Promise<void> | null = null

export async function ensureBusinessMarketplaceSelectionTables() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = (async () => {
      await ensureEnterpriseAuthTables()

      await withBusinessMarketplaceSelectionDbRetry("ensure-business-marketplace-selections-table", async () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_business_marketplace_selections" (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE,
            selected_agent_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
      )

      await withBusinessMarketplaceSelectionDbRetry("ensure-business-marketplace-selections-user-unique-index", async () =>
        db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_business_marketplace_selections_user_idx"
          ON "AI_MARKETING_business_marketplace_selections"(user_id)
        `),
      )

      await withBusinessMarketplaceSelectionDbRetry("ensure-business-marketplace-selections-user-updated-index", async () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_business_marketplace_selections_user_updated_idx"
          ON "AI_MARKETING_business_marketplace_selections"(user_id, updated_at DESC)
        `),
      )
    })().catch((error) => {
      ensureTablesPromise = null
      throw error
    })
  }

  await ensureTablesPromise
}

function normalizeSelectedAgentIds(input: unknown) {
  const rawIds = Array.isArray(input) ? input : []
  const seen = new Set<string>()
  const selectedAgentIds: string[] = []

  for (const item of rawIds) {
    const agentId = typeof item === "string" ? item.trim() : ""
    if (!agentId || seen.has(agentId) || !isBusinessMarketplaceSelectableAgentId(agentId)) continue
    seen.add(agentId)
    selectedAgentIds.push(agentId)
    if (selectedAgentIds.length >= 256) break
  }

  return selectedAgentIds
}

export function sanitizeBusinessMarketplaceSelectionInput(input: unknown): BusinessMarketplaceSelection {
  return {
    selectedAgentIds: normalizeSelectedAgentIds(
      typeof (input as { selectedAgentIds?: unknown })?.selectedAgentIds !== "undefined"
        ? (input as { selectedAgentIds?: unknown }).selectedAgentIds
        : input,
    ),
  }
}

function normalizeRecord(
  row: typeof businessMarketplaceSelections.$inferSelect | undefined | null,
): BusinessMarketplaceSelection | null {
  if (!row) return null
  return {
    selectedAgentIds: normalizeSelectedAgentIds(row.selectedAgentIds),
  }
}

export async function getBusinessMarketplaceSelection(userId: number) {
  await ensureBusinessMarketplaceSelectionTables()
  const rows = await withBusinessMarketplaceSelectionDbRetry("business-marketplace-selection.select", async () =>
    db
      .select()
      .from(businessMarketplaceSelections)
      .where(eq(businessMarketplaceSelections.userId, userId))
      .limit(1),
  )

  return normalizeRecord(rows[0])
}

export async function upsertBusinessMarketplaceSelection(userId: number, input: unknown) {
  await ensureBusinessMarketplaceSelectionTables()
  const selection = sanitizeBusinessMarketplaceSelectionInput(input)
  const rows = await withBusinessMarketplaceSelectionDbRetry("business-marketplace-selection.select-for-upsert", async () =>
    db
      .select()
      .from(businessMarketplaceSelections)
      .where(eq(businessMarketplaceSelections.userId, userId))
      .limit(1),
  )

  const existing = rows[0]
  if (!existing) {
    const [created] = await withBusinessMarketplaceSelectionDbRetry("business-marketplace-selection.insert", async () =>
      db
        .insert(businessMarketplaceSelections)
        .values({
          userId,
          selectedAgentIds: selection.selectedAgentIds,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning(),
    )
    return normalizeRecord(created)
  }

  const [updated] = await withBusinessMarketplaceSelectionDbRetry("business-marketplace-selection.update", async () =>
    db
      .update(businessMarketplaceSelections)
      .set({
        selectedAgentIds: selection.selectedAgentIds,
        updatedAt: new Date(),
      })
      .where(eq(businessMarketplaceSelections.id, existing.id))
      .returning(),
  )

  return normalizeRecord(updated)
}
