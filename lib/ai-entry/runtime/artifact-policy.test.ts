import assert from "node:assert/strict"
import { test } from "node:test"

import {
  DASHI_PPT_MAX_ARTIFACT_BYTES,
  DASHI_PPT_MAX_ARTIFACT_TOTAL_BYTES,
  resolveRuntimeArtifactLimits,
} from "./artifact-policy"

test("raises Dashi artifact limits enough for native PPTX exports", () => {
  const limits = resolveRuntimeArtifactLimits({
    agentId: "executive-presentation-ppt",
    selectedSkillIds: ["dashiai-ppt"],
    maxArtifacts: 8,
    maxArtifactBytes: 2 * 1024 * 1024,
    maxArtifactTotalBytes: 4 * 1024 * 1024,
  })

  assert.equal(limits.maxArtifactBytes, DASHI_PPT_MAX_ARTIFACT_BYTES)
  assert.equal(limits.maxArtifactTotalBytes, DASHI_PPT_MAX_ARTIFACT_TOTAL_BYTES)
})

test("does not widen generic runtime artifact limits", () => {
  const limits = resolveRuntimeArtifactLimits({
    agentId: "general",
    selectedSkillIds: [],
    maxArtifacts: 8,
    maxArtifactBytes: 100,
    maxArtifactTotalBytes: 200,
  })

  assert.deepEqual(limits, {
    agentId: "general",
    selectedSkillIds: [],
    maxArtifacts: 8,
    maxArtifactBytes: 100,
    maxArtifactTotalBytes: 200,
  })
})
