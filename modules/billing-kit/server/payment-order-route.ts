import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/modules/billing-kit/host/auth"
import { findCreditPaymentOrder } from "@/modules/billing-kit/server/credit-topup-service"

export async function handlePaymentOrderGet(request: NextRequest, orderNo: string) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response
  const order = await findCreditPaymentOrder({ orderNo, enterpriseId: auth.user.enterpriseId, userId: auth.user.id })
  if (!order) return NextResponse.json({ error: "billing_payment_order_not_found" }, { status: 404 })
  return NextResponse.json({
    orderNo: order.orderNo,
    status: order.status,
    productCode: order.productCode,
    amountMinor: order.amountMinor,
    currency: order.currency,
    creditAmount: order.creditAmount,
    provider: order.provider,
    paymentMethod: order.paymentMethod,
    expiresAt: order.expiresAt,
    creditExpiresAt: null,
    paidAt: order.paidAt,
  })
}
