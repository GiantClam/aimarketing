import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicSiteHeader } from "@/components/seo/public-site-header"
import { PublicPlatformDetail } from "@/components/platform/public-platform-detail"
import { RegistryExecutionPanel } from "@/components/platform/registry-execution-panel"
import { getServerSessionUser } from "@/lib/auth/server-session"
import type { AppLocale } from "@/lib/i18n/config"
import { buildLocalizedPublicUrl, getLocalizedPublicAlternates } from "@/lib/i18n/routing"
import {
  getLocalizedPlatformAgentBySlug,
  getLocalizedPlatformAgents,
  getLocalizedPlatformCapabilityBySlug,
  getLocalizedPlatformCapabilities,
  getLocalizedPlatformMcpServiceBySlug,
  getLocalizedPlatformMcpServices,
  getLocalizedPlatformPluginBySlug,
  getLocalizedPlatformPlugins,
  getLocalizedPlatformWorkflowBySlug,
  getLocalizedPlatformWorkflows,
  type LocalizedAgentCard,
  type LocalizedMcpServiceDescriptor,
  type LocalizedPluginDescriptor,
  type LocalizedWorkflowTemplate,
} from "@/lib/platform/catalog"
import { getLocalizedPlatformDirectoryEntryBySlug } from "@/lib/platform/directory-registry"
import { getPlatformRegistryEntryExecutionState } from "@/lib/platform/registry-entry-execution"
import { getPlatformCapabilityExecutionState } from "@/lib/platform/execution"

type PlatformEntryKind = "capability" | "plugin" | "mcp_service" | "workflow" | "agent"

function getStatusLabel(locale: AppLocale, status: "live" | "beta" | "planned") {
  if (locale === "zh") {
    if (status === "live") return "已上线"
    if (status === "beta") return "Beta"
    return "规划中"
  }
  if (status === "live") return "Live"
  if (status === "beta") return "Beta"
  return "Planned"
}

function getCapabilityExecutionLabel(
  locale: AppLocale,
  runtimeStatus: "ready" | "deferred" | "runtime_disabled",
  accessState: "public" | "public_then_login" | "login_required" | "authorized" | "permission_required" | "admin_required",
) {
  const runtimeLabel =
    locale === "zh"
      ? {
          ready: "运行中",
          deferred: "后续实现",
          runtime_disabled: "运行时关闭",
        }[runtimeStatus]
      : {
          ready: "Runtime ready",
          deferred: "Deferred",
          runtime_disabled: "Runtime disabled",
        }[runtimeStatus]

  const accessLabel =
    locale === "zh"
      ? {
          public: "公开可见",
          public_then_login: "先公开后登录",
          login_required: "需登录",
          authorized: "已授权",
          permission_required: "需企业权限",
          admin_required: "需管理员",
        }[accessState]
      : {
          public: "Public",
          public_then_login: "Public then login",
          login_required: "Login required",
          authorized: "Authorized",
          permission_required: "Permission required",
          admin_required: "Admin required",
        }[accessState]

  return `${runtimeLabel} · ${accessLabel}`
}

