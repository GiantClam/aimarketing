import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"

import { getCreditProduct } from "@/modules/billing-kit/core/credit-products"
import { isZPayConfigured, buildZPayPaymentUrl } from "@/modules/billing-kit/core/zpay"
import { requireSessionUser } from "@/modules/billing-kit/host/auth"
import { pool } from "@/modules/billing-kit/host/db"

export async function handleCreditOrderPost(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response
  if (!isZPayConfigured()) return NextResponse.json({ error: "zpay_disabled" }, { status: 503 })

  const body = await request.json().catch(() => null)
  const productCode = typeof body?.productCode === "string" ? body.productCode : ""
  const product = getCreditProduct(productCode)
  if (!product) return NextResponse.json({ error: "billing_credit_product_not_found" }, { status: 400 })
  if (body?.provider !== "zpay" || body?.paymentMethod !== "alipay") {
    return NextResponse.json({ error: "billing_payment_method_not_supported" }, { status: 400 })
  }

  const suppliedKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : ""
  const idempotencyKey = `${auth.user.id}:${suppliedKey || randomUUID()}`.slice(0, 160)
  const orderNo = `zpay_${Date.now()}_${randomUUID().replaceAll("-", "").slice(0, 12)}`
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
  const inserted = await pool.query(
    `
      INSERT INTO "AI_MARKETING_payment_orders" (
        order_no, enterprise_id, user_id, product_type, product_code, provider, payment_method,
        amount_minor, currency, credit_amount, status, request_idempotency_key, expires_at
      ) VALUES ($1, $2, $3, 'one_time', $4, 'zpay', 'alipay', $5, 'CNY', $6, 'pending', $7, $8)
      ON CONFLICT (request_idempotency_key) DO NOTHING
      RETURNING order_no, status, expires_at
    `,
    [orderNo, auth.user.enterpriseId, auth.user.id, product.code, product.priceCnyFen, product.creditAmount, idempotencyKey, expiresAt],
  )
  const order = inserted.rows[0] ||
    (await pool.query(
      `SELECT order_no, product_code, status, expires_at FROM "AI_MARKETING_payment_orders" WHERE request_idempotency_key = $1 LIMIT 1`,
      [idempotencyKey],
    )).rows[0]
  if (!order) return NextResponse.json({ error: "billing_payment_order_create_failed" }, { status: 500 })
  if (String(order.product_code || product.code) !== product.code) {
    return NextResponse.json({ error: "billing_payment_idempotency_key_reused" }, { status: 409 })
  }

  return NextResponse.json({
    orderNo: String(order.order_no),
    status: String(order.status),
    provider: "zpay",
    paymentMethod: "alipay",
    paymentUrl: buildZPayPaymentUrl({
      origin: request.nextUrl.origin,
      orderNo: String(order.order_no),
      amountMinor: product.priceCnyFen,
      name: product.name,
    }),
    amountMinor: product.priceCnyFen,
    currency: "CNY",
    creditAmount: product.creditAmount,
    expiresAt: new Date(String(order.expires_at)).toISOString(),
    creditExpiresAt: null,
  })
}
