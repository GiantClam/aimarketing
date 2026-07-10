import assert from "node:assert/strict"
import test from "node:test"

import {
  buildResearchBriefContextMarker,
  buildResearchBriefFromWebSearchResult,
  extractLatestResearchBriefContext,
  extractLatestResearchBriefContextFromContents,
} from "./research-brief-context"

test("builds a structured research brief from web_search results", () => {
  const brief = buildResearchBriefFromWebSearchResult({
    query: "Crimea military posture 2026",
    intent: "Need current evidence before generating a geopolitical PPT.",
    results: [
      {
        title: "Black Sea fleet posture update",
        url: "https://example.com/fleet",
        snippet: "Russia dispersed key Black Sea Fleet assets after repeated strikes on Crimea bases.",
      },
    ],
  })

  assert.deepEqual(brief, {
    topic: "Crimea military posture 2026",
    keyFacts: ["Russia dispersed key Black Sea Fleet assets after repeated strikes on Crimea bases."],
    sourceNotes: ["Black Sea fleet posture update - https://example.com/fleet"],
    implications: ["Need current evidence before generating a geopolitical PPT."],
    rawSummary: [
      "Topic: Crimea military posture 2026",
      "Key facts:",
      "- Russia dispersed key Black Sea Fleet assets after repeated strikes on Crimea bases.",
      "Implications:",
      "- Need current evidence before generating a geopolitical PPT.",
      "Source notes:",
      "- Black Sea fleet posture update - https://example.com/fleet",
    ].join("\n"),
  })
})

test("extracts the latest persisted research brief marker from message contents", () => {
  const firstMarker = buildResearchBriefContextMarker({
    topic: "Older brief",
    keyFacts: ["Older fact"],
    rawSummary: "Topic: Older brief",
  })
  const latestMarker = buildResearchBriefContextMarker({
    topic: "Latest brief",
    keyFacts: ["Latest fact"],
    sourceNotes: ["Source A - https://example.com/a"],
    rawSummary: "Topic: Latest brief",
  })

  assert.deepEqual(extractLatestResearchBriefContext(`hello\n${firstMarker}\n${latestMarker}`), {
    topic: "Latest brief",
    keyFacts: ["Latest fact"],
    sourceNotes: ["Source A - https://example.com/a"],
    rawSummary: "Topic: Latest brief",
  })

  assert.deepEqual(extractLatestResearchBriefContextFromContents(["plain", latestMarker]), {
    topic: "Latest brief",
    keyFacts: ["Latest fact"],
    sourceNotes: ["Source A - https://example.com/a"],
    rawSummary: "Topic: Latest brief",
  })
})
