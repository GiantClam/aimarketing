import assert from "node:assert/strict"
import test from "node:test"

import { buildSoulCardInput, parseMemoryType, parseWriterAgentType } from "./types"

test("memory type parser rejects unknown type", () => {
  assert.equal(parseMemoryType("unknown"), null)
})

test("agent type parser accepts allowlisted values only", () => {
  assert.equal(parseWriterAgentType("writer"), "writer")
  assert.equal(parseWriterAgentType("sales"), null)
})

test("buildSoulCardInput normalizes defaults and clamps confidence", () => {
  const soulCard = buildSoulCardInput({
    agentType: "writer",
    tone: "",
    sentenceStyle: "",
    tabooList: ["", "夸张", "夸张"],
    lexicalHints: ["务实", "务实", "可执行"],
    confidence: 100,
    generatedAt: -1,
  })

  assert.equal(soulCard.agentType, "writer")
  assert.equal(soulCard.tone, "adaptive")
  assert.equal(soulCard.sentenceStyle, "clear and concise")
  assert.deepEqual(soulCard.tabooList, ["夸张"])
  assert.deepEqual(soulCard.lexicalHints, ["务实", "可执行"])
  assert.equal(soulCard.confidence, 1)
  assert.equal(soulCard.generatedAt, 0)
})

