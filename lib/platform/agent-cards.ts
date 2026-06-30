import { and, asc, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { enterprisePlatformAgentCards } from "@/lib/db/schema"
import { createRetryableDbErrorMatcher, withDbRetry } from "@/lib/db/retry"
import { ensureEnterpriseAuthTables, type AuthUserPayload } from "@/lib/enterprise/server"
import type { AppLocale } from "@/lib/i18n/config"
import {
  canManagePlatformRegistry,
  getPlatformRegistryBindingOptions,
  type PlatformBindingMode,
  type PlatformRegistryBindingOption,
} from "@/lib/platform/control-plane"

export type EnterpriseAgentCardStatus = "live" | "beta" | "planned"

export type EnterpriseAgentCardRecord = {
  id: number
  slug: string
  title: string
  summary: string
  focus: string
  status: EnterpriseAgentCardStatus
  publicVisible: boolean
  workspaceVisible: boolean
  bindingTarget: string
  bindingMode: PlatformBindingMode
  notes: string
  bindingOptions: PlatformRegistryBindingOption[]
}

const PLATFORM_AGENT_CARD_DB_RETRY_DELAYS_MS = [250, 750] as const
const isRetryablePlatformAgentCardDbError = createRetryableDbErrorMatcher(["timeout exceeded"])

async function withPlatformAgentCardDbRetry<T>(label: string, operation: () => Promise<T>) {
  return withDbRetry(label, operation, {
    retryDelaysMs: PLATFORM_AGENT_CARD_DB_RETRY_DELAYS_MS,
    isRetryable: isRetryablePlatformAgentCardDbError,
    logPrefix: "platform.agent-cards.db.retry",
    exhaustedErrorPrefix: "platform_agent_cards_db_retry_exhausted",
  })
}

let ensurePlatformAgentCardTablesPromise: Promise<void> | null = null

export async function ensurePlatformAgentCardTables() {
  if (!ensurePlatformAgentCardTablesPromise) {
    ensurePlatformAgentCardTablesPromise = (async () => {
      await ensureEnterpriseAuthTables()

      await withPlatformAgentCardDbRetry("ensure-platform-agent-card-tables", async () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_enterprise_platform_agent_cards" (
            id SERIAL PRIMARY KEY,
            enterprise_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprises"(id),
            slug VARCHAR(128) NOT NULL,
            title VARCHAR(160) NOT NULL,
            summary TEXT NOT NULL,
            focus VARCHAR(160) NOT NULL,
            status VARCHAR(24) NOT NULL DEFAULT 'beta',
            public_visible BOOLEAN NOT NULL DEFAULT FALSE,
            workspace_visible BOOLEAN NOT NULL DEFAULT TRUE,
            binding_target VARCHAR(128),
            binding_mode VARCHAR(32) NOT NULL DEFAULT 'existing_runtime',
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `),
      )

      await withPlatformAgentCardDbRetry("ensure-platform-agent-card-index", async () =>
        db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_platform_agent_cards_enterprise_slug_idx"
          ON "AI_MARKETING_enterprise_platform_agent_cards"(enterprise_id, slug)
        `),
      )
    })().catch((error) => {
      ensurePlatformAgentCardTablesPromise = null
      throw error
    })
  }

  await ensurePlatformAgentCardTablesPromise
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
}

function normalizeStatus(value: unknown): EnterpriseAgentCardStatus {
  if (value === "live" || value === "planned") return value
  return "beta"
}

function normalizeBindingMode(value: unknown): PlatformBindingMode {
  if (value === "deferred" || value === "external_runtime") return value
  return "existing_runtime"
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() || fallback : fallback
}

export async function listEnterpriseAgentCards(locale: AppLocale, enterpriseId: number) {
  await ensurePlatformAgentCardTables()

  const rows = await withPlatformAgentCardDbRetry("platform-agent-cards.list", async () =>
    db
      .select()
      .from(enterprisePlatformAgentCards)
      .where(eq(enterprisePlatformAgentCards.enterpriseId, enterpriseId))
      .orderBy(asc(enterprisePlatformAgentCards.createdAt), asc(enterprisePlatformAgentCards.id)),
  )

  const bindingOptions = getPlatformRegistryBindingOptions("agent", locale)
  return rows.map<EnterpriseAgentCardRecord>((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    focus: row.focus,
    status: normalizeStatus(row.status),
    publicVisible: Boolean(row.publicVisible),
    workspaceVisible: Boolean(row.workspaceVisible),
    bindingTarget: row.bindingTarget?.trim() || "agent-platform",
    bindingMode: normalizeBindingMode(row.bindingMode),
    notes: row.notes?.trim() || "",
    bindingOptions,
  }))
}

