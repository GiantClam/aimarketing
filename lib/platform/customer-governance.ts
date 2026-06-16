import { sql } from "drizzle-orm"

import type { AuthUser } from "@/lib/auth/session"
import { getBillingEntitlementForUser } from "@/lib/billing/entitlements"
import { db } from "@/lib/db"
import {
  buildDefaultEnterpriseModelConfiguration,
  mergeEnterpriseModelConfigurationSecrets,
  normalizeEnterpriseModelConfiguration,
  redactEnterpriseModelConfigurationSecrets,
  type EnterpriseModelConfiguration,
} from "@/lib/platform/model-config"
import { getPlatformRuntimeSnapshot, type PlatformRuntimeSnapshot } from "@/lib/platform/runtime"
import { getWorkspaceBillingSnapshot } from "@/modules/billing-kit/core/workspace"

export type CustomerGovernanceRuntimeStatus = "ready" | "deferred" | "runtime_disabled"
export type CustomerGovernanceSsoStatus = "not_configured" | "configured"
export type CustomerGovernanceRuntimeIntakeMode = "workspace_default" | "admin_review"

export type CustomerGovernanceSettings = {
  ssoDomain: string | null
  seatRequestNote: string | null
  runtimeIntakeMode: CustomerGovernanceRuntimeIntakeMode
  modelConfig: EnterpriseModelConfiguration
  updatedAt: string | null
}

export type CustomerGovernanceSnapshot = {
  members: { total: number; active: number; seatLimit: number | null }
  usage: {
    sharedCredits: number | null
    currentPlan: string | null
    recentLedgerEntries: number | null
    recentLedgerNetCredits: number | null
  }
  runtimes: Array<{ slug: string; status: CustomerGovernanceRuntimeStatus }>
  sso: { status: CustomerGovernanceSsoStatus; domain: string | null }
  settings: CustomerGovernanceSettings
  canManageSettings: boolean
}

type CustomerGovernanceSnapshotParts = {
  memberCounts: { total: number; active: number }
  seatLimit: number | null
  sharedCredits: number | null
  currentPlan: string | null
  recentLedgerEntries: number | null
  recentLedgerNetCredits: number | null
  runtime: PlatformRuntimeSnapshot
  settings: CustomerGovernanceSettings | null
  canManageSettings: boolean
}

type UpdateCustomerGovernanceSettingsInput = {
  currentUser: AuthUser
  patch: Partial<Pick<CustomerGovernanceSettings, "ssoDomain" | "seatRequestNote" | "runtimeIntakeMode" | "modelConfig">>
}

const CUSTOMER_GOVERNANCE_RUNTIME_SLUGS = [
  "ai-chat",
  "ai-ppt",
  "content-repurpose",
  "ai-image",
  "ai-video",
  "ai-music",
] as const

const DEFAULT_CUSTOMER_GOVERNANCE_SETTINGS: CustomerGovernanceSettings = {
  ssoDomain: null,
  seatRequestNote: null,
  runtimeIntakeMode: "workspace_default",
  modelConfig: buildDefaultEnterpriseModelConfiguration(),
  updatedAt: null,
}

let ensureCustomerGovernanceSettingsTablePromise: Promise<void> | null = null

function normalizeOptionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

function normalizeRuntimeIntakeMode(value: unknown): CustomerGovernanceRuntimeIntakeMode {
  return value === "admin_review" ? "admin_review" : "workspace_default"
}

function mapRuntimeTaskToStatus(
  task: PlatformRuntimeSnapshot["tasks"][number] | undefined,
): CustomerGovernanceRuntimeStatus {
  if (!task || !task.enabled) return "runtime_disabled"
  if (task.mode === "deferred") return "deferred"
  return "ready"
}

function assertEnterpriseUser(currentUser: AuthUser): asserts currentUser is AuthUser & { enterpriseId: number } {
  if (!currentUser?.enterpriseId) {
    throw new Error("enterprise_context_required")
  }
}

function assertEnterpriseAdmin(currentUser: AuthUser) {
  assertEnterpriseUser(currentUser)
  if (currentUser.enterpriseRole !== "admin") {
    throw new Error("admin_required")
  }
}

