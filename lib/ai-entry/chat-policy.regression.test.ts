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

test("consulting speed mode keeps web search intent-gated for fresh external facts only", () => {
  const rule = getAiEntryWebSearchSystemRule({
    webSearchAvailable: true,
    conversationScope: "consulting",
    consultingModelMode: "speed",
  })

  assert.match(rule, /consulting speed mode/)
  assert.match(rule, /Do not call web_search for evergreen diagnosis/)
  assert.match(rule, /fresh\/current external facts/)
})

test("normal chat keeps standard intent-based web search guidance", () => {
  const rule = getAiEntryWebSearchSystemRule({
    webSearchAvailable: true,
    conversationScope: "chat",
    consultingModelMode: "speed",
  })

  assert.match(rule, /Decide from the user's intent/)
  assert.doesNotMatch(rule, /consulting speed mode/)
})