function metadataForPlatformEntry(
  locale: AppLocale,
  path: string,
  title: string,
  description: string,
): Metadata {
  const canonical = buildLocalizedPublicUrl(path, locale)

  return {
    title: { absolute: `${title} | AI Marketing` },
    description,
    alternates: {
      canonical,
      languages: getLocalizedPublicAlternates(path),
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "AI Marketing",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  }
}

export function getPlatformCapabilityStaticParams() {
  return getLocalizedPlatformCapabilities("en", "public").map((item) => ({ slug: item.slug }))
}

export function getPlatformPluginStaticParams() {
  return getLocalizedPlatformPlugins("en", "public").map((item) => ({ slug: item.slug }))
}

export function getPlatformMcpServiceStaticParams() {
  return getLocalizedPlatformMcpServices("en", "public").map((item) => ({ slug: item.slug }))
}

export function getPlatformWorkflowStaticParams() {
  return getLocalizedPlatformWorkflows("en", "public").map((item) => ({ slug: item.slug }))
}

export function getPlatformAgentStaticParams() {
  return getLocalizedPlatformAgents("en", "public").map((item) => ({ slug: item.slug }))
}

export function getPlatformCapabilityMetadata(locale: AppLocale, slug: string) {
  const capability = getLocalizedPlatformCapabilityBySlug(locale, slug)
  if (!capability) return {}
  return metadataForPlatformEntry(locale, `/capabilities/${slug}`, capability.title, capability.summary)
}

export function getPlatformPluginMetadata(locale: AppLocale, slug: string) {
  const entry = getLocalizedPlatformPluginBySlug(locale, slug)
  if (!entry) return {}
  return metadataForPlatformEntry(locale, `/plugins/${slug}`, entry.title, entry.summary)
}

export function getPlatformMcpServiceMetadata(locale: AppLocale, slug: string) {
  const entry = getLocalizedPlatformMcpServiceBySlug(locale, slug)
  if (!entry) return {}
  return metadataForPlatformEntry(locale, `/mcp-services/${slug}`, entry.title, entry.summary)
}

export function getPlatformWorkflowMetadata(locale: AppLocale, slug: string) {
  const entry = getLocalizedPlatformWorkflowBySlug(locale, slug)
  if (!entry) return {}
  return metadataForPlatformEntry(locale, `/workflows/${slug}`, entry.title, entry.summary)
}

export function getPlatformAgentMetadata(locale: AppLocale, slug: string) {
  const entry = getLocalizedPlatformAgentBySlug(locale, slug)
  if (!entry) return {}
  return metadataForPlatformEntry(locale, `/agents/${slug}`, entry.title, entry.summary)
}

async function buildCapabilityDetail(locale: AppLocale, slug: string) {
  const currentUser = await getServerSessionUser().catch(() => null)
  const capability = getLocalizedPlatformCapabilityBySlug(locale, slug)
  if (!capability) return null

  const execution = await getPlatformCapabilityExecutionState(slug, locale, currentUser)
  if (!execution) return null

  const detailLines = [
    {
      label: locale === "zh" ? "能力类型" : "Capability kind",
      value: capability.kind.toUpperCase(),
    },
    {
      label: locale === "zh" ? "平台状态" : "Platform status",
      value: getStatusLabel(locale, capability.status),
    },
    {
      label: locale === "zh" ? "运行时" : "Runtime",
      value: `${execution.task.runtimeId || "—"} · ${execution.runtimeStatus}`,
    },
    {
      label: locale === "zh" ? "访问门槛" : "Access",
      value: execution.accessState,
    },
    {
      label: locale === "zh" ? "Provider" : "Providers",
      value: execution.activeProviderIds.join(", ") || "—",
    },
  ]

  return {
    itemType: "capability" as const,
    slug,
    availability: getLocalizedPlatformDirectoryEntryBySlug(locale, "capability", slug)?.availability,
    bindingTarget: slug,
    runtimeStatus: execution.runtimeStatus,
    accessState: execution.accessState,
    currentUser: Boolean(currentUser),
    loginHref: execution.workspaceHref,
    title: capability.title,
    summary: capability.summary,
    status: capability.status,
    extraLabel: getCapabilityExecutionLabel(locale, execution.runtimeStatus, execution.accessState),
    detailLines,
    proofPoints: execution.notes.length > 0 ? execution.notes : capability.proofPoints,
    publicHref: capability.publicHref,
    workspaceHref: capability.workspaceHref,
  }
}

async function buildRegistryDetail(
  locale: AppLocale,
  kind: Exclude<PlatformEntryKind, "capability">,
  slug: string,
) {
  const currentUser = await getServerSessionUser().catch(() => null)

  let entry:
    | LocalizedPluginDescriptor
    | LocalizedMcpServiceDescriptor
    | LocalizedWorkflowTemplate
    | LocalizedAgentCard
    | null = null

  if (kind === "plugin") entry = getLocalizedPlatformPluginBySlug(locale, slug)
  if (kind === "mcp_service") entry = getLocalizedPlatformMcpServiceBySlug(locale, slug)
  if (kind === "workflow") entry = getLocalizedPlatformWorkflowBySlug(locale, slug)
  if (kind === "agent") entry = getLocalizedPlatformAgentBySlug(locale, slug)
  if (!entry) return null

  const execution = await getPlatformRegistryEntryExecutionState({
    locale,
    itemType: kind,
    slug,
    surface: "public",
    enterpriseId: currentUser?.enterpriseId ?? null,
    currentUser,
  })
  if (!execution) return null

  const detailLines = [
    {
      label: locale === "zh" ? "平台状态" : "Platform status",
      value: getStatusLabel(locale, entry.status),
    },
    {
      label: locale === "zh" ? "展示面" : "Surface",
      value: entry.surface,
    },
    {
      label: locale === "zh" ? "绑定模式" : "Binding mode",
      value: execution.bindingMode,
    },
    {
      label: locale === "zh" ? "绑定目标" : "Binding target",
      value: execution.bindingTarget || "—",
    },
  ]

  if (execution.mappedCapabilitySlug) {
    detailLines.push({
      label: locale === "zh" ? "映射目标" : "Mapped target",
      value: execution.mappedCapabilitySlug,
    })
  }

  if (execution.runtimeStatus) {
    detailLines.push({
      label: locale === "zh" ? "运行时状态" : "Runtime status",
      value: execution.runtimeStatus,
    })
  }

  if (execution.accessState) {
    detailLines.push({
      label: locale === "zh" ? "访问门槛" : "Access",
      value: execution.accessState,
    })
  }

  if ("integratesWith" in entry) {
    detailLines.push({
      label: locale === "zh" ? "集成方向" : "Integrates with",
      value: entry.integratesWith,
    })
  }

  if ("serviceType" in entry) {
    detailLines.push({
      label: locale === "zh" ? "服务类型" : "Service type",
      value: entry.serviceType,
    })
  }

  if ("trigger" in entry) {
    detailLines.push({
      label: locale === "zh" ? "触发方式" : "Trigger",
      value: entry.trigger,
    })
  }

  if ("focus" in entry) {
    detailLines.push({
      label: locale === "zh" ? "聚焦场景" : "Focus",
      value: entry.focus,
    })
  }

  return {
    itemType: kind,
    slug,
    availability: getLocalizedPlatformDirectoryEntryBySlug(locale, kind, slug)?.availability,
    bindingTarget: execution.bindingTarget,
    runtimeStatus: execution.runtimeStatus,
    accessState: execution.accessState,
    currentUser: Boolean(currentUser),
    loginHref: execution.runtimeStatus === "deferred" ? execution.workspaceHref : execution.workspaceLaunchPath,
    title: entry.title,
    summary: entry.summary,
    status: entry.status,
    extraLabel: execution.label,
    detailLines,
    proofPoints: execution.notes.length > 0 ? execution.notes : entry.proofPoints,
    publicHref: execution.publicHref || entry.publicHref,
    workspaceHref: execution.workspaceHref || entry.workspaceHref,
  }
}

export async function renderPlatformCapabilityPage(locale: AppLocale, slug: string) {
  const detail = await buildCapabilityDetail(locale, slug)
  if (!detail) notFound()
  const displayLocale = locale === "zh" ? "zh" : "en"

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader activeKey="tools" />
      <PublicPlatformDetail
        locale={displayLocale}
        eyebrow={locale === "zh" ? "Capability Detail" : "Capability Detail"}
        title={detail.title}
        description={detail.summary}
        status={detail.status}
        availability={detail.availability}
        extraLabel={detail.extraLabel}
        detailLines={detail.detailLines}
        proofPoints={detail.proofPoints}
        publicHref={detail.publicHref}
        workspaceHref={detail.workspaceHref}
        launchItemType={detail.itemType}
        launchSlug={detail.slug}
      >
        <RegistryExecutionPanel
          locale={displayLocale}
          surface="public"
          itemType={detail.itemType}
          slug={detail.slug}
          bindingTarget={detail.bindingTarget}
          runtimeStatus={detail.runtimeStatus}
          availability={detail.availability}
          accessState={detail.accessState}
          currentUser={detail.currentUser}
          loginHref={detail.loginHref}
        />
      </PublicPlatformDetail>
      <PublicSiteFooter />
    </main>
  )
}

