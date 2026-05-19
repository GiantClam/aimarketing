import { pool } from "@/modules/billing-kit/host/db"
import type { AuthUserPayload } from "@/modules/billing-kit/host/enterprise"

import { getBillingPlan } from "./plans"

const FREE_PLAN_CODE = "free"
const FREE_TRIAL_FEATURE_KEY = "free_trial_grant"

export type DefaultFreeBillingState = {
  subscription: {
    id: number
    planCode: "free"
    status: "active"
    currentPeriodStart: string | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: false
  }
  creditAccount: {
    id: number
    balance: number
    reservedBalance: number
    availableCredits: number
  }
}

function toIsoOrNull(value: unknown) {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function readNumber(value: unknown) {
  return Number(value || 0)
}

export async function ensureDefaultFreeBillingForUser(user: AuthUserPayload): Promise<DefaultFreeBillingState> {
  const freePlan = getBillingPlan(FREE_PLAN_CODE)
  if (!freePlan) {
    throw new Error("free_billing_plan_missing")
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const subscriptionResult = await client.query(
      `
        SELECT id, current_period_start, current_period_end
        FROM "AI_MARKETING_user_subscriptions"
        WHERE
          ($1::integer IS NOT NULL AND enterprise_id = $1)
          OR ($1::integer IS NULL AND subscribed_by_user_id = $2)
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1
        FOR UPDATE
      `,
      [user.enterpriseId, user.id],
    )

    let subscriptionRow = subscriptionResult.rows[0] || null
    if (!subscriptionRow) {
      const now = new Date()
      const trialEnd = new Date(now)
      trialEnd.setUTCDate(trialEnd.getUTCDate() + (freePlan.trialDays || 0))

      const insertedSubscription = await client.query(
        `
          INSERT INTO "AI_MARKETING_user_subscriptions" (
            enterprise_id,
            subscribed_by_user_id,
            plan_code,
            status,
            current_period_start,
            current_period_end,
            cancel_at_period_end
          ) VALUES ($1, $2, 'free', 'active', $3, $4, FALSE)
          RETURNING id, current_period_start, current_period_end
        `,
        [user.enterpriseId, user.id, now.toISOString(), trialEnd.toISOString()],
      )
      subscriptionRow = insertedSubscription.rows[0]
    }

    const creditAccountResult = await client.query(
      `
        SELECT id, balance, reserved_balance
        FROM "AI_MARKETING_credit_accounts"
        WHERE
          ($1::integer IS NOT NULL AND enterprise_id = $1)
          OR ($1::integer IS NULL AND owner_user_id = $2)
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1
        FOR UPDATE
      `,
      [user.enterpriseId, user.id],
    )

    let accountRow = creditAccountResult.rows[0] || null
    if (!accountRow) {
      const createdAccount = await client.query(
        `
          INSERT INTO "AI_MARKETING_credit_accounts" (account_type, enterprise_id, owner_user_id)
          VALUES ($1, $2, $3)
          RETURNING id, balance, reserved_balance
        `,
        [user.enterpriseId ? "enterprise" : "personal", user.enterpriseId, user.enterpriseId ? null : user.id],
      )
      accountRow = createdAccount.rows[0]
    }

    const grantIdempotencyKey = `free-trial:${user.enterpriseId || `user-${user.id}`}`
    const existingGrant = await client.query(
      `
        SELECT id
        FROM "AI_MARKETING_credit_ledger"
        WHERE credit_account_id = $1 AND idempotency_key = $2
        LIMIT 1
      `,
      [accountRow.id, grantIdempotencyKey],
    )

    if (!existingGrant.rows[0] && freePlan.trialCredits > 0) {
      const nextBalance = readNumber(accountRow.balance) + freePlan.trialCredits
      await client.query(
        `
          INSERT INTO "AI_MARKETING_credit_ledger" (
            credit_account_id,
            enterprise_id,
            user_id,
            subscription_id,
            entry_type,
            feature_key,
            amount,
            balance_after,
            reserved_balance_after,
            idempotency_key,
            metadata
          ) VALUES ($1, $2, $3, $4, 'grant', $5, $6, $7, $8, $9, $10::jsonb)
        `,
        [
          accountRow.id,
          user.enterpriseId,
          user.id,
          subscriptionRow.id,
          FREE_TRIAL_FEATURE_KEY,
          freePlan.trialCredits,
          nextBalance,
          readNumber(accountRow.reserved_balance),
          grantIdempotencyKey,
          JSON.stringify({
            planCode: FREE_PLAN_CODE,
            trialDays: freePlan.trialDays,
            trialCredits: freePlan.trialCredits,
          }),
        ],
      )
      await client.query(
        `
          UPDATE "AI_MARKETING_credit_accounts"
          SET balance = $2,
              monthly_grant_balance = monthly_grant_balance + $3,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `,
        [accountRow.id, nextBalance, freePlan.trialCredits],
      )
      accountRow = {
        ...accountRow,
        balance: nextBalance,
      }
    }

    await client.query("COMMIT")

    const balance = readNumber(accountRow.balance)
    const reservedBalance = readNumber(accountRow.reserved_balance)

    return {
      subscription: {
        id: Number(subscriptionRow.id || 0),
        planCode: "free",
        status: "active",
        currentPeriodStart: toIsoOrNull(subscriptionRow.current_period_start),
        currentPeriodEnd: toIsoOrNull(subscriptionRow.current_period_end),
        cancelAtPeriodEnd: false,
      },
      creditAccount: {
        id: Number(accountRow.id),
        balance,
        reservedBalance,
        availableCredits: Math.max(0, balance - reservedBalance),
      },
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