async function ensureCustomerGovernanceSettingsTable() {
  if (!ensureCustomerGovernanceSettingsTablePromise) {
    ensureCustomerGovernanceSettingsTablePromise = db.execute(sql`
      CREATE TABLE IF NOT EXISTS "AI_MARKETING_enterprise_governance_settings" (
        id SERIAL PRIMARY KEY,
        enterprise_id INTEGER NOT NULL UNIQUE REFERENCES "AI_MARKETING_enterprises"(id) ON DELETE CASCADE,
        sso_domain VARCHAR(255),
        seat_request_note TEXT,
        runtime_intake_mode VARCHAR(32) NOT NULL DEFAULT 'workspace_default',
        model_config JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).then(async () => {
      await db.execute(sql`
        ALTER TABLE "AI_MARKETING_enterprise_governance_settings"
        ADD COLUMN IF NOT EXISTS model_config JSONB
      `)
    }).then(() => undefined)
  }

  await ensureCustomerGovernanceSettingsTablePromise
}

export function buildCustomerGovernanceSnapshot(parts: CustomerGovernanceSnapshotParts): CustomerGovernanceSnapshot {
  const settings = parts.settings ?? DEFAULT_CUSTOMER_GOVERNANCE_SETTINGS
  const runtimeMap = new Map(parts.runtime.tasks.map((task) => [task.capabilitySlug, task]))
  const ssoDomain = settings.ssoDomain

  return {
    members: {
      total: parts.memberCounts.total,
      active: parts.memberCounts.active,
      seatLimit: parts.seatLimit,
    },
    usage: {
      sharedCredits: parts.sharedCredits,
      currentPlan: parts.currentPlan,
      recentLedgerEntries: parts.recentLedgerEntries,
      recentLedgerNetCredits: parts.recentLedgerNetCredits,
    },
    runtimes: CUSTOMER_GOVERNANCE_RUNTIME_SLUGS.map((slug) => ({
      slug,
      status: mapRuntimeTaskToStatus(runtimeMap.get(slug)),
    })),
    sso: {
      status: ssoDomain ? "configured" : "not_configured",
      domain: ssoDomain,
    },
    settings,
    canManageSettings: parts.canManageSettings,
  }
}

export function normalizeCustomerGovernanceSettingsPatch(
  patch: Partial<Pick<CustomerGovernanceSettings, "ssoDomain" | "seatRequestNote" | "runtimeIntakeMode" | "modelConfig">>,
) {
  return {
    ssoDomain: normalizeOptionalText(patch.ssoDomain, 255),
    seatRequestNote: normalizeOptionalText(patch.seatRequestNote, 4_000),
    runtimeIntakeMode: normalizeRuntimeIntakeMode(patch.runtimeIntakeMode),
    modelConfig: normalizeEnterpriseModelConfiguration(patch.modelConfig),
  }
}

export async function getCustomerGovernanceSettings(
  enterpriseId: number,
  options?: { includeSecrets?: boolean },
): Promise<CustomerGovernanceSettings> {
  await ensureCustomerGovernanceSettingsTable()

  const result = await db.execute(sql`
    SELECT
      sso_domain,
      seat_request_note,
      runtime_intake_mode,
      model_config,
      FLOOR(EXTRACT(EPOCH FROM updated_at) * 1000)::bigint AS updated_at_ms
    FROM "AI_MARKETING_enterprise_governance_settings"
    WHERE enterprise_id = ${enterpriseId}
    LIMIT 1
  `)

  const row = (result.rows[0] ?? {}) as {
    sso_domain?: string | null
    seat_request_note?: string | null
    runtime_intake_mode?: string | null
    model_config?: unknown
    updated_at_ms?: string | number | null
  }

  const updatedAtMs = Number(row.updated_at_ms || 0)

  const settings = {
    ssoDomain: normalizeOptionalText(row.sso_domain, 255),
    seatRequestNote: normalizeOptionalText(row.seat_request_note, 4_000),
    runtimeIntakeMode: normalizeRuntimeIntakeMode(row.runtime_intake_mode),
    modelConfig: normalizeEnterpriseModelConfiguration(row.model_config),
    updatedAt: updatedAtMs > 0 ? new Date(updatedAtMs).toISOString() : null,
  }

  return options?.includeSecrets
    ? settings
    : {
        ...settings,
        modelConfig: redactEnterpriseModelConfigurationSecrets(settings.modelConfig),
      }
}

export async function updateCustomerGovernanceSettings(
  input: UpdateCustomerGovernanceSettingsInput,
): Promise<CustomerGovernanceSettings> {
  assertEnterpriseAdmin(input.currentUser)
  await ensureCustomerGovernanceSettingsTable()

  const enterpriseId = input.currentUser.enterpriseId
  if (typeof enterpriseId !== "number") {
    throw new Error("enterprise_context_required")
  }
  const patch = normalizeCustomerGovernanceSettingsPatch(input.patch)
  const existing = await getCustomerGovernanceSettings(enterpriseId, {
    includeSecrets: true,
  }).catch(() => DEFAULT_CUSTOMER_GOVERNANCE_SETTINGS)
  const modelConfig = mergeEnterpriseModelConfigurationSecrets({
    existing: existing.modelConfig,
    incoming: patch.modelConfig,
  })

  await db.execute(sql`
    INSERT INTO "AI_MARKETING_enterprise_governance_settings" (
      enterprise_id,
      sso_domain,
      seat_request_note,
      runtime_intake_mode,
      model_config
    )
    VALUES (
      ${enterpriseId},
      ${patch.ssoDomain},
      ${patch.seatRequestNote},
      ${patch.runtimeIntakeMode},
      ${JSON.stringify(modelConfig)}
    )
    ON CONFLICT (enterprise_id) DO UPDATE SET
      sso_domain = EXCLUDED.sso_domain,
      seat_request_note = EXCLUDED.seat_request_note,
      runtime_intake_mode = EXCLUDED.runtime_intake_mode,
      model_config = EXCLUDED.model_config,
      updated_at = CURRENT_TIMESTAMP
  `)

  return getCustomerGovernanceSettings(enterpriseId)
}

export async function getCustomerGovernanceSnapshot(currentUser: AuthUser): Promise<CustomerGovernanceSnapshot> {
  assertEnterpriseUser(currentUser)
  const enterpriseId = currentUser.enterpriseId
  if (typeof enterpriseId !== "number") {
    throw new Error("enterprise_context_required")
  }
  const [memberResult, ledgerResult, entitlement, workspaceSnapshot, settings] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total_members,
        COUNT(*) FILTER (WHERE enterprise_status = 'active')::int AS active_members
      FROM "AI_MARKETING_users"
      WHERE enterprise_id = ${enterpriseId}
    `),
    db.execute(sql`
      SELECT
        COUNT(*)::int AS recent_entries,
        COALESCE(SUM(amount), 0)::int AS recent_net_credits
      FROM "AI_MARKETING_credit_ledger"
      WHERE enterprise_id = ${enterpriseId}
        AND created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    `).catch(() => ({ rows: [] as Array<Record<string, unknown>> })),
    getBillingEntitlementForUser(currentUser).catch(() => null),
    getWorkspaceBillingSnapshot(enterpriseId).catch(() => null),
    getCustomerGovernanceSettings(enterpriseId).catch(() => DEFAULT_CUSTOMER_GOVERNANCE_SETTINGS),
  ])

  const memberRow = (memberResult.rows[0] ?? {}) as {
    total_members?: string | number
    active_members?: string | number
  }
  const ledgerRow = (ledgerResult.rows[0] ?? {}) as {
    recent_entries?: string | number
    recent_net_credits?: string | number
  }

  return buildCustomerGovernanceSnapshot({
    memberCounts: {
      total: Number(memberRow.total_members || 0),
      active: Number(memberRow.active_members || 0),
    },
    seatLimit: workspaceSnapshot?.seatLimit ?? null,
    sharedCredits: entitlement?.creditAccount?.availableCredits ?? null,
    currentPlan: workspaceSnapshot?.effectivePlan.name || entitlement?.plan?.name || entitlement?.plan?.code || null,
    recentLedgerEntries:
      ledgerRow.recent_entries == null ? null : Number.isFinite(Number(ledgerRow.recent_entries)) ? Number(ledgerRow.recent_entries) : null,
    recentLedgerNetCredits:
      ledgerRow.recent_net_credits == null
        ? null
        : Number.isFinite(Number(ledgerRow.recent_net_credits))
          ? Number(ledgerRow.recent_net_credits)
          : null,
    runtime: getPlatformRuntimeSnapshot(),
    settings,
    canManageSettings: currentUser.enterpriseRole === "admin",
  })
}
