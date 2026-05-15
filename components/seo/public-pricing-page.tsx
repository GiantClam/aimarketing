"use client"

import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicPricingGrid } from "@/components/seo/public-pricing-grid"
import { PublicSiteHeader } from "@/components/seo/public-site-header"
import { TrackedCtaLink } from "@/components/seo/tracked-cta-link"
import { useI18n } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { getPublicCopy } from "@/lib/i18n/public-copy"
import { SEO_EVENT } from "@/lib/seo/analytics"

export function PublicPricingPageContent() {
  const { locale } = useI18n()
  const copy = getPublicCopy(locale)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader activeKey="pricing" />

      <section className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
        <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">{copy.pricingPage.eyebrow}</p>
        <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-[1.04] lg:text-6xl">{copy.pricingPage.title}</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">{copy.pricingPage.description}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" className="rounded-full px-7" asChild>
            <TrackedCtaLink
              href="/register"
              eventName={SEO_EVENT.pricingCtaClick}
              eventData={{ placement: "hero", cta: "primary", destination: "/register" }}
            >
              {copy.pricingPage.primaryCta}
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
              {copy.pricingPage.calculatorCta}
            </TrackedCtaLink>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-10">
        <PublicPricingGrid showActions />
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-18">
        <div className="rounded-[26px] border-2 border-border bg-card p-6 sm:p-8">
          <h2 className="text-3xl font-semibold text-foreground">{copy.pricingPage.guardrailsTitle}</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {copy.pricingPage.guardrails.map((item) => (
              <div key={item.title} className="rounded-[20px] bg-background p-4 text-sm leading-7 text-muted-foreground">
                {item.description}
              </div>
            ))}
          </div>
        </div>
      </section>

      <PublicSiteFooter />
    </main>
  )
}
