import assert from "node:assert/strict"
import test from "node:test"

import {
  buildEnterpriseWorkflowPresetPrompt,
  createEmptyEnterpriseWorkflowPreset,
  getDefaultEnterpriseWorkflowPreset,
  listEnterpriseWorkflowPresets,
  upsertEnterpriseWorkflowPresetsMetadata,
} from "@/lib/workflows/presets"

test("listEnterpriseWorkflowPresets normalizes metadata and preserves one default preset", () => {
  const presets = listEnterpriseWorkflowPresets(
    {
      enterprisePresets: [
        {
          id: "launch-b2b",
          name: "Launch B2B",
          channelTargets: ["LinkedIn", "Email", "Email"],
          reviewRules: ["Legal review"],
          bannedTerms: ["best", "guaranteed"],
          isDefault: false,
        },
        {
          name: "Founder-led",
          brandVoice: "Confident and concise",
          isDefault: true,
        },
      ],
    },
    "en",
  )

  assert.equal(presets.length, 2)
  assert.equal(presets[0]?.channelTargets.length, 2)
  assert.equal(presets[0]?.isDefault, false)
  assert.equal(presets[1]?.isDefault, true)
  assert.equal(presets[1]?.name, "Founder-led")
})

test("getDefaultEnterpriseWorkflowPreset falls back to the first preset", () => {
  const preset = getDefaultEnterpriseWorkflowPreset(
    {
      enterprisePresets: [
        { name: "Preset A" },
        { name: "Preset B" },
      ],
    },
    "en",
  )

  assert.equal(preset?.name, "Preset A")
  assert.equal(preset?.isDefault, true)
})

test("upsertEnterpriseWorkflowPresetsMetadata writes default preset id and cleans lists", () => {
  const presetA = createEmptyEnterpriseWorkflowPreset("en", 0)
  const presetB = createEmptyEnterpriseWorkflowPreset("en", 1)

  const metadata = upsertEnterpriseWorkflowPresetsMetadata(
    { source: "workflow_template" },
    [
      {
        ...presetA,
        name: "B2B SaaS",
        channelTargets: ["LinkedIn", "Email", "Email"],
        isDefault: false,
      },
      {
        ...presetB,
        name: "Consumer launch",
        isDefault: true,
      },
    ],
  )

  const presets = listEnterpriseWorkflowPresets(metadata, "en")
  assert.equal((metadata.defaultPresetId as string) || "", presetB.id)
  assert.equal(presets[0]?.isDefault, false)
  assert.equal(presets[1]?.isDefault, true)
  assert.deepEqual(presets[0]?.channelTargets, ["LinkedIn", "Email"])
})

test("buildEnterpriseWorkflowPresetPrompt builds a usable prompt block", () => {
  const preset = {
    ...createEmptyEnterpriseWorkflowPreset("zh", 0),
    industry: "SaaS",
    audience: "市场负责人",
    brandVoice: "专业克制",
    channelTargets: ["公众号", "LinkedIn"],
    reviewRules: ["法务审查", "品牌审查"],
    bannedTerms: ["最强", "保证"],
    notes: "需要保守表述",
  }

  const prompt = buildEnterpriseWorkflowPresetPrompt(preset, "zh")
  assert.match(prompt, /行业: SaaS/)
  assert.match(prompt, /默认渠道: 公众号、LinkedIn/)
  assert.match(prompt, /禁用词: 最强、保证/)
})
