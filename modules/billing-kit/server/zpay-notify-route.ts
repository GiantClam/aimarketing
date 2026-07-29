import { NextRequest, NextResponse } from "next/server"

import {
  getZPayKey,
  getZPayOrderNo,
  getZPayProviderTradeNo,
  getZPayReportedPid,
  isZPayPaymentSuccessful,
  parseZPayAmountMinor,
  verifyZPaySignature,
  type ZPayParams,
} from "@/modules/billing-kit/core/zpay"
import { pool } from "@/modules/billing-kit/host/db"
import { settleZPayCreditOrder } from "@/modules/billing-kit/server/credit-topup-service"

async function readZPayParams(request: NextRequest): Promise<ZPayParams> {
  const params: ZPayParams = Object.fromEntries(request.nextUrl.searchParams.entries())
  const contentType = request.headers.get("content-type") || ""
  const raw = await request.text()
  if (!raw) return params
  if (contentType.includes("application/json")) {
    const json = JSON.parse(raw) as Record<string, unknown>
    for (const [key, value] of Object.entries(json)) params[key] = typeof value === "string" || typeof value === "number" ? value : undefined
    return params
  }
  for (const [key, value] of new URLSearchParams(raw).entries()) params[key] = value
  return params
}

function successResponse() {
  return new NextResponse(process.env.ZPAY_NOTIFY_SUCCESS_RESPONSE?.trim() || "success", { status: 200 })
}

export async function handleZPayNotifyPost(request: NextRequest) {
  const params = await readZPayParams(request)
  const key = getZPayKey()
  if (!key || !verifyZPaySignature(params, key)) {
    return NextResponse.json({ error: "zpay_invalid_signature" }, { status: 401 })
  }
  const configuredPid = process.env.ZPAY_PID?.trim()
  const reportedPid = getZPayReportedPid(params)
  if (configuredPid && reportedPid && configuredPid !== reportedPid) {
    return NextResponse.json({ error: "zpay_merchant_mismatch" }, { status: 400 })
  }
  if (!isZPayPaymentSuccessful(params)) return successResponse()

  const orderNo = getZPayOrderNo(params)
  if (!orderNo) return NextResponse.json({ error: "zpay_order_no_missing" }, { status: 400 })
  const orderResult = await pool.query(
    `SELECT amount_minor, provider FROM "AI_MARKETING_payment_orders" WHERE order_no = $1 LIMIT 1`,
    [orderNo],
  )
  const order = orderResult.rows[0]
  if (!order) return NextResponse.json({ error: "billing_payment_order_not_found" }, { status: 404 })
  if (order.provider !== "zpay") return NextResponse.json({ error: "billing_payment_provider_mismatch" }, { status: 400 })
  const reportedAmount = parseZPayAmountMinor(params.money ?? params.amount ?? params.total_fee)
  if (reportedAmount == null || reportedAmount !== Number(order.amount_minor)) {
    return NextResponse.json({ error: "zpay_amount_mismatch" }, { status: 400 })
  }

  try {
    await settleZPayCreditOrder({
      orderNo,
      providerTradeNo: getZPayProviderTradeNo(params),
      providerPayload: Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value ?? "")])),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "billing_payment_settlement_failed"
    const status = message === "billing_payment_order_expired" ? 409 : message === "billing_payment_order_not_found" ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
  return successResponse()
}
