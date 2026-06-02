"use client"

import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TrackedCtaLink } from "@/components/seo/tracked-cta-link"
import type { AppLocale } from "@/lib/i18n/config"
import { localizePublicPath } from "@/lib/i18n/routing"
import { SEO_EVENT } from "@/lib/seo/analytics"
import type { SeoPage } from "@/lib/seo/pages"

export function SeoPageHeroCta({ page, locale }: { page: SeoPage; locale: AppLocale }) {
  const primaryHref = localizePublicPath(page.cta.primaryHref, locale)
  const secondaryHref = page.cta.secondaryHref ? localizePublicPath(page.cta.secondaryHref, locale) : null

  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Button size="lg" className="public-button-primary h-12 px-7" asChild>
        <TrackedCtaLink
          href={primaryHref}
          eventName={SEO_EVENT.seoPageCtaClick}
          eventData={{
            group: page.group,
            slug: page.slug,
            placement: "hero",
            cta: "primary",
            destination: primaryHref,
          }}
        >
          {page.cta.primaryLabel}
          <ArrowRight className="ml-2 h-4 w-4" />
        </TrackedCtaLink>
      </Button>
      {secondaryHref && page.cta.secondaryLabel ? (
        <Button size="lg" className="public-button-secondary h-12 px-7" asChild>
          <TrackedCtaLink
            href={secondaryHref}
            eventName={SEO_EVENT.seoPageCtaClick}
            eventData={{
              group: page.group,
              slug: page.slug,
              placement: "hero",
              cta: "secondary",
              destination: secondaryHref,
            }}
          >
            {page.cta.secondaryLabel}
          </TrackedCtaLink>
        </Button>
      ) : null}
    </div>
  )
}
