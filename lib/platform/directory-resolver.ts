import type { AppLocale } from "@/lib/i18n/config"
import { listEnterpriseAgentCards, type EnterpriseAgentCardRecord } from "@/lib/platform/agent-cards"
import {
  getPlatformRegistryBindingOptions,
  buildPlatformRegistryDefaultEntries,
  listPlatformRegistryControlEntries,
  type PlatformRegistryControlEntry,
  type PlatformRegistryItemType,
} from "@/lib/platform/control-plane"
import {
  listEnterpriseMcpServiceProfiles,
  type EnterpriseMcpServiceProfileRecord,
} from "@/lib/platform/mcp-service-profiles"
import { listEnterprisePluginSlots, type EnterprisePluginSlotRecord } from "@/lib/platform/plugin-slots"
import {
  listEnterpriseWorkflowTemplates,
  type EnterpriseWorkflowTemplateRecord,
} from "@/lib/platform/workflow-templates"

type PlatformDirectorySurface = "public" | "workspace"

type PlatformDirectoryCustomRecord =
  | EnterpriseAgentCardRecord
  | EnterpriseWorkflowTemplateRecord
  | EnterprisePluginSlotRecord
  | EnterpriseMcpServiceProfileRecord

type PlatformDirectoryDependencies = {
  loadBaseEntries: (locale: AppLocale, enterpriseId: number | null | undefined, itemType: PlatformRegistryItemType) => Promise<
    PlatformRegistryControlEntry[]
  >
  loadCustomEntries: (
    locale: AppLocale,
    enterpriseId: number | null | undefined,
    itemType: PlatformRegistryItemType,
  ) => Promise<PlatformRegistryControlEntry[]>
}

function getRegistryHubHrefs(itemType: PlatformRegistryItemType) {
  if (itemType === "capability") {
    return { publicHref: "/capabilities", workspaceHref: "/dashboard/capabilities" }
  }

  if (itemType === "agent") {
    return { publicHref: "/agents", workspaceHref: "/dashboard/agent-platform" }
  }

  if (itemType === "plugin") {
    return { publicHref: "/plugins", workspaceHref: "/dashboard/plugins" }
  }

  if (itemType === "mcp_service") {
    return { publicHref: "/mcp-services", workspaceHref: "/dashboard/mcp-services" }
  }

  return { publicHref: "/workflows", workspaceHref: "/dashboard/workflows" }
}

function getBindingTargetHrefs(bindingTarget: string) {
  if (bindingTarget === "ai-chat") {
    return { publicHref: "/tools/ai-chat", workspaceHref: "/dashboard/ai" }
  }

  if (bindingTarget === "ai-ppt") {
    return { publicHref: "/tools/ai-ppt-preview", workspaceHref: "/dashboard/capabilities?feature=ai-ppt" }
  }

  if (bindingTarget === "ai-image") {
    return { publicHref: "/tools/ai-image", workspaceHref: "/dashboard/image-assistant" }
  }

  if (bindingTarget === "ai-video") {
    return { publicHref: "/tools/ai-video", workspaceHref: "/dashboard/video" }
  }

  if (bindingTarget === "agent-platform") {
    return { publicHref: "/agents", workspaceHref: "/dashboard/agent-platform" }
  }

  if (bindingTarget === "content-repurpose") {
    return { publicHref: "/workflows", workspaceHref: "/dashboard/writer" }
  }

  if (bindingTarget === "campaign-launch") {
    return { publicHref: "/workflows", workspaceHref: "/dashboard/workflows" }
  }

  if (bindingTarget === "visual-ad-pipeline") {
    return { publicHref: "/workflows", workspaceHref: "/dashboard/workflows" }
  }

  if (
    bindingTarget === "sales-proposal" ||
    bindingTarget === "paid-media-creative-pipeline" ||
    bindingTarget === "seo-aeo-growth-engine" ||
    bindingTarget === "short-video-growth" ||
    bindingTarget === "brand-asset-factory" ||
    bindingTarget === "reputation-guard" ||
    bindingTarget === "compliance-review" ||
    bindingTarget === "training-enablement" ||
    bindingTarget === "knowledge-asset-loop"
  ) {
    return { publicHref: "/workflows", workspaceHref: "/dashboard/workflows" }
  }

  if (bindingTarget === "knowledge-base") {
    return { publicHref: "/capabilities", workspaceHref: "/dashboard/knowledge-base" }
  }

  return {}
}

