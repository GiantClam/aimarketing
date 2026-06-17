"use client"

import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicPricingGrid } from "@/components/seo/public-pricing-grid"
import { PublicSiteHeader } from "@/components/seo/public-site-header"
import { TrackedCtaLink } from "@/components/seo/tracked-cta-link"
import { useI18n } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { getPublicCopy } from "@/lib/i18n/public-copy"
import { localizePublicPath } from "@/lib/i18n/routing"
import { SEO_EVENT } from "@/lib/seo/analytics"

export function PublicPricingPageContent() {
  const { locale } = useI18n()
  const copy = getPublicCopy(locale)
  const calculatorHref = localizePublicPath("/resources/ai-subscription-cost-calculator", locale)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader activeKey="pricing" />

      <section className="public-grid-bg public-page-hero-shell mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center gap-2">
          <p className="public-kicker text-muted-foreground">{copy.pricingPage.eyebrow}</p>
          <span className="public-system-chip public-kicker rounded-[4px] px-3 py-1 text-muted-foreground">{copy.pricingPage.matrixLabel}</span>
          <span className="inline-flex items-center gap-2 rounded-[4px] border border-border px-3 py-1">
            <span className="public-signal" aria-hidden="true" />
            <span className="public-kicker text-muted-foreground">{copy.pricingPage.sharedWorkspaceLabel}</span>
          </span>
        </div>
        <h1 className="public-display mt-4 max-w-4xl text-5xl text-foreground lg:text-6xl">{copy.pricingPage.title}</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">{copy.pricingPage.description}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" className="public-button-primary h-12 px-7" asChild>
            <TrackedCtaLink
              href="/register"
              eventName={SEO_EVENT.pricingCtaClick}
              eventData={{ placement: "hero", cta: "primary", destination: "/register" }}
            >
              {copy.pricingPage.primaryCta}
            </TrackedCtaLink>
          </Button>
          <Button size="lg" className="public-button-secondary h-12 px-7" asChild>
            <TrackedCtaLink
              href={calculatorHref}
              eventName={SEO_EVENT.pricingCtaClick}
              eventData={{
                placement: "hero",
                cta: "calculator",
                destination: calculatorHref,
              }}
            >
              {copy.pricingPage.calculatorCta}
            </TrackedCtaLink>
          </Button>
        </div>
      </section>

      <section className="public-page-bottom-shell mx-auto max-w-7xl">
        <PublicPricingGrid showActions />
      </section>

      <section className="public-page-bottom-shell mx-auto max-w-7xl">
        <div className="public-panel rounded-[12px] p-6 sm:p-8">
          <h2 className="font-display text-3xl font-extrabold uppercase tracking-[0.02em] text-foreground">{copy.pricingPage.guardrailsTitle}</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {copy.pricingPage.guardrails.map((item) => (
              <div key={item.title} className="rounded-[8px] border border-border bg-background p-4 text-sm leading-7 text-muted-foreground">
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
