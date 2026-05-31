import Link from "next/link"
import { ArrowRight } from "lucide-react"

import type { SeoCta } from "@/lib/seo/pages"
import { Button } from "@/components/ui/button"

export function SeoCtaBlock({ cta }: { cta: SeoCta }) {
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
          <Link href={cta.primaryHref}>
            {cta.primaryLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        {cta.secondaryHref && cta.secondaryLabel ? (
          <Button className="h-12 rounded-[4px] border border-accent-foreground/28 bg-transparent px-6 font-display text-xs font-bold uppercase tracking-[0.08em] text-accent-foreground hover:bg-accent-foreground/10" asChild>
            <Link href={cta.secondaryHref}>{cta.secondaryLabel}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  )
}
