import type { Metadata } from "next"

import { AiCostCalculator } from "@/components/seo/ai-cost-calculator"
import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicSiteHeader } from "@/components/seo/public-site-header"
import { buildAppUrl } from "@/lib/app-url"

const canonical = buildAppUrl("/resources/ai-subscription-cost-calculator")

export const metadata: Metadata = {
  title: "AI Subscription Cost Calculator for Small Teams",
  description:
    "Estimate how much your team spends on ChatGPT, Claude, Gemini, image tools, writing tools, and search tools, then compare a shared AI marketing workspace.",
  alternates: {
    canonical,
  },
  openGraph: {
    title: "AI Subscription Cost Calculator for Small Teams",
    description:
      "Estimate monthly and annual AI software costs for a small team and compare a shared AI Marketing workspace.",
    url: canonical,
    siteName: "AI Marketing",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Subscription Cost Calculator for Small Teams",
    description: "Estimate monthly and annual AI software costs for your team's AI stack.",
  },
}

export default function AiSubscriptionCostCalculatorPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "AI Subscription Cost Calculator",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "A calculator for estimating small-team AI software subscription costs and comparing a shared AI marketing workspace.",
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicSiteHeader activeKey="calculator" />

      <section className="public-grid-bg mx-auto max-w-7xl px-6 py-16 lg:py-20">
        <div className="flex flex-wrap items-center gap-2">
          <p className="public-kicker text-muted-foreground">AI cost calculator</p>
          <span className="public-system-chip public-kicker rounded-[4px] px-3 py-1 text-muted-foreground">Budget Signal</span>
          <span className="inline-flex items-center gap-2 rounded-[4px] border border-border px-3 py-1">
            <span className="public-signal" aria-hidden="true" />
            <span className="public-kicker text-muted-foreground">Team Cost Scan</span>
          </span>
        </div>
        <h1 className="public-display mt-4 max-w-4xl text-5xl text-foreground lg:text-6xl">
          Calculate how much your team spends on separate AI tools
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
          Estimate your monthly and annual AI software cost across ChatGPT, Claude, Gemini, image tools, writing tools,
          and search tools. Then compare it with one shared AI Marketing workspace for small teams.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-18">
        <AiCostCalculator />
      </section>

      <PublicSiteFooter />
    </main>
  )
}
