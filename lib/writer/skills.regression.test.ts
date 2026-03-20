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
  routing: null,
}

function createRouting(
  overrides: Partial<NonNullable<WriterTurnDiagnostics["routing"]>> = {},
): NonNullable<WriterTurnDiagnostics["routing"]> {
  return {
    contentType: "longform",
    targetPlatform: "WeChat Official Account",
    outputForm: "long-form article",
    lengthTarget: "1500-3500 words",
    renderPlatform: "wechat",
    renderMode: "article",
    selectedSkillId: "longform",
    selectedSkillLabel: "长文内容",
    ...overrides,
  }
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
      runtimeLabel: "Universal Content Brief Intake",
      requiredBriefFields: [
        "Content type or publishing scenario",
        "Target platform or destination surface",
        "Topic and core angle",
        "Target audience",
        "Primary objective or desired outcome",
        "Tone, voice, or style preference",
      ],
      collectionRules: [
        "Collect the brief through conversation, not through a form.",
        "Ask only the next missing item by default, and combine two only near the turn limit.",
      ],
      followUpStyle: "Be concise, practical, and editorial.",
      defaultAssumptions: [
        "If tone is missing near the turn limit, fall back to the selected platform tone.",
      ],
    }),
    getContentGuide: async () => ({
      runtimeLabel: "Long-form Content Writer",
      guidance: "Use scenario-native structure.",
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
        diagnostics: {
          ...baseDiagnostics,
          routing: createRouting(),
        },
      }
    },
  }
}

test("clarification asks only one missing item early in the briefing flow", async () => {
  const result = await runWriterSkillsTurnWithRuntime(
    {
      query: "写一篇关于 AI 销售自动化的文章",
      platform: "wechat",
      mode: "article",
      preferredLanguage: "zh",
      conversationStatus: "drafting",
      history: [],
    },
    createRuntime({
      extractBrief: async () => ({
        resolvedBrief: {
          topic: "AI 销售自动化",
          audience: "",
          objective: "",
          tone: "",
          constraints: "",
        },
        routingDecision: createRouting(),
        answeredFields: ["topic"],
        suggestedFollowUpFields: ["audience", "objective"],
        suggestedFollowUpQuestion: "这篇文章主要写给谁，以及想达成什么结果？",
        userWantsDirectOutput: false,
        briefSufficient: false,
        confidence: 0.88,
      }),
    }),
  )

  assert.equal(result.outcome, "needs_clarification")
  assert.match(result.answer, /1\./)
  assert.doesNotMatch(result.answer, /2\./)
})

test("short reply can fill objective and proceed to drafting", async () => {
  let compiledPrompt = ""

  const result = await runWriterSkillsTurnWithRuntime(
    {
      query: "Drive consultation requests",
      platform: "wechat",
      mode: "article",
      preferredLanguage: "en",
      conversationStatus: "drafting",
      history: [
        createHistoryEntry(
          1,
          "Write an article about AI sales automation for factory owners",
          "What result should the article drive?",
        ),
      ],
    },
    createRuntime({
      extractBrief: async () => ({
        resolvedBrief: {
          topic: "AI sales automation",
          audience: "factory owners",
          objective: "Drive consultation requests",
          tone: "",
          constraints: "",
        },
        routingDecision: createRouting(),
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
  assert.equal(result.brief.objective, "Drive consultation requests")
  assert.equal(result.brief.tone, "platform default tone")
  assert.equal(result.routing.contentType, "longform")
  assert.match(compiledPrompt, /Drive consultation requests/)
})

test("direct output intent skips clarification even when brief is incomplete", async () => {
  const result = await runWriterSkillsTurnWithRuntime(
    {
      query: "Just write an X thread about AI agent sales automation",
      platform: "x",
      mode: "thread",
      preferredLanguage: "en",
      conversationStatus: "drafting",
      history: [],
    },
    createRuntime({
      extractBrief: async () => ({
        resolvedBrief: {
          topic: "AI agent sales automation",
          audience: "",
          objective: "",
          tone: "",
          constraints: "",
        },
        routingDecision: createRouting({
          contentType: "social_global",
          targetPlatform: "X",
          outputForm: "X thread",
          lengthTarget: "5-12 short segments",
          renderPlatform: "x",
          renderMode: "thread",
          selectedSkillId: "social_global",
          selectedSkillLabel: "海外社媒",
        }),
        answeredFields: ["topic"],
        suggestedFollowUpFields: ["audience", "objective"],
        suggestedFollowUpQuestion: "Who is this for and what outcome should it drive?",
        userWantsDirectOutput: true,
        briefSufficient: false,
        confidence: 0.9,
      }),
    }),
  )

  assert.equal(result.outcome, "draft_ready")
  assert.equal(result.selectedSkill.stage, "execution")
  assert.equal(result.routing.targetPlatform, "X")
})

test("turn limit falls back to platform tone and proceeds", async () => {
  const history = [
    createHistoryEntry(1, "Help me write something", "What topic should it focus on?"),
    createHistoryEntry(2, "AI productivity", "Who is it for?"),
    createHistoryEntry(3, "Not sure yet", "What should it achieve?"),
    createHistoryEntry(4, "Brand awareness first", "Understood. I will organize what we have."),
  ]

  const result = await runWriterSkillsTurnWithRuntime(
    {
      query: "Go ahead and draft it",
      platform: "wechat",
      mode: "article",
      preferredLanguage: "en",
      conversationStatus: "drafting",
      history,
    },
    createRuntime({
      extractBrief: async () => ({
        resolvedBrief: {
          topic: "AI productivity",
          audience: "",
          objective: "Brand awareness",
          tone: "",
          constraints: "",
        },
        routingDecision: createRouting(),
        answeredFields: ["objective"],
        suggestedFollowUpFields: ["audience"],
        suggestedFollowUpQuestion: "Who is the primary audience?",
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
