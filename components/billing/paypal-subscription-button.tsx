"use client"

import { useEffect, useState } from "react"

import { useI18n } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"

declare global {
  interface Window {
    paypal?: {
      createInstance?: (options: {
        clientToken: string
        components?: string[]
      }) => Promise<unknown>
    }
  }
}

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
}) {
  switch (code) {
    case "paypal_create_subscription_failed":
      return billing.errorCreateSubscription
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
  const response = await fetch("/api/paypal/create-subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      planCode,
      returnUrl: `${window.location.origin}/dashboard/billing?paypal=approved`,
      cancelUrl: `${window.location.origin}/dashboard/billing?paypal=cancelled`,
    }),
  })
  const json = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(json?.error || "paypal_create_subscription_failed")
  }
  return json?.subscription
}

async function savePendingSubscription(planCode: string, paypalSubscriptionId: string) {
  const response = await fetch("/api/billing/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planCode, paypalSubscriptionId }),
  })
  const json = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(json?.error || "billing_subscription_save_failed")
  }
}

export function PayPalSubscriptionButton({ planCode, disabled, onApproved }: PayPalSubscriptionButtonProps) {
  const { messages } = useI18n()
  const billing = messages.billing
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (disabled) return

    let cancelled = false
    async function initSdk() {
      setError("")
      try {
        const response = await fetch("/api/paypal/browser-safe-client-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
        const json = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(json?.error || "paypal_sdk_load_failed")
        }

        const clientToken = typeof json?.clientToken === "string" ? json.clientToken : ""
        const sdkBaseUrl = typeof json?.sdkBaseUrl === "string" ? json.sdkBaseUrl : ""
        if (!clientToken || !sdkBaseUrl) {
          throw new Error("paypal_sdk_load_failed")
        }

        if (!document.querySelector("script[data-paypal-web-sdk-v6='true']")) {
          const script = document.createElement("script")
          script.src = `${sdkBaseUrl}/web-sdk/v6/core.js`
          script.async = true
          script.dataset.paypalWebSdkV6 = "true"
          await new Promise<void>((resolve, reject) => {
            script.onload = () => resolve()
            script.onerror = () => reject(new Error("paypal_sdk_load_failed"))
            document.body.appendChild(script)
          })
        }

        if (window.paypal?.createInstance) {
          await window.paypal.createInstance({
            clientToken,
            components: ["paypal-payments"],
          })
        }
      } catch (sdkError) {
        // The current checkout path can continue through the server-side approval URL
        // even if the optional v6 SDK bootstrap fails in the browser.
        if (!cancelled) {
          console.warn("billing.paypal.sdk_init_failed", sdkError)
        }
      }
    }

    void initSdk()
    return () => {
      cancelled = true
    }
  }, [disabled])

  const handleFallbackSubscribe = async () => {
    if (disabled || loading) return
    setLoading(true)
    setError("")
    try {
      const subscription = await createSubscription(planCode)
      const subscriptionId = typeof subscription?.id === "string" ? subscription.id : ""
      if (subscriptionId) {
        await savePendingSubscription(planCode, subscriptionId)
      }
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
      <Button className="w-full rounded-full" disabled={disabled || loading} onClick={() => void handleFallbackSubscribe()}>
        {loading ? billing.creatingSubscription : billing.subscribeWithPaypal}
      </Button>
      {error ? <p className="text-xs text-destructive">{translateBillingError(error, billing)}</p> : null}
    </div>
  )
}
