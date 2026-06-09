import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PublicHomePageContent } from "@/components/seo/public-home-page"
import { PublicPlatformDirectory } from "@/components/platform/public-platform-directory"
import { AiCostCalculator } from "@/components/seo/ai-cost-calculator"
import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicSiteHeader } from "@/components/seo/public-site-header"
import { SeoLandingPage } from "@/components/seo/seo-landing-page"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getPublicCopy } from "@/lib/i18n/public-copy"
import type { AppLocale } from "@/lib/i18n/config"
import { buildLocalizedPublicUrl, getLocalizedPublicAlternates, isLocalizedPublicPath } from "@/lib/i18n/routing"
import { listPlatformCapabilityExecutionStates } from "@/lib/platform/execution"
import { listPlatformRegistryEntryExecutionStates } from "@/lib/platform/registry-entry-execution"
import { listVisiblePlatformRegistryEntries } from "@/lib/platform/directory-resolver"
import { getAiCostPageCopy, localizeSeoPage } from "@/lib/seo/i18n"
import { metadataForSeoPage } from "@/lib/seo/metadata"
import {
  getSeoPage,
  getSeoPagesByGroup,
  seoPathForPage,
} from "@/lib/seo/pages"

type LocalizedSeoGroup =
  | "agents"
  | "alternatives"
  | "compare"
  | "prompts"
  | "use-cases"

type PlatformDirectoryPage = "agents" | "capabilities" | "plugins" | "mcp-services" | "workflows"