function withResolvedEntryHrefs(entry: PlatformRegistryControlEntry) {
  const registryHubHrefs = getRegistryHubHrefs(entry.itemType)
  const bindingTarget = entry.config.bindingTarget?.trim() || entry.defaultConfig.bindingTarget?.trim() || ""

  if (entry.config.bindingMode === "deferred") {
    return {
      ...entry,
      publicHref: entry.publicHref || registryHubHrefs.publicHref,
      workspaceHref: entry.workspaceHref || registryHubHrefs.workspaceHref,
    }
  }

  const bindingTargetHrefs = getBindingTargetHrefs(bindingTarget)
  return {
    ...entry,
    publicHref: bindingTargetHrefs.publicHref || entry.publicHref || registryHubHrefs.publicHref,
    workspaceHref: bindingTargetHrefs.workspaceHref || entry.workspaceHref || registryHubHrefs.workspaceHref,
  }
}

function getCustomSurfaceLabel(
  locale: AppLocale,
  publicVisible: boolean,
  workspaceVisible: boolean,
) {
  if (publicVisible && workspaceVisible) return locale === "zh" ? "公开 + 企业" : "Public + workspace"
  if (publicVisible) return locale === "zh" ? "公开前台" : "Public"
  return locale === "zh" ? "企业工作台" : "Workspace"
}

function toCustomProofPoints(
  locale: AppLocale,
  itemType: PlatformRegistryItemType,
  bindingTarget: string,
  bindingMode: PlatformRegistryControlEntry["config"]["bindingMode"],
) {
  const kindLabel =
    locale === "zh"
      ? {
          agent: "企业自定义智能体卡片",
          capability: "企业自定义能力入口",
          workflow: "企业自定义工作流模板",
          plugin: "企业自定义插件位",
          mcp_service: "企业自定义 MCP 服务",
        }[itemType]
      : {
          capability: "Enterprise custom capability entry",
          agent: "Enterprise custom agent card",
          workflow: "Enterprise custom workflow template",
          plugin: "Enterprise custom plugin slot",
          mcp_service: "Enterprise custom MCP service",
        }[itemType]

  const bindingLabel = locale === "zh" ? `绑定目标: ${bindingTarget}` : `Binding target: ${bindingTarget}`
  const modeLabel =
    locale === "zh"
      ? {
          existing_runtime: "绑定模式: 现有运行时",
          deferred: "绑定模式: 后续接入",
          external_runtime: "绑定模式: 外部运行时",
        }[bindingMode]
      : {
          existing_runtime: "Binding mode: existing runtime",
          deferred: "Binding mode: deferred",
          external_runtime: "Binding mode: external runtime",
        }[bindingMode]

  return [kindLabel, bindingLabel, modeLabel]
}

function toCustomDirectoryEntry(
  locale: AppLocale,
  itemType: PlatformRegistryItemType,
  record: PlatformDirectoryCustomRecord,
): PlatformRegistryControlEntry {
  const defaultBindingTarget = record.bindingTarget?.trim() || "agent-platform"
  const defaultConfig = {
    enabled: record.status !== "planned",
    publicVisible: Boolean(record.publicVisible),
    workspaceVisible: Boolean(record.workspaceVisible),
    bindingTarget: defaultBindingTarget,
    bindingMode: record.bindingMode,
    notes: record.notes,
  }

  return {
    itemType,
    slug: record.slug,
    title: record.title,
    summary: record.summary,
    status: record.status,
    ...getRegistryHubHrefs(itemType),
    defaultConfig,
    config: defaultConfig,
    proofPoints: toCustomProofPoints(locale, itemType, defaultBindingTarget, record.bindingMode),
    surfaceLabel: getCustomSurfaceLabel(locale, defaultConfig.publicVisible, defaultConfig.workspaceVisible),
    bindingOptions: getPlatformRegistryBindingOptions(itemType, locale),
  }
}

async function loadBaseDirectoryEntries(
  locale: AppLocale,
  enterpriseId: number | null | undefined,
  itemType: PlatformRegistryItemType,
) {
  return enterpriseId
    ? listPlatformRegistryControlEntries(locale, enterpriseId, itemType)
    : Promise.resolve(buildPlatformRegistryDefaultEntries(locale, itemType))
}

async function loadCustomDirectoryEntries(
  locale: AppLocale,
  enterpriseId: number | null | undefined,
  itemType: PlatformRegistryItemType,
) {
  if (!enterpriseId) return []

  if (itemType === "agent") {
    return (await listEnterpriseAgentCards(locale, enterpriseId)).map((record) =>
      toCustomDirectoryEntry(locale, itemType, record),
    )
  }

  if (itemType === "capability") {
    return []
  }

  if (itemType === "workflow") {
    return (await listEnterpriseWorkflowTemplates(locale, enterpriseId)).map((record) =>
      toCustomDirectoryEntry(locale, itemType, record),
    )
  }

  if (itemType === "plugin") {
    return (await listEnterprisePluginSlots(locale, enterpriseId)).map((record) =>
      toCustomDirectoryEntry(locale, itemType, record),
    )
  }

  return (await listEnterpriseMcpServiceProfiles(locale, enterpriseId)).map((record) =>
    toCustomDirectoryEntry(locale, itemType, record),
  )
}

