import { and, desc, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { enterprisePlatformRegistryConfigs } from "@/lib/db/schema"
import { createRetryableDbErrorMatcher, withDbRetry } from "@/lib/db/retry"
import { ensureEnterpriseAuthTables, type AuthUserPayload } from "@/lib/enterprise/server"
import type { AppLocale } from "@/lib/i18n/config"
import {
  getLocalizedPlatformAgents,
  getLocalizedPlatformCapabilities,
  getLocalizedPlatformMcpServices,
  getLocalizedPlatformPlugins,
  getLocalizedPlatformWorkflows,
  type LocalizedCapabilityDescriptor,
  type LocalizedAgentCard,
  type LocalizedMcpServiceDescriptor,
  type LocalizedPluginDescriptor,
  type LocalizedWorkflowTemplate,
} from "@/lib/platform/catalog"

export type PlatformRegistryItemType = "capability" | "agent" | "plugin" | "mcp_service" | "workflow"
export type PlatformBindingMode = "existing_runtime" | "deferred" | "external_runtime"

type RegistryCatalogItem =
  | LocalizedCapabilityDescriptor
  | LocalizedAgentCard
  | LocalizedPluginDescriptor
  | LocalizedMcpServiceDescriptor
  | LocalizedWorkflowTemplate

type RegistryConfigRow = typeof enterprisePlatformRegistryConfigs.$inferSelect

export type PlatformRegistryBindingOption = {
  value: string
  label: string
}

export type PlatformRegistryControlEntry = {
  itemType: PlatformRegistryItemType
  slug: string
  title: string
  summary: string
  status: "live" | "beta" | "planned"
  publicHref?: string
  workspaceHref?: string
  capabilityKind?: LocalizedCapabilityDescriptor["kind"]
  bindings?: LocalizedCapabilityDescriptor["bindings"]
  defaultConfig: {
    enabled: boolean
    publicVisible: boolean
    workspaceVisible: boolean
    bindingTarget: string
    bindingMode: PlatformBindingMode
    notes: string
  }
  config: {
    enabled: boolean
    publicVisible: boolean
    workspaceVisible: boolean
    bindingTarget: string
    bindingMode: PlatformBindingMode
    notes: string
  }
  proofPoints: string[]
  surfaceLabel: string
  bindingOptions: PlatformRegistryBindingOption[]
}

const PLATFORM_REGISTRY_DB_RETRY_DELAYS_MS = [250, 750] as const
const isRetryablePlatformRegistryDbError = createRetryableDbErrorMatcher(["timeout exceeded"])

async function withPlatformRegistryDbRetry<T>(label: string, operation: () => Promise<T>) {
  return withDbRetry(label, operation, {
    retryDelaysMs: PLATFORM_REGISTRY_DB_RETRY_DELAYS_MS,
    isRetryable: isRetryablePlatformRegistryDbError,
    logPrefix: "platform.registry.db.retry",
    exhaustedErrorPrefix: "platform_registry_db_retry_exhausted",
  })
}

let ensurePlatformRegistryTablesPromise: Promise<void> | null = null

export async function ensurePlatformRegistryTables() {
  if (!ensurePlatformRegistryTablesPromise) {
    ensurePlatformRegistryTablesPromise = (async () => {
      await ensureEnterpriseAuthTables()

      await withPlatformRegistryDbRetry("ensure-platform-registry-tables", async () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_enterprise_platform_registry_configs" (
            id SERIAL PRIMARY KEY,
            enterprise_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprises"(id),
            item_type VARCHAR(32) NOT NULL,
            item_slug VARCHAR(128) NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            public_visible BOOLEAN NOT NULL DEFAULT FALSE,
            workspace_visible BOOLEAN NOT NULL DEFAULT TRUE,
            binding_target VARCHAR(128),
            binding_mode VARCHAR(32) NOT NULL DEFAULT 'existing_runtime',
            notes TEXT,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `),
      )

      await withPlatformRegistryDbRetry("ensure-platform-registry-index", async () =>
        db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_platform_registry_configs_enterprise_item_idx"
          ON "AI_MARKETING_enterprise_platform_registry_configs"(enterprise_id, item_type, item_slug)
        `),
      )
    })().catch((error) => {
      ensurePlatformRegistryTablesPromise = null
      throw error
    })
  }

  await ensurePlatformRegistryTablesPromise
}

