import type { AppLocale } from "@/lib/i18n/config"
import { resolveLocalizedPlatformCapabilitiesFromSnapshot } from "@/lib/platform/capability-resolver"
import {
  getLocalizedPlatformHubLinks,
  getLocalizedPlatformAgents,
  getLocalizedPlatformCapabilityBySlug,
  getLocalizedPlatformMcpServices,
  getLocalizedPlatformPlugins,
  getLocalizedPlatformWorkflows,
  type LocalizedAgentCard,
  type LocalizedMcpServiceDescriptor,
  type LocalizedPluginDescriptor,
  type LocalizedWorkflowTemplate,
} from "@/lib/platform/catalog"
import {
  getLocalizedLeadToolsCatalog,
  type LeadToolAccessMode,
  type LeadToolDefinition,
  type LeadToolMedia,
  type LeadToolScene,
} from "@/lib/lead-tools/catalog"
import {
  getPlatformDirectoryAvailability as resolveSharedDirectoryAvailability,
  getPlatformDirectorySourceMap as getSharedPlatformDirectorySourceMap,
  type PlatformDirectoryAvailability,
  type PlatformDirectoryItemType,
  type PlatformDirectorySourceRef,
  type PlatformDirectorySurface,
} from "@/lib/platform/directory-config"
import { getPlatformRuntimeSnapshot } from "@/lib/platform/runtime"

type PlatformDirectoryEntryBase = {
  itemType: PlatformDirectoryItemType
  slug: string
  title: string
  summary: string
  proofPoints: string[]
  availability: PlatformDirectoryAvailability
  sourceRefs: PlatformDirectorySourceRef[]
}

export type LocalizedToolDirectoryEntry = PlatformDirectoryEntryBase &
  Pick<
    LeadToolDefinition,
    | "category"
    | "description"
    | "downloadRequiresLogin"
    | "faqs"
    | "featured"
    | "finalModel"
    | "finalizeRequiresLogin"
    | "href"
    | "icon"
    | "media"
    | "name"
    | "previewEnabled"
    | "previewModel"
    | "scenes"
    | "shortName"
    | "tagline"
  > & {
    itemType: "tool"
    status: LeadToolDefinition["status"]
    accessMode: LeadToolAccessMode
    surface: "public"
  }

export type PublicToolsCenterEntry = {
  slug: string
  title: string
  shortTitle: string
  tagline: string
  description: string
  href: string
  icon: LeadToolDefinition["icon"] | "agent"
  availability: PlatformDirectoryAvailability
  media: LeadToolMedia | "agent"
  scenes: LeadToolScene[]
  accessMode: LeadToolAccessMode | "public_directory"
  kind: "tool" | "directory"
  itemType: "tool" | "agent"
  proofPoints: string[]
  sourceRefs: PlatformDirectorySourceRef[]
  featured?: boolean
}

type LocalizedPlatformCatalogEntry =
  | {
      slug: string
      title: string
      summary: string
      proofPoints: string[]
      status: "live" | "beta" | "planned"
      publicHref?: string
      workspaceHref?: string
    }
  | LocalizedAgentCard
  | LocalizedPluginDescriptor
  | LocalizedMcpServiceDescriptor
  | LocalizedWorkflowTemplate

export type LocalizedPlatformDirectoryEntry = PlatformDirectoryEntryBase & {
  itemType: Exclude<PlatformDirectoryItemType, "tool">
  status: "live" | "beta" | "planned"
  surface: PlatformDirectorySurface
  publicHref?: string
  workspaceHref?: string
}

const DIRECTORY_SOURCE_MAP = getSharedPlatformDirectorySourceMap()

function getAiMusicPublicToolsEntry(locale: AppLocale): PublicToolsCenterEntry | null {
  const capability = getLocalizedPlatformCapabilityBySlug(locale, "ai-music")
  if (!capability) return null

  return {
    slug: capability.slug,
    title: capability.title,
    shortTitle: locale === "zh" ? "AI 音乐" : "AI Music",
    tagline:
      locale === "zh"
        ? "从 public toolsite 进入 AI 配乐与音频生成入口。"
        : "Use one public toolsite entry for AI music and soundtrack generation.",
    description: capability.summary,
    href: capability.publicHref || "/tools/ai-music",
    icon: "video",
    availability: "available",
    media: "video",
    scenes: ["content_creation", "campaign_launch", "video_growth"],
    accessMode: "workspace_entry",
    kind: "tool",
    itemType: "tool",
    proofPoints: capability.proofPoints,
    sourceRefs: [
      ...DIRECTORY_SOURCE_MAP.capability,
      {
        id: "ai-music-public-page",
        label: "AI music public page",
        file: "app/tools/ai-music/page.tsx",
        description: "Localized public landing page for the AI music capability entry.",
      },
    ],
    featured: true,
  }
}

function resolvePlatformSurface(publicHref?: string, workspaceHref?: string): PlatformDirectorySurface {
  if (publicHref && workspaceHref) return "both"
  if (publicHref) return "public"
  return "workspace"
}

function resolveAvailability(
  itemType: PlatformDirectoryItemType,
  slug: string,
  status: "live" | "beta" | "planned" | "live_tool" | "coming_soon_tool",
  surface: PlatformDirectorySurface,
) {
  return resolveSharedDirectoryAvailability(itemType, slug, {
    status,
    surface,
  })
}

