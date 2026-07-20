import assert from "node:assert/strict"
import test from "node:test"

import { isRailwayRuntimeTerminal, platformTaskStatusFromRailway } from "./railway-task-status"

test("maps Railway runtime status to the platform task lifecycle", () => {
  assert.deepEqual([
    platformTaskStatusFromRailway("queued"),
    platformTaskStatusFromRailway("running"),
    platformTaskStatusFromRailway("waiting"),
    platformTaskStatusFromRailway("succeeded"),
    platformTaskStatusFromRailway("failed"),
    platformTaskStatusFromRailway("cancelled"),
    platformTaskStatusFromRailway("timed_out"),
  ], ["queued", "running", "running", "succeeded", "failed", "cancelled", "failed"])
})

test("recognizes every terminal Railway runtime state", () => {
  assert.equal(isRailwayRuntimeTerminal("queued"), false)
  assert.equal(isRailwayRuntimeTerminal("running"), false)
  assert.equal(isRailwayRuntimeTerminal("waiting"), false)
  for (const status of ["succeeded", "failed", "cancelled", "timed_out"] as const) {
    assert.equal(isRailwayRuntimeTerminal(status), true)
  }
})
