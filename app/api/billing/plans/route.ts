import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { getPayPalPlanId, isPayPalSubscriptionEnabled } from "@/lib/billing/paypal"
import { listBillingPlans } from "@/lib/billing/plans"

export async function GET(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response

  const paypalEnabled = isPayPalSubscriptionEnabled()

  return NextResponse.json({
    plans: listBillingPlans().map((plan) => ({
      ...plan,
      paypalPlanId: plan.checkoutEnabled && paypalEnabled ? getPayPalPlanId(plan.code) || null : null,
    })),
  })
}
