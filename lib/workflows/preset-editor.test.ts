import assert from "node:assert/strict"
import test from "node:test"

import { applyEnterpriseWorkflowPresetDraft, cloneEnterpriseWorkflowPreset } from "@/lib/workflows/preset-editor"
import { createEmptyEnterpriseWorkflowPreset } from "@/lib/workflows/presets"

test("cloneEnterpriseWorkflowPreset copies list fields", () => {
  const preset = {
    ...createEmptyEnterpriseWorkflowPreset("zh", 0),
    channelTargets: ["公众号"],
    reviewRules: ["法务"],
    bannedTerms: ["最强"],
    allowedKnowledgeDatasetIds: [12],
  }

  const cloned = cloneEnterpriseWorkflowPreset(preset)
  cloned.channelTargets.push("LinkedIn")
  cloned.reviewRules.push("品牌")
  cloned.bannedTerms.push("保证")
  cloned.allowedKnowledgeDatasetIds.push(18)

  assert.deepEqual(preset.channelTargets, ["公众号"])
  assert.deepEqual(preset.reviewRules, ["法务"])
  assert.deepEqual(preset.bannedTerms, ["最强"])
  assert.deepEqual(preset.allowedKnowledgeDatasetIds, [12])
})

test("applyEnterpriseWorkflowPresetDraft appends new presets and replaces existing ones", () => {
  const presetA = {
    ...createEmptyEnterpriseWorkflowPreset("en", 0),
    id: "preset-a",
    name: "Preset A",
  }
  const presetB = {
    ...createEmptyEnterpriseWorkflowPreset("en", 1),
    id: "preset-b",
    name: "Preset B",
  }

  const appended = applyEnterpriseWorkflowPresetDraft([presetA], presetB)
  assert.equal(appended.length, 2)
  assert.equal(appended[1]?.id, "preset-b")

  const replaced = applyEnterpriseWorkflowPresetDraft(appended, {
    ...presetA,
    name: "Preset A Updated",
    channelTargets: ["Email"],
  })
  assert.equal(replaced.length, 2)
  assert.equal(replaced[0]?.name, "Preset A Updated")
  assert.deepEqual(replaced[0]?.channelTargets, ["Email"])
  assert.equal(appended[0]?.name, "Preset A")
})
