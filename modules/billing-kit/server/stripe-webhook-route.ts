import { NextRequest, NextResponse } from "next/server"

import { pool } from "@/modules/billing-kit/host/db"
import { getBillingPlan } from "@/lib/billing/plans"
import {
  buildStripeGrantIdempotencyKey,
  getStripeClient,
  getStripeSubscriptionDetails,
  getStripeWebhookSecret,
  inferStripePlanCode,
  parseStripeClientReferenceId,
} from "@/lib/billing/stripe"
import { upsertActiveStripeSubscription } from "@/lib/billing/subscription-store"

type StripeClient = ReturnType<typeof getStripeClient>
type StripeSubscription = Awaited<ReturnType<StripeClient["subscriptions"]["retrieve"]>>
type StripeWebhookEvent = ReturnType<StripeClient["webhooks"]["constructEvent"]>
type StripeCheckoutSession = Extract<StripeWebhookEvent["data"]["object"], { object: "checkout.session" }>
type StripeInvoice = Extract<StripeWebhookEvent["data"]["object"], { object: "invoice" }>

function normalizeText(raw: unknown) {
  return typeof raw === "string" ? raw.trim() : ""
}

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

function parseStripeSubscriptionReference(subscription: StripeSubscription | null | undefined) {
  const metadata = subscription?.metadata || {}
  const rawClientReferenceId = normalizeText(metadata.client_reference_id)
  if (rawClientReferenceId) {
    return parseStripeClientReferenceId(rawClientReferenceId)
  }

  return {
    enterpriseId: Number.parseInt(normalizeText(metadata.enterpriseId), 10) || null,
    userId: Number.parseInt(normalizeText(metadata.userId), 10) || null,
    planCode: normalizeText(metadata.planCode).toLowerCase() || null,
    provider: normalizeText(metadata.provider).toLowerCase() || null,
  }
}

function mapStripeStatus(status: string | null | undefined) {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized === "active" || normalized === "trialing") return "active"
  if (normalized === "canceled" || normalized === "cancelled") return "cancelled"
  if (
    normalized === "past_due" ||
    normalized === "unpaid" ||
    normalized === "incomplete_expired" ||
    normalized === "paused"
  ) {
    return "suspended"
  }
  return "pending"
}

