import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/modules/billing-kit/host/auth"
import { beginProviderCheckout, getCheckoutContext } from "@/lib/billing/checkout"
import type { BillingProvider } from "@/lib/billing/provider"

function getProviderCheckoutErrorStatus(provider: BillingProvider, message: string) {
  return message === "billing_plan_not_found"
    ? 400
    : message === "billing_plan_checkout_disabled"
      ? 403
      : message === `${provider}_subscriptions_disabled`
        ? 503
        : message === "billing_plan_already_subscribed" ||
            message === "billing_subscription_pending_approval" ||
            message === "billing_provider_switch_requires_cancellation"
          ? 409
          : 500
}

export async function handleProviderCheckoutPost(request: NextRequest, provider: BillingProvider) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response

  const body = await request.json().catch(() => null)
  const planCode = typeof body?.planCode === "string" ? body.planCode : ""

  try {
    const existingSubscription = await getCheckoutContext(auth.user)
    const result = await beginProviderCheckout({
      provider,
      user: auth.user,
      planCode,
      returnUrl: typeof body?.returnUrl === "string" ? body.returnUrl : null,
      cancelUrl: typeof body?.cancelUrl === "string" ? body.cancelUrl : null,
      origin: request.nextUrl?.origin || "",
      existingSubscription,
    })

    if (provider === "stripe" && result.operation === "checkout") {
      return NextResponse.json({
        operation: "checkout",
        sessionId: result.session.id,
        url: result.session.url || null,
        subscription: result.subscription || null,
      })
    }

    if (provider === "stripe" && result.operation === "revise") {
      return NextResponse.json({
        operation: "revise",
        stripeSubscription: result.stripeSubscription || null,
        subscriptionId: result.subscriptionId || null,
        nextPlanCode: result.nextPlanCode || null,
      })
    }

    return NextResponse.json(result)
  } catch (error) {
    const fallback =
      provider === "stripe" ? "stripe_create_checkout_session_failed" : "paypal_create_subscription_failed"
    const message = error instanceof Error ? error.message : fallback

    return NextResponse.json({ error: message }, { status: getProviderCheckoutErrorStatus(provider, message) })
  }
}