function normalizeBindingMode(value: string | null | undefined): PlatformBindingMode {
  if (value === "deferred" || value === "external_runtime") return value
  return "existing_runtime"
}

function getSurfaceLabel(item: RegistryCatalogItem, locale: AppLocale) {
  if (item.surface === "both") return locale === "zh" ? "公开 + 企业" : "Public + workspace"
  if (item.surface === "public") return locale === "zh" ? "公开前台" : "Public"
  return locale === "zh" ? "企业工作台" : "Workspace"
}

function getDefaultBindingTarget(itemType: PlatformRegistryItemType, slug: string) {
  if (itemType === "capability") {
    if (slug === "ai-chat") return "ai-chat"
    if (slug === "ai-ppt") return "ai-ppt"
    if (slug === "ai-image") return "ai-image"
    if (slug === "ai-video") return "ai-video"
    return "agent-platform"
  }

  if (itemType === "agent") {
    if (slug === "brand-strategy-agent" || slug === "growth-marketing-agent") return "ai-chat"
    if (slug === "public-relations-agent") return "agent-platform"
    if (slug === "video-ops-agent") return "ai-video"
    return "agent-platform"
  }

  if (itemType === "plugin") {
    if (slug === "writer-memory") return "content-repurpose"
    if (slug === "image-reference-assets") return "ai-image"
    if (slug === "web-search-connector") return "ai-chat"
    if (slug === "runninghub-media") return "visual-ad-pipeline"
    return "agent-platform"
  }

  if (itemType === "mcp_service") {
    if (slug === "document-parsing-mcp") return "campaign-launch"
    if (slug === "design-context-mcp") return "ai-image"
    if (slug === "market-data-mcp") return "knowledge-base"
    return "content-repurpose"
  }

  if (slug === "campaign-launch") return "campaign-launch"
  if (slug === "content-repurpose") return "content-repurpose"
  if (slug === "visual-ad-pipeline") return "visual-ad-pipeline"
  return "agent-platform"
}

function getDefaultBindingMode(status: RegistryCatalogItem["status"]): PlatformBindingMode {
  return status === "planned" ? "deferred" : "existing_runtime"
}

function buildDefaultConfig(itemType: PlatformRegistryItemType, item: RegistryCatalogItem) {
  return {
    enabled: item.status !== "planned",
    publicVisible: item.surface === "public" || item.surface === "both",
    workspaceVisible: item.surface === "workspace" || item.surface === "both",
    bindingTarget: getDefaultBindingTarget(itemType, item.slug),
    bindingMode: getDefaultBindingMode(item.status),
    notes: "",
  }
}

export function getPlatformRegistryBindingOptions(
  itemType: PlatformRegistryItemType,
  locale: AppLocale,
): PlatformRegistryBindingOption[] {
  const label = (zh: string, en: string) => (locale === "zh" ? zh : en)

  if (itemType === "capability") {
    return [
      { value: "ai-chat", label: label("AI 对话工作台", "AI chat workspace") },
      { value: "ai-ppt", label: label("AI PPT", "AI PPT") },
      { value: "ai-image", label: label("AI 绘图", "AI image") },
      { value: "ai-video", label: label("AI 视频", "AI video") },
      { value: "agent-platform", label: label("智能体中台", "Agent platform") },
      { value: "knowledge-base", label: label("知识入口", "Knowledge hub") },
    ]
  }

  if (itemType === "agent") {
    return [
      { value: "ai-chat", label: label("AI 对话工作台", "AI chat workspace") },
      { value: "ai-ppt", label: label("AI PPT", "AI PPT") },
      { value: "ai-image", label: label("AI 绘图", "AI image") },
      { value: "ai-video", label: label("AI 视频", "AI video") },
      { value: "agent-platform", label: label("智能体中台", "Agent platform") },
    ]
  }

  if (itemType === "plugin") {
    return [
      { value: "ai-chat", label: label("AI 对话工作台", "AI chat workspace") },
      { value: "content-repurpose", label: label("内容复用工作流", "Content repurpose workflow") },
      { value: "ai-image", label: label("AI 绘图", "AI image") },
      { value: "ai-video", label: label("AI 视频", "AI video") },
      { value: "campaign-launch", label: label("Campaign Launch", "Campaign Launch") },
    ]
  }

  if (itemType === "mcp_service") {
    return [
      { value: "ai-chat", label: label("AI 对话工作台", "AI chat workspace") },
      { value: "campaign-launch", label: label("Campaign Launch", "Campaign Launch") },
      { value: "ai-image", label: label("AI 绘图", "AI image") },
      { value: "agent-platform", label: label("智能体中台", "Agent platform") },
      { value: "knowledge-base", label: label("知识库", "Knowledge base") },
      { value: "content-repurpose", label: label("内容复用工作流", "Content repurpose workflow") },
    ]
  }

  return [
    { value: "ai-chat", label: label("AI 对话工作台", "AI chat workspace") },
    { value: "ai-ppt", label: label("AI PPT", "AI PPT") },
    { value: "ai-image", label: label("AI 绘图", "AI image") },
    { value: "ai-video", label: label("AI 视频", "AI video") },
    { value: "agent-platform", label: label("智能体中台", "Agent platform") },
    { value: "content-repurpose", label: label("内容复用工作流", "Content repurpose workflow") },
    { value: "campaign-launch", label: label("Campaign Launch", "Campaign Launch") },
    { value: "visual-ad-pipeline", label: label("Visual Ad Pipeline", "Visual Ad Pipeline") },
    { value: "knowledge-base", label: label("知识库", "Knowledge base") },
  ]
}

