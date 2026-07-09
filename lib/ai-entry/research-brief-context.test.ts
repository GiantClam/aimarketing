import assert from "node:assert/strict"
import test from "node:test"

import {
  buildResearchBriefFromAttachmentContent,
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

test("builds a minimal research brief from uploaded attachment content", () => {
  const brief = buildResearchBriefFromAttachmentContent({
    latestUserPrompt: [
      "写一份介绍预算智能公司和业务的 ppt",
      "",
      "[Uploaded file: 屿算智能_ppt信息提取.md / text/markdown]",
      "# 《屿算智能》PPT 信息提取",
      "",
      "- 实用 AI 大于 AI 概念",
      "- 企业专属 AI 业务工作台",
      "- 配置 17 个 AI 智能体员工",
      "- 从业务梳理到资产沉淀形成闭环",
    ].join("\n"),
  })

  assert.deepEqual(brief, {
    topic: "《屿算智能》PPT 信息提取",
    keyFacts: [
      "实用 AI 大于 AI 概念",
      "企业专属 AI 业务工作台",
      "配置 17 个 AI 智能体员工",
      "从业务梳理到资产沉淀形成闭环",
    ],
    rawSummary: [
      "# 《屿算智能》PPT 信息提取",
      "",
      "- 实用 AI 大于 AI 概念",
      "- 企业专属 AI 业务工作台",
      "- 配置 17 个 AI 智能体员工",
      "- 从业务梳理到资产沉淀形成闭环",
    ].join("\n"),
  })
})
