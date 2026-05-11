"use client"

import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"

declare global {
  interface Window {
    paypal?: {
      Buttons: (options: {
        createSubscription: () => Promise<string>
        onApprove: (data: { subscriptionID?: string }) => Promise<void>
        onError?: (error: unknown) => void
      }) => {
        render: (selector: HTMLElement | string) => Promise<void>
      }
    }
  }
}

type PayPalSubscriptionButtonProps = {
  planCode: string
  disabled?: boolean
  onApproved?: () => void
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
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [sdkReady, setSdkReady] = useState(false)
  const publicClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || ""

  useEffect(() => {
    if (!publicClientId || disabled || !containerRef.current) return
    if (window.paypal?.Buttons) {
      setSdkReady(true)
      return
    }

    const existing = document.querySelector<HTMLScriptElement>("script[data-paypal-subscription-sdk='true']")
    if (existing) {
      existing.addEventListener("load", () => setSdkReady(true), { once: true })
      return
    }

    const script = document.createElement("script")
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(publicClientId)}&vault=true&intent=subscription`
    script.async = true
    script.dataset.paypalSubscriptionSdk = "true"
    script.onload = () => setSdkReady(true)
    script.onerror = () => setError("paypal_sdk_load_failed")
    document.body.appendChild(script)
  }, [disabled, publicClientId])

  useEffect(() => {
    if (!sdkReady || !publicClientId || disabled || !containerRef.current || !window.paypal?.Buttons) return
    const container = containerRef.current
    container.innerHTML = ""
    window.paypal.Buttons({
      createSubscription: async () => {
        setError("")
        const subscription = await createSubscription(planCode)
        const id = typeof subscription?.id === "string" ? subscription.id : ""
        if (!id) throw new Error("paypal_subscription_id_missing")
        return id
      },
      onApprove: async (data) => {
        const subscriptionId = data.subscriptionID || ""
        if (!subscriptionId) throw new Error("paypal_subscription_id_missing")
        await savePendingSubscription(planCode, subscriptionId)
        onApproved?.()
      },
      onError: (paypalError) => {
        setError(paypalError instanceof Error ? paypalError.message : "paypal_subscription_failed")
      },
    }).render(container).catch((renderError) => {
      setError(renderError instanceof Error ? renderError.message : "paypal_button_render_failed")
    })
  }, [disabled, onApproved, planCode, publicClientId, sdkReady])

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

  if (publicClientId) {
    return (
      <div className="space-y-2">
        <div ref={containerRef} className={disabled ? "pointer-events-none opacity-50" : ""} />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Button className="w-full rounded-full" disabled={disabled || loading} onClick={() => void handleFallbackSubscribe()}>
        {loading ? "Creating subscription..." : "Subscribe with PayPal"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
