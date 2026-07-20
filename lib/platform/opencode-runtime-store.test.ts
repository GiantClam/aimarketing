import test from "node:test"
import assert from "node:assert/strict"
import { canClaimRuntimeRun, isRuntimeRunTerminal } from "./opencode-runtime-store"

test("claims queued and expired runs but not terminal or exhausted runs", () => {
  const now = new Date("2026-07-12T00:00:00.000Z")
  assert.equal(canClaimRuntimeRun({ status: "queued", leaseOwner: null, leaseExpiresAt: null, attempt: 0, maxAttempts: 3, owner: "worker-a", now }), true)
  assert.equal(canClaimRuntimeRun({ status: "running", leaseOwner: "worker-b", leaseExpiresAt: new Date("2026-07-11T23:59:00.000Z"), attempt: 1, maxAttempts: 3, owner: "worker-a", now }), true)
  assert.equal(canClaimRuntimeRun({ status: "running", leaseOwner: "worker-a", leaseExpiresAt: new Date("2026-07-12T00:10:00.000Z"), attempt: 1, maxAttempts: 3, owner: "worker-a", now }), true)
  assert.equal(canClaimRuntimeRun({ status: "running", leaseOwner: "worker-b", leaseExpiresAt: new Date("2026-07-12T00:10:00.000Z"), attempt: 1, maxAttempts: 3, owner: "worker-a", now }), false)
  assert.equal(canClaimRuntimeRun({ status: "failed", leaseOwner: null, leaseExpiresAt: null, attempt: 1, maxAttempts: 3, owner: "worker-a", now }), false)
  assert.equal(canClaimRuntimeRun({ status: "queued", leaseOwner: null, leaseExpiresAt: null, attempt: 3, maxAttempts: 3, owner: "worker-a", now }), false)
})

test("terminal state predicate is explicit", () => {
  assert.equal(isRuntimeRunTerminal("succeeded"), true)
  assert.equal(isRuntimeRunTerminal("timed_out"), true)
  assert.equal(isRuntimeRunTerminal("running"), false)
})
