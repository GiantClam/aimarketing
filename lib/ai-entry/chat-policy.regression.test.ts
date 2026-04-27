import assert from "node:assert/strict"
import test from "node:test"

import {
  getAiEntryWebSearchSystemRule,
  shouldQueryAiEntryEnterpriseKnowledge,
} from "./chat-policy"

test("normal AI entry chat without an agent does not query enterprise knowledge", () => {
  assert.equal(
    shouldQueryAiEntryEnterpriseKnowledge({
      canQueryEnterpriseKnowledge: true,
      effectiveAgentId: null,
    }),
    false,
  )
})

test("agent-backed AI entry chat can query enterprise knowledge", () => {
  assert.equal(
    shouldQueryAiEntryEnterpriseKnowledge({
      canQueryEnterpriseKnowledge: true,
      effectiveAgentId: "executive-diagnostic",
    }),
    true,
  )
})

test("enterprise knowledge remains disabled when enterprise state is unavailable", () => {
  assert.equal(
    shouldQueryAiEntryEnterpriseKnowledge({
      canQueryEnterpriseKnowledge: false,
      effectiveAgentId: "executive-diagnostic",
    }),
    false,
  )
})

test("consulting uses the standard intent-based web search guidance", () => {
  const rule = getAiEntryWebSearchSystemRule({
    webSearchAvailable: true,
    conversationScope: "consulting",
    consultingModelMode: "quality",
  })

  assert.match(rule, /Decide from the user's intent/)
  assert.doesNotMatch(rule, /consulting speed mode/)
})

test("normal chat keeps standard intent-based web search guidance", () => {
  const rule = getAiEntryWebSearchSystemRule({
    webSearchAvailable: true,
    conversationScope: "chat",
    consultingModelMode: "quality",
  })

  assert.match(rule, /Decide from the user's intent/)
  assert.doesNotMatch(rule, /consulting speed mode/)
})
