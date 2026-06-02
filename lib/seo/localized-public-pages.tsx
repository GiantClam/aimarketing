import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PublicHomePageContent } from "@/components/seo/public-home-page"
import { AiCostCalculator } from "@/components/seo/ai-cost-calculator"
import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicSiteHeader } from "@/components/seo/public-site-header"
import { SeoLandingPage } from "@/components/seo/seo-landing-page"
import { getPublicCopy } from "@/lib/i18n/public-copy"
import type { AppLocale } from "@/lib/i18n/config"
import { buildLocalizedPublicUrl, getLocalizedPublicAlternates, isLocalizedPublicPath } from "@/lib/i18n/routing"
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

export function renderHomePage() {
  return <PublicHomePageContent />
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
