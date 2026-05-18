import { pool } from "@/lib/db"

import { getBillingPlan, isPlanUpgrade, type BillingPlan, type BillingPlanCode } from "./plans"

type SubscriptionRow = {
  id: number
  plan_code: string
  next_plan_code?: string | null
  status: string
  current_period_start: string | Date | null
  current_period_end: string | Date | null
  cancel_at_period_end: boolean
}

export type WorkspaceBillingSnapshot = {
  subscription: {
    id: number
    planCode: BillingPlanCode
    nextPlanCode: BillingPlanCode | null
    status: string
    currentPeriodStart: string | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
  } | null
  effectivePlan: BillingPlan
  activeMemberCount: number
  seatLimit: number
  seatsRemaining: number
}

function toIsoOrNull(value: string | Date | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function readCount(value: unknown) {
  const count = Number(value || 0)
  return Number.isFinite(count) ? count : 0
}

function isFutureDate(value: string | Date | null | undefined) {
  if (!value) return false
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isFinite(date.getTime()) && date.getTime() > Date.now()
}

function getEffectivePlan(subscription: SubscriptionRow | null) {
  const freePlan = getBillingPlan("free")
  if (!freePlan) {
    throw new Error("free_billing_plan_missing")
  }
  if (!subscription) return freePlan

  const currentPlan = getBillingPlan(subscription.plan_code)
  const nextPlan = getBillingPlan(subscription.next_plan_code || null)
  if (!currentPlan) return freePlan

  const status = String(subscription.status || "").trim().toLowerCase()
  const accessPlan =
    nextPlan && isPlanUpgrade(subscription.plan_code, subscription.next_plan_code) ? nextPlan : currentPlan

  if (status === "active" || status === "pending") {
    return accessPlan
  }
  if (status === "cancelled" && isFutureDate(subscription.current_period_end)) {
    return accessPlan
  }
  return freePlan
}

export async function getWorkspaceBillingSnapshot(enterpriseId: number): Promise<WorkspaceBillingSnapshot> {
  const [subscriptionResult, membersResult] = await Promise.all([
    pool.query(
      `
        SELECT id, plan_code, status, current_period_start, current_period_end, cancel_at_period_end
               , next_plan_code
        FROM "AI_MARKETING_user_subscriptions"
        WHERE enterprise_id = $1
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1
      `,
      [enterpriseId],
    ),
    pool.query(
      `
        SELECT COUNT(*) AS active_member_count
        FROM "AI_MARKETING_users"
        WHERE enterprise_id = $1 AND enterprise_status = 'active'
      `,
      [enterpriseId],
    ),
  ])

  const subscriptionRow = (subscriptionResult.rows[0] || null) as SubscriptionRow | null
  const effectivePlan = getEffectivePlan(subscriptionRow)
  const activeMemberCount = readCount(membersResult.rows[0]?.active_member_count)
  const seatLimit = Math.max(1, Number(effectivePlan.sharedMemberLimit || 1))

  return {
    subscription: subscriptionRow
      ? {
          id: Number(subscriptionRow.id),
          planCode: (getBillingPlan(subscriptionRow.plan_code)?.code || "free") as BillingPlanCode,
          status: String(subscriptionRow.status || "pending"),
          nextPlanCode:
            (getBillingPlan(subscriptionRow.next_plan_code || null)?.code || null) as BillingPlanCode | null,
          currentPeriodStart: toIsoOrNull(subscriptionRow.current_period_start),
          currentPeriodEnd: toIsoOrNull(subscriptionRow.current_period_end),
          cancelAtPeriodEnd: Boolean(subscriptionRow.cancel_at_period_end),
        }
      : null,
    effectivePlan,
    activeMemberCount,
    seatLimit,
    seatsRemaining: Math.max(0, seatLimit - activeMemberCount),
  }
}

export function hasAvailableWorkspaceSeat(snapshot: Pick<WorkspaceBillingSnapshot, "seatLimit" | "activeMemberCount">) {
  return snapshot.activeMemberCount < snapshot.seatLimit
}
