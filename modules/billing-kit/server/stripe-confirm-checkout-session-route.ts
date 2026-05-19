import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/modules/billing-kit/host/auth"
import {
  getStripeCheckoutSession,
  getStripeSubscriptionDetails,
  inferStripePlanCode,
  isStripeSubscriptionEnabledForEmail,
  parseStripeClientReferenceId,
} from "@/lib/billing/stripe"
import { upsertActiveStripeSubscription } from "@/lib/billing/subscription-store"

function toIsoOrNull(value: number | null | undefined) {
  if (!value) return null
  return new Date(value * 1000).toISOString()
}

function readStripeTimestamp(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (typeof value === "number") return value

  const firstItem = Array.isArray((record.items as { data?: unknown[] } | undefined)?.data)
    ? ((record.items as { data?: Record<string, unknown>[] } | undefined)?.data?.[0] as
        | Record<string, unknown>
        | undefined)
    : undefined
  const nestedValue = firstItem?.[key]
  return typeof nestedValue === "number" ? nestedValue : null
}

export async function handleStripeConfirmCheckoutSessionPost(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response

  if (!isStripeSubscriptionEnabledForEmail(auth.user.email)) {
    return NextResponse.json({ error: "stripe_subscriptions_disabled" }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : ""
  if (!sessionId) {
    return NextResponse.json({ error: "stripe_checkout_session_id_missing" }, { status: 400 })
  }

  try {
    const session = await getStripeCheckoutSession(sessionId)
    const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : ""
    if (!stripeSubscriptionId) {
      return NextResponse.json({ error: "stripe_subscription_id_missing" }, { status: 409 })
    }

    const subscription = await getStripeSubscriptionDetails(stripeSubscriptionId)
    const refs = parseStripeClientReferenceId(session.client_reference_id)
    if (refs.userId && refs.userId !== auth.user.id) {
      return NextResponse.json({ error: "stripe_checkout_session_user_mismatch" }, { status: 403 })
    }

    const planCode = inferStripePlanCode(subscription) || refs.planCode
    if (!planCode) {
      return NextResponse.json({ error: "billing_plan_not_found" }, { status: 409 })
    }

    const stored = await upsertActiveStripeSubscription({
      enterpriseId: auth.user.enterpriseId,
      userId: auth.user.id,
      planCode,
      stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : null,
      stripeSubscriptionId: subscription.id,
      stripeCheckoutSessionId: session.id,
      currentPeriodStart: toIsoOrNull(
        readStripeTimestamp(subscription as unknown as Record<string, unknown>, "current_period_start"),
      ),
      currentPeriodEnd: toIsoOrNull(
        readStripeTimestamp(subscription as unknown as Record<string, unknown>, "current_period_end"),
      ),
    })

    return NextResponse.json({ subscription: stored })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "stripe_checkout_session_confirm_failed" },
      { status: 500 },
    )
  }
}
