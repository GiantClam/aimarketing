import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"

import { getCreditProduct, isCreditProductAvailable } from "@/modules/billing-kit/core/credit-products"
import {
  createStripeCreditCheckoutSession,
  getStripeCreditPrice,
  isStripeCreditPaymentEnabled,
} from "@/modules/billing-kit/core/stripe"
import { buildZPayPaymentUrl, isZPayConfigured } from "@/modules/billing-kit/core/zpay"
import { requireSessionUser } from "@/modules/billing-kit/host/auth"
import { pool } from "@/modules/billing-kit/host/db"

export async function handleCreditOrderPost(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response

  const body = await request.json().catch(() => null)
  const productCode = typeof body?.productCode === "string" ? body.productCode : ""
  const product = getCreditProduct(productCode)
  if (!product) return NextResponse.json({ error: "billing_credit_product_not_found" }, { status: 400 })
  if (!isCreditProductAvailable(product.code)) {
    return NextResponse.json({ error: "billing_credit_product_unavailable" }, { status: 400 })
  }

  const provider = body?.provider === "stripe" || body?.provider === "zpay" ? body.provider : ""
  if (!provider) {
    return NextResponse.json({ error: "billing_payment_method_not_supported" }, { status: 400 })
  }
  if (provider === "zpay" && (!isZPayConfigured() || body?.paymentMethod !== "alipay")) {
    return NextResponse.json({ error: "zpay_disabled" }, { status: 503 })
  }
  if (provider === "stripe" && (!isStripeCreditPaymentEnabled(product.code) || body?.paymentMethod !== "card")) {
    return NextResponse.json({ error: "stripe_credit_payments_disabled" }, { status: 503 })
  }

  const stripePrice = provider === "stripe" ? await getStripeCreditPrice(product.code) : null
  const amountMinor = stripePrice?.unit_amount ?? product.priceCnyFen
  const currency = stripePrice?.currency?.toUpperCase() || product.currency

  const suppliedKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : ""
  const idempotencyKey = `${auth.user.id}:${suppliedKey || randomUUID()}`.slice(0, 160)
  const orderNo = `${provider}_${Date.now()}_${randomUUID().replaceAll("-", "").slice(0, 12)}`
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
  const inserted = await pool.query(
    `
      INSERT INTO "AI_MARKETING_payment_orders" (
        order_no, enterprise_id, user_id, product_type, product_code, provider, payment_method,
        amount_minor, currency, credit_amount, status, request_idempotency_key, expires_at
      ) VALUES ($1, $2, $3, 'one_time', $4, $5, $6, $7, $8, $9, 'pending', $10, $11)
      ON CONFLICT (request_idempotency_key) DO NOTHING
      RETURNING order_no, status, expires_at
    `,
    [
      orderNo,
      auth.user.enterpriseId,
      auth.user.id,
      product.code,
      provider,
      provider === "zpay" ? "alipay" : "card",
      amountMinor,
      currency,
      product.creditAmount,
      idempotencyKey,
      expiresAt,
    ],
  )
  const order = inserted.rows[0] ||
    (await pool.query(
      `SELECT order_no, product_code, provider, status, expires_at FROM "AI_MARKETING_payment_orders" WHERE request_idempotency_key = $1 LIMIT 1`,
      [idempotencyKey],
    )).rows[0]
  if (!order) return NextResponse.json({ error: "billing_payment_order_create_failed" }, { status: 500 })
  if (String(order.product_code || product.code) !== product.code) {
    return NextResponse.json({ error: "billing_payment_idempotency_key_reused" }, { status: 409 })
  }
  if (String(order.provider || provider) !== provider) {
    return NextResponse.json({ error: "billing_payment_idempotency_key_reused" }, { status: 409 })
  }

  if (String(order.status) !== "pending") {
    return NextResponse.json({ error: "billing_payment_order_not_pending" }, { status: 409 })
  }

  if (provider === "stripe") {
    try {
      const successUrl = new URL(`${request.nextUrl.origin}/dashboard/billing`)
      successUrl.searchParams.set("stripe", "credit_approved")
      successUrl.searchParams.set("orderNo", String(order.order_no))
      const cancelUrl = new URL(`${request.nextUrl.origin}/dashboard/billing`)
      cancelUrl.searchParams.set("stripe", "credit_cancelled")
      cancelUrl.searchParams.set("orderNo", String(order.order_no))
      const session = await createStripeCreditCheckoutSession({
        productCode: product.code,
        orderNo: String(order.order_no),
        userEmail: auth.user.email,
        enterpriseId: auth.user.enterpriseId,
        userId: auth.user.id,
        successUrl: `${successUrl.toString()}&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: cancelUrl.toString(),
      })
      if (!session.url) throw new Error("stripe_credit_checkout_url_missing")
      await pool.query(
        `UPDATE "AI_MARKETING_payment_orders" SET provider_payload = $2::jsonb, updated_at = CURRENT_TIMESTAMP WHERE order_no = $1`,
        [String(order.order_no), JSON.stringify({ checkoutSessionId: session.id })],
      )
      return NextResponse.json({
        orderNo: String(order.order_no),
        status: String(order.status),
        provider: "stripe",
        paymentMethod: "card",
        paymentUrl: session.url,
        amountMinor,
        currency,
        creditAmount: product.creditAmount,
        expiresAt: new Date(String(order.expires_at)).toISOString(),
        creditExpiresAt: null,
      })
    } catch (error) {
      await pool.query(
        `UPDATE "AI_MARKETING_payment_orders" SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE order_no = $1 AND status = 'pending'`,
        [String(order.order_no)],
      )
      throw error
    }
  }

  return NextResponse.json({
    orderNo: String(order.order_no),
    status: String(order.status),
    provider,
    paymentMethod: "alipay",
    paymentUrl: buildZPayPaymentUrl({
      origin: request.nextUrl.origin,
      orderNo: String(order.order_no),
      amountMinor: product.priceCnyFen,
      name: product.name,
    }),
    amountMinor,
    currency,
    creditAmount: product.creditAmount,
    expiresAt: new Date(String(order.expires_at)).toISOString(),
    creditExpiresAt: null,
  })
}
