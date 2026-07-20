import assert from "node:assert/strict"
import test from "node:test"

import { shouldFallbackToNextPostgresConnection } from "./db-connection-errors"

test("recognizes administrator-terminated Postgres connections as recoverable", () => {
  assert.equal(
    shouldFallbackToNextPostgresConnection(new Error("terminating connection due to administrator command")),
    true,
  )
})

test("does not classify query errors as connection failover candidates", () => {
  assert.equal(shouldFallbackToNextPostgresConnection(new Error("relation does not exist")), false)
})
