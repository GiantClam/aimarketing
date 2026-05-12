"use client"

import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TrackedCtaLink } from "@/components/seo/tracked-cta-link"
import { SEO_EVENT } from "@/lib/seo/analytics"
import type { SeoPage } from "@/lib/seo/pages"

export function SeoPageHeroCta({ page }: { page: SeoPage }) {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Button size="lg" className="rounded-full px-7" asChild>
        <TrackedCtaLink
          href={page.cta.primaryHref}
          eventName={SEO_EVENT.seoPageCtaClick}
          eventData={{
            group: page.group,
            slug: page.slug,
            placement: "hero",
            cta: "primary",
            destination: page.cta.primaryHref,
          }}
        >
          {page.cta.primaryLabel}
          <ArrowRight className="ml-2 h-4 w-4" />
        </TrackedCtaLink>
      </Button>
      {page.cta.secondaryHref && page.cta.secondaryLabel ? (
        <Button size="lg" variant="outline" className="rounded-full border-2 border-border bg-card px-7" asChild>
          <TrackedCtaLink
            href={page.cta.secondaryHref}
            eventName={SEO_EVENT.seoPageCtaClick}
            eventData={{
              group: page.group,
              slug: page.slug,
              placement: "hero",
              cta: "secondary",
              destination: page.cta.secondaryHref,
            }}
          >
            {page.cta.secondaryLabel}
          </TrackedCtaLink>
        </Button>
      ) : null}
    </div>
  )
}
