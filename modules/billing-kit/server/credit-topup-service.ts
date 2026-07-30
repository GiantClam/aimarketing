import type { PoolClient } from "pg"

import { pool } from "@/modules/billing-kit/host/db"

async function ensureCreditAccount(client: PoolClient, enterpriseId: number | null, ownerUserId: number) {
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

export type CreditPaymentOrder = {
  orderNo: string
  enterpriseId: number | null
  userId: number
  productCode: string
  provider: string
  paymentMethod: string
  amountMinor: number
  currency: string
  creditAmount: number
  status: string
  expiresAt: string
  providerTradeNo: string | null
  paidAt: string | null
}

function mapOrder(row: Record<string, unknown>): CreditPaymentOrder {
  return {
    orderNo: String(row.order_no),
    enterpriseId: row.enterprise_id == null ? null : Number(row.enterprise_id),
    userId: Number(row.user_id),
    productCode: String(row.product_code),
    provider: String(row.provider),
    paymentMethod: String(row.payment_method),
    amountMinor: Number(row.amount_minor),
    currency: String(row.currency),
    creditAmount: Number(row.credit_amount),
    status: String(row.status),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    providerTradeNo: row.provider_trade_no == null ? null : String(row.provider_trade_no),
    paidAt: row.paid_at == null ? null : new Date(String(row.paid_at)).toISOString(),
  }
}

export async function findCreditPaymentOrder(input: {
  orderNo: string
  enterpriseId: number | null
  userId: number
}) {
  const result = await pool.query(
    `
      SELECT order_no, enterprise_id, user_id, product_code, provider, payment_method,
             amount_minor, currency, credit_amount, status, expires_at, provider_trade_no, paid_at
      FROM "AI_MARKETING_payment_orders"
      WHERE order_no = $1
        AND (($2::integer IS NOT NULL AND enterprise_id = $2) OR ($2::integer IS NULL AND user_id = $3))
      LIMIT 1
    `,
    [input.orderNo, input.enterpriseId, input.userId],
  )
  return result.rows[0] ? mapOrder(result.rows[0]) : null
}

async function settleCreditPaymentOrder(input: {
  orderNo: string
  provider: "zpay" | "stripe"
  providerTradeNo: string | null
  providerPayload: Record<string, string>
  amountMinor?: number | null
  currency?: string | null
}) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const orderResult = await client.query(
      `
        SELECT id, order_no, enterprise_id, user_id, product_code, provider, amount_minor,
               currency, credit_amount, status, expires_at
        FROM "AI_MARKETING_payment_orders"
        WHERE order_no = $1
        FOR UPDATE
      `,
      [input.orderNo],
    )
    const order = orderResult.rows[0]
    if (!order) throw new Error("billing_payment_order_not_found")
    if (order.provider !== input.provider) throw new Error("billing_payment_provider_mismatch")
    if (input.amountMinor != null && Number(order.amount_minor) !== input.amountMinor) {
      throw new Error("billing_payment_amount_mismatch")
    }
    if (input.currency && String(order.currency).toUpperCase() !== input.currency.toUpperCase()) {
      throw new Error("billing_payment_currency_mismatch")
    }
    if (order.status === "paid") {
      await client.query("COMMIT")
      return { duplicate: true, creditAmount: Number(order.credit_amount) }
    }
    if (order.status === "refunded") throw new Error("billing_payment_order_refunded")
    if (order.status === "expired" || new Date(String(order.expires_at)).getTime() <= Date.now()) {
      await client.query(
        `UPDATE "AI_MARKETING_payment_orders" SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'`,
        [order.id],
      )
      await client.query("COMMIT")
      throw new Error("billing_payment_order_expired")
    }

    const accountId = await ensureCreditAccount(client, order.enterprise_id == null ? null : Number(order.enterprise_id), Number(order.user_id))
    const accountResult = await client.query(
      `SELECT balance, reserved_balance FROM "AI_MARKETING_credit_accounts" WHERE id = $1 FOR UPDATE`,
      [accountId],
    )
    const currentBalance = Number(accountResult.rows[0]?.balance || 0)
    const reservedBalance = Number(accountResult.rows[0]?.reserved_balance || 0)
    const creditAmount = Number(order.credit_amount)
    const idempotencyKey = `payment-order:${order.order_no}`
    const ledgerResult = await client.query(
      `
        INSERT INTO "AI_MARKETING_credit_ledger" (
          credit_account_id, enterprise_id, subscription_id, entry_type, feature_key,
          amount, balance_after, reserved_balance_after, idempotency_key, provider, metadata
        ) VALUES ($1, $2, NULL, 'grant', 'purchased_credits', $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT (credit_account_id, idempotency_key) DO NOTHING
        RETURNING id
      `,
      [
        accountId,
        order.enterprise_id == null ? null : Number(order.enterprise_id),
        creditAmount,
        currentBalance + creditAmount,
        reservedBalance,
        idempotencyKey,
        input.provider,
        JSON.stringify({
          orderNo: order.order_no,
          productCode: order.product_code,
          provider: input.provider,
          providerTradeNo: input.providerTradeNo,
        }),
      ],
    )

    if (ledgerResult.rows[0]?.id) {
      await client.query(
        `
          UPDATE "AI_MARKETING_credit_accounts"
          SET balance = balance + $2,
              purchased_balance = purchased_balance + $2,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `,
        [accountId, creditAmount],
      )
    }

    await client.query(
      `
        UPDATE "AI_MARKETING_payment_orders"
        SET status = 'paid', provider_trade_no = COALESCE($2, provider_trade_no),
            provider_payload = $3::jsonb, notify_received_at = CURRENT_TIMESTAMP,
            paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [order.id, input.providerTradeNo, JSON.stringify(input.providerPayload)],
    )
    await client.query("COMMIT")
    return { duplicate: !ledgerResult.rows[0]?.id, creditAmount }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function settleZPayCreditOrder(input: {
  orderNo: string
  providerTradeNo: string | null
  providerPayload: Record<string, string>
}) {
  return settleCreditPaymentOrder({ ...input, provider: "zpay" })
}

export async function settleStripeCreditOrder(input: {
  orderNo: string
  providerTradeNo: string | null
  providerPayload: Record<string, string>
  amountMinor?: number | null
  currency?: string | null
}) {
  return settleCreditPaymentOrder({ ...input, provider: "stripe" })
}
