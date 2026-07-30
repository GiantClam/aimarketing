import assert from "node:assert/strict"
import test from "node:test"

import { getCreditProduct, isCreditProductAvailable, listAvailableCreditProducts, listCreditProducts } from "./credit-products"

test("credit packs use the documented prices and never expire", () => {
  assert.deepEqual(
    listCreditProducts().map((product) => [product.code, product.creditAmount, product.priceCnyFen]),
    [
      ["credits_1000", 1_000, 1_990],
      ["credits_5000", 5_000, 8_990],
      ["credits_15000", 15_000, 24_900],
      ["credits_50000", 50_000, 69_900],
    ],
  )
  assert.ok(listCreditProducts().every((product) => product.expiresAt === null))
  assert.equal(getCreditProduct("credits_5000")?.expiresAt, null)
})

test("only the 1000-credit pack is currently available for checkout", () => {
  assert.deepEqual(listAvailableCreditProducts().map((product) => product.code), ["credits_1000"])
  assert.equal(isCreditProductAvailable("credits_1000"), true)
  assert.equal(isCreditProductAvailable("credits_5000"), false)
})
