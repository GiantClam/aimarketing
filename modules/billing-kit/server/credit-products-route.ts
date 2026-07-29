import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/modules/billing-kit/host/auth"
import { listCreditProducts } from "@/modules/billing-kit/core/credit-products"
import { isZPayConfigured } from "@/modules/billing-kit/core/zpay"

export async function handleCreditProductsGet(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response

  const currency = request.nextUrl.searchParams.get("currency") || "CNY"
  if (currency !== "CNY") return NextResponse.json({ error: "billing_credit_currency_not_supported" }, { status: 400 })

  return NextResponse.json({
    products: listCreditProducts().map((product) => ({
      code: product.code,
      name: product.name,
      creditAmount: product.creditAmount,
      amountMinor: product.priceCnyFen,
      currency: product.currency,
      expiresAt: product.expiresAt,
      availableProviders: isZPayConfigured() ? ["zpay"] : [],
    })),
  })
}
