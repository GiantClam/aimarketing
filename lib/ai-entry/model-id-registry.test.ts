import assert from "node:assert/strict"
import test from "node:test"

import {
  areEquivalentModelIds,
  normalizeModelDisplayId,
  pickPreferredDisplayModelId,
  resolveEquivalentModelId,
} from "./model-id-registry"

test("model registry treats provider and separator variants as equivalent", () => {
  assert.equal(
    areEquivalentModelIds("anthropic/claude-sonnet-4.6", "claude-sonnet-4.6"),
    true,
  )
  assert.equal(
    areEquivalentModelIds("openai/gpt-5.4-mini", "gpt-5-4-mini"),
    true,
  )
  assert.equal(
    areEquivalentModelIds("openai/gpt-5.4-mini", "google/gemini-3.0-pro"),
    false,
  )
})

test("model registry prefers single display id deterministically", () => {
  assert.equal(
    pickPreferredDisplayModelId([
      "anthropic/claude-sonnet-4.6",
      "claude-sonnet-4.6",
      "anthropic/claude-sonnet-4.6-thinking",
      "claude-sonnet-4.6-thinking",
    ]),
    "claude-sonnet-4.6",
  )
})

test("model registry resolves persisted alias to displayed model id", () => {
  const resolved = resolveEquivalentModelId("anthropic/claude-sonnet-4.6", [
    "gpt-5-4-mini",
    "claude-sonnet-4.6",
  ])

  assert.equal(resolved, "claude-sonnet-4.6")
})

test("model registry strips claude release date suffix but keeps thinking distinction", () => {
  assert.equal(
    normalizeModelDisplayId("claude-haiku-4-5-20251001"),
    "claude-haiku-4.5",
  )
  assert.equal(
    normalizeModelDisplayId("claude-haiku-4-5-thinking-20251001"),
    "claude-haiku-4.5-thinking",
  )
  assert.equal(
    normalizeModelDisplayId("anthropic/claude-opus-4-6-20251101-thinking"),
    "anthropic/claude-opus-4.6-thinking",
  )
})