export async function renderPlatformPluginPage(locale: AppLocale, slug: string) {
  const detail = await buildRegistryDetail(locale, "plugin", slug)
  if (!detail) notFound()
  const displayLocale = locale === "zh" ? "zh" : "en"

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader activeKey="tools" />
      <PublicPlatformDetail
        locale={displayLocale}
        eyebrow={locale === "zh" ? "Plugin Detail" : "Plugin Detail"}
        title={detail.title}
        description={detail.summary}
        status={detail.status}
        availability={detail.availability}
        extraLabel={detail.extraLabel}
        detailLines={detail.detailLines}
        proofPoints={detail.proofPoints}
        publicHref={detail.publicHref}
        workspaceHref={detail.workspaceHref}
        launchItemType={detail.itemType}
        launchSlug={detail.slug}
      >
        <RegistryExecutionPanel
          locale={displayLocale}
          surface="public"
          itemType={detail.itemType}
          slug={detail.slug}
          bindingTarget={detail.bindingTarget}
          runtimeStatus={detail.runtimeStatus}
          availability={detail.availability}
          accessState={detail.accessState}
          currentUser={detail.currentUser}
          loginHref={detail.loginHref}
        />
      </PublicPlatformDetail>
      <PublicSiteFooter />
    </main>
  )
}