function getCatalogItems(locale: AppLocale, itemType: PlatformRegistryItemType): RegistryCatalogItem[] {
  if (itemType === "capability") {
    try {
      const { resolveLocalizedPlatformCapabilitiesFromSnapshot } =
        require("@/lib/platform/capability-resolver") as typeof import("@/lib/platform/capability-resolver")
      const { getPlatformRuntimeSnapshot } =
        require("@/lib/platform/runtime") as typeof import("@/lib/platform/runtime")
      return resolveLocalizedPlatformCapabilitiesFromSnapshot(locale, "all", getPlatformRuntimeSnapshot())
    } catch {
      return getLocalizedPlatformCapabilities(locale, "all")
    }
  }
  if (itemType === "agent") return getLocalizedPlatformAgents(locale, "all")
  if (itemType === "plugin") return getLocalizedPlatformPlugins(locale, "all")
  if (itemType === "mcp_service") return getLocalizedPlatformMcpServices(locale, "all")
  return getLocalizedPlatformWorkflows(locale, "all")
}

function mergeControlEntry(
  locale: AppLocale,
  itemType: PlatformRegistryItemType,
  item: RegistryCatalogItem,
  persisted?: RegistryConfigRow,
): PlatformRegistryControlEntry {
  const defaultConfig = buildDefaultConfig(itemType, item)
  const config = {
    enabled: typeof persisted?.enabled === "boolean" ? Boolean(persisted.enabled) : defaultConfig.enabled,
    publicVisible: typeof persisted?.publicVisible === "boolean" ? Boolean(persisted.publicVisible) : defaultConfig.publicVisible,
    workspaceVisible:
      typeof persisted?.workspaceVisible === "boolean" ? Boolean(persisted.workspaceVisible) : defaultConfig.workspaceVisible,
    bindingTarget: persisted?.bindingTarget?.trim() || defaultConfig.bindingTarget,
    bindingMode: normalizeBindingMode(persisted?.bindingMode || defaultConfig.bindingMode),
    notes: persisted?.notes?.trim() || defaultConfig.notes,
  }

  return {
    itemType,
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    status: item.status,
    publicHref: item.publicHref,
    workspaceHref: item.workspaceHref,
    capabilityKind: itemType === "capability" && "kind" in item ? item.kind : undefined,
    bindings: itemType === "capability" && "bindings" in item ? item.bindings : undefined,
    defaultConfig,
    config,
    proofPoints: item.proofPoints,
    surfaceLabel: getSurfaceLabel(item, locale),
    bindingOptions: getPlatformRegistryBindingOptions(itemType, locale),
  }
}

function normalizeBoolean(input: unknown, fallback: boolean) {
  return typeof input === "boolean" ? input : fallback
}

function normalizeText(input: unknown, fallback = "") {
  return typeof input === "string" && input.trim() ? input.trim() : fallback
}

