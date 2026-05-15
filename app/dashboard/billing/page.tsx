"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ReceiptText } from "lucide-react"

import { CreditBalance } from "@/components/billing/credit-balance"
import { PricingCards } from "@/components/billing/pricing-cards"
import { useI18n } from "@/components/locale-provider"

export default function BillingPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [syncComplete, setSyncComplete] = useState(false)
  const [approvalSaved, setApprovalSaved] = useState(false)
  const { messages } = useI18n()
  const billing = messages.billing
  const searchParams = useSearchParams()
  const paypalState = searchParams.get("paypal")
  const approvedPlanCode = searchParams.get("planCode")
  const approvedSubscriptionId =
    searchParams.get("subscription_id") || searchParams.get("ba_token") || searchParams.get("token")

  useEffect(() => {
    if (paypalState !== "approved") {
      setApprovalSaved(false)
      return
    }
    if (!approvedPlanCode || !approvedSubscriptionId || approvalSaved) {
      return
    }

    let cancelled = false
    async function confirmApprovedSubscription() {
      try {
        const response = await fetch("/api/billing/subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planCode: approvedPlanCode,
            paypalSubscriptionId: approvedSubscriptionId,
          }),
        })
        const json = await response.json().catch(() => null)
        if (!response.ok && !(response.status === 409 && json?.error === "billing_plan_already_subscribed")) {
          throw new Error(json?.error || "billing_subscription_save_failed")
        }
        if (!cancelled) {
          setApprovalSaved(true)
          setRefreshKey((current) => current + 1)
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("billing.subscription.approval_save_failed", error)
        }
      }
    }

    void confirmApprovedSubscription()
    return () => {
      cancelled = true
    }
  }, [paypalState, approvedPlanCode, approvedSubscriptionId, approvalSaved])

  useEffect(() => {
    if (paypalState !== "approved") {
      setSyncComplete(false)
      return
    }
    if (syncComplete) {
      return
    }

    let attempts = 0
    setSyncComplete(false)
    setRefreshKey((current) => current + 1)
    const timer = window.setInterval(() => {
      attempts += 1
      setRefreshKey((current) => current + 1)
      if (attempts >= 9) {
        window.clearInterval(timer)
      }
    }, 2500)

    return () => {
      window.clearInterval(timer)
    }
  }, [paypalState, syncComplete])

  const paypalNotice =
    paypalState === "approved"
      ? syncComplete
        ? billing.paypalApprovedNotice
        : billing.paypalSyncingNotice
      : paypalState === "cancelled"
        ? billing.paypalCancelledNotice
        : ""

  return (
    <div className="h-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.18),transparent_32%),linear-gradient(135deg,#fff7ed_0%,#f8fafc_45%,#ecfeff_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 lg:px-10">
        <section className="rounded-[2.4rem] border-2 border-white/70 bg-white/70 p-8 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="inline-flex rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
                {billing.pageEyebrow}
              </p>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-950 lg:text-6xl">
                {billing.pageTitle}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
                {billing.pageDescription}
              </p>
            </div>
            <div className="rounded-[2rem] border bg-slate-950 p-5 text-white">
              <ReceiptText className="h-6 w-6" />
              <p className="mt-4 text-sm leading-6 text-white/72">
                {billing.pageNotice}
              </p>
            </div>
          </div>
        </section>

        {paypalNotice ? (
          <section className="rounded-[1.8rem] border border-teal-200 bg-teal-50/80 px-5 py-4 text-sm text-teal-950 shadow-sm">
            {paypalNotice}
          </section>
        ) : null}

        <CreditBalance
          refreshKey={refreshKey}
          onSubscriptionLoaded={(subscription) => {
            if (
              paypalState === "approved" &&
              (String(subscription?.status || "").toLowerCase() === "active" || Boolean(subscription?.next_plan_code))
            ) {
              setSyncComplete(true)
            }
          }}
        />
        <PricingCards
          refreshKey={refreshKey}
          onSubscribed={() => setRefreshKey((current) => current + 1)}
        />
      </div>
    </div>
  )
}
