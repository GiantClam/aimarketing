import assert from "node:assert/strict"
import test from "node:test"

import { buildImageAssistantProviderPlan, generateOrEditImages } from "./aiberm"

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

test("image assistant provider plan respects a locked pptoken provider", () => {
  const plan = buildImageAssistantProviderPlan({
    hasPptoken: true,
    hasAiberm: true,
    hasCrazyroute: true,
    providerLock: "pptoken",
  })

  assert.deepEqual(plan, ["pptoken"])
})

test("image assistant fixtures preserve a request for 9 generated candidates", async () => {
  const originalFixtures = process.env.IMAGE_ASSISTANT_FIXTURES
  process.env.IMAGE_ASSISTANT_FIXTURES = "true"

  try {
    const result = await generateOrEditImages({
      prompt: "Generate a family of nine related product ads",
      resolution: "2K",
      sizePreset: "16:9",
      candidateCount: 9,
    })

    assert.equal(result.images.length, 9)
    assert.equal(new Set(result.images).size, 9)
  } finally {
    if (originalFixtures === undefined) {
      delete process.env.IMAGE_ASSISTANT_FIXTURES
    } else {
      process.env.IMAGE_ASSISTANT_FIXTURES = originalFixtures
    }
  }
})
