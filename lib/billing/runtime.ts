import { pool } from "@/lib/db"
import type { PermissionMap } from "@/lib/enterprise/constants"

import { ensureDefaultFreeBillingForUser } from "./default-free-plan"
import { provisionDefaultBillingForUserId } from "./provision"

export type BillingReservation = {
  creditAccountId: number
  reserveIdempotencyKey: string
  amount: number
}

export function isBillingCreditEnforcementEnabled() {
  return process.env.BILLING_CREDITS_ENFORCEMENT === "true"
}

async function findBillingAccount(client: { query: typeof pool.query }, input: {
  userId: number
  enterpriseId?: number | null
}) {
  const result = await client.query(
    `
      SELECT id, balance, reserved_balance
      FROM "AI_MARKETING_credit_accounts"
      WHERE
        ($1::integer IS NOT NULL AND enterprise_id = $1)
        OR ($1::integer IS NULL AND owner_user_id = $2)
      ORDER BY id ASC
      LIMIT 1
    `,
    [input.enterpriseId || null, input.userId],
  )
  return result.rows[0] || null
}

async function createBillingAccount(client: { query: typeof pool.query }, input: {
  userId: number
  enterpriseId?: number | null
}) {
  const created = await client.query(
    `
      INSERT INTO "AI_MARKETING_credit_accounts" (account_type, enterprise_id, owner_user_id)
      VALUES ($1, $2, $3)
      RETURNING id, balance, reserved_balance
    `,
    [input.enterpriseId ? "enterprise" : "personal", input.enterpriseId || null, input.enterpriseId ? null : input.userId],
  )
  return created.rows[0]
}

