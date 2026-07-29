import { NextRequest } from "next/server"

import { handlePaymentOrderGet } from "@/modules/billing-kit/server/payment-order-route"

export const runtime = "nodejs"

export async function GET(request: NextRequest, context: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await context.params
  return handlePaymentOrderGet(request, orderNo)
}
