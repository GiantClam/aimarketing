"use client"

import { useCallback, useEffect, useState } from "react"
import { CreditCard, RefreshCw } from "lucide-react"

import { useI18n } from "@/components/locale-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type CreditState = {
  account: {
    id: number
    account_type: string
    enterprise_id: number | null
    owner_user_id: number | null
    period_start: string | null
    period_end: string | null
  } | null
  balance: number
  reservedBalance: number
  availableCredits: number
}

type SubscriptionState = {
  subscription: {
    plan_code: string
    effective_plan_code?: string | null
    next_plan_code?: string | null
    status: string
    paypal_subscription_id: string | null
    current_period_start: string | null
    current_period_end: string | null
    seat_limit?: number | null
    active_member_count?: number | null
    seats_remaining?: number | null
  } | null
}

type CreditBalanceProps = {
  refreshKey?: number
  onSubscriptionLoaded?: (subscription: SubscriptionState["subscription"]) => void
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(Math.max(0, Math.floor(value || 0)))
}

function formatTemplate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""))
}

function translateBillingError(code: string, billing: {
  errorLoadCredits: string
  errorLoadSubscription: string
  errorLoadBilling: string
  statusActive: string
  statusPending: string
  statusCancelled: string
  statusSuspended: string
  statusExpired: string
  statusInactive: string
  statusUnknown: string
}) {
  switch (code) {
    case "billing_credits_failed":
      return billing.errorLoadCredits
    case "billing_subscription_failed":
      return billing.errorLoadSubscription
    case "billing_load_failed":
      return billing.errorLoadBilling
    default:
      return code
  }
}

function translateStatus(status: string, billing: {
  statusActive: string
  statusPending: string
  statusCancelled: string
  statusSuspended: string
  statusExpired: string
  statusInactive: string
  statusUnknown: string
}) {
  switch (status.toLowerCase()) {
    case "active":
      return billing.statusActive
    case "pending":
      return billing.statusPending
    case "cancelled":
      return billing.statusCancelled
    case "suspended":
      return billing.statusSuspended
    case "expired":
      return billing.statusExpired
    case "inactive":
      return billing.statusInactive
    default:
      return billing.statusUnknown
  }
}

export function CreditBalance({ refreshKey = 0, onSubscriptionLoaded }: CreditBalanceProps) {
  const { messages, locale } = useI18n()
  const billing = messages.billing
  const [credits, setCredits] = useState<CreditState | null>(null)
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [creditsResponse, subscriptionResponse] = await Promise.all([
        fetch("/api/billing/credits", { cache: "no-store" }),
        fetch("/api/billing/subscription", { cache: "no-store" }),
      ])
      const [creditsJson, subscriptionJson] = await Promise.all([
        creditsResponse.json().catch(() => null),
        subscriptionResponse.json().catch(() => null),
      ])
      if (!creditsResponse.ok) throw new Error(creditsJson?.error || "billing_credits_failed")
      if (!subscriptionResponse.ok) throw new Error(subscriptionJson?.error || "billing_subscription_failed")
      setCredits(creditsJson)
      setSubscription(subscriptionJson)
      onSubscriptionLoaded?.(subscriptionJson?.subscription ?? null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "billing_load_failed")
    } finally {
      setLoading(false)
    }
  }, [onSubscriptionLoaded])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const billedPlanCode = subscription?.subscription?.plan_code || "free"
  const planCode = subscription?.subscription?.effective_plan_code || billedPlanCode
  const status = subscription?.subscription?.status || "active"
  const seatLimit = subscription?.subscription?.seat_limit
  const activeMemberCount = subscription?.subscription?.active_member_count
  const nextPlanCode = subscription?.subscription?.next_plan_code
  const hasImmediateUpgradeAccess = billedPlanCode !== planCode && nextPlanCode === planCode

  return (
    <Card className="overflow-hidden rounded-[2rem] border-2 border-slate-200 bg-white/85 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-xl">
            <CreditCard className="h-5 w-5" />
            {billing.sharedCreditsTitle}
          </CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            {billing.sharedCreditsDescription}
          </p>
        </div>
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {billing.refresh}
        </Button>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="mb-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">
            {translateBillingError(error, billing)}
          </p>
        ) : null}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[1.5rem] border bg-slate-950 p-5 text-white">
            <p className="text-xs uppercase tracking-[0.18em] text-white/60">{billing.available}</p>
            <p className="mt-3 text-4xl font-semibold">{formatNumber(credits?.availableCredits || 0, locale)}</p>
          </div>
          <div className="rounded-[1.5rem] border bg-orange-50 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{billing.reserved}</p>
            <p className="mt-3 text-3xl font-semibold">{formatNumber(credits?.reservedBalance || 0, locale)}</p>
          </div>
          <div className="rounded-[1.5rem] border bg-teal-50 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{billing.plan}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge className="rounded-full">{planCode}</Badge>
              <Badge variant={status === "active" ? "default" : "secondary"} className="rounded-full">
                {translateStatus(status, billing)}
              </Badge>
              {nextPlanCode && nextPlanCode !== planCode ? (
                <Badge variant="secondary" className="rounded-full">
                  {`${billing.scheduledPlanBadge}: ${nextPlanCode}`}
                </Badge>
              ) : null}
            </div>
            {hasImmediateUpgradeAccess ? (
              <p className="mt-3 text-sm text-muted-foreground">{billing.immediateUpgradeMessage}</p>
            ) : nextPlanCode ? (
              <p className="mt-3 text-sm text-muted-foreground">{billing.nextPlanMessage}</p>
            ) : null}
            {typeof seatLimit === "number" && typeof activeMemberCount === "number" ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {formatTemplate(billing.membersUsage, {
                  used: formatNumber(activeMemberCount, locale),
                  limit: formatNumber(seatLimit, locale),
                })}
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
