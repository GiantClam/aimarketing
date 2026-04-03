import assert from "node:assert/strict"
import test from "node:test"

import { mergeImageAssistantExtraInstructions, resolveImageAssistantMemoryBridge } from "./memory-bridge"
import type { WriterMemoryItem, WriterSoulProfile } from "@/lib/writer/memory/types"

function memoryFixture(overrides: Partial<WriterMemoryItem>): WriterMemoryItem {
  return {
    id: 1,
    userId: 9,
    agentType: "image",
    conversationId: null,
    type: "feedback",
    title: "style",
    content: "Use restrained cinematic red-black palette",
    confidence: 0.9,
    source: "explicit_user",
    dedupFingerprint: "feedback:style",
    isDeleted: false,
    lastUsedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-02T00:00:00.000Z"),
    ...overrides,
  }
}

const emptySoulProfile = null as WriterSoulProfile | null

test("image bridge only applies memory from agentType=image", async () => {
  const result = await resolveImageAssistantMemoryBridge(
    {
      userId: 9,
      prompt: "generate a red black cinematic poster",
      enabled: true,
      soulEnabled: false,
      rankingLimit: 5,
    },
    {
      listMemories: async () => [
        memoryFixture({ id: 11, agentType: "image", content: "Prefer cinematic black-red style, low saturation." }),
        memoryFixture({ id: 12, agentType: "growth", content: "Growth advisor prefers tabular output only." }),
      ],
      getSoulProfile: async () => emptySoulProfile,
    },
  )

  assert.deepEqual(result.memoryAppliedIds, [11])
  assert.match(result.memoryContext || "", /black-red|cinematic/i)
  assert.doesNotMatch(result.memoryContext || "", /tabular output/i)
})

test("merged image extra instructions contain memory bridge output for prompt assembly", () => {
  const merged = mergeImageAssistantExtraInstructions({
    extraInstructions: "Keep the logo area untouched.",
    memoryContext: "Image memory hints:\n- palette: black red cinematic",
    soulCard: "Soul Card:\n- Tone: restrained",
  })

  assert.ok(merged)
  assert.match(merged || "", /Keep the logo area untouched\./)
  assert.match(merged || "", /Image memory hints:/)
  assert.match(merged || "", /Soul Card:/)
})
