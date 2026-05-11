import assert from "node:assert/strict"
import test from "node:test"

import { buildImageAssistantProviderPlan } from "./aiberm"

test("image assistant provider plan prefers pptoken then aiberm then crazyroute", () => {
  const plan = buildImageAssistantProviderPlan({
    hasPptoken: true,
    hasAiberm: true,
    hasCrazyroute: true,
  })

  assert.deepEqual(plan, ["pptoken", "aiberm", "crazyroute"])
})

test("image assistant provider plan omits unavailable deprecated fallbacks", () => {
  const plan = buildImageAssistantProviderPlan({
    hasPptoken: false,
    hasAiberm: true,
    hasCrazyroute: false,
  })

  assert.deepEqual(plan, ["aiberm"])
})
