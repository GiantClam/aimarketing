import assert from "node:assert/strict"
import test from "node:test"

import { getBillingPlan, getDefaultFreeTrialCredits, getDefaultFreeTrialDays, isFreeBillingPlanCode } from "./plans"

test("free plan exists with default trial metadata", () => {
  const freePlan = getBillingPlan("free")

  assert.ok(freePlan)
  assert.equal(freePlan?.priceUsdCents, 0)
  assert.equal(freePlan?.trialDays, getDefaultFreeTrialDays())
  assert.equal(freePlan?.trialCredits, getDefaultFreeTrialCredits())
  assert.equal(freePlan?.checkoutEnabled, false)
})

test("free plan code helper recognizes the default free tier", () => {
  assert.equal(isFreeBillingPlanCode("free"), true)
  assert.equal(isFreeBillingPlanCode("creator"), false)
  assert.equal(isFreeBillingPlanCode(null), false)
})
