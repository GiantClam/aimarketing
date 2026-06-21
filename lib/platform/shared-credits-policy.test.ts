import assert from "node:assert/strict"
import test from "node:test"

import {
  hasCustomAiChatModelSelection,
  hasCustomImageModelSelection,
  hasCustomMediaModelSelection,
  shouldChargeSharedCreditsForCapability,
} from "@/lib/platform/shared-credits-policy"

test("ai chat custom provider or model selection skips shared credits", () => {
  assert.equal(hasCustomAiChatModelSelection(undefined), false)
  assert.equal(hasCustomAiChatModelSelection({ providerId: "pptoken" }), true)
  assert.equal(hasCustomAiChatModelSelection({ modelId: "gpt-5.4" }), true)
})

test("image selection only charges shared credits when provider and model are absent", () => {
  assert.equal(hasCustomImageModelSelection({}), false)
  assert.equal(hasCustomImageModelSelection({ providerLock: "pptoken" }), true)
  assert.equal(hasCustomImageModelSelection({ model: "gpt-image-2" }), true)
})

test("media selection detects custom models in root or params", () => {
  assert.equal(hasCustomMediaModelSelection({}), false)
  assert.equal(hasCustomMediaModelSelection({ model: "veo-3.1" }), true)
  assert.equal(hasCustomMediaModelSelection({ params: { model: "speech-2.8-hd" } }), true)
})

test("shared credits are charged only for system-routed capability executions", () => {
  assert.equal(
    shouldChargeSharedCreditsForCapability({
      capabilitySlug: "ai-chat",
      usesSharedCredits: true,
      body: {},
    }),
    true,
  )

  assert.equal(
    shouldChargeSharedCreditsForCapability({
      capabilitySlug: "ai-chat",
      usesSharedCredits: true,
      body: { modelConfig: { providerId: "openrouter", modelId: "gpt-5.4" } },
    }),
    false,
  )

  assert.equal(
    shouldChargeSharedCreditsForCapability({
      capabilitySlug: "ai-image",
      usesSharedCredits: true,
      body: { providerLock: "pptoken", model: "gpt-image-2" },
    }),
    false,
  )

  assert.equal(
    shouldChargeSharedCreditsForCapability({
      capabilitySlug: "ai-music",
      usesSharedCredits: true,
      body: { params: { model: "speech-2.8-hd" } },
    }),
    false,
  )
})
