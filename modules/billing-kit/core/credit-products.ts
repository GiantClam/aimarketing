export type CreditProduct = {
  code: string
  name: string
  creditAmount: number
  priceCnyFen: number
  currency: "CNY"
  expiresAt: null
}

const CREDIT_PRODUCTS: readonly CreditProduct[] = [
  { code: "credits_1000", name: "1000 积分包", creditAmount: 1_000, priceCnyFen: 1_990, currency: "CNY", expiresAt: null },
  { code: "credits_5000", name: "5000 积分包", creditAmount: 5_000, priceCnyFen: 8_990, currency: "CNY", expiresAt: null },
  { code: "credits_15000", name: "15000 积分包", creditAmount: 15_000, priceCnyFen: 24_900, currency: "CNY", expiresAt: null },
  { code: "credits_50000", name: "50000 积分包", creditAmount: 50_000, priceCnyFen: 69_900, currency: "CNY", expiresAt: null },
]

const ENABLED_CREDIT_PRODUCT_CODES = new Set(["credits_1000"])

export function listCreditProducts() {
  return CREDIT_PRODUCTS.map((product) => ({ ...product }))
}

export function listAvailableCreditProducts() {
  return listCreditProducts().filter((product) => ENABLED_CREDIT_PRODUCT_CODES.has(product.code))
}

export function isCreditProductAvailable(code: string) {
  return ENABLED_CREDIT_PRODUCT_CODES.has(code)
}

export function getCreditProduct(code: string) {
  return CREDIT_PRODUCTS.find((product) => product.code === code) || null
}
