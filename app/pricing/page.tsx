import type { Metadata } from "next"

import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicPricingGrid } from "@/components/seo/public-pricing-grid"
import { PublicSiteHeader } from "@/components/seo/public-site-header"
import { TrackedCtaLink } from "@/components/seo/tracked-cta-link"
import { Button } from "@/components/ui/button"
import { buildAppUrl } from "@/lib/app-url"
import { SEO_EVENT } from "@/lib/seo/analytics"

const canonical = buildAppUrl("/pricing")

export const metadata: Metadata = {
  title: "AI Marketing Pricing for Small Teams",
  description:
    "Affordable AI marketing workspace plans for small teams, including shared credits, marketing agents, team permissions, and optional BYOK for heavier usage.",
  alternates: {
    canonical,
  },
  openGraph: {
    title: "AI Marketing Pricing for Small Teams",
    description:
      "Compare shared-credit AI marketing workspace options for small teams, agencies, startups, and consultants.",
    url: canonical,
    siteName: "AI Marketing",
    type: "website",
  },
}

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader activeKey="pricing" />

      <section className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
        <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">Pricing</p>
        <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-[1.04] lg:text-6xl">
          Shared-credit plans for small-team AI marketing work
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
          Pricing works best as a support page, not the first thing visitors need to decode. Teams usually want to
          understand the workflow and savings first, then compare plans. This page gives the full plan view after the
          homepage, alternatives pages, and calculator have already framed the product.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" className="rounded-full px-7" asChild>
            <TrackedCtaLink
              href="/register"
              eventName={SEO_EVENT.pricingCtaClick}
              eventData={{ placement: "hero", cta: "primary", destination: "/register" }}
            >
              Create your workspace
            </TrackedCtaLink>
          </Button>
          <Button size="lg" variant="outline" className="rounded-full border-2 border-border bg-card px-7" asChild>
            <TrackedCtaLink
              href="/resources/ai-subscription-cost-calculator"
              eventName={SEO_EVENT.pricingCtaClick}
              eventData={{
                placement: "hero",
                cta: "calculator",
                destination: "/resources/ai-subscription-cost-calculator",
              }}
            >
              Calculate AI tool savings
            </TrackedCtaLink>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-10">
        <PublicPricingGrid showActions />
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-18">
        <div className="rounded-[26px] border-2 border-border bg-card p-6 sm:p-8">
          <h2 className="text-3xl font-semibold text-foreground">Pricing guardrails</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-[20px] bg-background p-4 text-sm leading-7 text-muted-foreground">
              Credits and fair-use limits matter because model calls have ongoing cost.
            </div>
            <div className="rounded-[20px] bg-background p-4 text-sm leading-7 text-muted-foreground">
              Heavy users can upgrade or connect provider keys where supported instead of relying only on starter
              credits.
            </div>
            <div className="rounded-[20px] bg-background p-4 text-sm leading-7 text-muted-foreground">
              AI Marketing does not promise unlimited GPT, Claude, Gemini, or image generation usage.
            </div>
          </div>
        </div>
      </section>

      <PublicSiteFooter />
    </main>
  )
}
