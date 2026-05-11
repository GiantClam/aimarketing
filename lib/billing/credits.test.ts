import assert from "node:assert/strict"
import test from "node:test"

import {
  createCreditAccountState,
  finalizeCreditDebit,
  getAvailableCredits,
  grantCredits,
  releaseCreditReserve,
  reserveCredits,
} from "./credits"

test("credit ledger grants shared enterprise credits and reserves per user", () => {
  let account = createCreditAccountState({ creditAccountId: "acct_1", enterpriseId: 7 })
  account = grantCredits(account, { amount: 1_000, idempotencyKey: "grant:period-1" }).account
  const reserved = reserveCredits(account, {
    userId: 42,
    featureKey: "image_design_generate",
    amount: 27,
    idempotencyKey: "reserve:image-job-1",
  })
  account = reserved.account

  assert.equal(account.enterpriseId, 7)
  assert.equal(getAvailableCredits(account), 973)
  assert.equal(reserved.entry.userId, 42)
  assert.equal(reserved.entry.featureKey, "image_design_generate")
})

test("credit ledger finalizes only once and records provider usage", () => {
  let account = createCreditAccountState({ creditAccountId: "acct_1", initialBalance: 100 })
  account = reserveCredits(account, {
    userId: 42,
    featureKey: "image_design_mask_edit",
    amount: 50,
    idempotencyKey: "reserve:mask-job",
  }).account

  const first = finalizeCreditDebit(account, {
    reserveIdempotencyKey: "reserve:mask-job",
    idempotencyKey: "debit:mask-job",
    actualAmount: 45,
    provider: "pptoken",
    model: "gpt-image-2",
    officialCostUsd: 0.053,
    costBasisUsd: 0.0265,
    usagePayload: { size: "1024x1024" },
  })
  account = first.account
  const duplicate = finalizeCreditDebit(account, {
    reserveIdempotencyKey: "reserve:mask-job",
    idempotencyKey: "debit:mask-job",
    actualAmount: 45,
  })

  assert.equal(account.balance, 55)
  assert.equal(account.reservedBalance, 0)
  assert.equal(duplicate.idempotent, true)
  assert.equal(duplicate.account.ledger.length, 2)
  assert.equal(first.entry.provider, "pptoken")
})

test("credit ledger releases reserve on failed task without debit", () => {
  let account = createCreditAccountState({ creditAccountId: "acct_1", initialBalance: 100 })
  account = reserveCredits(account, {
    userId: 42,
    featureKey: "image_design_generate",
    amount: 30,
    idempotencyKey: "reserve:failed-job",
  }).account
  account = releaseCreditReserve(account, {
    reserveIdempotencyKey: "reserve:failed-job",
    idempotencyKey: "release:failed-job",
    reason: "provider_failed",
  }).account

  assert.equal(account.balance, 100)
  assert.equal(account.reservedBalance, 0)
  assert.equal(getAvailableCredits(account), 100)
  assert.equal(account.ledger.at(-1)?.entryType, "release")
})

test("credit ledger rejects insufficient shared credits before execution", () => {
  const account = createCreditAccountState({ creditAccountId: "acct_1", initialBalance: 5 })

  assert.throws(
    () =>
      reserveCredits(account, {
        userId: 42,
        featureKey: "image_design_generate",
        amount: 6,
        idempotencyKey: "reserve:too-expensive",
      }),
    /insufficient_credits/,
  )
})
