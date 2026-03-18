import assert from "node:assert/strict"
import test from "node:test"

import { runWriterSkillsTurnWithRuntime } from "./skills"
import type { WriterHistoryEntry, WriterTurnDiagnostics } from "./types"

const baseDiagnostics: WriterTurnDiagnostics = {
  retrievalStrategy: "rewrite_only",
  enterpriseKnowledgeEnabled: false,
  enterpriseKnowledgeUsed: false,
  enterpriseDatasetCount: 0,
  enterpriseSourceCount: 0,
  enterpriseDatasets: [],
  enterpriseTitles: [],
  webResearchUsed: false,
  webResearchStatus: "skipped",
  webSourceCount: 0,
}

function createHistoryEntry(index: number, query: string, answer: string): WriterHistoryEntry {
  return {
    id: String(index),
    conversation_id: "test-conversation",
    query,
    answer,
    diagnostics: null,
    inputs: { contents: query },
    created_at: index,
  }
}

function createRuntime(options: {
  extractBrief: Parameters<typeof runWriterSkillsTurnWithRuntime>[1]["extractBrief"]
  onGenerate?: (compiledPrompt: string) => void
}) {
  return {
    getBriefingGuide: async () => ({
      runtimeLabel: "Writer Brief Intake",
      requiredBriefFields: [
        "Topic and core angle",
        "Target audience",
        "Primary objective or desired outcome",
        "Tone, voice, or style preference",
      ],
      collectionRules: [
        "Collect the brief through conversation, not through a form.",
        "Ask at most two missing items in each follow-up.",
      ],
      followUpStyle: "Be concise, practical, and editorial.",
      defaultAssumptions: [
        "If tone is missing near the turn limit, fall back to the selected platform tone.",
      ],
    }),
    getRuntimeGuide: async () => ({
      runtimeLabel: "WeChat Official Account article writer",
      tone: "platform default tone",
      contentFormat: "publish-ready long-form article",
      lengthTarget: "1500-3500 words",
      imageGuidance: "16:9 cover plus inline images",
      promptRules: [],
      articleStructureGuidance: "Write as a complete article.",
      threadStructureGuidance: "Write as a thread.",
    }),
    extractBrief: options.extractBrief,
    generateDraft: async (compiledPrompt: string) => {
      options.onGenerate?.(compiledPrompt)
      return {
        answer: "# Draft\n\nGenerated body.",
        diagnostics: baseDiagnostics,
      }
    },
  }
}

test("short reply can fill objective and proceed to drafting", async () => {
  let compiledPrompt = ""
  const result = await runWriterSkillsTurnWithRuntime(
    {
      query: "促成咨询",
      platform: "wechat",
      mode: "article",
      preferredLanguage: "zh",
      conversationStatus: "drafting",
      history: [createHistoryEntry(1, "帮我写一篇关于 AI 销售自动化的文章，写给制造业老板", "你最希望这篇文章达成什么结果？")],
    },
    createRuntime({
      extractBrief: async () => ({
        resolvedBrief: {
          topic: "AI 销售自动化",
          audience: "制造业老板",
          objective: "促成咨询",
          tone: "",
          constraints: "",
        },
        answeredFields: ["objective"],
        suggestedFollowUpFields: [],
        suggestedFollowUpQuestion: "",
        userWantsDirectOutput: false,
        briefSufficient: true,
        confidence: 0.96,
      }),
      onGenerate: (prompt) => {
        compiledPrompt = prompt
      },
    }),
  )

  assert.equal(result.outcome, "draft_ready")
  assert.equal(result.brief.objective, "促成咨询")
  assert.equal(result.brief.tone, "platform default tone")
  assert.match(compiledPrompt, /促成咨询/)
})

test("direct output intent skips clarification even when brief is incomplete", async () => {
  const result = await runWriterSkillsTurnWithRuntime(
    {
      query: "直接生成一篇关于 AI agent 销售自动化的 X thread",
      platform: "x",
      mode: "thread",
      preferredLanguage: "zh",
      conversationStatus: "drafting",
      history: [],
    },
    createRuntime({
      extractBrief: async () => ({
        resolvedBrief: {
          topic: "AI agent 销售自动化",
          audience: "",
          objective: "",
          tone: "",
          constraints: "",
        },
        answeredFields: ["topic"],
        suggestedFollowUpFields: ["audience", "objective"],
        suggestedFollowUpQuestion: "这篇内容主要写给谁，以及希望达成什么结果？",
        userWantsDirectOutput: true,
        briefSufficient: false,
        confidence: 0.9,
      }),
    }),
  )

  assert.equal(result.outcome, "draft_ready")
  assert.equal(result.selectedSkill.stage, "execution")
  assert.equal(result.brief.topic, "AI agent 销售自动化")
})

test("turn limit falls back to platform tone and proceeds", async () => {
  const history = [
    createHistoryEntry(1, "帮我写篇文章", "想聚焦什么主题？"),
    createHistoryEntry(2, "AI 提效", "主要写给谁看？"),
    createHistoryEntry(3, "还没想好", "希望达成什么结果？"),
    createHistoryEntry(4, "先做品牌认知", "明白了，我先整理一下目前的信息。"),
  ]

  const result = await runWriterSkillsTurnWithRuntime(
    {
      query: "先出稿吧",
      platform: "wechat",
      mode: "article",
      preferredLanguage: "zh",
      conversationStatus: "drafting",
      history,
    },
    createRuntime({
      extractBrief: async () => ({
        resolvedBrief: {
          topic: "AI 提效",
          audience: "",
          objective: "品牌认知",
          tone: "",
          constraints: "",
        },
        answeredFields: ["objective"],
        suggestedFollowUpFields: ["audience"],
        suggestedFollowUpQuestion: "这篇文章主要写给谁？",
        userWantsDirectOutput: false,
        briefSufficient: false,
        confidence: 0.92,
      }),
    }),
  )

  assert.equal(result.outcome, "draft_ready")
  assert.equal(result.turnCount, 5)
  assert.equal(result.brief.tone, "platform default tone")
  assert.equal(result.readyForGeneration, true)
})
