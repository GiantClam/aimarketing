import { pool } from "@/modules/billing-kit/host/db"
import type { AuthUserPayload } from "@/modules/billing-kit/host/enterprise"

export type BillingSubscriptionRecord = {
  id: number
  enterprise_id: number | null
  subscribed_by_user_id: number | null
  plan_code: string
  status: string
  payment_provider?: string | null
  paypal_subscription_id?: string | null
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  stripe_checkout_session_id?: string | null
  next_plan_code?: string | null
  current_period_start?: string | Date | null
  current_period_end?: string | Date | null
  cancel_at_period_end?: boolean
  created_at?: string | Date | null
  updated_at?: string | Date | null
}

const SELECT_LATEST_SUBSCRIPTION = `
  SELECT id, enterprise_id, subscribed_by_user_id, plan_code, status, payment_provider,
         paypal_subscription_id, stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id,
         next_plan_code, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at
  FROM "AI_MARKETING_user_subscriptions"
  WHERE
    ($1::integer IS NOT NULL AND enterprise_id = $1)
    OR ($1::integer IS NULL AND subscribed_by_user_id = $2)
  ORDER BY updated_at DESC NULLS LAST, id DESC
  LIMIT 1
`

export async function getLatestBillingSubscription(user: Pick<AuthUserPayload, "enterpriseId" | "id">) {
  const result = await pool.query(SELECT_LATEST_SUBSCRIPTION, [user.enterpriseId, user.id])
  return (result.rows[0] || null) as BillingSubscriptionRecord | null
}

export async function scheduleSubscriptionPlanChange(subscriptionId: number, planCode: string) {
  const result = await pool.query(
    `
      UPDATE "AI_MARKETING_user_subscriptions"
      SET next_plan_code = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, enterprise_id, subscribed_by_user_id, plan_code, status, payment_provider,
                paypal_subscription_id, stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id,
                next_plan_code, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at
    `,
    [subscriptionId, planCode],
  )
  return (result.rows[0] || null) as BillingSubscriptionRecord | null
}

export async function savePendingPayPalSubscription(input: {
  enterpriseId: number | null
  userId: number
  planCode: string
  paypalSubscriptionId: string
}) {
  const result = await pool.query(
    `
      INSERT INTO "AI_MARKETING_user_subscriptions" (
        enterprise_id,
        subscribed_by_user_id,
        plan_code,
        status,
        payment_provider,
        paypal_subscription_id,
        next_plan_code
      ) VALUES ($1, $2, $3, 'pending', 'paypal', $4, NULL)
      ON CONFLICT (paypal_subscription_id) DO UPDATE SET
        enterprise_id = EXCLUDED.enterprise_id,
        subscribed_by_user_id = EXCLUDED.subscribed_by_user_id,
        plan_code = EXCLUDED.plan_code,
        payment_provider = 'paypal',
        next_plan_code = NULL,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, enterprise_id, subscribed_by_user_id, plan_code, status, payment_provider,
                paypal_subscription_id, stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id,
                next_plan_code, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at
    `,
    [input.enterpriseId, input.userId, input.planCode, input.paypalSubscriptionId],
  )
  return (result.rows[0] || null) as BillingSubscriptionRecord | null
}