export async function reserveFeatureCredits(input: {
  userId: number
  enterpriseId?: number | null
  userName?: string | null
  userEmail?: string | null
  userPermissions?: PermissionMap | null
  featureKey: string
  amount: number
  idempotencyKey: string
  metadata?: Record<string, unknown> | null
}): Promise<BillingReservation | null> {
  const amount = Math.max(1, Math.ceil(input.amount))
  if (input.userName && input.userEmail && input.userPermissions) {
    await ensureDefaultFreeBillingForUser({
      id: input.userId,
      enterpriseId: input.enterpriseId || null,
      name: input.userName,
      email: input.userEmail,
      isDemo: false,
      enterpriseCode: null,
      enterpriseName: null,
      enterpriseRole: null,
      enterpriseStatus: null,
      permissions: input.userPermissions,
    })
  } else {
    await provisionDefaultBillingForUserId(input.userId)
  }
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    let account = await findBillingAccount(client, input)
    if (!account && !isBillingCreditEnforcementEnabled()) {
      await client.query("ROLLBACK")
      return null
    }
    if (!account) {
      account = await createBillingAccount(client, input)
    }

    account = (
      await client.query(
        `SELECT id, balance, reserved_balance FROM "AI_MARKETING_credit_accounts" WHERE id = $1 FOR UPDATE`,
        [account.id],
      )
    ).rows[0]

    const existing = await client.query(
      `
        SELECT id, amount
        FROM "AI_MARKETING_credit_ledger"
        WHERE credit_account_id = $1 AND idempotency_key = $2
        LIMIT 1
      `,
      [account.id, input.idempotencyKey],
    )
    if (existing.rows[0]) {
      await client.query("COMMIT")
      return {
        creditAccountId: Number(account.id),
        reserveIdempotencyKey: input.idempotencyKey,
        amount: Number(existing.rows[0].amount || amount),
      }
    }

    const balance = Number(account.balance || 0)
    const reservedBalance = Number(account.reserved_balance || 0)
    if (balance - reservedBalance < amount) {
      throw new Error("insufficient_credits")
    }

    const nextReservedBalance = reservedBalance + amount
    await client.query(
      `UPDATE "AI_MARKETING_credit_accounts" SET reserved_balance = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [account.id, nextReservedBalance],
    )
    await client.query(
      `
        INSERT INTO "AI_MARKETING_credit_ledger" (
          credit_account_id,
          enterprise_id,
          user_id,
          entry_type,
          feature_key,
          amount,
          balance_after,
          reserved_balance_after,
          idempotency_key,
          metadata
        ) VALUES ($1, $2, $3, 'reserve', $4, $5, $6, $7, $8, $9::jsonb)
      `,
      [
        account.id,
        input.enterpriseId || null,
        input.userId,
        input.featureKey,
        amount,
        balance,
        nextReservedBalance,
        input.idempotencyKey,
        JSON.stringify(input.metadata || {}),
      ],
    )
    await client.query("COMMIT")
    return {
      creditAccountId: Number(account.id),
      reserveIdempotencyKey: input.idempotencyKey,
      amount,
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function finalizeReservedCredits(input: {
  reservation: BillingReservation | null
  userId: number
  enterpriseId?: number | null
  actualAmount: number
  idempotencyKey: string
  provider?: string | null
  model?: string | null
  officialCostUsd?: number | null
  costBasisUsd?: number | null
  usagePayload?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}) {
  if (!input.reservation) return null
  const actualAmount = Math.max(1, Math.min(input.reservation.amount, Math.ceil(input.actualAmount)))
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const account = (
      await client.query(
        `SELECT id, balance, reserved_balance FROM "AI_MARKETING_credit_accounts" WHERE id = $1 FOR UPDATE`,
        [input.reservation.creditAccountId],
      )
    ).rows[0]
    if (!account) throw new Error("credit_account_not_found")

    const existing = await client.query(
      `
        SELECT id FROM "AI_MARKETING_credit_ledger"
        WHERE credit_account_id = $1 AND idempotency_key = $2
        LIMIT 1
      `,
      [account.id, input.idempotencyKey],
    )
    if (existing.rows[0]) {
      await client.query("COMMIT")
      return existing.rows[0]
    }

    const balance = Number(account.balance || 0)
    const reservedBalance = Number(account.reserved_balance || 0)
    const nextBalance = Math.max(0, balance - actualAmount)
    const nextReservedBalance = Math.max(0, reservedBalance - input.reservation.amount)
    await client.query(
      `
        UPDATE "AI_MARKETING_credit_accounts"
        SET balance = $2, reserved_balance = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [account.id, nextBalance, nextReservedBalance],
    )
    const inserted = await client.query(
      `
        INSERT INTO "AI_MARKETING_credit_ledger" (
          credit_account_id,
          enterprise_id,
          user_id,
          entry_type,
          amount,
          balance_after,
          reserved_balance_after,
          idempotency_key,
          provider,
          model,
          official_cost_usd,
          cost_basis_usd,
          usage_payload,
          metadata
        ) VALUES ($1, $2, $3, 'debit', $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb)
        RETURNING id
      `,
      [
        account.id,
        input.enterpriseId || null,
        input.userId,
        -actualAmount,
        nextBalance,
        nextReservedBalance,
        input.idempotencyKey,
        input.provider || null,
        input.model || null,
        input.officialCostUsd || null,
        input.costBasisUsd || null,
        JSON.stringify(input.usagePayload || {}),
        JSON.stringify({
          ...(input.metadata || {}),
          reserveIdempotencyKey: input.reservation.reserveIdempotencyKey,
        }),
      ],
    )
    await client.query("COMMIT")
    return inserted.rows[0] || null
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function releaseReservedCredits(input: {
  reservation: BillingReservation | null
  userId: number
  enterpriseId?: number | null
  idempotencyKey: string
  reason: string
}) {
  if (!input.reservation) return null
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const account = (
      await client.query(
        `SELECT id, balance, reserved_balance FROM "AI_MARKETING_credit_accounts" WHERE id = $1 FOR UPDATE`,
        [input.reservation.creditAccountId],
      )
    ).rows[0]
    if (!account) throw new Error("credit_account_not_found")
    const existing = await client.query(
      `
        SELECT id FROM "AI_MARKETING_credit_ledger"
        WHERE credit_account_id = $1 AND idempotency_key = $2
        LIMIT 1
      `,
      [account.id, input.idempotencyKey],
    )
    if (existing.rows[0]) {
      await client.query("COMMIT")
      return existing.rows[0]
    }

    const nextReservedBalance = Math.max(0, Number(account.reserved_balance || 0) - input.reservation.amount)
    await client.query(
      `UPDATE "AI_MARKETING_credit_accounts" SET reserved_balance = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [account.id, nextReservedBalance],
    )
    const inserted = await client.query(
      `
        INSERT INTO "AI_MARKETING_credit_ledger" (
          credit_account_id,
          enterprise_id,
          user_id,
          entry_type,
          amount,
          balance_after,
          reserved_balance_after,
          idempotency_key,
          metadata
        ) VALUES ($1, $2, $3, 'release', $4, $5, $6, $7, $8::jsonb)
        RETURNING id
      `,
      [
        account.id,
        input.enterpriseId || null,
        input.userId,
        input.reservation.amount,
        Number(account.balance || 0),
        nextReservedBalance,
        input.idempotencyKey,
        JSON.stringify({
          reserveIdempotencyKey: input.reservation.reserveIdempotencyKey,
          reason: input.reason,
        }),
      ],
    )
    await client.query("COMMIT")
    return inserted.rows[0] || null
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
