import assert from "node:assert/strict"
import test from "node:test"

import { routeAiEntrySkills } from "./skill-router"

test("skill router recognizes PPT intent and selects ppt-master", () => {
  const decision = routeAiEntrySkills({
    latestUserPrompt: "请帮我做一份面向 CEO 的 AI 营销方案汇报 PPT，并导出可编辑 PPTX。",
    requestedAgentId: null,
  })

  assert.deepEqual(decision.selectedSkillIds, ["ppt-master"])
  assert.equal(decision.reasons[0]?.skillId, "ppt-master")
  assert.equal(decision.reasons[0]?.reason, "ppt_intent")
})

test("skill router respects explicit skill selection before heuristics", () => {
  const decision = routeAiEntrySkills({
    latestUserPrompt: "写一篇长文，也顺便整理成 deck。",
    requestedAgentId: null,
    requestedSkillIds: ["longform-writing"],
  })

  assert.ok(decision.selectedSkillIds.includes("longform-writing"))
  assert.ok(decision.selectedSkillIds.includes("ppt-master"))
  assert.equal(decision.reasons[0]?.reason, "explicit_selection")
})
