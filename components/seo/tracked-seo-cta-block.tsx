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
    <div className="rounded-[28px] border-2 border-border bg-accent p-6 text-accent-foreground sm:p-8">
      <div className="max-w-2xl">
        <p className="text-sm uppercase tracking-[0.2em] text-accent-foreground/70">
          Ready to consolidate your AI marketing stack?
        </p>
        <h2 className="mt-3 text-3xl font-semibold leading-tight">
          Give your team one workspace for models, agents, context, and marketing output.
        </h2>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button className="rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90" asChild>
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
          <Button
            variant="outline"
            className="rounded-full border-2 border-accent-foreground/20 bg-transparent px-6 text-accent-foreground hover:bg-accent-foreground/10"
            asChild
          >
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
