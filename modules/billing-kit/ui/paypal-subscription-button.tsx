"use client"

import { useState } from "react"

import { useI18n } from "@/modules/billing-kit/host/locale"
import { Button } from "@/modules/billing-kit/host/ui"

type PayPalSubscriptionButtonProps = {
  planCode: string
  disabled?: boolean
  onApproved?: () => void
}

function translateBillingError(code: string, billing: {
  errorCreateSubscription: string
  errorSaveSubscription: string
  errorLoadPaypalSdk: string
  errorMissingSubscriptionId: string
  errorPaypalFailed: string
  errorPaypalButtonRender: string
  errorDuplicateSubscription: string
  errorPendingSubscription: string
}) {
  switch (code) {
    case "paypal_create_subscription_failed":
      return billing.errorCreateSubscription
    case "billing_plan_already_subscribed":
      return billing.errorDuplicateSubscription
    case "billing_subscription_pending_approval":
      return billing.errorPendingSubscription
    case "billing_subscription_save_failed":
      return billing.errorSaveSubscription
    case "paypal_sdk_load_failed":
      return billing.errorLoadPaypalSdk
    case "paypal_subscription_id_missing":
      return billing.errorMissingSubscriptionId
    case "paypal_subscription_failed":
      return billing.errorPaypalFailed
    case "paypal_button_render_failed":
      return billing.errorPaypalButtonRender
    default:
      return code
  }
}

function getApprovalUrl(subscription: any) {
  const links = Array.isArray(subscription?.links) ? subscription.links : []
  const approve = links.find((link: any) => String(link?.rel || "").toLowerCase() === "approve")
  return typeof approve?.href === "string" ? approve.href : ""
}

async function createSubscription(planCode: string) {
  const approvedUrl = new URL(`${window.location.origin}/dashboard/billing`)
  approvedUrl.searchParams.set("paypal", "approved")
  approvedUrl.searchParams.set("planCode", planCode)

  const cancelledUrl = new URL(`${window.location.origin}/dashboard/billing`)
  cancelledUrl.searchParams.set("paypal", "cancelled")
  cancelledUrl.searchParams.set("planCode", planCode)

  const response = await fetch("/api/paypal/create-subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      planCode,
      returnUrl: approvedUrl.toString(),
      cancelUrl: cancelledUrl.toString(),
    }),
  })
  const json = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(json?.error || "paypal_create_subscription_failed")
  }
  return {
    operation: typeof json?.operation === "string" ? json.operation : "create",
    subscription: json?.subscription,
  }
}

export function PayPalSubscriptionButton({ planCode, disabled, onApproved }: PayPalSubscriptionButtonProps) {
  const { messages } = useI18n()
  const billing = messages.billing
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleFallbackSubscribe = async () => {
    if (disabled || loading) return
    setLoading(true)
    setError("")
    try {
      const { subscription } = await createSubscription(planCode)
      const approvalUrl = getApprovalUrl(subscription)
      if (approvalUrl) {
        window.location.assign(approvalUrl)
        return
      }
      onApproved?.()
    } catch (fallbackError) {
      setError(fallbackError instanceof Error ? fallbackError.message : "paypal_subscription_failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" className="w-full rounded-full" disabled={disabled || loading} onClick={() => void handleFallbackSubscribe()}>
        {loading ? billing.creatingSubscription : billing.subscribeWithPaypal}
      </Button>
      {error ? <p className="text-xs text-destructive">{translateBillingError(error, billing)}</p> : null}
    </div>
  )
}
