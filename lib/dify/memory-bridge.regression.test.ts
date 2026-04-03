import assert from "node:assert/strict"
import test from "node:test"

import { buildDifyMemoryBridge, mergeDifyInputsWithMemoryBridge } from "./memory-bridge"
import type { WriterMemoryItem, WriterSoulProfile } from "@/lib/writer/memory/types"

function memoryFixture(overrides: Partial<WriterMemoryItem>): WriterMemoryItem {
  return {
    id: 1,
    userId: 8,
    agentType: "brand-strategy",
    conversationId: null,
    type: "feedback",
    title: "tone",
    content: "Prefer concise strategic framing",
    confidence: 0.9,
    source: "explicit_user",
    dedupFingerprint: "feedback:tone",
    isDeleted: false,
    lastUsedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-02T00:00:00.000Z"),
    ...overrides,
  }
}

const emptySoulProfile = null as WriterSoulProfile | null

test("brand-strategy bridge does not include growth partition memory", async () => {
  const bridge = await buildDifyMemoryBridge(
    {
      userId: 8,
      advisorType: "brand-strategy",
      query: "give me brand strategy advice",
      enabled: true,
      soulEnabled: false,
    },
    {
      listMemories: async () => [
        memoryFixture({ id: 21, agentType: "brand-strategy", content: "Use strategic concise language." }),
        memoryFixture({ id: 22, agentType: "growth", content: "Output growth funnel table only." }),
      ],
      getSoulProfile: async () => emptySoulProfile,
    },
  )

  assert.equal(bridge.agentType, "brand-strategy")
  assert.deepEqual(bridge.memoryAppliedIds, [21])
  assert.match(bridge.memoryContext || "", /strategic concise/i)
  assert.doesNotMatch(bridge.memoryContext || "", /growth funnel/i)
})

test("company-search bridge does not include contact-mining partition memory", async () => {
  const bridge = await buildDifyMemoryBridge(
    {
      userId: 8,
      advisorType: "company-search",
      query: "find similar manufacturing companies",
      enabled: true,
      soulEnabled: false,
    },
    {
      listMemories: async () => [
        memoryFixture({ id: 31, agentType: "company-search", content: "Prefer ICP-first company filters." }),
        memoryFixture({ id: 32, agentType: "contact-mining", content: "Always include email confidence score." }),
      ],
      getSoulProfile: async () => emptySoulProfile,
    },
  )

  assert.equal(bridge.agentType, "company-search")
  assert.deepEqual(bridge.memoryAppliedIds, [31])
  assert.match(bridge.memoryContext || "", /ICP-first/i)
  assert.doesNotMatch(bridge.memoryContext || "", /email confidence/i)
})

test("bridge memory is observable in dify payload inputs", () => {
  const merged = mergeDifyInputsWithMemoryBridge(
    { contents: "hello" },
    {
      agentType: "growth",
      memoryContext: "Agent memory context:\n- style: be concise",
      soulCard: "Soul Card:\n- Tone: pragmatic",
      memoryAppliedIds: [9, 10],
    },
  )

  assert.equal(merged.contents, "hello")
  assert.equal(merged.memory_context, "Agent memory context:\n- style: be concise")
  assert.equal(merged.soul_card, "Soul Card:\n- Tone: pragmatic")
  assert.equal(merged.memory_applied_ids, "9,10")
  assert.equal(merged.memory_agent_type, "growth")
})
