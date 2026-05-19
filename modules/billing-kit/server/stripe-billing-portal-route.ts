import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/modules/billing-kit/host/auth"
import { getLatestBillingSubscription } from "@/lib/billing/subscription-store"
import {
  createStripeBillingPortalSession,
  getStripeSubscriptionDetails,
  isStripeSubscriptionEnabledForEmail,
} from "@/lib/billing/stripe"

function normalizeText(raw: unknown) {
  return typeof raw === "string" ? raw.trim() : ""
}

export async function handleStripeBillingPortalPost(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response

  if (!isStripeSubscriptionEnabledForEmail(auth.user.email)) {
    return NextResponse.json({ error: "stripe_subscriptions_disabled" }, { status: 403 })
  }

  try {
    const subscription = await getLatestBillingSubscription(auth.user)
    if (!subscription || normalizeText(subscription.payment_provider).toLowerCase() !== "stripe") {
      return NextResponse.json({ error: "stripe_subscription_not_found" }, { status: 404 })
    }

    let customerId = normalizeText(subscription.stripe_customer_id)
    const stripeSubscriptionId = normalizeText(subscription.stripe_subscription_id)
    if (!customerId && stripeSubscriptionId) {
      const remoteSubscription = await getStripeSubscriptionDetails(stripeSubscriptionId)
      customerId = typeof remoteSubscription.customer === "string" ? remoteSubscription.customer : ""
    }
    if (!customerId) {
      return NextResponse.json({ error: "stripe_customer_id_missing" }, { status: 409 })
    }

    const body = await request.json().catch(() => null)
    const returnUrl =
      typeof body?.returnUrl === "string" && body.returnUrl.trim()
        ? body.returnUrl.trim()
        : `${request.nextUrl?.origin || ""}/dashboard/billing`
    if (!returnUrl) {
      return NextResponse.json({ error: "stripe_billing_portal_return_url_missing" }, { status: 400 })
    }

    const session = await createStripeBillingPortalSession({ customerId, returnUrl })
    return NextResponse.json({ url: session.url })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "stripe_billing_portal_failed" },
      { status: 500 },
    )
  }
}
