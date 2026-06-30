import assert from "node:assert/strict"
import test from "node:test"

import { buildPersonalKnowledgeRetrievalContext } from "@/lib/knowledge/personal-datasets"

test("buildPersonalKnowledgeRetrievalContext ranks matching personal knowledge documents", () => {
  const result = buildPersonalKnowledgeRetrievalContext({
    query: "brand voice launch",
    topK: 2,
    documents: [
      {
        id: 1,
        datasetId: 7,
        datasetName: "Founder Notes",
        name: "Brand playbook",
        updatedAt: new Date("2026-06-29T00:00:00Z"),
        metadata: { contentMarkdown: "Brand voice system for launch messaging." },
      },
      {
        id: 2,
        datasetId: 8,
        datasetName: "Ops Notes",
        name: "Hiring notes",
        updatedAt: new Date("2026-06-28T00:00:00Z"),
        metadata: { contentMarkdown: "Interview scorecard and onboarding checklist." },
      },
    ],
  })

  assert.equal(result?.snippets.length, 1)
  assert.equal(result?.snippets[0]?.title, "Brand playbook")
  assert.equal(result?.datasetsUsed[0]?.datasetId, "personal:7")
})

test("buildPersonalKnowledgeRetrievalContext respects preferred dataset ids", () => {
  const result = buildPersonalKnowledgeRetrievalContext({
    query: "launch",
    preferredDatasetIds: [8],
    documents: [
      {
        id: 1,
        datasetId: 7,
        datasetName: "Founder Notes",
        name: "Brand playbook",
        updatedAt: new Date("2026-06-29T00:00:00Z"),
        metadata: { contentMarkdown: "Launch message." },
      },
      {
        id: 2,
        datasetId: 8,
        datasetName: "Ops Notes",
        name: "Launch checklist",
        updatedAt: new Date("2026-06-28T00:00:00Z"),
        metadata: { contentMarkdown: "Launch runbook." },
      },
    ],
  })

  assert.equal(result?.snippets.length, 1)
  assert.equal(result?.snippets[0]?.datasetId, "personal:8")
})
