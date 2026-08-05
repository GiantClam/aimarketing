import assert from "node:assert/strict"
import test from "node:test"

import { createRetryableDbErrorMatcher, withDbRetry } from "./retry"

test("database retry matcher treats lock and statement timeouts as transient", () => {
  const isRetryable = createRetryableDbErrorMatcher()

  assert.equal(isRetryable(new Error("canceling statement due to statement timeout")), true)
  assert.equal(isRetryable(new Error("canceling statement due to lock timeout")), true)
  assert.equal(isRetryable(new Error("insufficient_credits")), false)
})

test("database retry replays an idempotent operation after a transient timeout", async () => {
  let attempts = 0

  const result = await withDbRetry(
    "billing-test",
    async () => {
      attempts += 1
      if (attempts === 1) {
        throw new Error("canceling statement due to statement timeout")
      }
      return "ok"
    },
    { retryDelaysMs: [1], logPrefix: "test.db.retry" },
  )

  assert.equal(result, "ok")
  assert.equal(attempts, 2)
})
