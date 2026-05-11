import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { ensureDefaultFreeBillingForUser } from "@/lib/billing/default-free-plan"
import { getBillingPlan } from "@/lib/billing/plans"
import { pool } from "@/lib/db"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response

  try {
    const result = await pool.query(
      `
        SELECT id, enterprise_id, subscribed_by_user_id, plan_code, status, paypal_subscription_id,
               current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at
        FROM "AI_MARKETING_user_subscriptions"
        WHERE
          ($1::integer IS NOT NULL AND enterprise_id = $1)
          OR ($1::integer IS NULL AND subscribed_by_user_id = $2)
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1
      `,
      [auth.user.enterpriseId, auth.user.id],
    )

    const subscription = result.rows[0] || null
    if (subscription) {
      return NextResponse.json({ subscription })
    }

    const freeState = await ensureDefaultFreeBillingForUser(auth.user)
    return NextResponse.json({
      subscription: {
        id: freeState.subscription.id,
        enterprise_id: auth.user.enterpriseId,
        subscribed_by_user_id: auth.user.id,
        plan_code: freeState.subscription.planCode,
        status: freeState.subscription.status,
        paypal_subscription_id: null,
        current_period_start: freeState.subscription.currentPeriodStart,
        current_period_end: freeState.subscription.currentPeriodEnd,
        cancel_at_period_end: false,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "billing_subscription_failed" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response

  const body = await request.json().catch(() => null)
  const plan = getBillingPlan(typeof body?.planCode === "string" ? body.planCode : "")
  const paypalSubscriptionId =
    typeof body?.paypalSubscriptionId === "string" && body.paypalSubscriptionId.trim()
      ? body.paypalSubscriptionId.trim()
      : null
  if (!plan || !paypalSubscriptionId) {
    return NextResponse.json({ error: "planCode and paypalSubscriptionId are required" }, { status: 400 })
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO "AI_MARKETING_user_subscriptions" (
          enterprise_id,
          subscribed_by_user_id,
          plan_code,
          status,
          paypal_subscription_id
        ) VALUES ($1, $2, $3, 'pending', $4)
        ON CONFLICT (paypal_subscription_id) DO UPDATE SET
          enterprise_id = EXCLUDED.enterprise_id,
          subscribed_by_user_id = EXCLUDED.subscribed_by_user_id,
          plan_code = EXCLUDED.plan_code,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, enterprise_id, subscribed_by_user_id, plan_code, status, paypal_subscription_id
      `,
      [auth.user.enterpriseId, auth.user.id, plan.code, paypalSubscriptionId],
    )

    return NextResponse.json({ subscription: result.rows[0] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "billing_subscription_save_failed" },
      { status: 500 },
    )
  }
}
