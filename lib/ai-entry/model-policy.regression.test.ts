import assert from "node:assert/strict"
import test from "node:test"

import {
  AI_ENTRY_CONSULTING_ENTRY_MODE,
  AI_ENTRY_SONNET_46_MODEL_HINT,
  isConsultingAdvisorEntryMode,
  pickSonnet46ModelId,
  shouldLockConsultingAdvisorModel,
} from "./model-policy"

test("pickSonnet46ModelId prefers non-thinking variant across separator styles", () => {
  const selected = pickSonnet46ModelId([
    { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
    { id: "claude-sonnet-4-6:thinking", name: "Claude Sonnet 4.6 Thinking" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
  ])

  assert.equal(selected, "claude-sonnet-4-6")
})

test("pickSonnet46ModelId returns null when sonnet-4.6 model does not exist", () => {
  const selected = pickSonnet46ModelId([
    { id: "openai/gpt-5.4", name: "GPT 5.4" },
    { id: "google/gemini-3-flash", name: "Gemini 3 Flash" },
  ])

  assert.equal(selected, null)
})

test("consulting entry mode detection and lock flag", () => {
  assert.equal(isConsultingAdvisorEntryMode("consulting-advisor"), true)
  assert.equal(isConsultingAdvisorEntryMode(" consulting-advisor "), true)
  assert.equal(isConsultingAdvisorEntryMode("other"), false)

  assert.equal(
    shouldLockConsultingAdvisorModel({
      entryMode: AI_ENTRY_CONSULTING_ENTRY_MODE,
      agentId: "general",
    }),
    true,
  )
  assert.equal(
    shouldLockConsultingAdvisorModel({
      entryMode: "other",
      agentId: "executive-diagnostic",
    }),
    false,
  )
  assert.equal(AI_ENTRY_SONNET_46_MODEL_HINT, "sonnet-4.6")
})
