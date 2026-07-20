import assert from "node:assert/strict"
import test from "node:test"

import { resolveSharedSkillSetSelection } from "./shared-agent-skill-resolver"

test("resolves agency, business, and custom Agents into deterministic multi-Skill selections", () => {
  const agency = resolveSharedSkillSetSelection({
    agentId: "agency-strategist",
    enterpriseId: null,
    selectedSkillIds: ["longform-writing"],
    allowedSkillIds: ["executive-consulting", "longform-writing"],
  })
  const business = resolveSharedSkillSetSelection({
    agentId: "business-content-growth",
    enterpriseId: 7,
    selectedSkillIds: ["longform-writing", "executive-consulting"],
    allowedSkillIds: ["executive-consulting", "longform-writing"],
  })
  const custom = resolveSharedSkillSetSelection({
    agentId: "custom-agent:42",
    enterpriseId: 7,
    selectedSkillIds: [],
    allowedSkillIds: ["executive-consulting", "longform-writing"],
    customSkillBindings: { enabledSkillIds: ["longform-writing", "unknown"], "executive-consulting": true },
  })

  assert.deepEqual(agency?.skills, [{ id: "executive-consulting", position: 0 }, { id: "longform-writing", position: 1 }])
  assert.deepEqual(business?.skills, agency?.skills)
  assert.deepEqual(custom?.skills, [{ id: "longform-writing", position: 0 }, { id: "executive-consulting", position: 1 }])
  assert.match(agency?.bundleKey || "", /^shared-agent-skillsets\/global\/agency-strategist\//)
  assert.match(custom?.bundleKey || "", /^shared-agent-skillsets\/enterprise-7\/custom-agent:42\//)
  assert.equal(agency?.skillSetId, business?.skillSetId)
})

test("does not attach an unbound default Skill to a custom Agent", () => {
  const selection = resolveSharedSkillSetSelection({
    agentId: "custom-agent:42",
    enterpriseId: 7,
    selectedSkillIds: ["executive-consulting"],
    allowedSkillIds: ["executive-consulting", "longform-writing"],
    customSkillBindings: { enabledSkillIds: ["longform-writing"] },
  })
  assert.deepEqual(selection?.skills, [{ id: "longform-writing", position: 0 }])
})

test("excludes dedicated PPT and unknown Skill selections", () => {
  for (const input of [
    { agentId: "executive-ppt", selectedSkillIds: ["ppt-master"] },
    { agentId: "executive-presentation-ppt", selectedSkillIds: ["dashiai-ppt"] },
    { agentId: "general", selectedSkillIds: ["longform-writing"] },
  ]) {
    assert.equal(resolveSharedSkillSetSelection({ ...input, enterpriseId: 1, allowedSkillIds: input.selectedSkillIds }), null)
  }
})
