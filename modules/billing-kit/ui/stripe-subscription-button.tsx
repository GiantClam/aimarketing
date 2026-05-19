"use client"

import { useState } from "react"

import { useI18n } from "@/modules/billing-kit/host/locale"
import { Button } from "@/modules/billing-kit/host/ui"

type StripeSubscriptionButtonProps = {
  planCode: string
  disabled?: boolean
  onApproved?: () => void
}

function translateBillingError(code: string, billing: {
  errorCreateStripeCheckout: string
  errorDuplicateSubscription: string
  errorPendingSubscription: string
  errorProviderSwitch: string
}) {
  switch (code) {
    case "billing_plan_already_subscribed":
      return billing.errorDuplicateSubscription
    case "billing_subscription_pending_approval":
      return billing.errorPendingSubscription
    case "billing_provider_switch_requires_cancellation":
      return billing.errorProviderSwitch
    case "stripe_create_checkout_session_failed":
      return billing.errorCreateStripeCheckout
    default:
      return code
  }
}

async function createCheckoutSession(planCode: string) {
  const response = await fetch("/api/stripe/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planCode }),
  })
  const json = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(json?.error || "stripe_create_checkout_session_failed")
  }
  return json || {}
}

export function StripeSubscriptionButton({ planCode, disabled, onApproved }: StripeSubscriptionButtonProps) {
  const { messages } = useI18n()
  const billing = messages.billing
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleCheckout = async () => {
    if (disabled || loading) return
    setLoading(true)
    setError("")
    try {
      const result = await createCheckoutSession(planCode)
      if (typeof result?.url === "string" && result.url) {
        window.location.assign(result.url)
        return
      }
      onApproved?.()
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "stripe_create_checkout_session_failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button className="w-full rounded-full" disabled={disabled || loading} onClick={() => void handleCheckout()}>
        {loading ? billing.creatingCheckout : billing.subscribeWithStripe}
      </Button>
      {error ? <p className="text-xs text-destructive">{translateBillingError(error, billing)}</p> : null}
    </div>
  )
}
