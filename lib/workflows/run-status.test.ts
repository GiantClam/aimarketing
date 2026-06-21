import assert from "node:assert/strict"
import test from "node:test"

import { isWorkflowRunActiveStatus, isWorkflowRunResumableStatus } from "@/lib/workflows/run-status"

test("isWorkflowRunActiveStatus treats queued and running as active", () => {
  assert.equal(isWorkflowRunActiveStatus("queued"), true)
  assert.equal(isWorkflowRunActiveStatus("running"), true)
  assert.equal(isWorkflowRunActiveStatus("failed"), false)
  assert.equal(isWorkflowRunActiveStatus("succeeded"), false)
  assert.equal(isWorkflowRunActiveStatus("cancelled"), false)
  assert.equal(isWorkflowRunActiveStatus(null), false)
})

test("isWorkflowRunResumableStatus only treats failed as resumable", () => {
  assert.equal(isWorkflowRunResumableStatus("failed"), true)
  assert.equal(isWorkflowRunResumableStatus("queued"), false)
  assert.equal(isWorkflowRunResumableStatus("running"), false)
  assert.equal(isWorkflowRunResumableStatus("succeeded"), false)
  assert.equal(isWorkflowRunResumableStatus("cancelled"), false)
  assert.equal(isWorkflowRunResumableStatus(undefined), false)
})
