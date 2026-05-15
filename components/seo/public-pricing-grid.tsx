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
                {copy.pricingGrid.recommended}
              </span>
            ) : null}
          </div>

          <div className="mt-5">
            <div className="text-4xl font-semibold text-foreground">
              {formatPrice(plan.priceUsdCents, locale, copy.pricingGrid.free)}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {plan.priceUsdCents === 0 ? copy.pricingGrid.starterAccess : copy.pricingGrid.perMonth}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {buildFeatureSummary(plan, locale, copy.pricingGrid).map((item) => (
              <div key={item} className="text-sm leading-6 text-muted-foreground">
                {item}
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
