"use client"

import { useEffect, useState } from "react"
import { Check, ShieldCheck } from "lucide-react"

import { PayPalSubscriptionButton } from "@/components/billing/paypal-subscription-button"
import { useI18n } from "@/components/locale-provider"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type BillingPlan = {
  code: string
  name: string
  priceUsdCents: number
  monthlyCredits: number
  sharedMemberLimit: number
  trialDays: number | null
  trialCredits: number
  checkoutEnabled: boolean
  paypalPlanId: string | null
  features: Record<string, unknown>
}

function formatPrice(cents: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100)
}

function formatCredits(credits: number, locale: string) {
  return new Intl.NumberFormat(locale).format(credits)
}

function formatTemplate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""))
}

function featureLines(
  plan: BillingPlan,
  billing: {
    freeTrialLine: string
    sharedCreditsLine: string
    sharedMembersLine: string
    imageQualityLine: string
    maskEditLine: string
    priorityQueue: string
    standardQueue: string
  },
  locale: string,
) {
  const quality = Array.isArray(plan.features?.imageQuality)
    ? plan.features.imageQuality.join("/")
    : "standard"
  return [
    plan.code === "free"
      ? formatTemplate(billing.freeTrialLine, { credits: formatCredits(plan.trialCredits, locale), days: plan.trialDays || 0 })
      : formatTemplate(billing.sharedCreditsLine, { credits: formatCredits(plan.monthlyCredits, locale) }),
    formatTemplate(billing.sharedMembersLine, { count: plan.sharedMemberLimit }),
    formatTemplate(billing.imageQualityLine, { quality }),
    formatTemplate(billing.maskEditLine, { level: String(plan.features?.maskEdit || "standard") }),
    plan.features?.priorityQueue ? billing.priorityQueue : billing.standardQueue,
  ]
}

function planAvailabilityMessage(
  plan: BillingPlan,
  billing: {
    freePlanMessage: string
    paidPlanMessage: string
  },
  locale: string,
) {
  if (plan.code === "free") {
    return formatTemplate(billing.freePlanMessage, {
      credits: formatCredits(plan.trialCredits, locale),
      days: plan.trialDays || 0,
    })
  }
  return billing.paidPlanMessage
}

function translateBillingError(code: string, billing: {
  errorLoadPlans: string
}) {
  switch (code) {
    case "billing_plans_failed":
      return billing.errorLoadPlans
    default:
      return code
  }
}

export function PricingCards({ onSubscribed }: { onSubscribed?: () => void }) {
  const { messages, locale } = useI18n()
  const billing = messages.billing
  const [plans, setPlans] = useState<BillingPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    async function loadPlans() {
      setLoading(true)
      setError("")
      try {
        const response = await fetch("/api/billing/plans", { cache: "no-store" })
        const json = await response.json().catch(() => null)
        if (!response.ok) throw new Error(json?.error || "billing_plans_failed")
        if (!cancelled) setPlans(Array.isArray(json?.plans) ? json.plans : [])
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "billing_plans_failed")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadPlans()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <div className="rounded-[2rem] border bg-white/80 p-6 text-sm text-muted-foreground">{billing.loadingPlans}</div>
  }

  if (error) {
    return (
      <div className="rounded-[2rem] border border-destructive/20 bg-destructive/10 p-6 text-sm text-destructive">
        {translateBillingError(error, billing)}
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {plans.map((plan) => {
        const highlighted = plan.code === "creator"
        const isFree = plan.code === "free"
        return (
          <Card
            key={plan.code}
            className={`relative overflow-hidden rounded-[2rem] border-2 bg-white/90 shadow-sm ${
              highlighted ? "border-slate-950" : "border-slate-200"
            }`}
          >
            {highlighted ? (
              <div className="absolute right-4 top-4">
                <Badge className="rounded-full bg-slate-950 text-white">{billing.recommended}</Badge>
              </div>
            ) : isFree ? (
              <div className="absolute right-4 top-4">
                <Badge className="rounded-full bg-teal-600 text-white">{billing.defaultBadge}</Badge>
              </div>
            ) : null}
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <ShieldCheck className="h-5 w-5" />
                {plan.name}
              </CardTitle>
              <div className="mt-5">
                <span className="text-5xl font-semibold tracking-tight">{formatPrice(plan.priceUsdCents, locale)}</span>
                <span className="ml-2 text-sm text-muted-foreground">{billing.perMonth}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-3">
                {featureLines(plan, billing, locale).map((line) => (
                  <div key={line} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span>{line}</span>
                  </div>
                ))}
              </div>
              <PayPalSubscriptionButton
                planCode={plan.code}
                disabled={isFree || !plan.checkoutEnabled || !plan.paypalPlanId}
                onApproved={onSubscribed}
              />
              {planAvailabilityMessage(plan, billing, locale) ? (
                <p className="text-xs text-muted-foreground">{planAvailabilityMessage(plan, billing, locale)}</p>
              ) : null}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
