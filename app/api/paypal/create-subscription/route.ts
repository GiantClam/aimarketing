import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { createPayPalSubscription, isPayPalSubscriptionEnabled } from "@/lib/billing/paypal"
import { getBillingPlan } from "@/lib/billing/plans"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response

  if (!isPayPalSubscriptionEnabled()) {
    return NextResponse.json({ error: "paypal_subscriptions_disabled" }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  const plan = getBillingPlan(typeof body?.planCode === "string" ? body.planCode : "")
  if (!plan) {
    return NextResponse.json({ error: "billing_plan_not_found" }, { status: 400 })
  }
  if (!plan.checkoutEnabled) {
    return NextResponse.json({ error: "billing_plan_checkout_disabled" }, { status: 403 })
  }

  try {
    const customId = `enterprise:${auth.user.enterpriseId || "personal"}:user:${auth.user.id}:plan:${plan.code}`
    const subscription = await createPayPalSubscription({
      planCode: plan.code,
      customId,
      returnUrl: typeof body?.returnUrl === "string" ? body.returnUrl : null,
      cancelUrl: typeof body?.cancelUrl === "string" ? body.cancelUrl : null,
    })
    return NextResponse.json({ subscription })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "paypal_create_subscription_failed" },
      { status: 500 },
    )
  }
}
