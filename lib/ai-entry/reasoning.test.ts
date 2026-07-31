import test from "node:test"
import assert from "node:assert/strict"

import {
  getReasoningCapabilities,
  normalizeReasoningEffort,
} from "./reasoning"

test("DeepSeek exposes vendor-specific max reasoning", () => {
  assert.deepEqual(
    getReasoningCapabilities({ providerId: "deepseek", modelId: "deepseek-v4-flash" }).map((item) => item.effort),
    ["auto", "none", "low", "high", "max"],
  )
})

test("OpenAI exposes xhigh but not DeepSeek max", () => {
  const efforts = getReasoningCapabilities({ providerId: "pptoken", modelId: "gpt-5.4" }).map((item) => item.effort)
  assert.ok(efforts.includes("xhigh"))
  assert.ok(!efforts.includes("max"))
})

test("GPT-5.6 Luna receives the full OpenAI reasoning menu", () => {
  assert.deepEqual(
    getReasoningCapabilities({ providerId: "pptoken", modelId: "gpt-5.6-luna" }).map((item) => item.effort),
    ["auto", "none", "minimal", "low", "medium", "high", "xhigh"],
  )
})

test("unsupported effort falls back to auto when the model changes", () => {
  assert.equal(
    normalizeReasoningEffort("max", { providerId: "openai", modelId: "gpt-5.4" }),
    "auto",
  )
})
