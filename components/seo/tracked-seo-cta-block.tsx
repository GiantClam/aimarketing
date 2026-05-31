"use client"

import { ArrowRight } from "lucide-react"

import type { SeoCta } from "@/lib/seo/pages"
import { Button } from "@/components/ui/button"
import { TrackedCtaLink } from "@/components/seo/tracked-cta-link"
import { SEO_EVENT } from "@/lib/seo/analytics"

export function TrackedSeoCtaBlock({
  cta,
  group,
  slug,
}: {
  cta: SeoCta
  group: string
  slug: string
}) {
  return (
    <div className="rounded-[12px] border border-border bg-accent p-6 text-accent-foreground sm:p-8">
      <div className="max-w-2xl">
        <p className="public-kicker text-accent-foreground/70">
          Ready to consolidate your AI marketing stack?
        </p>
        <h2 className="mt-3 font-display text-3xl font-extrabold uppercase leading-tight tracking-[0.02em]">
          Give your team one workspace for models, agents, context, and marketing output.
        </h2>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button className="public-button-primary h-12 px-6" asChild>
          <TrackedCtaLink
            href={cta.primaryHref}
            eventName={SEO_EVENT.seoPageCtaClick}
            eventData={{
              group,
              slug,
              placement: "footer",
              cta: "primary",
              destination: cta.primaryHref,
            }}
          >
            {cta.primaryLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </TrackedCtaLink>
        </Button>
        {cta.secondaryHref && cta.secondaryLabel ? (
          <Button className="h-12 rounded-[4px] border border-accent-foreground/28 bg-transparent px-6 font-display text-xs font-bold uppercase tracking-[0.08em] text-accent-foreground hover:bg-accent-foreground/10" asChild>
            <TrackedCtaLink
              href={cta.secondaryHref}
              eventName={SEO_EVENT.seoPageCtaClick}
              eventData={{
                group,
                slug,
                placement: "footer",
                cta: "secondary",
                destination: cta.secondaryHref,
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
