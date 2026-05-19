import { pool } from "@/modules/billing-kit/host/db"
import type { AuthUserPayload } from "@/modules/billing-kit/host/enterprise"

import { ensureDefaultFreeBillingForUser } from "./default-free-plan"
import { getBillingPlan, isPlanUpgrade, type BillingPlan, type BillingPlanCode } from "./plans"

export type BillingSubscriptionStatus = "pending" | "active" | "suspended" | "cancelled" | "expired"

export type BillingEntitlement = {
  plan: BillingPlan | null
  subscription: {
    id: number
    planCode: BillingPlanCode
    nextPlanCode?: BillingPlanCode | null
    status: BillingSubscriptionStatus
    currentPeriodStart: string | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
  } | null
  creditAccount: {
    id: number
    balance: number
    reservedBalance: number
    availableCredits: number
  } | null
  canSpendCredits: boolean
}

export function isActiveBillingSubscriptionStatus(status: unknown) {
  return status === "active"
}

export function canSpendFromBillingEntitlement(entitlement: Pick<BillingEntitlement, "creditAccount" | "subscription">) {
  const availableCredits = entitlement.creditAccount?.availableCredits || 0
  if (availableCredits > 0) return true
  return isActiveBillingSubscriptionStatus(entitlement.subscription?.status)
}

function getEffectiveEntitlementPlan(subscriptionRow: Record<string, unknown> | null) {
  const currentPlan = getBillingPlan(String(subscriptionRow?.plan_code || ""))
  const nextPlan = getBillingPlan(String(subscriptionRow?.next_plan_code || ""))
  if (!currentPlan) return getBillingPlan("free")
  return nextPlan && isPlanUpgrade(currentPlan.code, nextPlan.code) ? nextPlan : currentPlan
}

export async function getBillingEntitlementForUser(user: AuthUserPayload): Promise<BillingEntitlement> {
  const [subscriptionResult, accountResult] = await Promise.all([
    pool.query(
      `
        SELECT id, plan_code, status, current_period_start, current_period_end, cancel_at_period_end
               , next_plan_code
        FROM "AI_MARKETING_user_subscriptions"
        WHERE
          ($1::integer IS NOT NULL AND enterprise_id = $1)
          OR ($1::integer IS NULL AND subscribed_by_user_id = $2)
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1
      `,
      [user.enterpriseId, user.id],
    ),
    pool.query(
      `
        SELECT id, balance, reserved_balance
        FROM "AI_MARKETING_credit_accounts"
        WHERE
          ($1::integer IS NOT NULL AND enterprise_id = $1)
          OR ($1::integer IS NULL AND owner_user_id = $2)
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1
      `,
      [user.enterpriseId, user.id],
    ),
  ])

  const subscriptionRow = subscriptionResult.rows[0] || null
  const accountRow = accountResult.rows[0] || null
  if (!subscriptionRow) {
    const freeState = await ensureDefaultFreeBillingForUser(user)
    return {
      plan: getBillingPlan("free"),
      subscription: freeState.subscription,
      creditAccount: freeState.creditAccount,
      canSpendCredits: canSpendFromBillingEntitlement({
        subscription: freeState.subscription,
        creditAccount: freeState.creditAccount,
      }),
    }
  }
  const plan = getEffectiveEntitlementPlan(subscriptionRow) || null
  const currentPlan = getBillingPlan(subscriptionRow?.plan_code) || null
  const nextPlan = getBillingPlan(subscriptionRow?.next_plan_code) || null
  const subscription = subscriptionRow
    ? {
        id: Number(subscriptionRow.id),
        planCode: (currentPlan?.code || String(subscriptionRow.plan_code) || "free") as BillingPlanCode,
        nextPlanCode: nextPlan?.code || null,
        status: String(subscriptionRow.status || "pending") as BillingSubscriptionStatus,
        currentPeriodStart: subscriptionRow.current_period_start
          ? new Date(subscriptionRow.current_period_start).toISOString()
          : null,
        currentPeriodEnd: subscriptionRow.current_period_end
          ? new Date(subscriptionRow.current_period_end).toISOString()
          : null,
        cancelAtPeriodEnd: Boolean(subscriptionRow.cancel_at_period_end),
      }
    : null
  const creditAccount = accountRow
    ? {
        id: Number(accountRow.id),
        balance: Number(accountRow.balance || 0),
        reservedBalance: Number(accountRow.reserved_balance || 0),
        availableCredits: Math.max(0, Number(accountRow.balance || 0) - Number(accountRow.reserved_balance || 0)),
      }
    : null

  return {
    plan,
    subscription,
    creditAccount,
    canSpendCredits: canSpendFromBillingEntitlement({ creditAccount, subscription }),
  }
}
