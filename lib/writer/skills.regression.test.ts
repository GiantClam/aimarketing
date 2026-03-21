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
  ;({ runWriterSkillsTurnWithRuntime } = await import("./skills"))
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
  onGenerate?: (compiledPrompt: string, generationOptions?: any) => void
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
    generateDraft: async (compiledPrompt: string, _routing: any, _preferredLanguage: any, generationOptions?: any) => {
      options.onGenerate?.(compiledPrompt, generationOptions)
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

function createBriefExtraction(
  overrides: Partial<{
    resolvedBrief: {
      topic: string
      audience: string
      objective: string
      tone: string
      constraints: string
    }
    routingDecision: NonNullable<WriterTurnDiagnostics["routing"]>
    userWantsDirectOutput: boolean
    briefSufficient: boolean
    retrievalHints: {
      enterpriseKnowledgeNeeded: boolean
      freshResearchNeeded: boolean
      confidence: number
      reason: string
    }
    confidence: number
  }> = {},
) {
  return {
    resolvedBrief: {
      topic: "generic topic",
      audience: "generic audience",
      objective: "generic objective",
      tone: "professional",
      constraints: "",
      ...(overrides.resolvedBrief || {}),
    },
    routingDecision: overrides.routingDecision || createRouting(),
    answeredFields: ["topic", "audience", "objective", "tone"],
    suggestedFollowUpFields: [],
    suggestedFollowUpQuestion: "",
    userWantsDirectOutput: overrides.userWantsDirectOutput ?? false,
    briefSufficient: overrides.briefSufficient ?? true,
    retrievalHints: {
      enterpriseKnowledgeNeeded: false,
      freshResearchNeeded: false,
      confidence: 0.9,
      reason: "generic_writing",
      ...(overrides.retrievalHints || {}),
    },
    confidence: overrides.confidence ?? 0.9,
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
  assert.match(result.answer, /who is this article for/i)
  assert.match(result.answer, /what should it achieve/i)
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

test("model-authored follow-up question is used when clarification is still needed", async () => {
  const result = await runWriterSkillsTurnWithRuntime(
    {
      query: "Write something about AI outbound",
      platform: "wechat",
      mode: "article",
      preferredLanguage: "en",
      conversationStatus: "drafting",
      history: [],
    },
    createRuntime({
      extractBrief: async () => ({
        resolvedBrief: {
          topic: "AI outbound",
          audience: "",
          objective: "",
          tone: "",
          constraints: "",
        },
        routingDecision: createRouting(),
        answeredFields: ["topic"],
        suggestedFollowUpFields: ["audience", "objective"],
        suggestedFollowUpQuestion: "Who exactly is this for, and what should the piece make them do next?",
        userWantsDirectOutput: false,
        briefSufficient: false,
        confidence: 0.91,
      }),
    }),
  )

  assert.equal(result.outcome, "needs_clarification")
  assert.equal(result.answer, "Who exactly is this for, and what should the piece make them do next?")
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

test("multi-turn briefing returns a confirmation prompt before drafting", async () => {
  const result = await runWriterSkillsTurnWithRuntime(
    {
      query: "Professional and restrained.",
      platform: "wechat",
      mode: "article",
      preferredLanguage: "en",
      conversationStatus: "drafting",
      history: [
        createHistoryEntry(1, "Write about AI sales automation", "Who is it for?"),
        createHistoryEntry(2, "Factory owners", "What should it achieve?"),
      ],
    },
    createRuntime({
      extractBrief: async () => ({
        resolvedBrief: {
          topic: "AI sales automation",
          audience: "factory owners",
          objective: "drive consultation requests",
          tone: "professional and restrained",
          constraints: "",
        },
        routingDecision: createRouting(),
        answeredFields: ["audience", "objective", "tone"],
        suggestedFollowUpFields: [],
        suggestedFollowUpQuestion: "",
        userWantsDirectOutput: false,
        briefSufficient: true,
        confidence: 0.95,
      }),
    }),
  )

  assert.equal(result.outcome, "needs_clarification")
  assert.equal(result.selectedSkill.stage, "briefing")
  assert.match(result.answer, /confirm and write/i)
  assert.match(result.answer, /Suggested writing prompt:/)
})

test("second-turn follow-up completion returns confirmation prompt before drafting", async () => {
  const result = await runWriterSkillsTurnWithRuntime(
    {
      query:
        "Audience: overseas B2B buyers and sourcing managers. Objective: build trust and drive consultation. Tone: professional and trustworthy.",
      platform: "wechat",
      mode: "article",
      preferredLanguage: "en",
      conversationStatus: "drafting",
      history: [createHistoryEntry(1, "I want to write a WeChat article about our textile products.", "Who is the target audience, and what is the main goal of this article?")],
    },
    createRuntime({
      extractBrief: async () => ({
        resolvedBrief: {
          topic: "our textile products",
          audience: "overseas B2B buyers and sourcing managers",
          objective: "build trust and drive consultation",
          tone: "professional and trustworthy",
          constraints: "",
        },
        routingDecision: createRouting({
          contentType: "social_cn",
          targetPlatform: "WeChat Official Account",
          outputForm: "WeChat Official Account native post",
          lengthTarget: "platform-native medium length",
        }),
        answeredFields: ["audience", "objective", "tone"],
        suggestedFollowUpFields: [],
        suggestedFollowUpQuestion: "",
        userWantsDirectOutput: false,
        briefSufficient: true,
        confidence: 0.95,
      }),
    }),
  )

  assert.equal(result.outcome, "needs_clarification")
  assert.equal(result.selectedSkill.stage, "briefing")
  assert.match(result.answer, /confirm and write/i)
  assert.match(result.answer, /Topic: our textile products/i)
  assert.match(result.answer, /Audience: overseas B2B buyers and sourcing managers/i)
})

test("confirm-and-write keeps enterprise grounding on the final drafting turn", async () => {
  let generationOptions: any = null

  const result = await runWriterSkillsTurnWithRuntime(
    {
      query: "confirm and write",
      platform: "wechat",
      mode: "article",
      preferredLanguage: "en",
      conversationStatus: "drafting",
      enterpriseId: 45,
      history: [
        createHistoryEntry(
          1,
          "I want to write a WeChat Official Account article about our textile products.",
          "Who is the target audience, and what is the main goal of this article?",
        ),
        createHistoryEntry(
          2,
          "Audience: overseas B2B buyers and sourcing managers. Objective: build trust and drive consultation. Tone: professional and trustworthy.",
          'Here is my current understanding: Topic: our textile products; Audience: overseas B2B buyers and sourcing managers; Objective: build trust and drive consultation; Tone: professional and trustworthy. If this looks right, reply "confirm and write" or tell me what to change.',
        ),
      ],
    },
    createRuntime({
      extractBrief: async () => ({
        resolvedBrief: {
          topic: "our textile products",
          audience: "overseas B2B buyers and sourcing managers",
          objective: "build trust and drive consultation",
          tone: "professional and trustworthy",
          constraints: "",
        },
        routingDecision: createRouting({
          contentType: "social_cn",
          targetPlatform: "WeChat Official Account",
          outputForm: "WeChat Official Account native post",
          lengthTarget: "platform-native medium length",
        }),
        answeredFields: [],
        suggestedFollowUpFields: [],
        suggestedFollowUpQuestion: "",
        userWantsDirectOutput: false,
        briefSufficient: true,
        confidence: 0.95,
      }),
      onGenerate: (_prompt, options) => {
        generationOptions = options
      },
    }),
  )

  assert.equal(result.outcome, "draft_ready")
  assert.equal(generationOptions?.retrievalStrategy, "enterprise_grounded")
  assert.match(generationOptions?.researchQuery || "", /Topic: our textile products/)
  assert.match(generationOptions?.researchQuery || "", /Audience: overseas B2B buyers and sourcing managers/)
  assert.match(generationOptions?.researchQuery || "", /Objective: build trust and drive consultation/)
  assert.ok((generationOptions?.researchQuery || "").length <= 220)
  assert.ok((generationOptions?.enterpriseQueryVariants || []).every((variant: string) => variant.length <= 220))
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

test("generic writing request with an enterprise account skips enterprise retrieval by default", async () => {
  let generationOptions: any = null

  const result = await runWriterSkillsTurnWithRuntime(
    {
      query:
        "Write a WeChat article for startup operators about how to run better weekly planning meetings with a practical and concise tone.",
      platform: "wechat",
      mode: "article",
      preferredLanguage: "en",
      conversationStatus: "drafting",
      history: [],
      enterpriseId: 45,
    },
    createRuntime({
      extractBrief: async () => ({
        resolvedBrief: {
          topic: "how to run better weekly planning meetings",
          audience: "startup operators",
          objective: "teach a practical workflow",
          tone: "practical and concise",
          constraints: "",
        },
        routingDecision: createRouting(),
        answeredFields: ["topic", "audience", "objective", "tone"],
        suggestedFollowUpFields: [],
        suggestedFollowUpQuestion: "",
        userWantsDirectOutput: false,
        briefSufficient: true,
        retrievalHints: {
          enterpriseKnowledgeNeeded: false,
          freshResearchNeeded: false,
          confidence: 0.94,
          reason: "generic_writing",
        },
        confidence: 0.94,
      }),
      onGenerate: (_prompt, options) => {
        generationOptions = options
      },
    }),
  )

  assert.equal(result.outcome, "draft_ready")
  assert.equal(generationOptions?.retrievalStrategy, "no_retrieval")
})

test("retrieval hints can force enterprise grounding for product-intro requests", async () => {
  let generationOptions: any = null

  const result = await runWriterSkillsTurnWithRuntime(
    {
      query:
        "Write an English product overview email introducing multi-spindle engraving machines for procurement directors.",
      platform: "wechat",
      mode: "article",
      preferredLanguage: "en",
      conversationStatus: "drafting",
      history: [],
      enterpriseId: 46,
    },
    createRuntime({
      extractBrief: async () => ({
        resolvedBrief: {
          topic: "multi-spindle engraving machines",
          audience: "procurement directors",
          objective: "introduce the offer and drive replies",
          tone: "concise and professional",
          constraints: "",
        },
        routingDecision: createRouting({
          contentType: "email",
          targetPlatform: "Email",
          outputForm: "single email",
          lengthTarget: "120-220 words",
          renderPlatform: "generic",
          renderMode: "article",
          selectedSkillId: "email",
          selectedSkillLabel: "Email",
        }),
        answeredFields: ["topic", "audience", "objective", "tone"],
        suggestedFollowUpFields: [],
        suggestedFollowUpQuestion: "",
        userWantsDirectOutput: false,
        briefSufficient: true,
        retrievalHints: {
          enterpriseKnowledgeNeeded: true,
          freshResearchNeeded: false,
          confidence: 0.91,
          reason: "enterprise_fact_request",
        },
        confidence: 0.91,
      }),
      onGenerate: (_prompt, options) => {
        generationOptions = options
      },
    }),
  )

  assert.equal(result.outcome, "draft_ready")
  assert.equal(generationOptions?.retrievalStrategy, "enterprise_grounded")
})

test("explicit enterprise fact signals override model hints that incorrectly skip grounding", async () => {
  let generationOptions: any = null

  const result = await runWriterSkillsTurnWithRuntime(
    {
      query:
        "Write an English cold email introducing our textile products and manufacturing strengths to overseas buyers.",
      platform: "wechat",
      mode: "article",
      preferredLanguage: "en",
      conversationStatus: "drafting",
      history: [],
      enterpriseId: 45,
    },
    createRuntime({
      extractBrief: async () => ({
        resolvedBrief: {
          topic: "our textile products and manufacturing strengths",
          audience: "overseas buyers",
          objective: "build trust and drive replies",
          tone: "professional and concise",
          constraints: "",
        },
        routingDecision: createRouting({
          contentType: "email",
          targetPlatform: "Email",
          outputForm: "single email",
          lengthTarget: "120-220 words",
          renderPlatform: "generic",
          renderMode: "article",
          selectedSkillId: "email",
          selectedSkillLabel: "Email",
        }),
        answeredFields: ["topic", "audience", "objective", "tone"],
        suggestedFollowUpFields: [],
        suggestedFollowUpQuestion: "",
        userWantsDirectOutput: true,
        briefSufficient: true,
        retrievalHints: {
          enterpriseKnowledgeNeeded: false,
          freshResearchNeeded: false,
          confidence: 0.93,
          reason: "generic_writing",
        },
        confidence: 0.93,
      }),
      onGenerate: (_prompt, options) => {
        generationOptions = options
      },
    }),
  )

  assert.equal(result.outcome, "draft_ready")
  assert.equal(generationOptions?.retrievalStrategy, "enterprise_grounded")
})

test("generic linkedin post phrased as post for audience about topic drafts without retrieval", async () => {
  let generationOptions: any = null

  const result = await runWriterSkillsTurnWithRuntime(
    {
      query:
        "Write an English LinkedIn post for B2B sales leaders about how to improve discovery call preparation. Audience: sales leaders. Objective: share practical tips. Tone: concise and professional. Directly write it, no follow-up questions.",
      platform: "generic",
      mode: "article",
      preferredLanguage: "en",
      conversationStatus: "drafting",
      history: [],
      enterpriseId: 45,
    },
    createRuntime({
      extractBrief: async () => null,
      onGenerate: (_prompt, options) => {
        generationOptions = options
      },
    }),
  )

  assert.equal(result.outcome, "draft_ready")
  assert.equal(result.brief.topic, "how to improve discovery call preparation")
  assert.equal(result.brief.audience, "B2B sales leaders")
  assert.equal(generationOptions?.retrievalStrategy, "no_retrieval")
})

test("translation request with inline source text drafts immediately without clarification", async () => {
  let generationOptions: any = null
  let compiledPrompt = ""

  const result = await runWriterSkillsTurnWithRuntime(
    {
      query:
        "Translate this paragraph into English and keep it concise and professional: 我们专注于为制造业客户提供自动化设备解决方案，并提供持续的技术支持。",
      platform: "generic",
      mode: "article",
      preferredLanguage: "en",
      conversationStatus: "drafting",
      history: [],
      enterpriseId: 46,
    },
    createRuntime({
      extractBrief: async () => null,
      onGenerate: (prompt, options) => {
        compiledPrompt = prompt
        generationOptions = options
      },
    }),
  )

  assert.equal(result.outcome, "draft_ready")
  assert.equal(generationOptions?.retrievalStrategy, "rewrite_only")
  assert.match(compiledPrompt, /Source text to transform:/)
  assert.match(compiledPrompt, /Translate the provided source text directly/i)
  assert.match(compiledPrompt, /without adding a title, headings, or image placeholders unless requested/i)
  assert.match(compiledPrompt, /我们专注于为制造业客户提供自动化设备解决方案/u)
})

test("retrieval strategy matrix covers broader writer intents", async () => {
  const scenarios = [
    {
      name: "rewrite request stays rewrite_only",
      input: {
        query: "Rewrite this product intro email to sound more concise and professional.",
        enterpriseId: 45,
      },
      extraction: createBriefExtraction({
        resolvedBrief: {
          topic: "product intro email rewrite",
          audience: "procurement directors",
          objective: "make the copy cleaner",
          tone: "concise and professional",
          constraints: "",
        },
      }),
      expected: "rewrite_only",
    },
    {
      name: "translation request stays rewrite_only",
      input: {
        query: "Translate this landing page paragraph into English and keep the tone natural.",
        enterpriseId: 45,
      },
      extraction: createBriefExtraction({
        resolvedBrief: {
          topic: "landing page paragraph translation",
          audience: "overseas buyers",
          objective: "translate existing copy",
          tone: "natural and clear",
          constraints: "",
        },
      }),
      expected: "rewrite_only",
    },
    {
      name: "latest-trend prompt uses fresh_external",
      input: {
        query:
          "Write a LinkedIn post about the latest 2026 AI sales automation trends for revenue leaders.",
        enterpriseId: 45,
      },
      extraction: createBriefExtraction({
        resolvedBrief: {
          topic: "the latest 2026 AI sales automation trends",
          audience: "revenue leaders",
          objective: "summarize current market changes",
          tone: "insightful and concise",
          constraints: "",
        },
        routingDecision: createRouting({
          contentType: "social_global",
          targetPlatform: "LinkedIn",
          outputForm: "LinkedIn native post",
          lengthTarget: "platform-native medium length",
          renderPlatform: "linkedin",
          renderMode: "article",
          selectedSkillId: "social_global",
          selectedSkillLabel: "Global Social",
        }),
        retrievalHints: {
          enterpriseKnowledgeNeeded: false,
          freshResearchNeeded: true,
          confidence: 0.95,
          reason: "fresh_research_request",
        },
      }),
      expected: "fresh_external",
    },
    {
      name: "explicit knowledge-base wording forces enterprise grounding",
      input: {
        query: "Write a company overview based on our knowledge base and official company info.",
        enterpriseId: 45,
      },
      extraction: createBriefExtraction({
        resolvedBrief: {
          topic: "company overview",
          audience: "overseas buyers",
          objective: "build trust",
          tone: "professional",
          constraints: "",
        },
        retrievalHints: {
          enterpriseKnowledgeNeeded: false,
          freshResearchNeeded: false,
          confidence: 0.92,
          reason: "generic_writing",
        },
      }),
      expected: "enterprise_grounded",
    },
    {
      name: "enterprise plus latest market angle uses hybrid grounding",
      input: {
        query:
          "Write a market update using the latest robotics manufacturing trends and our company positioning.",
        enterpriseId: 46,
      },
      extraction: createBriefExtraction({
        resolvedBrief: {
          topic: "latest robotics manufacturing trends and our company positioning",
          audience: "industrial distributors",
          objective: "show why our offer matters now",
          tone: "authoritative",
          constraints: "",
        },
        retrievalHints: {
          enterpriseKnowledgeNeeded: true,
          freshResearchNeeded: true,
          confidence: 0.96,
          reason: "hybrid_grounding_request",
        },
      }),
      expected: "hybrid_grounded",
    },
    {
      name: "generic website copy for enterprise account still skips retrieval",
      input: {
        query: "Write homepage hero copy for a SaaS analytics startup.",
        enterpriseId: 45,
      },
      extraction: createBriefExtraction({
        resolvedBrief: {
          topic: "homepage hero copy",
          audience: "SaaS founders",
          objective: "improve conversion",
          tone: "clear and sharp",
          constraints: "",
        },
        routingDecision: createRouting({
          contentType: "website_copy",
          targetPlatform: "Website",
          outputForm: "homepage copy",
          lengthTarget: "page-section length with scannable blocks",
          renderPlatform: "generic",
          renderMode: "article",
          selectedSkillId: "website_copy",
          selectedSkillLabel: "Website Copy",
        }),
      }),
      expected: "no_retrieval",
    },
  ] as const

  for (const scenario of scenarios) {
    let generationOptions: any = null

    const result = await runWriterSkillsTurnWithRuntime(
      {
        query: scenario.input.query,
        platform: "generic",
        mode: "article",
        preferredLanguage: "en",
        conversationStatus: "drafting",
        history: [],
        enterpriseId: scenario.input.enterpriseId,
      },
      createRuntime({
        extractBrief: async () => scenario.extraction,
        onGenerate: (_prompt, options) => {
          generationOptions = options
        },
      }),
    )

    assert.equal(result.outcome, "draft_ready", scenario.name)
    assert.equal(generationOptions?.retrievalStrategy, scenario.expected, scenario.name)
  }
})

test("english Topic/Audience labels are enough to draft immediately without model extraction", async () => {
  let compiledPrompt = ""
  let generationOptions: any = null

  const result = await runWriterSkillsTurnWithRuntime(
    {
      query: [
        "Write a WeChat Official Account article.",
        "Topic: Introduce our company's core textile product lines and overseas B2B differentiators.",
        "Audience: overseas B2B buyers and sourcing managers.",
        "Objective: build initial trust and drive consultation.",
        "Tone: professional and trustworthy.",
      ].join(" "),
      platform: "wechat",
      mode: "article",
      preferredLanguage: "en",
      conversationStatus: "drafting",
      history: [],
      enterpriseId: 45,
    },
    createRuntime({
      extractBrief: async () => null,
      onGenerate: (prompt, options) => {
        compiledPrompt = prompt
        generationOptions = options
      },
    }),
  )

  assert.equal(result.outcome, "draft_ready")
  assert.equal(result.brief.topic, "Introduce our company's core textile product lines and overseas B2B differentiators")
  assert.equal(result.brief.audience, "overseas B2B buyers and sourcing managers")
  assert.equal(result.brief.objective, "build initial trust and drive consultation")
  assert.match(result.brief.tone, /professional and trustworthy/i)
  assert.equal(generationOptions?.enterpriseId, 45)
  assert.equal(generationOptions?.retrievalStrategy, "enterprise_grounded")
  assert.match(generationOptions?.researchQuery || "", /core textile product lines/i)
  assert.match(compiledPrompt, /Target audience: overseas B2B buyers and sourcing managers/i)
})

test("introducing-pattern prompts infer topic and explicit no-follow-up wording skips clarification", async () => {
  let generationOptions: any = null

  const result = await runWriterSkillsTurnWithRuntime(
    {
      query:
        "Write an English cold email to precision manufacturing buyers introducing our multi-spindle engraving machines, multi-spindle machining centers, and smart equipment solutions. Audience: procurement directors and factory owners. Objective: book a meeting. Tone: concise and professional. Output the full draft now without follow-up questions.",
      platform: "wechat",
      mode: "article",
      preferredLanguage: "en",
      conversationStatus: "drafting",
      history: [],
      enterpriseId: 46,
    },
    createRuntime({
      extractBrief: async () => null,
      onGenerate: (_prompt, options) => {
        generationOptions = options
      },
    }),
  )

  assert.equal(result.outcome, "draft_ready")
  assert.equal(result.routing.contentType, "email")
  assert.equal(result.routing.targetPlatform, "Email")
  assert.match(result.brief.topic, /multi-spindle engraving machines/i)
  assert.equal(result.brief.audience, "procurement directors and factory owners")
  assert.equal(result.brief.objective, "book a meeting")
  assert.deepEqual(generationOptions?.preferredEnterpriseScopes, ["general", "product"])
  assert.ok(Array.isArray(generationOptions?.enterpriseQueryVariants))
  assert.ok((generationOptions?.enterpriseQueryVariants || []).length >= 1)
  assert.ok((generationOptions?.enterpriseQueryVariants || []).every((variant: string) => variant.length <= 220))
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

test("new standalone request after a finished draft does not inherit the previous wechat route", async () => {
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
      query: "Write an English cold email for operations leaders about AI sales automation.",
      platform: "wechat",
      mode: "article",
      preferredLanguage: "en",
      conversationStatus: "text_ready",
      history: [
        createHistoryEntry(1, "写一篇公众号文章，主题是 AI 销售自动化。", "已生成公众号文章。", priorDiagnostics),
      ],
    },
    createRuntime({
      extractBrief: async () => null,
    }),
  )

  assert.equal(result.outcome, "draft_ready")
  assert.equal(result.routing.contentType, "email")
  assert.equal(result.routing.targetPlatform, "Email")
  assert.equal(result.routing.renderPlatform, "generic")
  assert.equal(result.routing.outputForm, "single email")
})

test("explicit platform switch in a rewrite request does not inherit the prior X route", async () => {
  const priorDiagnostics: WriterTurnDiagnostics = {
    ...baseDiagnostics,
    routing: createRouting({
      contentType: "social_global",
      targetPlatform: "X",
      outputForm: "X multi-part post",
      lengthTarget: "5-10 short segments",
      renderPlatform: "x",
      renderMode: "thread",
      selectedSkillId: "social_global",
      selectedSkillLabel: "Global social",
    }),
  }
  let generationOptions: any = null

  const result = await runWriterSkillsTurnWithRuntime(
    {
      query:
        "Now switch this to Xiaohongshu, rewrite it in Simplified Chinese, and make the tone more conversational while keeping the same topic.",
      platform: "generic",
      mode: "article",
      preferredLanguage: "auto",
      conversationStatus: "text_ready",
      history: [
        createHistoryEntry(
          1,
          "Write an English Twitter thread for B2B sales leaders about how to improve follow-up emails.",
          [
            "### Segment 1",
            "",
            "Most B2B follow-ups are just digital noise. Here are 5 practical ways to fix your follow-up game.",
            "",
            "### Segment 2",
            "",
            "Add value in every follow-up instead of just checking in.",
          ].join("\n"),
          priorDiagnostics,
        ),
      ],
    },
    createRuntime({
      extractBrief: async () => null,
      onGenerate: (_prompt, options) => {
        generationOptions = options
      },
    }),
  )

  assert.equal(result.outcome, "draft_ready")
  assert.equal(result.routing.contentType, "social_cn")
  assert.equal(result.routing.targetPlatform, "Xiaohongshu")
  assert.equal(result.routing.renderPlatform, "xiaohongshu")
  assert.equal(result.routing.outputForm, "Xiaohongshu native post")
  assert.equal(generationOptions?.retrievalStrategy, "rewrite_only")
})