function toPlatformDirectoryEntry(
  itemType: Exclude<PlatformDirectoryItemType, "tool">,
  item: LocalizedPlatformCatalogEntry,
): LocalizedPlatformDirectoryEntry {
  const surface = resolvePlatformSurface(item.publicHref, item.workspaceHref)

  return {
    itemType,
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    proofPoints: item.proofPoints,
    status: item.status,
    availability: resolveAvailability(itemType, item.slug, item.status, surface),
    surface,
    publicHref: item.publicHref,
    workspaceHref: item.workspaceHref,
    sourceRefs: DIRECTORY_SOURCE_MAP[itemType],
  }
}

export {
  getPlatformDirectoryAvailability,
  getPlatformDirectorySourceMap,
  type PlatformDirectoryAvailability,
} from "@/lib/platform/directory-config"

export function getLocalizedToolDirectoryEntries(locale: AppLocale): LocalizedToolDirectoryEntry[] {
  return getLocalizedLeadToolsCatalog(locale).map((tool) => ({
    ...tool,
    itemType: "tool",
    title: tool.name,
    summary: tool.description,
    availability: resolveAvailability(
      "tool",
      tool.slug,
      tool.status === "live" ? "live_tool" : "coming_soon_tool",
      "public",
    ),
    surface: "public",
    sourceRefs: DIRECTORY_SOURCE_MAP.tool,
  }))
}

export function getLocalizedPublicToolsCenterEntries(locale: AppLocale): PublicToolsCenterEntry[] {
  const tools = getLocalizedToolDirectoryEntries(locale).map<PublicToolsCenterEntry>((tool) => ({
    slug: tool.slug,
    title: tool.name,
    shortTitle: tool.shortName,
    tagline: tool.tagline,
    description: tool.description,
    href: tool.href,
    icon: tool.icon,
    availability: tool.availability,
    media: tool.media,
    scenes: tool.scenes,
    accessMode: tool.accessMode,
    kind: "tool",
    itemType: "tool",
    proofPoints: tool.proofPoints,
    sourceRefs: tool.sourceRefs,
    featured: tool.featured,
  }))
  const aiMusicEntry = getAiMusicPublicToolsEntry(locale)

  const agentHub = getLocalizedPlatformHubLinks(locale).find((item) => item.slug === "agents")
  const agentEntries = agentHub
    ? [
        {
          slug: "agents",
          title: agentHub.title,
          shortTitle: agentHub.title,
          tagline:
            locale === "zh"
              ? "浏览品牌策略、增长营销、公共关系等营销智能体入口。"
              : "Browse reusable brand strategy, growth marketing, and public relations agents.",
          description: agentHub.summary,
          href: agentHub.href,
          icon: "agent" as const,
          availability: "available" as const,
          media: "agent" as const,
          scenes: ["agent_collaboration", "brand_strategy", "research_analysis"] as LeadToolScene[],
          accessMode: "public_directory" as const,
          kind: "directory" as const,
          itemType: "agent" as const,
          proofPoints:
            locale === "zh"
              ? ["统一智能体入口", "公开浏览，后续接入企业工作台", "复用 Phase 1 registry 目录数据"]
              : [
                  "Unified agent entry point",
                  "Public browsing with a path into the enterprise workspace",
                  "Built on the shared Phase 1 registry",
                ],
          sourceRefs: DIRECTORY_SOURCE_MAP.agent,
          featured: true,
        },
      ]
    : []

  return [...tools, ...(aiMusicEntry ? [aiMusicEntry] : []), ...agentEntries]
}

export function getLocalizedToolDirectoryEntryBySlug(locale: AppLocale, slug: string) {
  return getLocalizedToolDirectoryEntries(locale).find((tool) => tool.slug === slug) ?? null
}

export function getLocalizedPlatformDirectoryEntries(
  locale: AppLocale,
  itemType: Exclude<PlatformDirectoryItemType, "tool">,
) {
  if (itemType === "capability") {
    return resolveLocalizedPlatformCapabilitiesFromSnapshot(locale, "all", getPlatformRuntimeSnapshot()).map((item) =>
      toPlatformDirectoryEntry(itemType, item),
    )
  }

  if (itemType === "agent") {
    return getLocalizedPlatformAgents(locale, "all").map((item) => toPlatformDirectoryEntry(itemType, item))
  }

  if (itemType === "plugin") {
    return getLocalizedPlatformPlugins(locale, "all").map((item) => toPlatformDirectoryEntry(itemType, item))
  }

  if (itemType === "mcp_service") {
    return getLocalizedPlatformMcpServices(locale, "all").map((item) => toPlatformDirectoryEntry(itemType, item))
  }

  return getLocalizedPlatformWorkflows(locale, "all").map((item) => toPlatformDirectoryEntry(itemType, item))
}

export function getLocalizedPlatformDirectoryEntryBySlug(
  locale: AppLocale,
  itemType: Exclude<PlatformDirectoryItemType, "tool">,
  slug: string,
) {
  return getLocalizedPlatformDirectoryEntries(locale, itemType).find((item) => item.slug === slug) ?? null
}
