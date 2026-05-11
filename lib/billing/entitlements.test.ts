import assert from "node:assert/strict"
import test from "node:test"

import {
  canSpendFromBillingEntitlement,
  isActiveBillingSubscriptionStatus,
} from "./entitlements"

test("active status is the only active billing subscription state", () => {
  assert.equal(isActiveBillingSubscriptionStatus("active"), true)
  assert.equal(isActiveBillingSubscriptionStatus("pending"), false)
  assert.equal(isActiveBillingSubscriptionStatus("suspended"), false)
  assert.equal(isActiveBillingSubscriptionStatus(null), false)
})

test("credits can be spent when the shared account has available balance", () => {
  assert.equal(
    canSpendFromBillingEntitlement({
      subscription: null,
      creditAccount: {
        id: 1,
        balance: 100,
        reservedBalance: 25,
        availableCredits: 75,
      },
    }),
    true,
  )
})

test("an active subscription is spendable even before credits route returns account state", () => {
  assert.equal(
    canSpendFromBillingEntitlement({
      subscription: {
        id: 1,
        planCode: "creator",
        status: "active",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
      creditAccount: null,
    }),
    true,
  )
})

test("suspended subscription without credits is not spendable", () => {
  assert.equal(
    canSpendFromBillingEntitlement({
      subscription: {
        id: 1,
        planCode: "starter",
        status: "suspended",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
      creditAccount: {
        id: 2,
        balance: 10,
        reservedBalance: 10,
        availableCredits: 0,
      },
    }),
    false,
  )
})
