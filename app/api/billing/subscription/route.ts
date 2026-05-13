import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { ensureDefaultFreeBillingForUser } from "@/lib/billing/default-free-plan"
import {
  buildPayPalGrantIdempotencyKey,
  getPayPalSubscriptionDetails,
  isPayPalSubscriptionEnabledForEmail,
} from "@/lib/billing/paypal"
import { getBillingPlan } from "@/lib/billing/plans"
import { getWorkspaceBillingSnapshot } from "@/lib/billing/workspace"
import { pool } from "@/lib/db"
import type { AuthUserPayload } from "@/lib/enterprise/server"

export const runtime = "nodejs"

function normalizeText(raw: unknown) {
  return typeof raw === "string" ? raw.trim() : ""
}

function getRecord(raw: unknown) {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

function inferPlanCodeFromCustomId(customId: string, fallbackPlanCode: string | null | undefined) {
  const normalized = normalizeText(customId).toLowerCase()
  if (normalized.includes("starter")) return "starter"
  if (normalized.includes("creator")) return "creator"
  if (normalized.includes("studio")) return "studio"
  return normalizeText(fallbackPlanCode) || null
}

async function ensureCreditAccount(client: { query: typeof pool.query }, enterpriseId: number | null, ownerUserId: number | null) {
  const existing = await client.query(
    `
      SELECT id FROM "AI_MARKETING_credit_accounts"
      WHERE
        ($1::integer IS NOT NULL AND enterprise_id = $1)
        OR ($1::integer IS NULL AND owner_user_id = $2)
      ORDER BY id ASC
      LIMIT 1
    `,
    [enterpriseId, ownerUserId],
  )
  if (existing.rows[0]?.id) return Number(existing.rows[0].id)

  const created = await client.query(
    `
      INSERT INTO "AI_MARKETING_credit_accounts" (account_type, enterprise_id, owner_user_id)
      VALUES ($1, $2, $3)
      RETURNING id
    `,
    [enterpriseId ? "enterprise" : "personal", enterpriseId, enterpriseId ? null : ownerUserId],
  )
  return Number(created.rows[0].id)
}

async function grantCreditsForRemoteSubscription(
  client: { query: typeof pool.query },
  input: {
    enterpriseId: number | null
    ownerUserId: number | null
    planCode: string
    paypalSubscriptionId: string
    subscriptionRowId: number | null
    remoteSubscription: Record<string, unknown>
  },
) {
  const plan = getBillingPlan(input.planCode)
  if (!plan) return

  const creditAccountId = await ensureCreditAccount(client, input.enterpriseId, input.ownerUserId)
  const account = await client.query(
    `SELECT balance, reserved_balance FROM "AI_MARKETING_credit_accounts" WHERE id = $1 FOR UPDATE`,
    [creditAccountId],
  )
  const currentBalance = Number(account.rows[0]?.balance || 0)
  const nextBalance = currentBalance + plan.monthlyCredits
  const idempotencyKey = buildPayPalGrantIdempotencyKey(
    input.paypalSubscriptionId,
    input.remoteSubscription,
    `subscription:${input.paypalSubscriptionId}`,
  )

  const inserted = await client.query(
    `
      INSERT INTO "AI_MARKETING_credit_ledger" (
        credit_account_id,
        enterprise_id,
        subscription_id,
        entry_type,
        feature_key,
        amount,
        balance_after,
        reserved_balance_after,
        idempotency_key,
        metadata
      ) VALUES ($1, $2, $3, 'grant', 'subscription_monthly_grant', $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT (credit_account_id, idempotency_key) DO NOTHING
      RETURNING id
    `,
    [
      creditAccountId,
      input.enterpriseId,
      input.subscriptionRowId,
      plan.monthlyCredits,
      nextBalance,
      Number(account.rows[0]?.reserved_balance || 0),
      idempotencyKey,
      JSON.stringify({ paypalSubscriptionId: input.paypalSubscriptionId, planCode: input.planCode }),
    ],
  )

  if (inserted.rows[0]?.id) {
    await client.query(
      `
        UPDATE "AI_MARKETING_credit_accounts"
        SET balance = $2,
            monthly_grant_balance = monthly_grant_balance + $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [creditAccountId, nextBalance, plan.monthlyCredits],
    )
  }
}

async function reconcilePayPalSubscriptionIfNeeded(localSubscription: Record<string, unknown>) {
  const paypalSubscriptionId = normalizeText(localSubscription.paypal_subscription_id)
  if (!paypalSubscriptionId) return localSubscription

  const remoteSubscription = await getPayPalSubscriptionDetails(paypalSubscriptionId)
  const remoteStatus = normalizeText(remoteSubscription.status).toLowerCase()
  if (!remoteStatus) return localSubscription

  const remoteBillingInfo = getRecord(remoteSubscription.billing_info)
  const remotePlanCode = inferPlanCodeFromCustomId(
    normalizeText(remoteSubscription.custom_id),
    normalizeText(localSubscription.plan_code),
  )

  if (!["active", "suspended", "cancelled", "expired"].includes(remoteStatus)) {
    return localSubscription
  }

  const nextStatus =
    remoteStatus === "active"
      ? "active"
      : remoteStatus === "suspended"
        ? "suspended"
        : remoteStatus === "cancelled"
          ? "cancelled"
          : "expired"

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const updated = await client.query(
      `
        UPDATE "AI_MARKETING_user_subscriptions"
        SET plan_code = COALESCE($2, plan_code),
            status = $3,
            current_period_start = COALESCE(NULLIF($4, '')::timestamp, current_period_start),
            current_period_end = COALESCE(NULLIF($5, '')::timestamp, current_period_end),
            cancel_at_period_end = CASE WHEN $3 = 'cancelled' THEN TRUE ELSE cancel_at_period_end END,
            updated_at = CURRENT_TIMESTAMP
        WHERE paypal_subscription_id = $1
        RETURNING id, enterprise_id, subscribed_by_user_id, plan_code, status, paypal_subscription_id,
                  current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at
      `,
      [
        paypalSubscriptionId,
        remotePlanCode,
        nextStatus,
        normalizeText(remoteSubscription.start_time),
        normalizeText(remoteBillingInfo?.next_billing_time),
      ],
    )

    const row = updated.rows[0] || localSubscription
    if (nextStatus === "active" && remotePlanCode) {
      await grantCreditsForRemoteSubscription(client, {
        enterpriseId: Number(row.enterprise_id || 0) || null,
        ownerUserId: Number(row.subscribed_by_user_id || 0) || null,
        planCode: remotePlanCode,
        paypalSubscriptionId,
        subscriptionRowId: Number(row.id || 0) || null,
        remoteSubscription,
      })
    }

    await client.query("COMMIT")
    return row
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response
  const user = (auth as { user: AuthUserPayload }).user

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
      [user.enterpriseId, user.id],
    )

    let subscription = result.rows[0] || null
    if (subscription?.paypal_subscription_id && subscription.status === "pending") {
      try {
        subscription = await reconcilePayPalSubscriptionIfNeeded(subscription)
      } catch (error) {
        console.warn("billing.subscription.paypal_reconcile_failed", {
          message: error instanceof Error ? error.message : String(error),
          paypalSubscriptionId: subscription.paypal_subscription_id,
        })
      }
    }
    const workspaceSnapshot = user.enterpriseId
      ? await getWorkspaceBillingSnapshot(user.enterpriseId)
      : null
    if (subscription) {
      return NextResponse.json({
        subscription: {
          ...subscription,
          seat_limit: workspaceSnapshot?.seatLimit ?? null,
          active_member_count: workspaceSnapshot?.activeMemberCount ?? null,
          seats_remaining: workspaceSnapshot?.seatsRemaining ?? null,
        },
      })
    }

    const freeState = await ensureDefaultFreeBillingForUser(user)
    const nextWorkspaceSnapshot = user.enterpriseId
      ? await getWorkspaceBillingSnapshot(user.enterpriseId)
      : null
    return NextResponse.json({
      subscription: {
        id: freeState.subscription.id,
        enterprise_id: user.enterpriseId,
        subscribed_by_user_id: user.id,
        plan_code: freeState.subscription.planCode,
        status: freeState.subscription.status,
        paypal_subscription_id: null,
        current_period_start: freeState.subscription.currentPeriodStart,
        current_period_end: freeState.subscription.currentPeriodEnd,
        cancel_at_period_end: false,
        seat_limit: nextWorkspaceSnapshot?.seatLimit ?? null,
        active_member_count: nextWorkspaceSnapshot?.activeMemberCount ?? null,
        seats_remaining: nextWorkspaceSnapshot?.seatsRemaining ?? null,
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
  const user = (auth as { user: AuthUserPayload }).user

  const body = await request.json().catch(() => null)
  const plan = getBillingPlan(typeof body?.planCode === "string" ? body.planCode : "")
  const paypalSubscriptionId =
    typeof body?.paypalSubscriptionId === "string" && body.paypalSubscriptionId.trim()
      ? body.paypalSubscriptionId.trim()
      : null
  if (!plan || !paypalSubscriptionId) {
    return NextResponse.json({ error: "planCode and paypalSubscriptionId are required" }, { status: 400 })
  }
  if (!isPayPalSubscriptionEnabledForEmail(user.email)) {
    return NextResponse.json({ error: "paypal_subscriptions_disabled" }, { status: 403 })
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
      [user.enterpriseId, user.id, plan.code, paypalSubscriptionId],
    )

    return NextResponse.json({ subscription: result.rows[0] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "billing_subscription_save_failed" },
      { status: 500 },
    )
  }
}