export async function savePendingStripeCheckoutSession(input: {
  enterpriseId: number | null
  userId: number
  planCode: string
  stripeCustomerId: string | null
  stripeCheckoutSessionId: string
}) {
  const result = await pool.query(
    `
      INSERT INTO "AI_MARKETING_user_subscriptions" (
        enterprise_id,
        subscribed_by_user_id,
        plan_code,
        status,
        payment_provider,
        stripe_customer_id,
        stripe_checkout_session_id,
        next_plan_code
      ) VALUES ($1, $2, $3, 'pending', 'stripe', $4, $5, NULL)
      ON CONFLICT (stripe_checkout_session_id) DO UPDATE SET
        enterprise_id = EXCLUDED.enterprise_id,
        subscribed_by_user_id = EXCLUDED.subscribed_by_user_id,
        plan_code = EXCLUDED.plan_code,
        payment_provider = 'stripe',
        stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, "AI_MARKETING_user_subscriptions".stripe_customer_id),
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, enterprise_id, subscribed_by_user_id, plan_code, status, payment_provider,
                paypal_subscription_id, stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id,
                next_plan_code, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at
    `,
    [input.enterpriseId, input.userId, input.planCode, input.stripeCustomerId, input.stripeCheckoutSessionId],
  )
  return (result.rows[0] || null) as BillingSubscriptionRecord | null
}

export async function upsertActiveStripeSubscription(input: {
  enterpriseId: number | null
  userId: number
  planCode: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string
  stripeCheckoutSessionId: string
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
}) {
  const updatedPending = await pool.query(
    `
      UPDATE "AI_MARKETING_user_subscriptions"
      SET payment_provider = 'stripe',
          enterprise_id = COALESCE($2, enterprise_id),
          subscribed_by_user_id = COALESCE($3, subscribed_by_user_id),
          plan_code = $4,
          status = 'active',
          stripe_customer_id = $5,
          stripe_subscription_id = $6,
          current_period_start = NULLIF($7, '')::timestamp,
          current_period_end = NULLIF($8, '')::timestamp,
          next_plan_code = NULL,
          cancel_at_period_end = FALSE,
          updated_at = CURRENT_TIMESTAMP
      WHERE stripe_checkout_session_id = $1
      RETURNING id, enterprise_id, subscribed_by_user_id, plan_code, status, payment_provider,
                paypal_subscription_id, stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id,
                next_plan_code, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at
    `,
    [
      input.stripeCheckoutSessionId,
      input.enterpriseId,
      input.userId,
      input.planCode,
      input.stripeCustomerId,
      input.stripeSubscriptionId,
      input.currentPeriodStart,
      input.currentPeriodEnd,
    ],
  )
  if (updatedPending.rows[0]) {
    return updatedPending.rows[0] as BillingSubscriptionRecord
  }

  const inserted = await pool.query(
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
      ) VALUES ($1, $2, $3, 'active', 'stripe', $4, $5, $6, NULLIF($7, '')::timestamp, NULLIF($8, '')::timestamp, NULL, FALSE)
      ON CONFLICT (stripe_subscription_id) DO UPDATE SET
        enterprise_id = EXCLUDED.enterprise_id,
        subscribed_by_user_id = COALESCE(EXCLUDED.subscribed_by_user_id, "AI_MARKETING_user_subscriptions".subscribed_by_user_id),
        plan_code = EXCLUDED.plan_code,
        status = 'active',
        payment_provider = 'stripe',
        stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, "AI_MARKETING_user_subscriptions".stripe_customer_id),
        stripe_checkout_session_id = COALESCE(EXCLUDED.stripe_checkout_session_id, "AI_MARKETING_user_subscriptions".stripe_checkout_session_id),
        current_period_start = COALESCE(EXCLUDED.current_period_start, "AI_MARKETING_user_subscriptions".current_period_start),
        current_period_end = COALESCE(EXCLUDED.current_period_end, "AI_MARKETING_user_subscriptions".current_period_end),
        next_plan_code = NULL,
        cancel_at_period_end = FALSE,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, enterprise_id, subscribed_by_user_id, plan_code, status, payment_provider,
                paypal_subscription_id, stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id,
                next_plan_code, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at
    `,
    [
      input.enterpriseId,
      input.userId,
      input.planCode,
      input.stripeCustomerId,
      input.stripeSubscriptionId,
      input.stripeCheckoutSessionId,
      input.currentPeriodStart,
      input.currentPeriodEnd,
    ],
  )
  return (inserted.rows[0] || null) as BillingSubscriptionRecord | null
}
