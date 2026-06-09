import { and, asc, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { enterprisePlatformMcpServiceProfiles } from "@/lib/db/schema"
import { createRetryableDbErrorMatcher, withDbRetry } from "@/lib/db/retry"
import { ensureEnterpriseAuthTables, type AuthUserPayload } from "@/lib/enterprise/server"
import type { AppLocale } from "@/lib/i18n/config"
import {
  canManagePlatformRegistry,
  getPlatformRegistryBindingOptions,
  type PlatformBindingMode,
  type PlatformRegistryBindingOption,
} from "@/lib/platform/control-plane"

export type EnterpriseMcpServiceProfileStatus = "live" | "beta" | "planned"

export type EnterpriseMcpServiceProfileRecord = {
  id: number
  slug: string
  title: string
  summary: string
  serviceType: string
  status: EnterpriseMcpServiceProfileStatus
  publicVisible: boolean
  workspaceVisible: boolean
  bindingTarget: string
  bindingMode: PlatformBindingMode
  notes: string
  bindingOptions: PlatformRegistryBindingOption[]
}

const RETRY_DELAYS_MS = [250, 750] as const
const isRetryable = createRetryableDbErrorMatcher(["timeout exceeded"])

async function withMcpServiceProfileDbRetry<T>(label: string, operation: () => Promise<T>) {
  return withDbRetry(label, operation, {
    retryDelaysMs: RETRY_DELAYS_MS,
    isRetryable,
    logPrefix: "platform.mcp-service-profiles.db.retry",
    exhaustedErrorPrefix: "platform_mcp_service_profiles_db_retry_exhausted",
  })
}

let ensureTablesPromise: Promise<void> | null = null

export async function ensurePlatformMcpServiceProfileTables() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = (async () => {
      await ensureEnterpriseAuthTables()
      await withMcpServiceProfileDbRetry("ensure-platform-mcp-service-profile-tables", async () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_enterprise_platform_mcp_service_profiles" (
            id SERIAL PRIMARY KEY,
            enterprise_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprises"(id),
            slug VARCHAR(128) NOT NULL,
            title VARCHAR(160) NOT NULL,
            summary TEXT NOT NULL,
            service_type VARCHAR(160) NOT NULL,
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
      await withMcpServiceProfileDbRetry("ensure-platform-mcp-service-profile-index", async () =>
        db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_platform_mcp_service_profiles_enterprise_slug_idx"
          ON "AI_MARKETING_enterprise_platform_mcp_service_profiles"(enterprise_id, slug)
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

function normalizeStatus(value: unknown): EnterpriseMcpServiceProfileStatus {
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

export async function listEnterpriseMcpServiceProfiles(locale: AppLocale, enterpriseId: number) {
  await ensurePlatformMcpServiceProfileTables()
  const rows = await withMcpServiceProfileDbRetry("platform-mcp-service-profiles.list", async () =>
    db
      .select()
      .from(enterprisePlatformMcpServiceProfiles)
      .where(eq(enterprisePlatformMcpServiceProfiles.enterpriseId, enterpriseId))
      .orderBy(asc(enterprisePlatformMcpServiceProfiles.createdAt), asc(enterprisePlatformMcpServiceProfiles.id)),
  )

  const bindingOptions = getPlatformRegistryBindingOptions("mcp_service", locale)
  return rows.map<EnterpriseMcpServiceProfileRecord>((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    serviceType: row.serviceType,
    status: normalizeStatus(row.status),
    publicVisible: Boolean(row.publicVisible),
    workspaceVisible: Boolean(row.workspaceVisible),
    bindingTarget: row.bindingTarget?.trim() || "agent-platform",
    bindingMode: normalizeBindingMode(row.bindingMode),
    notes: row.notes?.trim() || "",
    bindingOptions,
  }))
}

export async function createEnterpriseMcpServiceProfile(input: {
  enterpriseId: number
  title: string
  summary: string
  serviceType: string
  status?: EnterpriseMcpServiceProfileStatus
  publicVisible?: boolean
  workspaceVisible?: boolean
  bindingTarget?: string
  bindingMode?: PlatformBindingMode
  notes?: string
}) {
  await ensurePlatformMcpServiceProfileTables()
  const slug = normalizeSlug(input.title)
  if (!slug) throw new Error("invalid_title")
  const title = normalizeText(input.title)
  const summary = normalizeText(input.summary)
  const serviceType = normalizeText(input.serviceType)
  if (!title || !summary || !serviceType) throw new Error("invalid_payload")

  const [row] = await withMcpServiceProfileDbRetry("platform-mcp-service-profiles.insert", async () =>
    db
      .insert(enterprisePlatformMcpServiceProfiles)
      .values({
        enterpriseId: input.enterpriseId,
        slug,
        title,
        summary,
        serviceType,
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

export async function updateEnterpriseMcpServiceProfile(input: {
  enterpriseId: number
  id: number
  title?: string
  summary?: string
  serviceType?: string
  status?: EnterpriseMcpServiceProfileStatus
  publicVisible?: boolean
  workspaceVisible?: boolean
  bindingTarget?: string
  bindingMode?: PlatformBindingMode
  notes?: string
}) {
  await ensurePlatformMcpServiceProfileTables()
  const rows = await withMcpServiceProfileDbRetry("platform-mcp-service-profiles.select-one", async () =>
    db
      .select()
      .from(enterprisePlatformMcpServiceProfiles)
      .where(
        and(
          eq(enterprisePlatformMcpServiceProfiles.enterpriseId, input.enterpriseId),
          eq(enterprisePlatformMcpServiceProfiles.id, input.id),
        ),
      )
      .limit(1),
  )
  const existing = rows[0]
  if (!existing) throw new Error("mcp_service_profile_not_found")

  const [row] = await withMcpServiceProfileDbRetry("platform-mcp-service-profiles.update", async () =>
    db
      .update(enterprisePlatformMcpServiceProfiles)
      .set({
        title: normalizeText(input.title, existing.title),
        summary: normalizeText(input.summary, existing.summary),
        serviceType: normalizeText(input.serviceType, existing.serviceType),
        status: normalizeStatus(input.status ?? existing.status),
        publicVisible: typeof input.publicVisible === "boolean" ? input.publicVisible : Boolean(existing.publicVisible),
        workspaceVisible:
          typeof input.workspaceVisible === "boolean" ? input.workspaceVisible : Boolean(existing.workspaceVisible),
        bindingTarget: normalizeText(input.bindingTarget, existing.bindingTarget || "agent-platform"),
        bindingMode: normalizeBindingMode(input.bindingMode ?? existing.bindingMode),
        notes: normalizeText(input.notes, existing.notes || "") || null,
        updatedAt: new Date(),
      })
      .where(eq(enterprisePlatformMcpServiceProfiles.id, existing.id))
      .returning(),
  )
  return row
}

export function canManageEnterpriseMcpServiceProfiles(user: AuthUserPayload | null | undefined) {
  return canManagePlatformRegistry(user)
}
