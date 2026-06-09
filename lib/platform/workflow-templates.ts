import { and, asc, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { enterprisePlatformWorkflowTemplates } from "@/lib/db/schema"
import { createRetryableDbErrorMatcher, withDbRetry } from "@/lib/db/retry"
import { ensureEnterpriseAuthTables, type AuthUserPayload } from "@/lib/enterprise/server"
import type { AppLocale } from "@/lib/i18n/config"
import {
  canManagePlatformRegistry,
  getPlatformRegistryBindingOptions,
  type PlatformBindingMode,
  type PlatformRegistryBindingOption,
} from "@/lib/platform/control-plane"

export type EnterpriseWorkflowTemplateStatus = "live" | "beta" | "planned"

export type EnterpriseWorkflowTemplateRecord = {
  id: number
  slug: string
  title: string
  summary: string
  trigger: string
  status: EnterpriseWorkflowTemplateStatus
  publicVisible: boolean
  workspaceVisible: boolean
  bindingTarget: string
  bindingMode: PlatformBindingMode
  notes: string
  bindingOptions: PlatformRegistryBindingOption[]
}

const PLATFORM_WORKFLOW_TEMPLATE_DB_RETRY_DELAYS_MS = [250, 750] as const
const isRetryablePlatformWorkflowTemplateDbError = createRetryableDbErrorMatcher(["timeout exceeded"])

async function withPlatformWorkflowTemplateDbRetry<T>(label: string, operation: () => Promise<T>) {
  return withDbRetry(label, operation, {
    retryDelaysMs: PLATFORM_WORKFLOW_TEMPLATE_DB_RETRY_DELAYS_MS,
    isRetryable: isRetryablePlatformWorkflowTemplateDbError,
    logPrefix: "platform.workflow-templates.db.retry",
    exhaustedErrorPrefix: "platform_workflow_templates_db_retry_exhausted",
  })
}

let ensurePlatformWorkflowTemplateTablesPromise: Promise<void> | null = null

export async function ensurePlatformWorkflowTemplateTables() {
  if (!ensurePlatformWorkflowTemplateTablesPromise) {
    ensurePlatformWorkflowTemplateTablesPromise = (async () => {
      await ensureEnterpriseAuthTables()

      await withPlatformWorkflowTemplateDbRetry("ensure-platform-workflow-template-tables", async () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_enterprise_platform_workflow_templates" (
            id SERIAL PRIMARY KEY,
            enterprise_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprises"(id),
            slug VARCHAR(128) NOT NULL,
            title VARCHAR(160) NOT NULL,
            summary TEXT NOT NULL,
            trigger VARCHAR(160) NOT NULL,
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

      await withPlatformWorkflowTemplateDbRetry("ensure-platform-workflow-template-index", async () =>
        db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_platform_workflow_templates_enterprise_slug_idx"
          ON "AI_MARKETING_enterprise_platform_workflow_templates"(enterprise_id, slug)
        `),
      )
    })().catch((error) => {
      ensurePlatformWorkflowTemplateTablesPromise = null
      throw error
    })
  }

  await ensurePlatformWorkflowTemplateTablesPromise
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
}

function normalizeStatus(value: unknown): EnterpriseWorkflowTemplateStatus {
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

export async function listEnterpriseWorkflowTemplates(locale: AppLocale, enterpriseId: number) {
  await ensurePlatformWorkflowTemplateTables()

  const rows = await withPlatformWorkflowTemplateDbRetry("platform-workflow-templates.list", async () =>
    db
      .select()
      .from(enterprisePlatformWorkflowTemplates)
      .where(eq(enterprisePlatformWorkflowTemplates.enterpriseId, enterpriseId))
      .orderBy(asc(enterprisePlatformWorkflowTemplates.createdAt), asc(enterprisePlatformWorkflowTemplates.id)),
  )

  const bindingOptions = getPlatformRegistryBindingOptions("workflow", locale)
  return rows.map<EnterpriseWorkflowTemplateRecord>((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    trigger: row.trigger,
    status: normalizeStatus(row.status),
    publicVisible: Boolean(row.publicVisible),
    workspaceVisible: Boolean(row.workspaceVisible),
    bindingTarget: row.bindingTarget?.trim() || "agent-platform",
    bindingMode: normalizeBindingMode(row.bindingMode),
    notes: row.notes?.trim() || "",
    bindingOptions,
  }))
}

export async function createEnterpriseWorkflowTemplate(input: {
  enterpriseId: number
  title: string
  summary: string
  trigger: string
  status?: EnterpriseWorkflowTemplateStatus
  publicVisible?: boolean
  workspaceVisible?: boolean
  bindingTarget?: string
  bindingMode?: PlatformBindingMode
  notes?: string
}) {
  await ensurePlatformWorkflowTemplateTables()

  const slug = normalizeSlug(input.title)
  if (!slug) throw new Error("invalid_title")

  const title = normalizeText(input.title)
  const summary = normalizeText(input.summary)
  const trigger = normalizeText(input.trigger)
  if (!title || !summary || !trigger) throw new Error("invalid_payload")

  const [row] = await withPlatformWorkflowTemplateDbRetry("platform-workflow-templates.insert", async () =>
    db
      .insert(enterprisePlatformWorkflowTemplates)
      .values({
        enterpriseId: input.enterpriseId,
        slug,
        title,
        summary,
        trigger,
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

export async function updateEnterpriseWorkflowTemplate(input: {
  enterpriseId: number
  id: number
  title?: string
  summary?: string
  trigger?: string
  status?: EnterpriseWorkflowTemplateStatus
  publicVisible?: boolean
  workspaceVisible?: boolean
  bindingTarget?: string
  bindingMode?: PlatformBindingMode
  notes?: string
}) {
  await ensurePlatformWorkflowTemplateTables()

  const rows = await withPlatformWorkflowTemplateDbRetry("platform-workflow-templates.select-one", async () =>
    db
      .select()
      .from(enterprisePlatformWorkflowTemplates)
      .where(
        and(
          eq(enterprisePlatformWorkflowTemplates.enterpriseId, input.enterpriseId),
          eq(enterprisePlatformWorkflowTemplates.id, input.id),
        ),
      )
      .limit(1),
  )
  const existing = rows[0]
  if (!existing) throw new Error("workflow_template_not_found")

  const title = normalizeText(input.title, existing.title)
  const summary = normalizeText(input.summary, existing.summary)
  const trigger = normalizeText(input.trigger, existing.trigger)

  const [row] = await withPlatformWorkflowTemplateDbRetry("platform-workflow-templates.update", async () =>
    db
      .update(enterprisePlatformWorkflowTemplates)
      .set({
        title,
        summary,
        trigger,
        status: normalizeStatus(input.status ?? existing.status),
        publicVisible: typeof input.publicVisible === "boolean" ? input.publicVisible : Boolean(existing.publicVisible),
        workspaceVisible:
          typeof input.workspaceVisible === "boolean" ? input.workspaceVisible : Boolean(existing.workspaceVisible),
        bindingTarget: normalizeText(input.bindingTarget, existing.bindingTarget || "agent-platform"),
        bindingMode: normalizeBindingMode(input.bindingMode ?? existing.bindingMode),
        notes: normalizeText(input.notes, existing.notes || "") || null,
        updatedAt: new Date(),
      })
      .where(eq(enterprisePlatformWorkflowTemplates.id, existing.id))
      .returning(),
  )

  return row
}

export function canManageEnterpriseWorkflowTemplates(user: AuthUserPayload | null | undefined) {
  return canManagePlatformRegistry(user)
}
