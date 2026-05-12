import { TrackedCtaLink } from "@/components/seo/tracked-cta-link"
import { Button } from "@/components/ui/button"
import { listBillingPlans } from "@/lib/billing/plans"
import { SEO_EVENT } from "@/lib/seo/analytics"

function formatPrice(cents: number) {
  if (cents === 0) return "Free"

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function formatCredits(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

function featureSummary(plan: ReturnType<typeof listBillingPlans>[number]) {
  const imageQuality = Array.isArray(plan.features.imageQuality)
    ? plan.features.imageQuality.join(" / ")
    : "standard"

  const summary = [
    `${plan.sharedMemberLimit} workspace member${plan.sharedMemberLimit > 1 ? "s" : ""}`,
    plan.monthlyCredits > 0 ? `${formatCredits(plan.monthlyCredits)} monthly credits` : `${formatCredits(plan.trialCredits)} trial credits`,
    `Image quality: ${imageQuality}`,
  ]

  if (plan.features.priorityQueue) {
    summary.push("Priority image queue")
  }

  if (typeof plan.features.videoGeneration === "string") {
    summary.push(`Video generation: ${plan.features.videoGeneration}`)
  }

  return summary
}

export function PublicPricingGrid({
  compact = false,
  showActions = false,
}: {
  compact?: boolean
  showActions?: boolean
}) {
  const plans = listBillingPlans()

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan) => (
        <article
          key={plan.code}
          className={`rounded-[26px] border-2 p-6 ${
            plan.code === "creator"
              ? "border-foreground bg-card"
              : "border-border bg-card"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">{plan.code}</p>
              <h3 className="mt-2 text-2xl font-semibold text-foreground">{plan.name}</h3>
            </div>
            {plan.code === "creator" ? (
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                Recommended
              </span>
            ) : null}
          </div>

          <div className="mt-5">
            <div className="text-4xl font-semibold text-foreground">{formatPrice(plan.priceUsdCents)}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {plan.priceUsdCents === 0 ? "Starter access" : "per month"}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {featureSummary(plan).map((item) => (
              <div key={item} className="text-sm leading-6 text-muted-foreground">
                {item}
              </div>
            ))}
          </div>

          {!compact && plan.code === "free" ? (
            <p className="mt-5 text-xs leading-5 text-muted-foreground">
              Includes a time-limited trial with starter credits so teams can test the workspace before upgrading.
            </p>
          ) : null}

          {!compact && plan.code !== "free" ? (
            <p className="mt-5 text-xs leading-5 text-muted-foreground">
              Shared-credit plans are designed for small-team production. Heavy usage can upgrade or connect provider
              keys where supported.
            </p>
          ) : null}

          {showActions ? (
            <div className="mt-6">
              <Button className="w-full rounded-full" asChild>
                <TrackedCtaLink
                  href="/register"
                  eventName={SEO_EVENT.pricingCtaClick}
                  eventData={{
                    plan: plan.code,
                    destination: "/register",
                    placement: compact ? "compact_grid" : "full_grid",
                  }}
                >
                  Start workspace
                </TrackedCtaLink>
              </Button>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  )
}
