"use client"

import { useEffect, useState } from "react"
import { Check, ShieldCheck } from "lucide-react"

import { PayPalSubscriptionButton } from "@/components/billing/paypal-subscription-button"
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

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function formatCredits(credits: number) {
  return new Intl.NumberFormat("en-US").format(credits)
}

function featureLines(plan: BillingPlan) {
  const quality = Array.isArray(plan.features?.imageQuality)
    ? plan.features.imageQuality.join("/")
    : "standard"
  return [
    plan.code === "free"
      ? `${formatCredits(plan.trialCredits)} trial credits for ${plan.trialDays || 0} days`
      : `${formatCredits(plan.monthlyCredits)} shared credits / month`,
    `${plan.sharedMemberLimit} shared workspace members`,
    `GPT Image 2 ${quality} quality`,
    `Mask edit: ${String(plan.features?.maskEdit || "standard")}`,
    plan.features?.priorityQueue ? "Priority image queue" : "Standard queue",
  ]
}

function planAvailabilityMessage(plan: BillingPlan) {
  if (plan.code === "free") {
    return `Default plan for new workspaces. Includes ${formatCredits(plan.trialCredits)} credits for ${plan.trialDays || 0} days.`
  }
  return "Paid membership packages are visible now and will be tested separately before checkout is enabled."
}

export function PricingCards({ onSubscribed }: { onSubscribed?: () => void }) {
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
    return <div className="rounded-[2rem] border bg-white/80 p-6 text-sm text-muted-foreground">Loading plans...</div>
  }

  if (error) {
    return <div className="rounded-[2rem] border border-destructive/20 bg-destructive/10 p-6 text-sm text-destructive">{error}</div>
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
                <Badge className="rounded-full bg-slate-950 text-white">Recommended</Badge>
              </div>
            ) : isFree ? (
              <div className="absolute right-4 top-4">
                <Badge className="rounded-full bg-teal-600 text-white">Default</Badge>
              </div>
            ) : null}
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <ShieldCheck className="h-5 w-5" />
                {plan.name}
              </CardTitle>
              <div className="mt-5">
                <span className="text-5xl font-semibold tracking-tight">{formatPrice(plan.priceUsdCents)}</span>
                <span className="ml-2 text-sm text-muted-foreground">/ month</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-3">
                {featureLines(plan).map((line) => (
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
              {planAvailabilityMessage(plan) ? (
                <p className="text-xs text-muted-foreground">{planAvailabilityMessage(plan)}</p>
              ) : null}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
