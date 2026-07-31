import assert from "node:assert/strict"
import test from "node:test"

import { routeAiEntrySkills } from "./skill-router"

test("plain AI Chat never loads skills from PPT wording", () => {
  const decision = routeAiEntrySkills({
    latestUserPrompt: "请帮我做一份面向 CEO 的 AI 营销方案汇报 PPT，并导出可编辑 PPTX。",
    requestedAgentId: null,
  })

  assert.deepEqual(decision.selectedSkillIds, [])
  assert.deepEqual(decision.reasons, [])
})

test("explicit Agent skill selection remains supported", () => {
  const decision = routeAiEntrySkills({
    latestUserPrompt: "写一篇长文，也顺便整理成 deck。",
    requestedAgentId: "business-content-growth",
    requestedSkillIds: ["longform-writing"],
  })

  assert.deepEqual(decision.selectedSkillIds, ["longform-writing"])
  assert.equal(decision.reasons[0]?.reason, "explicit_selection")
})

test("editable PPT agent keeps its explicit default skill", () => {
  const decision = routeAiEntrySkills({
    latestUserPrompt: "请做一份 PPT",
    requestedAgentId: "executive-ppt",
  })

  assert.deepEqual(decision.selectedSkillIds, ["ppt-master"])
  assert.equal(decision.reasons[0]?.reason, "agent_default")
})

test("presentation PPT agent routes to Dashi without legacy brief tools", () => {
  const decision = routeAiEntrySkills({
    latestUserPrompt: "请做一份演讲型 PPT 并补充最新行业数据",
    requestedAgentId: "executive-presentation-ppt",
  })

  assert.deepEqual(decision.selectedSkillIds, ["dashiai-ppt"])
  assert.equal(decision.reasons[0]?.reason, "agent_default")
})