function getPlatformDirectoryHeadingCopy(locale: AppLocale, page: PlatformDirectoryPage) {
  const isZh = locale === "zh"

  switch (page) {
    case "agents":
      return {
        title: isZh ? "营销智能体广场" : "Marketing Agent Square",
        description: isZh
          ? "把可复用的营销角色、企业协作 Agent 和 deferred 入口统一整理进同一前台广场。"
          : "Bring reusable marketing roles, enterprise collaboration agents, and deferred entry points into one shared public square.",
      }
    case "capabilities":
      return {
        title: isZh ? "统一能力中心" : "Unified Capability Directory",
        description: isZh
          ? "把 AI 对话、AI PPT、AI 绘图、AI 视频和智能体组织进同一套平台注册表。"
          : "Organize AI chat, AI PPT, AI image, AI video, and agent capabilities through one shared registry.",
      }
    case "plugins":
      return {
        title: isZh ? "平台插件目录" : "Platform Plugin Directory",
        description: isZh
          ? "把图片、视频、知识、搜索和自动化扩展整理成平台插件位。"
          : "Organize image, video, knowledge, search, and automation extensions as platform plugin slots.",
      }
    case "mcp-services":
      return {
        title: isZh ? "MCP 服务目录" : "MCP Service Directory",
        description: isZh
          ? "把外部能力桥接、搜索、文档解析与市场数据接入点先整理成可见目录。"
          : "Expose external bridges, search, document parsing, and market data entry points through a visible MCP directory first.",
      }
    case "workflows":
      return {
        title: isZh ? "工作流模板中心" : "Workflow Template Center",
        description: isZh
          ? "把营销 brief、内容复用、视觉广告流程和 deferred 企业流程沉淀成统一模板。"
          : "Turn marketing briefs, content repurposing, visual ad pipelines, and deferred enterprise flows into shared templates.",
      }
  }
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

function getLocalizedSeoStaticParams(group: LocalizedSeoGroup) {
  return getSeoPagesByGroup(group)
    .filter((page) => isLocalizedPublicPath(seoPathForPage(page)))
    .map((page) => ({ slug: page.slug }))
}

function getLocalizedSeoMetadata(locale: AppLocale, group: LocalizedSeoGroup, slug: string) {
  const page = getSeoPage(group, slug)
  if (!page) return {}
  return metadataForSeoPage(localizeSeoPage(page, locale), locale)
}

function renderLocalizedSeoPage(locale: AppLocale, group: LocalizedSeoGroup, slug: string) {
  const page = getSeoPage(group, slug)
  if (!page) notFound()
  return <SeoLandingPage page={localizeSeoPage(page, locale)} locale={locale} />
}

export function getHomeMetadata(locale: AppLocale): Metadata {
  const copy = getPublicCopy(locale)
  const canonical = buildLocalizedPublicUrl("/", locale)
  const title =
    locale === "zh"
      ? "一个工作台，接入多个 AI 模型 | AIMarketingSite"
      : "Multi-Model AI Workspace for Marketing Teams | AIMarketingSite"

  return {
    title,
    description: copy.home.description,
    alternates: {
      canonical,
      languages: getLocalizedPublicAlternates("/"),
    },
    openGraph: {
      title,
      description: copy.home.description,
      url: canonical,
      siteName: "AIMarketingSite",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: copy.home.description,
    },
  }
}

export async function renderHomePage(locale: AppLocale) {
  const currentUser = await getServerSessionUser().catch(() => null)
  const platformCapabilities = (await listVisiblePlatformRegistryEntries({
    locale,
    itemType: "capability",
    surface: "public",
    enterpriseId: currentUser?.enterpriseId,
  })).filter((item: { slug: string }) => ["ai-chat", "ai-ppt", "ai-image", "ai-video", "agent-platform"].includes(item.slug))

  return <PublicHomePageContent platformCapabilities={platformCapabilities} />
}

export function getPricingMetadata(locale: AppLocale): Metadata {
  const copy = getPublicCopy(locale)
  const canonical = buildLocalizedPublicUrl("/pricing", locale)
  const title =
    locale === "zh"
      ? "面向营销团队的 AI 工作台价格 | AIMarketingSite"
      : "AI Workspace Pricing for Marketing Teams | AIMarketingSite"

  return {
    title,
    description: copy.pricingPage.description,
    alternates: {
      canonical,
      languages: getLocalizedPublicAlternates("/pricing"),
    },
    openGraph: {
      title,
      description: copy.pricingPage.description,
      url: canonical,
      siteName: "AIMarketingSite",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: copy.pricingPage.description,
    },
  }
}

export async function renderPricingPage() {
  const { PublicPricingPageContent } = await import("@/components/seo/public-pricing-page")
  return <PublicPricingPageContent />
}

async function getPlatformDirectoryCopy(locale: AppLocale, page: PlatformDirectoryPage) {
  const currentUser = await getServerSessionUser().catch(() => null)
  const capabilityExecutionMap = new Map(
    (await listPlatformCapabilityExecutionStates(locale, currentUser)).map((item) => [item.capabilitySlug, item] as const),
  )
  const heading = getPlatformDirectoryHeadingCopy(locale, page)

  switch (page) {
    case "agents":
      return {
        ...heading,
        items: (await listPlatformRegistryEntryExecutionStates({
          locale,
          itemType: "agent",
          surface: "public",
          enterpriseId: currentUser?.enterpriseId,
          currentUser,
        })).map((item) => ({
          ...item,
          launchItemType: "agent" as const,
          detailHref: `/agents/${item.slug}`,
          extraLabel: item.label,
          proofPoints: item.notes.slice(0, 4),
        })),
      }
    case "capabilities":
      return {
        ...heading,
        items: (await listPlatformRegistryEntryExecutionStates({
          locale,
          itemType: "capability",
          surface: "public",
          enterpriseId: currentUser?.enterpriseId,
          currentUser,
        })).map((item) => ({
          ...item,
          launchItemType: "capability" as const,
          detailHref: `/capabilities/${item.slug}`,
          proofPoints: item.notes.slice(0, 4),
          extraLabel: capabilityExecutionMap.has(item.slug)
            ? getCapabilityExecutionLabel(
                locale,
                capabilityExecutionMap.get(item.slug)!.runtimeStatus,
                capabilityExecutionMap.get(item.slug)!.accessState,
              )
            : item.bindingTarget.toUpperCase(),
        })),
      }
    case "plugins":
      return {
        ...heading,
        items: (await listPlatformRegistryEntryExecutionStates({
          locale,
          itemType: "plugin",
          surface: "public",
          enterpriseId: currentUser?.enterpriseId,
          currentUser,
        })).map((item) => ({
          ...item,
          launchItemType: "plugin" as const,
          detailHref: `/plugins/${item.slug}`,
          extraLabel: item.label,
          proofPoints: item.notes.slice(0, 4),
        })),
      }
    case "mcp-services":
      return {
        ...heading,
        items: (await listPlatformRegistryEntryExecutionStates({
          locale,
          itemType: "mcp_service",
          surface: "public",
          enterpriseId: currentUser?.enterpriseId,
          currentUser,
        })).map((item) => ({
          ...item,
          launchItemType: "mcp_service" as const,
          detailHref: `/mcp-services/${item.slug}`,
          extraLabel: item.label,
          proofPoints: item.notes.slice(0, 4),
        })),
      }
    case "workflows":
      return {
        ...heading,
        items: (await listPlatformRegistryEntryExecutionStates({
          locale,
          itemType: "workflow",
          surface: "public",
          enterpriseId: currentUser?.enterpriseId,
          currentUser,
        })).map((item) => ({
          ...item,
          launchItemType: "workflow" as const,
          detailHref: `/workflows/${item.slug}`,
          extraLabel: item.label,
          proofPoints: item.notes.slice(0, 4),
        })),
      }
  }
}

export function getPlatformDirectoryMetadata(locale: AppLocale, page: PlatformDirectoryPage): Metadata {
  const copy = getPlatformDirectoryHeadingCopy(locale, page)
  const canonical = buildLocalizedPublicUrl(`/${page}`, locale)

  return {
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical,
      languages: getLocalizedPublicAlternates(`/${page}`),
    },
    openGraph: {
      title: copy.title,
      description: copy.description,
      url: canonical,
      siteName: "AIMarketingSite",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
    },
  }
}

