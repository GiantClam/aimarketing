import { and, asc, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { enterprisePlatformPluginSlots } from "@/lib/db/schema"
import { createRetryableDbErrorMatcher, withDbRetry } from "@/lib/db/retry"
import { ensureEnterpriseAuthTables, type AuthUserPayload } from "@/lib/enterprise/server"
import type { AppLocale } from "@/lib/i18n/config"
import {
  canManagePlatformRegistry,
  getPlatformRegistryBindingOptions,
  type PlatformBindingMode,
  type PlatformRegistryBindingOption,
} from "@/lib/platform/control-plane"

export type EnterprisePluginSlotStatus = "live" | "beta" | "planned"

export type EnterprisePluginSlotRecord = {
  id: number
  slug: string
  title: string
  summary: string
  integratesWith: string
  status: EnterprisePluginSlotStatus
  publicVisible: boolean
  workspaceVisible: boolean
  bindingTarget: string
  bindingMode: PlatformBindingMode
  notes: string
  bindingOptions: PlatformRegistryBindingOption[]
}

const RETRY_DELAYS_MS = [250, 750] as const
const isRetryable = createRetryableDbErrorMatcher(["timeout exceeded"])

async function withPluginSlotDbRetry<T>(label: string, operation: () => Promise<T>) {
  return withDbRetry(label, operation, {
    retryDelaysMs: RETRY_DELAYS_MS,
    isRetryable,
    logPrefix: "platform.plugin-slots.db.retry",
    exhaustedErrorPrefix: "platform_plugin_slots_db_retry_exhausted",
  })
}

let ensureTablesPromise: Promise<void> | null = null

export async function ensurePlatformPluginSlotTables() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = (async () => {
      await ensureEnterpriseAuthTables()
      await withPluginSlotDbRetry("ensure-platform-plugin-slot-tables", async () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_enterprise_platform_plugin_slots" (
            id SERIAL PRIMARY KEY,
            enterprise_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprises"(id),
            slug VARCHAR(128) NOT NULL,
            title VARCHAR(160) NOT NULL,
            summary TEXT NOT NULL,
            integrates_with VARCHAR(160) NOT NULL,
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
      await withPluginSlotDbRetry("ensure-platform-plugin-slot-index", async () =>
        db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_platform_plugin_slots_enterprise_slug_idx"
          ON "AI_MARKETING_enterprise_platform_plugin_slots"(enterprise_id, slug)
        `),
      )
    })().catch((error) => {
      ensureTablesPromise = null
      throw error
    })
  }

  await ensureTablesPromise
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
}

function normalizeStatus(value: unknown): EnterprisePluginSlotStatus {
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

export async function listEnterprisePluginSlots(locale: AppLocale, enterpriseId: number) {
  await ensurePlatformPluginSlotTables()
  const rows = await withPluginSlotDbRetry("platform-plugin-slots.list", async () =>
    db
      .select()
      .from(enterprisePlatformPluginSlots)
      .where(eq(enterprisePlatformPluginSlots.enterpriseId, enterpriseId))
      .orderBy(asc(enterprisePlatformPluginSlots.createdAt), asc(enterprisePlatformPluginSlots.id)),
  )

  const bindingOptions = getPlatformRegistryBindingOptions("plugin", locale)
  return rows.map<EnterprisePluginSlotRecord>((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    integratesWith: row.integratesWith,
    status: normalizeStatus(row.status),
    publicVisible: Boolean(row.publicVisible),
    workspaceVisible: Boolean(row.workspaceVisible),
    bindingTarget: row.bindingTarget?.trim() || "agent-platform",
    bindingMode: normalizeBindingMode(row.bindingMode),
    notes: row.notes?.trim() || "",
    bindingOptions,
  }))
}

export async function createEnterprisePluginSlot(input: {
  enterpriseId: number
  title: string
  summary: string
  integratesWith: string
  status?: EnterprisePluginSlotStatus
  publicVisible?: boolean
  workspaceVisible?: boolean
  bindingTarget?: string
  bindingMode?: PlatformBindingMode
  notes?: string
}) {
  await ensurePlatformPluginSlotTables()
  const slug = normalizeSlug(input.title)
  if (!slug) throw new Error("invalid_title")
  const title = normalizeText(input.title)
  const summary = normalizeText(input.summary)
  const integratesWith = normalizeText(input.integratesWith)
  if (!title || !summary || !integratesWith) throw new Error("invalid_payload")

  const [row] = await withPluginSlotDbRetry("platform-plugin-slots.insert", async () =>
    db
      .insert(enterprisePlatformPluginSlots)
      .values({
        enterpriseId: input.enterpriseId,
        slug,
        title,
        summary,
        integratesWith,
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

export async function updateEnterprisePluginSlot(input: {
  enterpriseId: number
  id: number
  title?: string
  summary?: string
  integratesWith?: string
  status?: EnterprisePluginSlotStatus
  publicVisible?: boolean
  workspaceVisible?: boolean
  bindingTarget?: string
  bindingMode?: PlatformBindingMode
  notes?: string
}) {
  await ensurePlatformPluginSlotTables()
  const rows = await withPluginSlotDbRetry("platform-plugin-slots.select-one", async () =>
    db
      .select()
      .from(enterprisePlatformPluginSlots)
      .where(
        and(
          eq(enterprisePlatformPluginSlots.enterpriseId, input.enterpriseId),
          eq(enterprisePlatformPluginSlots.id, input.id),
        ),
      )
      .limit(1),
  )
  const existing = rows[0]
  if (!existing) throw new Error("plugin_slot_not_found")

  const [row] = await withPluginSlotDbRetry("platform-plugin-slots.update", async () =>
    db
      .update(enterprisePlatformPluginSlots)
      .set({
        title: normalizeText(input.title, existing.title),
        summary: normalizeText(input.summary, existing.summary),
        integratesWith: normalizeText(input.integratesWith, existing.integratesWith),
        status: normalizeStatus(input.status ?? existing.status),
        publicVisible: typeof input.publicVisible === "boolean" ? input.publicVisible : Boolean(existing.publicVisible),
        workspaceVisible:
          typeof input.workspaceVisible === "boolean" ? input.workspaceVisible : Boolean(existing.workspaceVisible),
        bindingTarget: normalizeText(input.bindingTarget, existing.bindingTarget || "agent-platform"),
        bindingMode: normalizeBindingMode(input.bindingMode ?? existing.bindingMode),
        notes: normalizeText(input.notes, existing.notes || "") || null,
        updatedAt: new Date(),
      })
      .where(eq(enterprisePlatformPluginSlots.id, existing.id))
      .returning(),
  )

  return row
}

export function canManageEnterprisePluginSlots(user: AuthUserPayload | null | undefined) {
  return canManagePlatformRegistry(user)
}
