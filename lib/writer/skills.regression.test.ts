import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

import type { WriterHistoryEntry, WriterTurnDiagnostics } from "./types"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only") {
    return {}
  }
  return originalLoad.call(this, request, parent, isMain)
}

let runWriterSkillsTurnWithRuntime: (...args: any[]) => Promise<any>

test.before(async () => {
  ;({ runWriterSkillsTurnWithRuntime } = await import("./skills.ts"))
})

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
    selectedSkillLabel: "Long-form content",
    ...overrides,
  }
}

function createHistoryEntry(
  index: number,
  query: string,
  answer: string,
  diagnostics: WriterTurnDiagnostics | null = null,
): WriterHistoryEntry {
  return {
    id: String(index),
    conversation_id: "test-conversation",
    query,
    answer,
    diagnostics,
    inputs: { contents: query },
    created_at: index,
  }
}

function createRuntime(options: {
  extractBrief: (...args: any[]) => Promise<any> | any
  onGenerate?: (compiledPrompt: string) => void
  draftAnswer?: string
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
        answer: options.draftAnswer || "# Draft\n\nGenerated body.",
        diagnostics: {
          ...baseDiagnostics,
          routing: createRouting(),
        },
      }
    },
  }
}

function toPlainLengthText(markdown: string) {
  return markdown
    .replace(/^writer-asset:\/\/[^\r\n]+$/gimu, " ")
    .replace(/writer-asset:\/\/[^\s)]+/gimu, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/gimu, " ")
    .replace(/[`*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

test("clarification asks only one missing item early in the briefing flow", async () => {
  const result = await runWriterSkillsTurnWithRuntime(
    {
      query: "Write a WeChat article about AI sales automation.",
      platform: "wechat",
      mode: "article",
      preferredLanguage: "en",
      conversationStatus: "drafting",
      history: [],
    },
    createRuntime({
      extractBrief: async () => ({
        resolvedBrief: {
          topic: "AI sales automation",
          audience: "",
          objective: "",
          tone: "",
          constraints: "",
        },
        routingDecision: createRouting(),
        answeredFields: ["topic"],
        suggestedFollowUpFields: ["audience", "objective"],
        suggestedFollowUpQuestion: "Who is this article for and what should it achieve?",
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
          selectedSkillLabel: "Global social",
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

test("colloquial audience reply is captured without polluting topic and routing stays locked", async () => {
  const priorDiagnostics: WriterTurnDiagnostics = {
    ...baseDiagnostics,
    routing: createRouting({
      contentType: "social_cn",
      targetPlatform: "WeChat Official Account",
      outputForm: "WeChat Official Account native post",
      lengthTarget: "platform-native medium length",
      renderPlatform: "wechat",
      renderMode: "article",
      selectedSkillId: "social_cn",
      selectedSkillLabel: "Chinese social",
    }),
  }

  const result = await runWriterSkillsTurnWithRuntime(
    {
      query: "主要是喜欢AI的小白看的",
      platform: "wechat",
      mode: "article",
      preferredLanguage: "zh",
      conversationStatus: "drafting",
      history: [
        createHistoryEntry(
          1,
          "对 GTC 2026 大会进行介绍，特别是黄仁勋的 AI 和 token 演讲总结，写一篇微信公众号文章",
          "这篇文章主要是写给谁看的？",
          priorDiagnostics,
        ),
      ],
    },
    createRuntime({
      extractBrief: async () => null,
    }),
  )

  assert.equal(result.outcome, "needs_clarification")
  assert.match(result.brief.topic, /AI 和 token 演讲总结/)
  assert.doesNotMatch(result.brief.topic, /喜欢AI的小白/)
  assert.equal(result.brief.audience, "喜欢AI的小白")
  assert.equal(result.routing.contentType, "social_cn")
  assert.equal(result.routing.targetPlatform, "WeChat Official Account")
  assert.doesNotMatch(result.answer, /写给谁看/)
  assert.match(result.answer, /达成什么结果|结果|目标/)
})

test("rich first message drafts immediately when the brief is already sufficient", async () => {
  const result = await runWriterSkillsTurnWithRuntime(
    {
      query:
        "Write a WeChat article for manufacturing founders about AI sales automation, focused on how it improves lead conversion efficiency and drives more demo requests with a professional and restrained tone.",
      platform: "wechat",
      mode: "article",
      preferredLanguage: "en",
      conversationStatus: "drafting",
      history: [],
    },
    createRuntime({
      extractBrief: async () => ({
        resolvedBrief: {
          topic: "AI sales automation for lead conversion efficiency",
          audience: "manufacturing founders",
          objective: "drive more demo requests",
          tone: "professional and restrained",
          constraints: "",
        },
        routingDecision: createRouting(),
        answeredFields: ["topic", "audience", "objective", "tone"],
        suggestedFollowUpFields: [],
        suggestedFollowUpQuestion: "",
        userWantsDirectOutput: false,
        briefSufficient: true,
        confidence: 0.93,
      }),
    }),
  )

  assert.equal(result.outcome, "draft_ready")
  assert.equal(result.brief.audience, "manufacturing founders")
  assert.equal(result.brief.objective, "drive more demo requests")
})

test("preloaded brief supports one-shot drafting without clarification", async () => {
  const result = await runWriterSkillsTurnWithRuntime(
    {
      query: "Use the preloaded brief and write the article.",
      preloadedBrief: {
        topic: "AI sales automation",
        audience: "factory owners",
        objective: "drive consultation requests",
        tone: "professional and restrained",
      },
      platform: "wechat",
      mode: "article",
      preferredLanguage: "en",
      conversationStatus: "drafting",
      history: [],
    },
    createRuntime({
      extractBrief: async () => null,
    }),
  )

  assert.equal(result.outcome, "draft_ready")
  assert.equal(result.brief.topic, "AI sales automation")
  assert.equal(result.brief.audience, "factory owners")
  assert.equal(result.brief.objective, "drive consultation requests")
})

test("revision keeps prior hard length target and compresses an oversized X post", async () => {
  const priorDiagnostics: WriterTurnDiagnostics = {
    ...baseDiagnostics,
    routing: createRouting({
      contentType: "social_global",
      targetPlatform: "X",
      outputForm: "X native post",
      lengthTarget: "100 words",
      renderPlatform: "x",
      renderMode: "article",
      selectedSkillId: "social_global",
      selectedSkillLabel: "Global social",
    }),
  }

  const result = await runWriterSkillsTurnWithRuntime(
    {
      query: "Still too long for X.",
      platform: "x",
      mode: "article",
      preferredLanguage: "en",
      conversationStatus: "text_ready",
      history: [
        createHistoryEntry(
          1,
          "Make the above article into a 100-word X post about Jensen Huang's token thesis.",
          "Initial X draft",
          priorDiagnostics,
        ),
      ],
    },
    createRuntime({
      extractBrief: async () => null,
      draftAnswer:
        "writer-asset://cover\n\nJensen Huang says token economics will reshape AI, but the current draft keeps repeating the same idea across multiple paragraphs, drifts into side arguments about data centers, robotics, compute supply, and infrastructure strategy, and ends up far beyond what a single X post can carry comfortably. The core point is simpler: compute is the factory, tokens are the output, and lower token cost makes intelligence cheaper and more scalable across software and physical systems. That shift matters because AI is moving from demos to industrial production, and the economics of token generation will define the next wave of competition. #AI #GTC #JensenHuang #TokenEconomy",
    }),
  )

  assert.equal(result.outcome, "draft_ready")
  assert.equal(result.routing.targetPlatform, "X")
  assert.equal(result.routing.lengthTarget, "100 words")
  assert.ok(toPlainLengthText(result.answer).split(/\s+/u).filter(Boolean).length <= 100)
})
