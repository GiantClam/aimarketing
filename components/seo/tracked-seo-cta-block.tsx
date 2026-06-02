"use client"

import { ArrowRight } from "lucide-react"

import type { SeoCta } from "@/lib/seo/pages"
import { Button } from "@/components/ui/button"
import { TrackedCtaLink } from "@/components/seo/tracked-cta-link"
import { SEO_EVENT } from "@/lib/seo/analytics"
import type { AppLocale } from "@/lib/i18n/config"
import { localizePublicPath } from "@/lib/i18n/routing"
import { getSeoUiCopy } from "@/lib/seo/i18n"

export function TrackedSeoCtaBlock({
  cta,
  group,
  slug,
  locale,
}: {
  cta: SeoCta
  group: string
  slug: string
  locale: AppLocale
}) {
  const ui = getSeoUiCopy(locale)
  const primaryHref = localizePublicPath(cta.primaryHref, locale)
  const secondaryHref = cta.secondaryHref ? localizePublicPath(cta.secondaryHref, locale) : null
  return (
    <div className="rounded-[12px] border border-border bg-accent p-6 text-accent-foreground sm:p-8">
      <div className="max-w-2xl">
        <p className="public-kicker text-accent-foreground/70">
          {ui.footerCtaEyebrow}
        </p>
        <h2 className="mt-3 font-display text-3xl font-extrabold uppercase leading-tight tracking-[0.02em]">
          {ui.footerCtaTitle}
        </h2>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button className="public-button-primary h-12 px-6" asChild>
          <TrackedCtaLink
            href={primaryHref}
            eventName={SEO_EVENT.seoPageCtaClick}
            eventData={{
              group,
              slug,
              placement: "footer",
              cta: "primary",
              destination: primaryHref,
            }}
          >
            {cta.primaryLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </TrackedCtaLink>
        </Button>
        {secondaryHref && cta.secondaryLabel ? (
          <Button className="h-12 rounded-[4px] border border-accent-foreground/28 bg-transparent px-6 font-display text-xs font-bold uppercase tracking-[0.08em] text-accent-foreground hover:bg-accent-foreground/10" asChild>
            <TrackedCtaLink
              href={secondaryHref}
              eventName={SEO_EVENT.seoPageCtaClick}
              eventData={{
                group,
                slug,
                placement: "footer",
                cta: "secondary",
                destination: secondaryHref,
              }}
            >
              {cta.secondaryLabel}
            </TrackedCtaLink>
          </Button>
        ) : null}
      </div>
    </div>
  )
}
