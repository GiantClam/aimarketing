import assert from "node:assert/strict"
import test from "node:test"

import {
  AI_ENTRY_CONSULTING_QUALITY_MODEL_HINT,
  AI_ENTRY_AGENT_DEFAULT_MODEL_HINT,
  AI_ENTRY_CONSULTING_ENTRY_MODE,
  AI_ENTRY_CONSULTING_MODEL_LOCK_EXEMPT_AGENT_IDS,
  AI_ENTRY_NORMAL_DEFAULT_MODEL_HINT,
  AI_ENTRY_PPT_ASSISTANT_DEFAULT_MODEL_HINT,
  AI_ENTRY_PPT_AGENT_IDS,
  AI_ENTRY_SONNET_46_MODEL_HINT,
  isAiEntryPptAgentId,
  isConsultingAdvisorEntryMode,
  pickConsultingModelId,
  pickAgentDefaultModelId,
  pickPptAssistantDefaultModelId,
  pickSonnet46ModelId,
  resolvePptAssistantModelSelection,
  resolveConsultingModelMode,
  shouldLockConsultingAdvisorModel,
} from "./model-policy"

test("pickSonnet46ModelId prefers non-thinking variant across separator styles", () => {
  const selected = pickSonnet46ModelId([
    { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
    { id: "claude-sonnet-4.6:thinking", name: "Claude Sonnet 4.6 Thinking" },
    { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
  ])

  assert.equal(selected, "claude-sonnet-4.6")
})

test("pickSonnet46ModelId returns null when sonnet-4.6 model does not exist", () => {
  const selected = pickSonnet46ModelId([
    { id: "openai/gpt-5.4", name: "GPT 5.4" },
    { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
  ])

  assert.equal(selected, null)
})

test("pickConsultingModelId defaults consulting advisor to DeepSeek V4 Pro", () => {
  const selected = pickConsultingModelId([
    { id: "deepseek::deepseek-v4-pro", name: "DeepSeek V4 Pro", providerId: "deepseek", modelId: "deepseek-v4-pro" },
    { id: "pptoken::grok-4.5", name: "PPToken / Grok 4.5", providerId: "pptoken", modelId: "grok-4.5" },
  ])

  assert.equal(selected, "deepseek::deepseek-v4-pro")
})

test("pickConsultingModelId quality mode targets DeepSeek V4 Pro", () => {
  const selected = pickConsultingModelId(
    [
      { id: "deepseek::deepseek-v4-pro", name: "DeepSeek V4 Pro", providerId: "deepseek", modelId: "deepseek-v4-pro" },
      { id: "pptoken::grok-4.5", name: "PPToken / Grok 4.5", providerId: "pptoken", modelId: "grok-4.5" },
    ],
    "quality",
  )

  assert.equal(selected, "deepseek::deepseek-v4-pro")
})

test("agent default model selector targets DeepSeek V4 Pro", () => {
  assert.equal(
    pickAgentDefaultModelId([
      { id: "deepseek::deepseek-v4-pro", providerId: "deepseek", modelId: "deepseek-v4-pro" },
      { id: "pptoken::grok-4.5", providerId: "pptoken", modelId: "grok-4.5" },
    ]),
    "deepseek::deepseek-v4-pro",
  )
})

test("pickPptAssistantDefaultModelId defaults PPT assistant to PPToken Grok-4.5", () => {
  const selected = pickPptAssistantDefaultModelId([
    { id: "aiberm::gpt-5.4", name: "AIBERM / GPT 5.4", providerId: "aiberm", modelId: "gpt-5.4" },
    { id: "pptoken::grok-4.5", name: "PPToken / Grok 4.5", providerId: "pptoken", modelId: "grok-4.5" },
    { id: "pptoken::gpt-5.4", name: "PPToken / GPT 5.4", providerId: "pptoken", modelId: "gpt-5.4" },
    { id: "pptoken::gpt-5.6-sol", name: "PPToken / GPT-5.6 Sol", providerId: "pptoken", modelId: "gpt-5.6-sol" },
    { id: "deepseek::deepseek-v4-pro", name: "DeepSeek V4 Pro", providerId: "deepseek", modelId: "deepseek-v4-pro" },
    { id: "openrouter::claude-sonnet-4.6", name: "OpenRouter / Claude Sonnet 4.6", providerId: "openrouter", modelId: "claude-sonnet-4.6" },
  ])

  assert.equal(selected, "pptoken::grok-4.5")
})

test("PPT assistant keeps the current conversation model before applying its default", () => {
  assert.equal(
    resolvePptAssistantModelSelection({
      currentModelId: "pptoken::gpt-5.4",
      availableModelIds: ["deepseek::deepseek-v4-pro", "pptoken::gpt-5.4"],
      defaultModelId: "pptoken::gpt-5.4",
    }),
    "pptoken::gpt-5.4",
  )
  assert.equal(
    resolvePptAssistantModelSelection({
      currentModelId: null,
      availableModelIds: ["deepseek::deepseek-v4-pro", "pptoken::gpt-5.4"],
      defaultModelId: "pptoken::gpt-5.4",
    }),
    "pptoken::gpt-5.4",
  )
})

test("PPT assistant restores a persisted conversation model when model loading races", () => {
  assert.equal(
    resolvePptAssistantModelSelection({
      currentModelId: null,
      conversationModelId: "pptoken::gpt-5.4",
      availableModelIds: ["deepseek::deepseek-v4-pro", "pptoken::gpt-5.4"],
      defaultModelId: "deepseek::deepseek-v4-pro",
    }),
    "pptoken::gpt-5.4",
  )
})

test("resolveConsultingModelMode always keeps consulting advisor on quality", () => {
  assert.equal(resolveConsultingModelMode({ requestedMode: "quality" }), "quality")
  assert.equal(resolveConsultingModelMode({ requestedMode: "deep" }), "quality")
  assert.equal(resolveConsultingModelMode({ requestedMode: "fast" }), "quality")
  assert.equal(resolveConsultingModelMode({ requestedMode: undefined }), "quality")
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
    false,
  )
  assert.equal(
    shouldLockConsultingAdvisorModel({
      entryMode: "other",
      agentId: "executive-diagnostic",
    }),
    false,
  )
  assert.deepEqual(AI_ENTRY_PPT_AGENT_IDS, ["executive-ppt", "executive-presentation-ppt"])
  assert.deepEqual(AI_ENTRY_CONSULTING_MODEL_LOCK_EXEMPT_AGENT_IDS, ["executive-ppt", "executive-presentation-ppt"])
  assert.equal(
    shouldLockConsultingAdvisorModel({
      entryMode: AI_ENTRY_CONSULTING_ENTRY_MODE,
      agentId: "executive-ppt",
    }),
    false,
  )
  assert.equal(
    shouldLockConsultingAdvisorModel({
      entryMode: AI_ENTRY_CONSULTING_ENTRY_MODE,
      agentId: "executive-presentation-ppt",
    }),
    false,
  )
  assert.equal(isAiEntryPptAgentId("executive-ppt"), true)
  assert.equal(isAiEntryPptAgentId("executive-presentation-ppt"), true)
  assert.equal(isAiEntryPptAgentId("executive-brand"), false)
  assert.equal(AI_ENTRY_NORMAL_DEFAULT_MODEL_HINT, "deepseek-v4-pro")
  assert.equal(AI_ENTRY_CONSULTING_QUALITY_MODEL_HINT, "deepseek-v4-pro")
  assert.equal(AI_ENTRY_AGENT_DEFAULT_MODEL_HINT, "deepseek-v4-pro")
  assert.equal(AI_ENTRY_SONNET_46_MODEL_HINT, "claude-sonnet-4.6")
  assert.equal(AI_ENTRY_PPT_ASSISTANT_DEFAULT_MODEL_HINT, "grok-4.5")
})
