import type { Metadata } from "next"

import { AiCostCalculator } from "@/components/seo/ai-cost-calculator"
import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicSiteHeader } from "@/components/seo/public-site-header"
import { buildLocalizedPublicUrl, getLocalizedPublicAlternates } from "@/lib/i18n/routing"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getAiCostPageCopy } from "@/lib/seo/i18n"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  const copy = getAiCostPageCopy(locale)
  const canonical = buildLocalizedPublicUrl("/resources/ai-subscription-cost-calculator", locale)

  return {
    title: locale === "zh" ? "对比营销团队的 AI 工具成本" : "Compare AI Tool Costs for Marketing Teams",
    description: copy.description,
    alternates: {
      canonical,
      languages: getLocalizedPublicAlternates("/resources/ai-subscription-cost-calculator"),
    },
    openGraph: {
      title: locale === "zh" ? "对比营销团队的 AI 工具成本" : "Compare AI Tool Costs for Marketing Teams",
      description: copy.description,
      url: canonical,
      siteName: "AIMarketingSite",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: locale === "zh" ? "对比营销团队的 AI 工具成本" : "Compare AI Tool Costs for Marketing Teams",
      description: copy.description,
    },
  }
}

export default async function AiSubscriptionCostCalculatorPage() {
  const locale = await getRequestLocale()
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
      <PublicSiteHeader activeKey="resources" />

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
