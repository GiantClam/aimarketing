import assert from "node:assert/strict"
import test from "node:test"

import {
  getWorkbenchTaskStatusLabel,
  getWorkbenchTaskStatusTone,
  isWorkbenchTaskActive,
  isWorkbenchTaskRetryable,
  normalizeWorkbenchTaskStatus,
} from "../src/task-status"

test("normalizes runtime status variants to the shared six-state contract", () => {
  assert.deepEqual(
    ["pending", "in_progress", "blocked", "succeeded", "interrupted", "canceled"].map(normalizeWorkbenchTaskStatus),
    ["queued", "running", "waiting", "completed", "failed", "cancelled"],
  )
})

test("localizes status labels and exposes semantic tones", () => {
  assert.equal(getWorkbenchTaskStatusLabel("waiting", "zh"), "等待中")
  assert.equal(getWorkbenchTaskStatusLabel("completed", "en"), "Completed")
  assert.equal(getWorkbenchTaskStatusTone("failed"), "danger")
  assert.equal(getWorkbenchTaskStatusTone("cancelled"), "muted")
})

test("only failed and cancelled runs expose retry", () => {
  assert.equal(isWorkbenchTaskRetryable("failed"), true)
  assert.equal(isWorkbenchTaskRetryable("cancelled"), true)
  assert.equal(isWorkbenchTaskRetryable("waiting"), false)
  assert.equal(isWorkbenchTaskActive("waiting"), true)
  assert.equal(isWorkbenchTaskActive("completed"), false)
})
