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
import { getPublicProofPoints, getPublicRegistryEntryLabel } from "@/lib/platform/public-status"
import { getPlatformCapabilityExecutionState } from "@/lib/platform/execution"
import { normalizePublicTitle } from "@/lib/seo/metadata"

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

function metadataForPlatformEntry(
  locale: AppLocale,
  path: string,
  title: string,
  description: string,
): Metadata {
  const canonical = buildLocalizedPublicUrl(path, locale)
  const normalizedTitle = normalizePublicTitle(title)

  return {
    title: { absolute: normalizedTitle },
    description,
    alternates: {
      canonical,
      languages: getLocalizedPublicAlternates(path),
    },
    openGraph: {
      title: normalizedTitle,
      description,
      url: canonical,
      siteName: "AIMarketingSite",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: normalizedTitle,
      description,
    },
  }
}

function WorkflowUsageBoundary({ locale }: { locale: AppLocale }) {
  const copy = locale === "zh"
    ? {
        title: "使用前先看清输入、产出和保存边界",
        input: "需要什么输入",
        inputBody: "准备 brief、受众、目标、品牌规则和必要的参考资料。输入越具体，后续产出越容易复核。",
        output: "会得到什么",
        outputBody: "根据模板得到结构化步骤、文案方向、视觉任务或可继续编辑的预览。页面会以当前模板实际支持的结果为准。",
        next: "下一步做什么",
        nextBody: "先检查预览，再打开入口继续执行；只有点击保存或明确完成保存动作后，结果才会进入可复用的工作流记录。",
        preview: "预览是检查用的临时结果",
        saved: "保存后才可复用",
      }
    : {
        title: "Know the input, output, and save boundary first",
        input: "What you provide",
        inputBody: "Prepare the brief, audience, goal, brand rules, and any references the workflow needs. Specific inputs make review easier.",
        output: "What you get",
        outputBody: "The template produces structured steps, copy directions, visual tasks, or an editable preview according to what this workflow currently supports.",
        next: "What to do next",
        nextBody: "Review the preview first, then open the entry to continue. The result becomes reusable workflow history only after the explicit save action completes.",
        preview: "Preview is for checking",
        saved: "Saved output is reusable",
      }

  return (
    <section className="public-panel rounded-[12px] border border-border bg-card/80 p-6">
      <h2 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">{copy.title}</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {[
          { title: copy.input, body: copy.inputBody },
          { title: copy.output, body: copy.outputBody },
          { title: copy.next, body: copy.nextBody },
        ].map((item) => (
          <article key={item.title} className="rounded-[8px] border border-border bg-background p-4">
            <h3 className="font-semibold text-foreground">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
          </article>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border border-border px-3 py-1">{copy.preview}</span>
        <span className="rounded-full border border-border px-3 py-1">{copy.saved}</span>
      </div>
    </section>
  )
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
      label: locale === "zh" ? "使用方式" : "How it works",
      value: getPublicRegistryEntryLabel(locale, execution.runtimeStatus, execution.accessState),
    },
    {
      label: locale === "zh" ? "下一步" : "Next step",
      value: execution.accessState === "public" ? (locale === "zh" ? "直接开始" : "Start here") : (locale === "zh" ? "查看使用要求" : "Review access requirements"),
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
    extraLabel: getPublicRegistryEntryLabel(locale, execution.runtimeStatus, execution.accessState),
    detailLines,
    proofPoints: getPublicProofPoints(locale, execution.notes, capability.proofPoints),
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
      label: locale === "zh" ? "使用方式" : "How it works",
      value: getPublicRegistryEntryLabel(locale, execution.runtimeStatus, execution.accessState),
    },
  ]

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
    extraLabel: getPublicRegistryEntryLabel(locale, execution.runtimeStatus, execution.accessState),
    detailLines,
    proofPoints: getPublicProofPoints(locale, execution.notes, entry.proofPoints),
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
        <WorkflowUsageBoundary locale={displayLocale} />
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