export async function createEnterpriseAgentCard(input: {
  enterpriseId: number
  title: string
  summary: string
  focus: string
  status?: EnterpriseAgentCardStatus
  publicVisible?: boolean
  workspaceVisible?: boolean
  bindingTarget?: string
  bindingMode?: PlatformBindingMode
  notes?: string
}) {
  await ensurePlatformAgentCardTables()

  const slug = normalizeSlug(input.title)
  if (!slug) {
    throw new Error("invalid_title")
  }

  const title = normalizeText(input.title)
  const summary = normalizeText(input.summary)
  const focus = normalizeText(input.focus)
  if (!title || !summary || !focus) {
    throw new Error("invalid_payload")
  }

  const [row] = await withPlatformAgentCardDbRetry("platform-agent-cards.insert", async () =>
    db
      .insert(enterprisePlatformAgentCards)
      .values({
        enterpriseId: input.enterpriseId,
        slug,
        title,
        summary,
        focus,
        status: normalizeStatus(input.status),
        publicVisible: Boolean(input.publicVisible),
        workspaceVisible: typeof input.workspaceVisible === "boolean" ? input.workspaceVisible : true,
        bindingTarget: normalizeText(input.bindingTarget, "agent-platform"),
        bindingMode: normalizeBindingMode(input.bindingMode),
        notes: normalizeText(input.notes) || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning(),
  )

  return row
}

export async function updateEnterpriseAgentCard(input: {
  enterpriseId: number
  id: number
  title?: string
  summary?: string
  focus?: string
  status?: EnterpriseAgentCardStatus
  publicVisible?: boolean
  workspaceVisible?: boolean
  bindingTarget?: string
  bindingMode?: PlatformBindingMode
  notes?: string
}) {
  await ensurePlatformAgentCardTables()

  const rows = await withPlatformAgentCardDbRetry("platform-agent-cards.select-one", async () =>
    db
      .select()
      .from(enterprisePlatformAgentCards)
      .where(
        and(
          eq(enterprisePlatformAgentCards.enterpriseId, input.enterpriseId),
          eq(enterprisePlatformAgentCards.id, input.id),
        ),
      )
      .limit(1),
  )
  const existing = rows[0]
  if (!existing) {
    throw new Error("agent_card_not_found")
  }

  const title = normalizeText(input.title, existing.title)
  const summary = normalizeText(input.summary, existing.summary)
  const focus = normalizeText(input.focus, existing.focus)

  const [row] = await withPlatformAgentCardDbRetry("platform-agent-cards.update", async () =>
    db
      .update(enterprisePlatformAgentCards)
      .set({
        title,
        summary,
        focus,
        status: normalizeStatus(input.status ?? existing.status),
        publicVisible: typeof input.publicVisible === "boolean" ? input.publicVisible : Boolean(existing.publicVisible),
        workspaceVisible:
          typeof input.workspaceVisible === "boolean" ? input.workspaceVisible : Boolean(existing.workspaceVisible),
        bindingTarget: normalizeText(input.bindingTarget, existing.bindingTarget || "agent-platform"),
        bindingMode: normalizeBindingMode(input.bindingMode ?? existing.bindingMode),
        notes: normalizeText(input.notes, existing.notes || "") || null,
        updatedAt: new Date(),
      })
      .where(eq(enterprisePlatformAgentCards.id, existing.id))
      .returning(),
  )

  return row
}

export async function upsertEnterpriseAgentCardBySlug(input: {
  enterpriseId: number
  slug: string
  title: string
  summary: string
  focus: string
  status?: EnterpriseAgentCardStatus
  publicVisible?: boolean
  workspaceVisible?: boolean
  bindingTarget?: string
  bindingMode?: PlatformBindingMode
  notes?: string
}) {
  await ensurePlatformAgentCardTables()

  const slug = normalizeSlug(input.slug)
  if (!slug) {
    throw new Error("invalid_slug")
  }

  const rows = await withPlatformAgentCardDbRetry("platform-agent-cards.select-by-slug", async () =>
    db
      .select()
      .from(enterprisePlatformAgentCards)
      .where(
        and(
          eq(enterprisePlatformAgentCards.enterpriseId, input.enterpriseId),
          eq(enterprisePlatformAgentCards.slug, slug),
        ),
      )
      .limit(1),
  )

  const existing = rows[0]
  if (!existing) {
    return createEnterpriseAgentCard({
      enterpriseId: input.enterpriseId,
      title: input.title,
      summary: input.summary,
      focus: input.focus,
      status: input.status,
      publicVisible: input.publicVisible,
      workspaceVisible: input.workspaceVisible,
      bindingTarget: input.bindingTarget,
      bindingMode: input.bindingMode,
      notes: input.notes,
    })
  }

  return updateEnterpriseAgentCard({
    enterpriseId: input.enterpriseId,
    id: existing.id,
    title: input.title,
    summary: input.summary,
    focus: input.focus,
    status: input.status,
    publicVisible: input.publicVisible,
    workspaceVisible: input.workspaceVisible,
    bindingTarget: input.bindingTarget,
    bindingMode: input.bindingMode,
    notes: input.notes,
  })
}

export async function deleteEnterpriseAgentCardBySlug(input: {
  enterpriseId: number
  slug: string
}) {
  await ensurePlatformAgentCardTables()
  const slug = normalizeSlug(input.slug)
  if (!slug) return 0

  const deleted = await withPlatformAgentCardDbRetry("platform-agent-cards.delete-by-slug", async () =>
    db
      .delete(enterprisePlatformAgentCards)
      .where(
        and(
          eq(enterprisePlatformAgentCards.enterpriseId, input.enterpriseId),
          eq(enterprisePlatformAgentCards.slug, slug),
        ),
      )
      .returning({ id: enterprisePlatformAgentCards.id }),
  )

  return deleted.length
}

export function canManageEnterpriseAgentCards(user: AuthUserPayload | null | undefined) {
  return canManagePlatformRegistry(user)
}
