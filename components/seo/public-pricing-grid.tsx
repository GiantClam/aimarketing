"use client"

import { TrackedCtaLink } from "@/components/seo/tracked-cta-link"
import { useI18n } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { listBillingPlans } from "@/lib/billing/plans"
import { getPublicCopy } from "@/lib/i18n/public-copy"
import { SEO_EVENT } from "@/lib/seo/analytics"

function formatPrice(cents: number, locale: "zh" | "en", freeLabel: string) {
  if (cents === 0) return freeLabel

  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export function PublicPricingGrid({
  compact = false,
  showActions = false,
}: {
  compact?: boolean
  showActions?: boolean
}) {
  const { locale } = useI18n()
  const copy = getPublicCopy(locale)
  const plans = listBillingPlans()

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan) => (
        <article
          key={plan.code}
          className={`p-6 ${
            plan.code === "creator"
              ? "public-panel rounded-[10px] border-primary bg-card"
              : "public-panel rounded-[10px] border-border bg-card"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="public-kicker text-muted-foreground">{plan.code}</p>
              <h3 className="mt-2 font-display text-3xl font-extrabold uppercase tracking-[0.02em] text-foreground">{plan.name}</h3>
            </div>
            {plan.code === "creator" ? (
              <span className="public-kicker rounded-[6px] border border-primary/40 bg-primary px-3 py-1 text-primary-foreground">
                {copy.pricingGrid.recommended}
              </span>
            ) : null}
          </div>

          <div className="mt-5">
            <div className="font-display text-5xl font-extrabold uppercase tracking-[-0.04em] text-foreground">
              {formatPrice(plan.priceUsdCents, locale, copy.pricingGrid.free)}
            </div>
            <div className="public-kicker mt-2 text-muted-foreground">
              {plan.priceUsdCents === 0 ? copy.pricingGrid.starterAccess : copy.pricingGrid.perMonth}
            </div>
          </div>

          <div className="mt-5 space-y-3 border-t border-border pt-5">
            {buildFeatureSummary(plan, locale, copy.pricingGrid).map((item, index) => (
              <div key={item} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 text-sm leading-6 text-muted-foreground">
                <span className="font-display text-base font-bold text-foreground/52">{String(index + 1).padStart(2, "0")}</span>
                <span>{item}</span>
              </div>
            ))}
          </div>

          {!compact && plan.code === "free" ? (
            <p className="mt-5 text-xs leading-5 text-muted-foreground">
              {copy.pricingGrid.freePlanNote}
            </p>
          ) : null}

          {!compact && plan.code !== "free" ? (
            <p className="mt-5 text-xs leading-5 text-muted-foreground">
              {copy.pricingGrid.paidPlanNote}
            </p>
          ) : null}

          {showActions ? (
            <div className="mt-6">
              <Button className="public-button-primary h-11 w-full" asChild>
                <TrackedCtaLink
                  href="/register"
                  eventName={SEO_EVENT.pricingCtaClick}
                  eventData={{
                    plan: plan.code,
                    destination: "/register",
                    placement: compact ? "compact_grid" : "full_grid",
                  }}
                >
                  {copy.pricingGrid.startWorkspace}
                </TrackedCtaLink>
              </Button>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  )
}

function buildFeatureSummary(
  plan: ReturnType<typeof listBillingPlans>[number],
  locale: "zh" | "en",
  copy: ReturnType<typeof getPublicCopy>["pricingGrid"],
) {
  const imageQuality = Array.isArray(plan.features.imageQuality)
    ? plan.features.imageQuality.join(" / ")
    : "standard"

  const summary = [
    copy.workspaceMember(plan.sharedMemberLimit),
    copy.creditsLine(plan.monthlyCredits, plan.trialCredits),
    copy.imageQuality(imageQuality),
  ]

  if (plan.features.priorityQueue) {
    summary.push(copy.priorityQueue)
  }

  if (typeof plan.features.videoGeneration === "string") {
    summary.push(copy.videoGeneration(plan.features.videoGeneration))
  }

  return summary.map((item) => (locale === "zh" ? item.replace("standard", "标准") : item))
}