export async function renderPlatformDirectoryPage(locale: AppLocale, page: PlatformDirectoryPage) {
  const copy = await getPlatformDirectoryCopy(locale, page)
  const displayLocale = locale === "zh" ? "zh" : "en"

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader activeKey="tools" />
      <PublicPlatformDirectory
        locale={displayLocale}
        eyebrow="Platform Core"
        title={copy.title}
        description={copy.description}
        items={copy.items}
      />
      <PublicSiteFooter />
    </main>
  )
}

export function getUseCaseStaticParams() {
  return getLocalizedSeoStaticParams("use-cases")
}

export function getAlternativeStaticParams() {
  return getLocalizedSeoStaticParams("alternatives")
}

export function getAlternativeMetadata(locale: AppLocale, slug: string) {
  return getLocalizedSeoMetadata(locale, "alternatives", slug)
}

export function renderAlternativePage(locale: AppLocale, slug: string) {
  return renderLocalizedSeoPage(locale, "alternatives", slug)
}

export function getAgentStaticParams() {
  return getLocalizedSeoStaticParams("agents")
}

export function getAgentMetadata(locale: AppLocale, slug: string) {
  return getLocalizedSeoMetadata(locale, "agents", slug)
}

export function renderAgentPage(locale: AppLocale, slug: string) {
  return renderLocalizedSeoPage(locale, "agents", slug)
}

export function getUseCaseMetadata(locale: AppLocale, slug: string) {
  return getLocalizedSeoMetadata(locale, "use-cases", slug)
}

export function renderUseCasePage(locale: AppLocale, slug: string) {
  return renderLocalizedSeoPage(locale, "use-cases", slug)
}

export function getCompareStaticParams() {
  return getLocalizedSeoStaticParams("compare")
}

export function getCompareMetadata(locale: AppLocale, slug: string) {
  return getLocalizedSeoMetadata(locale, "compare", slug)
}

export function renderComparePage(locale: AppLocale, slug: string) {
  return renderLocalizedSeoPage(locale, "compare", slug)
}

export function getPromptStaticParams() {
  return getLocalizedSeoStaticParams("prompts")
}

export function getPromptMetadata(locale: AppLocale, slug: string) {
  return getLocalizedSeoMetadata(locale, "prompts", slug)
}

export function renderPromptPage(locale: AppLocale, slug: string) {
  return renderLocalizedSeoPage(locale, "prompts", slug)
}

export function getAiCostMetadata(locale: AppLocale): Metadata {
  const copy = getAiCostPageCopy(locale)
  const canonical = buildLocalizedPublicUrl("/resources/ai-subscription-cost-calculator", locale)
  const title = locale === "zh" ? "对比营销团队的 AI 工具成本" : "Compare AI Tool Costs for Marketing Teams"

  return {
    title,
    description: copy.description,
    alternates: {
      canonical,
      languages: getLocalizedPublicAlternates("/resources/ai-subscription-cost-calculator"),
    },
    openGraph: {
      title,
      description: copy.description,
      url: canonical,
      siteName: "AIMarketingSite",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: copy.description,
    },
  }
}

export function renderAiCostPage(locale: AppLocale) {
  const copy = getAiCostPageCopy(locale)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: locale === "zh" ? "AI 工具成本计算器" : "AI Subscription Cost Calculator",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: copy.description,
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicSiteHeader activeKey="calculator" />

      <section className="public-grid-bg mx-auto max-w-7xl px-6 py-16 lg:py-20">
        <div className="flex flex-wrap items-center gap-2">
          <p className="public-kicker text-muted-foreground">{copy.eyebrow}</p>
          <span className="public-system-chip public-kicker rounded-[4px] px-3 py-1 text-muted-foreground">
            {copy.budgetSignal}
          </span>
          <span className="inline-flex items-center gap-2 rounded-[4px] border border-border px-3 py-1">
            <span className="public-signal" aria-hidden="true" />
            <span className="public-kicker text-muted-foreground">{copy.teamCostScan}</span>
          </span>
        </div>
        <h1 className="public-display mt-4 max-w-4xl text-5xl text-foreground lg:text-6xl">
          {copy.title}
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
          {copy.description}
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-18">
        <AiCostCalculator locale={locale} />
      </section>

      <PublicSiteFooter />
    </main>
  )
}
