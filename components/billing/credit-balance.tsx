"use client"

import { useEffect, useState } from "react"
import { CreditCard, RefreshCw } from "lucide-react"

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
    status: string
    paypal_subscription_id: string | null
    current_period_start: string | null
    current_period_end: string | null
  } | null
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.floor(value || 0)))
}

export function CreditBalance() {
  const [credits, setCredits] = useState<CreditState | null>(null)
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = async () => {
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
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "billing_load_failed")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const planCode = subscription?.subscription?.plan_code || "free"
  const status = subscription?.subscription?.status || "active"

  return (
    <Card className="overflow-hidden rounded-[2rem] border-2 border-slate-200 bg-white/85 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-xl">
            <CreditCard className="h-5 w-5" />
            Shared credits
          </CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Enterprise/workspace shared balance with per-user usage attribution.
          </p>
        </div>
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {error ? <p className="mb-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[1.5rem] border bg-slate-950 p-5 text-white">
            <p className="text-xs uppercase tracking-[0.18em] text-white/60">Available</p>
            <p className="mt-3 text-4xl font-semibold">{formatNumber(credits?.availableCredits || 0)}</p>
          </div>
          <div className="rounded-[1.5rem] border bg-orange-50 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Reserved</p>
            <p className="mt-3 text-3xl font-semibold">{formatNumber(credits?.reservedBalance || 0)}</p>
          </div>
          <div className="rounded-[1.5rem] border bg-teal-50 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Plan</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge className="rounded-full">{planCode}</Badge>
              <Badge variant={status === "active" ? "default" : "secondary"} className="rounded-full">
                {status}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