async function ensureCreditAccount(
  client: { query: typeof pool.query },
  enterpriseId: number | null,
  ownerUserId: number | null,
) {
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

async function grantCreditsForStripeInvoice(
  client: { query: typeof pool.query },
  input: {
    enterpriseId: number | null
    ownerUserId: number | null
    stripeSubscriptionId: string
    planCode: string
    invoiceId: string | null
    periodEnd: string | null
    subscriptionRowId?: number | null
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
  const idempotencyKey = buildStripeGrantIdempotencyKey(
    input.stripeSubscriptionId,
    input.invoiceId,
    input.periodEnd,
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
      JSON.stringify({ stripeSubscriptionId: input.stripeSubscriptionId, planCode: input.planCode }),
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

async function upsertStripeSubscriptionStatus(
  client: { query: typeof pool.query },
  input: {
    enterpriseId: number | null
    ownerUserId: number | null
    planCode: string | null
    status: string
    stripeCustomerId: string | null
    stripeSubscriptionId: string
    stripeCheckoutSessionId?: string | null
    currentPeriodStart?: string | null
    currentPeriodEnd?: string | null
  },
) {
  const result = await client.query(
    `
      INSERT INTO "AI_MARKETING_user_subscriptions" (
        enterprise_id,
        subscribed_by_user_id,
        plan_code,
        status,
        payment_provider,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_checkout_session_id,
        current_period_start,
        current_period_end,
        next_plan_code,
        cancel_at_period_end
      ) VALUES ($1, $2, COALESCE($3, 'free'), $4, 'stripe', $5, $6, $7, NULLIF($8, '')::timestamp, NULLIF($9, '')::timestamp, NULL, FALSE)
      ON CONFLICT (stripe_subscription_id) DO UPDATE SET
        enterprise_id = COALESCE(EXCLUDED.enterprise_id, "AI_MARKETING_user_subscriptions".enterprise_id),
        subscribed_by_user_id = COALESCE(EXCLUDED.subscribed_by_user_id, "AI_MARKETING_user_subscriptions".subscribed_by_user_id),
        plan_code = COALESCE(EXCLUDED.plan_code, "AI_MARKETING_user_subscriptions".plan_code),
        status = EXCLUDED.status,
        payment_provider = 'stripe',
        stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, "AI_MARKETING_user_subscriptions".stripe_customer_id),
        stripe_checkout_session_id = COALESCE(EXCLUDED.stripe_checkout_session_id, "AI_MARKETING_user_subscriptions".stripe_checkout_session_id),
        current_period_start = COALESCE(EXCLUDED.current_period_start, "AI_MARKETING_user_subscriptions".current_period_start),
        current_period_end = COALESCE(EXCLUDED.current_period_end, "AI_MARKETING_user_subscriptions".current_period_end),
        cancel_at_period_end = CASE WHEN EXCLUDED.status = 'cancelled' THEN TRUE ELSE FALSE END,
        next_plan_code = CASE WHEN EXCLUDED.status = 'active' THEN NULL ELSE "AI_MARKETING_user_subscriptions".next_plan_code END,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, enterprise_id, subscribed_by_user_id, plan_code, status
    `,
    [
      input.enterpriseId,
      input.ownerUserId,
      input.planCode,
      input.status,
      input.stripeCustomerId,
      input.stripeSubscriptionId,
      input.stripeCheckoutSessionId || null,
      input.currentPeriodStart || null,
      input.currentPeriodEnd || null,
    ],
  )

  return result.rows[0] || null
}

async function handleCheckoutCompleted(
  client: { query: typeof pool.query },
  session: StripeCheckoutSession,
) {
  if (session.mode !== "subscription") return
  const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : ""
  if (!stripeSubscriptionId) return

  const subscription = await getStripeSubscriptionDetails(stripeSubscriptionId)
  const sessionRefs = parseStripeClientReferenceId(session.client_reference_id)
  const subscriptionRefs = parseStripeSubscriptionReference(subscription)
  const enterpriseId = sessionRefs.enterpriseId || subscriptionRefs.enterpriseId || null
  const userId = sessionRefs.userId || subscriptionRefs.userId || null
  const planCode = inferStripePlanCode(subscription) || sessionRefs.planCode || subscriptionRefs.planCode || null
  if (!userId || !planCode) return

  await upsertActiveStripeSubscription({
    enterpriseId,
    userId,
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
}

async function handleSubscriptionUpdated(
  client: { query: typeof pool.query },
  subscription: StripeSubscription,
) {
  const refs = parseStripeSubscriptionReference(subscription)
  await upsertStripeSubscriptionStatus(client, {
    enterpriseId: refs.enterpriseId || null,
    ownerUserId: refs.userId || null,
    planCode: inferStripePlanCode(subscription),
    status: mapStripeStatus(subscription.status),
    stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : null,
    stripeSubscriptionId: subscription.id,
    currentPeriodStart: toIsoOrNull(
      readStripeTimestamp(subscription as unknown as Record<string, unknown>, "current_period_start"),
    ),
    currentPeriodEnd: toIsoOrNull(
      readStripeTimestamp(subscription as unknown as Record<string, unknown>, "current_period_end"),
    ),
  })
}

async function handleInvoicePaid(client: { query: typeof pool.query }, invoice: StripeInvoice) {
  const invoiceRecord = invoice as unknown as Record<string, unknown>
  const invoiceSubscription = invoiceRecord.subscription
  const stripeSubscriptionId =
    typeof invoiceSubscription === "string"
      ? invoiceSubscription
      : invoiceSubscription &&
          typeof invoiceSubscription === "object" &&
          "id" in (invoiceSubscription as Record<string, unknown>)
        ? String((invoiceSubscription as Record<string, unknown>).id)
        : ""
  if (!stripeSubscriptionId) return

  const subscription = await getStripeSubscriptionDetails(stripeSubscriptionId)
  const refs = parseStripeSubscriptionReference(subscription)
  const planCode = inferStripePlanCode(subscription)
  const row = await upsertStripeSubscriptionStatus(client, {
    enterpriseId: refs.enterpriseId || null,
    ownerUserId: refs.userId || null,
    planCode,
    status: "active",
    stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : null,
    stripeSubscriptionId: subscription.id,
    currentPeriodStart: toIsoOrNull(
      readStripeTimestamp(subscription as unknown as Record<string, unknown>, "current_period_start"),
    ),
    currentPeriodEnd: toIsoOrNull(
      readStripeTimestamp(subscription as unknown as Record<string, unknown>, "current_period_end"),
    ),
  })

  if (planCode) {
    await grantCreditsForStripeInvoice(client, {
      enterpriseId: Number(row?.enterprise_id || refs.enterpriseId || 0) || null,
      ownerUserId: Number(row?.subscribed_by_user_id || refs.userId || 0) || null,
      stripeSubscriptionId,
      planCode,
      invoiceId: invoice.id,
      periodEnd: toIsoOrNull(
        readStripeTimestamp(subscription as unknown as Record<string, unknown>, "current_period_end"),
      ),
      subscriptionRowId: Number(row?.id || 0) || null,
    })
  }
}

async function applyStripeEvent(event: StripeWebhookEvent) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(client, event.data.object as StripeCheckoutSession)
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await handleSubscriptionUpdated(client, event.data.object as StripeSubscription)
    } else if (event.type === "invoice.paid") {
      await handleInvoicePaid(client, event.data.object as StripeInvoice)
    }
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function handleStripeWebhookPost(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get("stripe-signature")
  if (!signature) {
    return NextResponse.json({ error: "stripe_signature_missing" }, { status: 400 })
  }

  let event: StripeWebhookEvent
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret())
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "stripe_webhook_signature_invalid" },
      { status: 400 },
    )
  }

  try {
    const inserted = await pool.query(
      `
        INSERT INTO "AI_MARKETING_stripe_webhook_events" (
          stripe_event_id,
          event_type,
          resource_id,
          payload
        ) VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (stripe_event_id) DO NOTHING
        RETURNING id
      `,
      [event.id, event.type, normalizeText((event.data.object as unknown as Record<string, unknown>)?.id), rawBody],
    )
    if (!inserted.rows[0]?.id) {
      return NextResponse.json({ ok: true, duplicate: true })
    }

    await applyStripeEvent(event)
    await pool.query(
      `UPDATE "AI_MARKETING_stripe_webhook_events" SET processed_at = CURRENT_TIMESTAMP WHERE stripe_event_id = $1`,
      [event.id],
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "stripe_webhook_failed" },
      { status: 500 },
    )
  }
}
