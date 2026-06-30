import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { ensureDefaultFreeBillingForUser, ensureDemoBillingCreditFloor } from "@/lib/billing/default-free-plan"
import { pool } from "@/lib/db"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response

  const user = auth.user
  try {
    const result = await pool.query(
      `
        SELECT id, account_type, enterprise_id, owner_user_id, balance, reserved_balance,
               monthly_grant_balance, purchased_balance, period_start, period_end, updated_at
        FROM "AI_MARKETING_credit_accounts"
        WHERE
          ($1::integer IS NOT NULL AND enterprise_id = $1)
          OR ($1::integer IS NULL AND owner_user_id = $2)
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1
      `,
      [user.enterpriseId, user.id],
    )
    const account = result.rows[0] || null
    if (!account) {
      const freeState = user.isDemo
        ? await ensureDemoBillingCreditFloor(user)
        : await ensureDefaultFreeBillingForUser(user)
      return NextResponse.json({
        account: {
          id: freeState.creditAccount.id,
          account_type: user.enterpriseId ? "enterprise" : "personal",
          enterprise_id: user.enterpriseId,
          owner_user_id: user.enterpriseId ? null : user.id,
          balance: freeState.creditAccount.balance,
          reserved_balance: freeState.creditAccount.reservedBalance,
          monthly_grant_balance: freeState.creditAccount.balance,
          purchased_balance: 0,
          period_start: freeState.subscription.currentPeriodStart,
          period_end: freeState.subscription.currentPeriodEnd,
        },
        balance: freeState.creditAccount.balance,
        reservedBalance: freeState.creditAccount.reservedBalance,
        availableCredits: freeState.creditAccount.availableCredits,
      })
    }
    return NextResponse.json({
      account,
      balance: account ? Number(account.balance || 0) : 0,
      reservedBalance: account ? Number(account.reserved_balance || 0) : 0,
      availableCredits: account
        ? Math.max(0, Number(account.balance || 0) - Number(account.reserved_balance || 0))
        : 0,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "billing_credits_failed" },
      { status: 500 },
    )
  }
}
