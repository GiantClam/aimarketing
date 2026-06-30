import assert from "node:assert/strict"
import test from "node:test"

import {
  getLocalizedExecutiveBusinessMenuAgentById,
  isExecutiveBusinessMenuAgentId,
} from "@/lib/platform/business-menu-builtin-agents"

test("executive business-menu helpers resolve eligible advisors", () => {
  assert.equal(isExecutiveBusinessMenuAgentId("executive-brand"), true)
  assert.equal(isExecutiveBusinessMenuAgentId("business-sales-close"), false)

  const agent = getLocalizedExecutiveBusinessMenuAgentById("zh", "executive-brand")
  assert.equal(agent?.businessSlug, "brand-creative")
  assert.equal(agent?.agentId, "executive-brand")
  assert.equal(agent?.executionMode, "direct_agent")
  assert.ok((agent?.samplePrompts.length || 0) > 0)
})