export async function renderPlatformMcpServicePage(locale: AppLocale, slug: string) {
  const detail = await buildRegistryDetail(locale, "mcp_service", slug)
  if (!detail) notFound()
  const displayLocale = locale === "zh" ? "zh" : "en"

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader activeKey="tools" />
      <PublicPlatformDetail
        locale={displayLocale}
        eyebrow={locale === "zh" ? "MCP Service Detail" : "MCP Service Detail"}
        title={detail.title}
        description={detail.summary}
        status={detail.status}
        availability={detail.availability}
        extraLabel={detail.extraLabel}
        detailLines={detail.detailLines}
        proofPoints={detail.proofPoints}
        publicHref={detail.publicHref}
        workspaceHref={detail.workspaceHref}
        launchItemType={detail.itemType}
        launchSlug={detail.slug}
      >
        <RegistryExecutionPanel
          locale={displayLocale}
          surface="public"
          itemType={detail.itemType}
          slug={detail.slug}
          bindingTarget={detail.bindingTarget}
          runtimeStatus={detail.runtimeStatus}
          availability={detail.availability}
          accessState={detail.accessState}
          currentUser={detail.currentUser}
          loginHref={detail.loginHref}
        />
      </PublicPlatformDetail>
      <PublicSiteFooter />
    </main>
  )
}

export async function renderPlatformWorkflowPage(locale: AppLocale, slug: string) {
  const detail = await buildRegistryDetail(locale, "workflow", slug)
  if (!detail) notFound()
  const displayLocale = locale === "zh" ? "zh" : "en"

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader activeKey="tools" />
      <PublicPlatformDetail
        locale={displayLocale}
        eyebrow={locale === "zh" ? "Workflow Detail" : "Workflow Detail"}
        title={detail.title}
        description={detail.summary}
        status={detail.status}
        availability={detail.availability}
        extraLabel={detail.extraLabel}
        detailLines={detail.detailLines}
        proofPoints={detail.proofPoints}
        publicHref={detail.publicHref}
        workspaceHref={detail.workspaceHref}
        launchItemType={detail.itemType}
        launchSlug={detail.slug}
      >
        <RegistryExecutionPanel
          locale={displayLocale}
          surface="public"
          itemType={detail.itemType}
          slug={detail.slug}
          bindingTarget={detail.bindingTarget}
          runtimeStatus={detail.runtimeStatus}
          availability={detail.availability}
          accessState={detail.accessState}
          currentUser={detail.currentUser}
          loginHref={detail.loginHref}
        />
      </PublicPlatformDetail>
      <PublicSiteFooter />
    </main>
  )
}

export async function renderPlatformAgentPage(locale: AppLocale, slug: string) {
  const detail = await buildRegistryDetail(locale, "agent", slug)
  if (!detail) return null
  const displayLocale = locale === "zh" ? "zh" : "en"

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader activeKey="tools" />
      <PublicPlatformDetail
        locale={displayLocale}
        eyebrow={locale === "zh" ? "Agent Detail" : "Agent Detail"}
        title={detail.title}
        description={detail.summary}
        status={detail.status}
        availability={detail.availability}
        extraLabel={detail.extraLabel}
        detailLines={detail.detailLines}
        proofPoints={detail.proofPoints}
        publicHref={detail.publicHref}
        workspaceHref={detail.workspaceHref}
        launchItemType={detail.itemType}
        launchSlug={detail.slug}
      >
        <RegistryExecutionPanel
          locale={displayLocale}
          surface="public"
          itemType={detail.itemType}
          slug={detail.slug}
          bindingTarget={detail.bindingTarget}
          runtimeStatus={detail.runtimeStatus}
          availability={detail.availability}
          accessState={detail.accessState}
          currentUser={detail.currentUser}
          loginHref={detail.loginHref}
        />
      </PublicPlatformDetail>
      <PublicSiteFooter />
    </main>
  )
}