async function buildVisiblePlatformRegistryEntries(
  input: {
    locale: AppLocale
    itemType: PlatformRegistryItemType
    surface: PlatformDirectorySurface
    enterpriseId?: number | null
  },
  dependencies: PlatformDirectoryDependencies,
) {
  const { locale, itemType, surface, enterpriseId } = input
  const [baseEntries, customEntries] = await Promise.all([
    dependencies.loadBaseEntries(locale, enterpriseId, itemType),
    dependencies.loadCustomEntries(locale, enterpriseId, itemType),
  ])

  const mergedBySlug = new Map(baseEntries.map((entry) => [entry.slug, entry]))
  for (const customEntry of customEntries) {
    mergedBySlug.set(customEntry.slug, customEntry)
  }

  return filterPlatformRegistryEntriesForSurface([...mergedBySlug.values()], surface).map(withResolvedEntryHrefs)
}

async function buildAdminPlatformRegistryEntries(
  input: {
    locale: AppLocale
    itemType: PlatformRegistryItemType
    enterpriseId?: number | null
  },
  dependencies: PlatformDirectoryDependencies,
) {
  const { locale, itemType, enterpriseId } = input
  const [baseEntries, customEntries] = await Promise.all([
    dependencies.loadBaseEntries(locale, enterpriseId, itemType),
    dependencies.loadCustomEntries(locale, enterpriseId, itemType),
  ])

  const mergedBySlug = new Map(baseEntries.map((entry) => [entry.slug, entry]))
  for (const customEntry of customEntries) {
    mergedBySlug.set(customEntry.slug, customEntry)
  }

  return [...mergedBySlug.values()].map(withResolvedEntryHrefs)
}

function isVisibleOnSurface(entry: PlatformRegistryControlEntry, surface: PlatformDirectorySurface) {
  if (!entry.config.enabled) return false
  return surface === "public" ? entry.config.publicVisible : entry.config.workspaceVisible
}

export function filterPlatformRegistryEntriesForSurface(
  entries: PlatformRegistryControlEntry[],
  surface: PlatformDirectorySurface,
) {
  return entries.filter((entry) => isVisibleOnSurface(entry, surface))
}

export async function listVisiblePlatformRegistryEntries(input: {
  locale: AppLocale
  itemType: PlatformRegistryItemType
  surface: PlatformDirectorySurface
  enterpriseId?: number | null
}) {
  const { locale, itemType, surface, enterpriseId } = input

  try {
    return await buildVisiblePlatformRegistryEntries(
      {
        locale,
        itemType,
        surface,
        enterpriseId,
      },
      {
        loadBaseEntries: loadBaseDirectoryEntries,
        loadCustomEntries: loadCustomDirectoryEntries,
      },
    )
  } catch (error) {
    console.warn("platform.directory.entries.resolve.failed", {
      itemType,
      surface,
      enterpriseId,
      message: error instanceof Error ? error.message : "unknown_error",
    })
    return filterPlatformRegistryEntriesForSurface(buildPlatformRegistryDefaultEntries(locale, itemType), surface)
  }
}

export async function listPlatformRegistryAdminEntries(input: {
  locale: AppLocale
  itemType: PlatformRegistryItemType
  enterpriseId?: number | null
}) {
  const { locale, itemType, enterpriseId } = input

  try {
    return await buildAdminPlatformRegistryEntries(
      {
        locale,
        itemType,
        enterpriseId,
      },
      {
        loadBaseEntries: loadBaseDirectoryEntries,
        loadCustomEntries: loadCustomDirectoryEntries,
      },
    )
  } catch (error) {
    console.warn("platform.registry.admin.entries.resolve.failed", {
      itemType,
      enterpriseId,
      message: error instanceof Error ? error.message : "unknown_error",
    })
    return buildPlatformRegistryDefaultEntries(locale, itemType).map(withResolvedEntryHrefs)
  }
}

export const __testables__ = {
  buildAdminPlatformRegistryEntries,
  buildVisiblePlatformRegistryEntries,
  toCustomDirectoryEntry,
  withResolvedEntryHrefs,
}
