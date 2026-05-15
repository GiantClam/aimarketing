import { NextRequest, NextResponse } from "next/server"

import {
  buildPayPalGrantIdempotencyKey,
  getPayPalSubscriptionDetails,
  getPlanCodeForPayPalPlanId,
  verifyPayPalWebhookSignature,
  type PayPalWebhookEvent,
} from "@/lib/billing/paypal"
import { getBillingPlan, type BillingPlanCode } from "@/lib/billing/plans"
import { pool } from "@/lib/db"

export const runtime = "nodejs"

function normalizeText(raw: unknown) {
  return typeof raw === "string" ? raw.trim() : ""
}

function getSubscriptionId(resource: Record<string, unknown>) {
  return (
    normalizeText(resource.id) ||
    normalizeText(resource.billing_agreement_id) ||
    normalizeText(resource.subscription_id)
  )
}

function inferPlanCode(resource: Record<string, unknown>): BillingPlanCode | null {
  const raw = normalizeText(resource.custom_id || resource.plan_code).toLowerCase()
  if (raw.includes("starter")) return "starter"
  if (raw.includes("creator")) return "creator"
  if (raw.includes("studio")) return "studio"
  return getPlanCodeForPayPalPlanId(normalizeText(resource.plan_id))
}

function getRecord(raw: unknown) {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

function hasCompletedBillingCycle(periodEnd: unknown, lastPaymentTime: unknown) {
  const periodEndValue = Date.parse(normalizeText(periodEnd))
  const lastPaymentValue = Date.parse(normalizeText(lastPaymentTime))
  return Number.isFinite(periodEndValue) && Number.isFinite(lastPaymentValue) && lastPaymentValue >= periodEndValue
}

async function readRemoteSubscriptionSnapshot(paypalSubscriptionId: string) {
  try {
    const remoteSubscription = await getPayPalSubscriptionDetails(paypalSubscriptionId)
    const remoteBillingInfo = getRecord(remoteSubscription.billing_info)
    const remotePlanCode =
      inferPlanCode(remoteSubscription) ||
      inferPlanCode({ custom_id: remoteSubscription.custom_id } as Record<string, unknown>)
    return { remoteSubscription, remoteBillingInfo, remotePlanCode }
  } catch {
    return { remoteSubscription: null, remoteBillingInfo: null, remotePlanCode: null }
  }
}

function inferEnterpriseId(resource: Record<string, unknown>) {
  const customId = normalizeText(resource.custom_id)
  const match = /enterprise:(\d+)/i.exec(customId)
  return match ? Number.parseInt(match[1] || "", 10) : null
}

function inferSubscribedByUserId(resource: Record<string, unknown>) {
  const customId = normalizeText(resource.custom_id)
  const match = /user:(\d+)/i.exec(customId)
  return match ? Number.parseInt(match[1] || "", 10) : null
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

async function grantCreditsForSubscription(client: { query: typeof pool.query }, input: {
  enterpriseId: number | null
  ownerUserId: number | null
  paypalSubscriptionId: string
  grantResource: Record<string, unknown>
  fallbackGrantRef: string
  planCode: BillingPlanCode
  subscriptionRowId?: number | null
}) {
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
    input.grantResource,
    input.fallbackGrantRef,
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
      input.subscriptionRowId || null,
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

async function applyPayPalEvent(event: PayPalWebhookEvent) {
  const resource = event.resource || {}
  const paypalSubscriptionId = getSubscriptionId(resource)
  if (!paypalSubscriptionId) return

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    let enterpriseId = inferEnterpriseId(resource)
    let subscribedByUserId = inferSubscribedByUserId(resource)
    let planCode = inferPlanCode(resource)
    const existing = await client.query(
      `
        SELECT id, enterprise_id, subscribed_by_user_id, plan_code, next_plan_code, current_period_end
        FROM "AI_MARKETING_user_subscriptions"
        WHERE paypal_subscription_id = $1
        LIMIT 1
      `,
      [paypalSubscriptionId],
    )
    if (existing.rows[0]) {
      enterpriseId = enterpriseId || existing.rows[0].enterprise_id || null
      subscribedByUserId = subscribedByUserId || existing.rows[0].subscribed_by_user_id || null
      planCode = planCode || existing.rows[0].plan_code
    }

    if (event.event_type === "BILLING.SUBSCRIPTION.ACTIVATED" && planCode) {
      const upserted = await client.query(
        `
          INSERT INTO "AI_MARKETING_user_subscriptions" (
            enterprise_id,
            subscribed_by_user_id,
            plan_code,
            status,
            paypal_subscription_id,
            next_plan_code,
            current_period_start,
            current_period_end
          ) VALUES ($1, $2, $3, 'active', $4, NULL, NULLIF($5, '')::timestamp, NULLIF($6, '')::timestamp)
          ON CONFLICT (paypal_subscription_id) DO UPDATE SET
            enterprise_id = EXCLUDED.enterprise_id,
            subscribed_by_user_id = COALESCE(EXCLUDED.subscribed_by_user_id, "AI_MARKETING_user_subscriptions".subscribed_by_user_id),
            plan_code = EXCLUDED.plan_code,
            next_plan_code = NULL,
            status = 'active',
            current_period_start = COALESCE(EXCLUDED.current_period_start, "AI_MARKETING_user_subscriptions".current_period_start),
            current_period_end = COALESCE(EXCLUDED.current_period_end, "AI_MARKETING_user_subscriptions".current_period_end),
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `,
        [
          enterpriseId,
          subscribedByUserId,
          planCode,
          paypalSubscriptionId,
          normalizeText(resource.start_time),
          normalizeText((resource.billing_info as Record<string, unknown> | undefined)?.next_billing_time),
        ],
      )
      await grantCreditsForSubscription(client, {
        enterpriseId,
        ownerUserId: subscribedByUserId,
        paypalSubscriptionId,
        grantResource: resource,
        fallbackGrantRef: event.id,
        planCode,
        subscriptionRowId: upserted.rows[0]?.id || null,
      })
    } else if (event.event_type === "PAYMENT.SALE.COMPLETED") {
      const existingSubscription = existing.rows[0] || null
      const remoteSnapshot = await readRemoteSubscriptionSnapshot(paypalSubscriptionId)
      const remoteLastPayment = getRecord(remoteSnapshot.remoteBillingInfo?.last_payment)
      const effectivePlanCode =
        normalizeText(existingSubscription?.next_plan_code) ||
        remoteSnapshot.remotePlanCode ||
        planCode ||
        existingSubscription?.plan_code ||
        null
      const shouldApplyScheduledPlanChange =
        normalizeText(existingSubscription?.next_plan_code) &&
        hasCompletedBillingCycle(existingSubscription?.current_period_end, remoteLastPayment?.time)

      if (existingSubscription?.id) {
        await client.query(
          `
            UPDATE "AI_MARKETING_user_subscriptions"
            SET plan_code = COALESCE($2, plan_code),
                next_plan_code = CASE WHEN $3 THEN NULL ELSE next_plan_code END,
                status = 'active',
                current_period_start = COALESCE(NULLIF($4, '')::timestamp, current_period_start),
                current_period_end = COALESCE(NULLIF($5, '')::timestamp, current_period_end),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `,
          [
            existingSubscription.id,
            effectivePlanCode,
            Boolean(shouldApplyScheduledPlanChange),
            normalizeText(remoteLastPayment?.time),
            normalizeText(remoteSnapshot.remoteBillingInfo?.next_billing_time),
          ],
        )
      }

      if (effectivePlanCode) {
        await grantCreditsForSubscription(client, {
          enterpriseId,
          ownerUserId: subscribedByUserId,
          paypalSubscriptionId,
          grantResource: remoteSnapshot.remoteSubscription || resource,
          fallbackGrantRef: event.id,
          planCode: effectivePlanCode as BillingPlanCode,
          subscriptionRowId: existing.rows[0]?.id || null,
        })
      }
    } else if (event.event_type === "BILLING.SUBSCRIPTION.UPDATED" && planCode && existing.rows[0]?.id) {
      const currentPlanCode = normalizeText(existing.rows[0].plan_code)
      const nextPlanCode = currentPlanCode !== planCode ? planCode : null
      await client.query(
        `
          UPDATE "AI_MARKETING_user_subscriptions"
          SET next_plan_code = $2,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `,
        [existing.rows[0].id, nextPlanCode],
      )
    } else if (event.event_type === "BILLING.SUBSCRIPTION.CANCELLED") {
      await client.query(
        `UPDATE "AI_MARKETING_user_subscriptions" SET status = 'cancelled', cancel_at_period_end = TRUE, next_plan_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE paypal_subscription_id = $1`,
        [paypalSubscriptionId],
      )
    } else if (
      event.event_type === "BILLING.SUBSCRIPTION.SUSPENDED" ||
      event.event_type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED"
    ) {
      await client.query(
        `UPDATE "AI_MARKETING_user_subscriptions" SET status = 'suspended', updated_at = CURRENT_TIMESTAMP WHERE paypal_subscription_id = $1`,
        [paypalSubscriptionId],
      )
    }

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  let event: PayPalWebhookEvent
  try {
    event = JSON.parse(rawBody) as PayPalWebhookEvent
  } catch {
    return NextResponse.json({ error: "invalid_paypal_webhook_payload" }, { status: 400 })
  }

  try {
    const verified = process.env.PAYPAL_SKIP_WEBHOOK_VERIFICATION === "true"
      ? true
      : await verifyPayPalWebhookSignature({ headers: request.headers, rawBody })
    if (!verified) {
      return NextResponse.json({ error: "paypal_webhook_signature_invalid" }, { status: 401 })
    }

    const inserted = await pool.query(
      `
        INSERT INTO "AI_MARKETING_paypal_webhook_events" (
          paypal_event_id,
          event_type,
          resource_id,
          payload
        ) VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (paypal_event_id) DO NOTHING
        RETURNING id
      `,
      [event.id, event.event_type, getSubscriptionId(event.resource || {}) || null, rawBody],
    )
    if (!inserted.rows[0]?.id) {
      return NextResponse.json({ ok: true, duplicate: true })
    }

    await applyPayPalEvent(event)
    await pool.query(
      `UPDATE "AI_MARKETING_paypal_webhook_events" SET processed_at = CURRENT_TIMESTAMP WHERE paypal_event_id = $1`,
      [event.id],
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "paypal_webhook_failed" },
      { status: 500 },
    )
  }
}
