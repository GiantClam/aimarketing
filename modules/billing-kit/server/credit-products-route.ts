import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/modules/billing-kit/host/auth"
import { listAvailableCreditProducts } from "@/modules/billing-kit/core/credit-products"
import { getStripeCreditPrice, isStripeCreditPaymentEnabled } from "@/modules/billing-kit/core/stripe"
import { isZPayConfigured } from "@/modules/billing-kit/core/zpay"

export async function handleCreditProductsGet(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response

  const currency = request.nextUrl.searchParams.get("currency") || "CNY"
  if (currency !== "CNY") return NextResponse.json({ error: "billing_credit_currency_not_supported" }, { status: 400 })

  const products = listAvailableCreditProducts()
  const stripePrices = await Promise.all(
    products.map(async (product) => {
      if (!isStripeCreditPaymentEnabled(product.code)) return null
      try {
        const price = await getStripeCreditPrice(product.code)
        return price
          ? { amountMinor: price.unit_amount, currency: price.currency.toUpperCase() }
          : null
      } catch {
        return null
      }
    }),
  )

  return NextResponse.json({
    products: products.map((product, index) => ({
      code: product.code,
      name: product.name,
      creditAmount: product.creditAmount,
      amountMinor: product.priceCnyFen,
      currency: product.currency,
      expiresAt: product.expiresAt,
      stripeAmountMinor: stripePrices[index]?.amountMinor ?? null,
      stripeCurrency: stripePrices[index]?.currency ?? null,
      availableProviders: [
        ...(isZPayConfigured() ? ["zpay"] : []),
        ...(stripePrices[index] ? ["stripe"] : []),
      ],
    })),
  })
}
