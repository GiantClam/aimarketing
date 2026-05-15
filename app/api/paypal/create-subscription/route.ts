import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import {
  createPayPalSubscription,
  isPayPalSubscriptionEnabledForEmail,
  revisePayPalSubscription,
} from "@/lib/billing/paypal"
import { getBillingPlan } from "@/lib/billing/plans"
import { pool } from "@/lib/db"

export const runtime = "nodejs"

function normalizeText(raw: unknown) {
  return typeof raw === "string" ? raw.trim() : ""
}

function hasFuturePeriodEnd(value: unknown) {
  const normalized = normalizeText(value)
  if (!normalized) return false
  const time = Date.parse(normalized)
  return Number.isFinite(time) && time > Date.now()
}

function blocksDuplicatePlanSubscription(subscription: Record<string, unknown> | null, planCode: string) {
  if (!subscription) return false
  const normalizedPlanCode = planCode.toLowerCase()
  const currentPlanCode = normalizeText(subscription.plan_code).toLowerCase()
  const nextPlanCode = normalizeText(subscription.next_plan_code).toLowerCase()
  if (currentPlanCode !== normalizedPlanCode && nextPlanCode !== normalizedPlanCode) return false

  const status = normalizeText(subscription.status).toLowerCase()
  if (["active", "pending", "suspended"].includes(status)) return true
  if (status === "cancelled" && hasFuturePeriodEnd(subscription.current_period_end)) return true
  return false
}

export async function POST(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response

  if (!isPayPalSubscriptionEnabledForEmail(auth.user.email)) {
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
    const existingSubscriptionResult = await pool.query(
      `
        SELECT plan_code, status, current_period_end, paypal_subscription_id, next_plan_code
        FROM "AI_MARKETING_user_subscriptions"
        WHERE
          ($1::integer IS NOT NULL AND enterprise_id = $1)
          OR ($1::integer IS NULL AND subscribed_by_user_id = $2)
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1
      `,
      [auth.user.enterpriseId, auth.user.id],
    )
    const existingSubscription = existingSubscriptionResult.rows[0] || null
    if (blocksDuplicatePlanSubscription(existingSubscription, plan.code)) {
      return NextResponse.json({ error: "billing_plan_already_subscribed" }, { status: 409 })
    }

    const existingStatus = normalizeText(existingSubscription?.status).toLowerCase()
    const existingPayPalSubscriptionId = normalizeText(existingSubscription?.paypal_subscription_id)
    if (
      existingPayPalSubscriptionId &&
      existingStatus === "pending" &&
      normalizeText(existingSubscription?.plan_code).toLowerCase() !== plan.code
    ) {
      return NextResponse.json({ error: "billing_subscription_pending_approval" }, { status: 409 })
    }

    const canReviseExistingSubscription =
      existingPayPalSubscriptionId &&
      normalizeText(existingSubscription?.plan_code).toLowerCase() !== plan.code &&
      ["active", "suspended"].includes(existingStatus)

    if (canReviseExistingSubscription) {
      const subscription = await revisePayPalSubscription({
        paypalSubscriptionId: existingPayPalSubscriptionId,
        planCode: plan.code,
        returnUrl: typeof body?.returnUrl === "string" ? body.returnUrl : null,
        cancelUrl: typeof body?.cancelUrl === "string" ? body.cancelUrl : null,
      })
      return NextResponse.json({ subscription, operation: "revise" })
    }

    const customId = `enterprise:${auth.user.enterpriseId || "personal"}:user:${auth.user.id}:plan:${plan.code}`
    const subscription = await createPayPalSubscription({
      planCode: plan.code,
      customId,
      returnUrl: typeof body?.returnUrl === "string" ? body.returnUrl : null,
      cancelUrl: typeof body?.cancelUrl === "string" ? body.cancelUrl : null,
    })
    return NextResponse.json({ subscription, operation: "create" })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "paypal_create_subscription_failed" },
      { status: 500 },
    )
  }
}
