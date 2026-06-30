import assert from "node:assert/strict"
import test from "node:test"

import { summarizeSharedKnowledgeTargets } from "@/lib/knowledge/governance-targets"

test("summarizeSharedKnowledgeTargets groups datasets by enabled target", () => {
  const summary = summarizeSharedKnowledgeTargets([
    {
      id: 2,
      name: "Brand KB",
      category: "brand",
      bindings: [
        { id: 10, targetType: "advisor_external_knowledge" },
        { id: 11, targetType: "writer" },
      ],
    },
    {
      id: 5,
      name: "Chat KB",
      category: "general",
      bindings: [{ id: 12, targetType: "ai_entry" }],
    },
  ])

  assert.deepEqual(summary.advisorDatasets.map((item) => item.id), [2])
  assert.deepEqual(summary.writerDatasets.map((item) => item.id), [2])
  assert.deepEqual(summary.aiEntryDatasets.map((item) => item.id), [5])
})

test("summarizeSharedKnowledgeTargets ignores disabled targets", () => {
  const summary = summarizeSharedKnowledgeTargets([
    {
      id: 9,
      name: "Ops KB",
      category: "general",
      bindings: [{ id: 15, targetType: "advisor_external_knowledge", enabled: false }],
    },
  ])

  assert.deepEqual(summary.advisorDatasets, [])
})
