import assert from "node:assert/strict"
import test from "node:test"

import { isWorkflowBuiltinAgentSelectable } from "./workflow-agent-options"

test("workflow builtin agent selection excludes ppt assistants", () => {
  assert.equal(isWorkflowBuiltinAgentSelectable("executive-ppt"), false)
  assert.equal(isWorkflowBuiltinAgentSelectable("executive-presentation-ppt"), false)
  assert.equal(isWorkflowBuiltinAgentSelectable("executive-brand"), true)
  assert.equal(isWorkflowBuiltinAgentSelectable("business-seo-repurpose"), true)
})