export async function listPlatformRegistryControlEntries(locale: AppLocale, enterpriseId: number, itemType: PlatformRegistryItemType) {
  await ensurePlatformRegistryTables()

  const [items, persistedRows] = await Promise.all([
    Promise.resolve(getCatalogItems(locale, itemType)),
    withPlatformRegistryDbRetry("platform-registry-configs.list", async () =>
      db
        .select()
        .from(enterprisePlatformRegistryConfigs)
        .where(
          and(
            eq(enterprisePlatformRegistryConfigs.enterpriseId, enterpriseId),
            eq(enterprisePlatformRegistryConfigs.itemType, itemType),
          ),
        )
        .orderBy(desc(enterprisePlatformRegistryConfigs.updatedAt), desc(enterprisePlatformRegistryConfigs.id)),
    ),
  ])

  const persistedBySlug = new Map(persistedRows.map((row) => [row.itemSlug, row]))
  return items.map((item) => mergeControlEntry(locale, itemType, item, persistedBySlug.get(item.slug)))
}

export function buildPlatformRegistryDefaultEntries(locale: AppLocale, itemType: PlatformRegistryItemType) {
  return getCatalogItems(locale, itemType).map((item) => mergeControlEntry(locale, itemType, item))
}

export async function upsertPlatformRegistryControlEntry(input: {
  enterpriseId: number
  itemType: PlatformRegistryItemType
  slug: string
  enabled?: boolean
  publicVisible?: boolean
  workspaceVisible?: boolean
  bindingTarget?: string
  bindingMode?: PlatformBindingMode
  notes?: string
}) {
  await ensurePlatformRegistryTables()

  const existingRows = await withPlatformRegistryDbRetry("platform-registry-configs.select", async () =>
    db
      .select()
      .from(enterprisePlatformRegistryConfigs)
      .where(
        and(
          eq(enterprisePlatformRegistryConfigs.enterpriseId, input.enterpriseId),
          eq(enterprisePlatformRegistryConfigs.itemType, input.itemType),
          eq(enterprisePlatformRegistryConfigs.itemSlug, input.slug),
        ),
      )
      .limit(1),
  )

  const existing = existingRows[0]

  const nextValues = {
    enabled: normalizeBoolean(input.enabled, existing ? Boolean(existing.enabled) : true),
    publicVisible: normalizeBoolean(input.publicVisible, existing ? Boolean(existing.publicVisible) : false),
    workspaceVisible: normalizeBoolean(input.workspaceVisible, existing ? Boolean(existing.workspaceVisible) : true),
    bindingTarget: normalizeText(input.bindingTarget, existing?.bindingTarget || ""),
    bindingMode: normalizeBindingMode(input.bindingMode || existing?.bindingMode || "existing_runtime"),
    notes: normalizeText(input.notes, existing?.notes || ""),
  }

  if (existing?.id) {
    await withPlatformRegistryDbRetry("platform-registry-configs.update", async () =>
      db
        .update(enterprisePlatformRegistryConfigs)
        .set({
          enabled: nextValues.enabled,
          publicVisible: nextValues.publicVisible,
          workspaceVisible: nextValues.workspaceVisible,
          bindingTarget: nextValues.bindingTarget || null,
          bindingMode: nextValues.bindingMode,
          notes: nextValues.notes || null,
          updatedAt: new Date(),
        })
        .where(eq(enterprisePlatformRegistryConfigs.id, existing.id)),
    )
  } else {
    await withPlatformRegistryDbRetry("platform-registry-configs.insert", async () =>
      db.insert(enterprisePlatformRegistryConfigs).values({
        enterpriseId: input.enterpriseId,
        itemType: input.itemType,
        itemSlug: input.slug,
        enabled: nextValues.enabled,
        publicVisible: nextValues.publicVisible,
        workspaceVisible: nextValues.workspaceVisible,
        bindingTarget: nextValues.bindingTarget || null,
        bindingMode: nextValues.bindingMode,
        notes: nextValues.notes || null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    )
  }

  return nextValues
}

export function canManagePlatformRegistry(user: AuthUserPayload | null | undefined) {
  return Boolean(
    user?.enterpriseId &&
      user.enterpriseStatus === "active" &&
      user.enterpriseRole === "admin",
  )
}
