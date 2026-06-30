import assert from "node:assert/strict"
import test from "node:test"

import {
  buildCustomAgentRuntimeId,
  isCustomAgentRuntimeId,
  parseCustomAgentRuntimeId,
} from "@/lib/platform/custom-agent-runtime-id"

test("custom agent runtime id helpers round-trip valid ids", () => {
  const runtimeId = buildCustomAgentRuntimeId(42)
  assert.equal(runtimeId, "custom-agent:42")
  assert.equal(parseCustomAgentRuntimeId(runtimeId), 42)
  assert.equal(isCustomAgentRuntimeId(runtimeId), true)
})

test("custom agent runtime id helpers reject invalid values", () => {
  assert.equal(parseCustomAgentRuntimeId("custom-agent:0"), null)
  assert.equal(parseCustomAgentRuntimeId("custom-agent:not-a-number"), null)
  assert.equal(parseCustomAgentRuntimeId("business-content-growth"), null)
  assert.equal(isCustomAgentRuntimeId("business-content-growth"), false)
})
