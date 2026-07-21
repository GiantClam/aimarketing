import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load
const originalPlannerFallbackModels = process.env.IMAGE_ASSISTANT_PLANNER_FALLBACK_MODELS
const originalPlannerMaxAttempts = process.env.IMAGE_ASSISTANT_PLANNER_MAX_MODEL_ATTEMPTS

process.env.IMAGE_ASSISTANT_PLANNER_FALLBACK_MODELS = "openai/gpt-4o-mini"
process.env.IMAGE_ASSISTANT_PLANNER_MAX_MODEL_ATTEMPTS = "3"

let plannerCalls = 0
let structuredCalls = 0
let textCalls = 0
let structuredShouldThrow = false
let structuredFailFirstCallWithUserNotFound = false
let structuredFailFirstCallWithTimeout = false
let plannerModelHistory: string[] = []
let mockedPlannerResponse = JSON.stringify({
  brief_delta: {
    goal: "Launch homepage visual",
    subject: "Modern AI workflow illustration",
    style: "Crisp editorial product art",
    composition: "16:9 hero with safe whitespace for headline",
    constraints: "",
  },
  missing_fields: [],
  conflicts: [],
  confidence: 0.92,
  next_question: "",
  ready_for_generation: true,
})

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only") {
    return {}
  }
  if (request === "@/lib/writer/aiberm") {
    return {
      hasWriterTextProvider: () => true,
      generateStructuredObjectWithWriterModel: async (params: { model?: string }) => {
        structuredCalls += 1
        plannerModelHistory.push(`structured:${params?.model || ""}`)
        if (structuredFailFirstCallWithUserNotFound && structuredCalls === 1) {
          throw new Error("User not found.")
        }
        if (structuredFailFirstCallWithTimeout && structuredCalls === 1) {
          throw new Error("writer_request_timeout")
        }
        if (structuredShouldThrow) {
          throw new Error("tool not supported")
        }
        plannerCalls += 1
        return JSON.parse(mockedPlannerResponse)
      },
      generateTextWithWriterModel: async (_systemPrompt: string, _userPrompt: string, model?: string) => {
        textCalls += 1
        plannerModelHistory.push(`text:${model || ""}`)
        plannerCalls += 1
        return mockedPlannerResponse
      },
    }
  }
  if (request === "@/lib/image-assistant/skill-documents") {
    return {
      getImageAssistantAgentMetadata: async (_skillId: string, fallback: any) => fallback,
      getImageAssistantFailureChecks: async () => [],
      getImageAssistantPromptCompositionRules: async () => [],
      getImageAssistantRuntimeSystemPrompt: async (_skillId: string, fallback: string) => fallback,
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

let planImageAssistantTurn: (...args: any[]) => Promise<any>
let buildWorkflowImageRuntimeTurn: (...args: any[]) => Promise<any>
let buildImageAssistantConversationContext: (...args: any[]) => string

test.before(async () => {
  ;({ planImageAssistantTurn, buildWorkflowImageRuntimeTurn, buildImageAssistantConversationContext } = await import("./tools"))
})

test.beforeEach(() => {
  plannerCalls = 0
  structuredCalls = 0
  textCalls = 0
  structuredShouldThrow = false
  structuredFailFirstCallWithUserNotFound = false
  structuredFailFirstCallWithTimeout = false
  plannerModelHistory = []
  mockedPlannerResponse = JSON.stringify({
    brief_delta: {
      goal: "Launch homepage visual",
      subject: "Modern AI workflow illustration",
      style: "Crisp editorial product art",
      composition: "16:9 hero with safe whitespace for headline",
      constraints: "",
    },
    missing_fields: [],
    conflicts: [],
    confidence: 0.92,
    next_question: "",
    ready_for_generation: true,
  })
})

test.after(() => {
  nodeModule._load = originalLoad
  if (typeof originalPlannerFallbackModels === "string") {
    process.env.IMAGE_ASSISTANT_PLANNER_FALLBACK_MODELS = originalPlannerFallbackModels
  } else {
    delete process.env.IMAGE_ASSISTANT_PLANNER_FALLBACK_MODELS
  }
  if (typeof originalPlannerMaxAttempts === "string") {
    process.env.IMAGE_ASSISTANT_PLANNER_MAX_MODEL_ATTEMPTS = originalPlannerMaxAttempts
  } else {
    delete process.env.IMAGE_ASSISTANT_PLANNER_MAX_MODEL_ATTEMPTS
  }
})

test("planner can promote a complete brief into execution", async () => {
  const result = await planImageAssistantTurn({
    prompt: "Create a website homepage image for an AI workflow launch",
    currentBrief: {
      usage_preset: "website_banner",
      usage_label: "Website banner",
      orientation: "landscape",
      resolution: "2K",
      size_preset: "16:9",
      ratio_confirmed: true,
    },
    previousState: null,
    taskType: "generate",
    sizePreset: "16:9",
    resolution: "2K",
    referenceCount: 0,
  })

  assert.equal(plannerCalls, 1)
  assert.equal(structuredCalls, 1)
  assert.equal(textCalls, 0)
  assert.equal(result.orchestration.planner_strategy, "text_model")
  assert.equal(result.orchestration.ready_for_generation, true)
  assert.equal(result.orchestration.selected_skill.id, "canvas-design-execution")
  assert.equal(result.orchestration.schema_version, "image_assistant_brief_extract.v1")
  assert.equal(result.orchestration.prompt_version, "image_assistant_prompt_compose.v1")
  assert.ok(typeof result.orchestration.generated_prompt === "string" && result.orchestration.generated_prompt.length > 0)
  assert.ok(result.orchestration.generated_prompt?.includes("Design objective:"))
})

test("workflow runtime turn bypasses clarification and composes a generation prompt from defaults", async () => {
  const result = await buildWorkflowImageRuntimeTurn({
    prompt: "生成一张适合广告投放的沙滩日落主视觉海报，人物站在海边，氛围高级自然",
    currentBrief: {
      subject: "沙滩日落场景中的人物主视觉",
    },
    taskType: "generate",
    sizePreset: "4:3",
    resolution: "2K",
    referenceCount: 0,
  })

  assert.equal(result.orchestration.ready_for_generation, true)
  assert.deepEqual(result.orchestration.missing_fields, [])
  assert.equal(result.orchestration.brief.size_preset, "4:3")
  assert.equal(result.orchestration.brief.usage_preset, "ad_poster")
  assert.ok(typeof result.orchestration.generated_prompt === "string" && result.orchestration.generated_prompt.length > 0)
})

test("workflow runtime image prompts stay within the provider limit", async () => {
  const result = await buildWorkflowImageRuntimeTurn({
    prompt: "E2E workflow image prompt ".repeat(500),
    taskType: "generate",
    sizePreset: "1:1",
    resolution: "1K",
    referenceCount: 0,
  })

  assert.ok((result.orchestration.generated_prompt?.length || 0) <= 2000)
})

test("falls back to text JSON extraction when structured tool-call is unsupported", async () => {
  structuredShouldThrow = true
  const result = await planImageAssistantTurn({
    prompt: "Create a website homepage image for product launch",
    currentBrief: {
      usage_preset: "website_banner",
      usage_label: "Website banner",
      orientation: "landscape",
      resolution: "2K",
      size_preset: "16:9",
      ratio_confirmed: true,
    },
    previousState: null,
    taskType: "generate",
    sizePreset: "16:9",
    resolution: "2K",
    referenceCount: 0,
  })

  assert.equal(structuredCalls, 1)
  assert.equal(textCalls, 1)
  assert.equal(result.orchestration.planner_strategy, "text_model")
  assert.equal(result.orchestration.ready_for_generation, true)
})

test("planner retries with another model when first planner model returns user not found", async () => {
  structuredFailFirstCallWithUserNotFound = true
  const result = await planImageAssistantTurn({
    prompt: "Create a website homepage image for an AI workflow launch",
    currentBrief: {
      usage_preset: "website_banner",
      usage_label: "Website banner",
      orientation: "landscape",
      resolution: "2K",
      size_preset: "16:9",
      ratio_confirmed: true,
    },
    previousState: null,
    taskType: "generate",
    sizePreset: "16:9",
    resolution: "2K",
    referenceCount: 0,
  })

  const structuredModels = plannerModelHistory
    .filter((entry) => entry.startsWith("structured:"))
    .map((entry) => entry.replace("structured:", ""))
  assert.ok(structuredCalls >= 2)
  assert.ok(new Set(structuredModels).size >= 2)
  assert.equal(result.orchestration.planner_strategy, "text_model")
  assert.equal(result.orchestration.ready_for_generation, true)
})

test("planner retries with another model when first planner model times out", async () => {
  structuredFailFirstCallWithTimeout = true
  const result = await planImageAssistantTurn({
    prompt: "Create a website homepage image for an AI workflow launch",
    currentBrief: {
      usage_preset: "website_banner",
      usage_label: "Website banner",
      orientation: "landscape",
      resolution: "2K",
      size_preset: "16:9",
      ratio_confirmed: true,
    },
    previousState: null,
    taskType: "generate",
    sizePreset: "16:9",
    resolution: "2K",
    referenceCount: 0,
  })

  const structuredModels = plannerModelHistory
    .filter((entry) => entry.startsWith("structured:"))
    .map((entry) => entry.replace("structured:", ""))
  assert.ok(structuredCalls >= 2)
  assert.ok(new Set(structuredModels).size >= 2)
  assert.equal(result.orchestration.planner_strategy, "text_model")
  assert.equal(result.orchestration.ready_for_generation, true)
})

test("hard reference edit shortcut still bypasses the planner model", async () => {
  const result = await planImageAssistantTurn({
    prompt: "remove the logo from the uploaded image",
    currentBrief: null,
    previousState: null,
    taskType: "edit",
    sizePreset: "16:9",
    resolution: "2K",
    referenceCount: 1,
  })

  assert.equal(plannerCalls, 0)
  assert.equal(result.orchestration.planner_strategy, "rule_shortcut")
  assert.equal(result.orchestration.ready_for_generation, true)
  assert.equal(result.orchestration.selected_skill.id, "canvas-design-execution")
})

test("guided brief can auto-complete style fallback and continue to generation", async () => {
  mockedPlannerResponse = JSON.stringify({
    brief_delta: {
      goal: "Ad poster 4:3",
      subject: "Black and red industrial lathe",
      style: "",
      composition: "Keep a centered hero product with text-safe whitespace.",
      constraints: "",
    },
    missing_fields: ["style"],
    conflicts: [],
    confidence: 0.7,
    next_question: "Please share the style.",
    ready_for_generation: false,
  })

  const result = await planImageAssistantTurn({
    prompt: "continue",
    currentBrief: {
      usage_preset: "ad_poster",
      usage_label: "Ad poster 4:3",
      orientation: "landscape",
      resolution: "2K",
      size_preset: "4:3",
      ratio_confirmed: true,
      goal: "Ad poster 4:3",
      subject: "Black and red industrial lathe",
      style: "",
      composition: "Keep a centered hero product with text-safe whitespace.",
    },
    previousState: null,
    taskType: "generate",
    sizePreset: "4:3",
    resolution: "2K",
    referenceCount: 0,
  })

  assert.equal(plannerCalls, 1)
  assert.equal(result.orchestration.missing_fields.includes("style"), false)
  assert.equal(result.orchestration.ready_for_generation, true)
  assert.equal(result.orchestration.selected_skill.id, "enterprise-ad-image")
  assert.ok(typeof result.orchestration.generated_prompt === "string" && result.orchestration.generated_prompt.length > 0)
})

test("planner recovers the latest subject from raw conversation context for continuation prompts", async () => {
  mockedPlannerResponse = JSON.stringify({
    brief_delta: {},
    missing_fields: [],
    conflicts: [],
    confidence: 0.8,
    next_question: "",
    ready_for_generation: true,
  })

  const conversationContext = buildImageAssistantConversationContext([
    {
      id: "message-1",
      session_id: "session-1",
      role: "user",
      message_type: "prompt",
      task_type: "generate",
      content: "User request: 生成美女图片\nRequested mode: generate",
      created_version_id: null,
      request_payload: null,
      response_payload: null,
      created_at: 1,
    },
    {
      id: "message-2",
      session_id: "session-1",
      role: "assistant",
      message_type: "note",
      task_type: "generate",
      content: "请确认画幅和风格。",
      created_version_id: null,
      request_payload: null,
      response_payload: null,
      created_at: 2,
    },
  ])

  const result = await planImageAssistantTurn({
    prompt: "继续生成",
    currentBrief: {
      usage_preset: "social_cover",
      usage_label: "社媒封面 4:5",
      orientation: "portrait",
      resolution: "2K",
      size_preset: "4:5",
      ratio_confirmed: true,
    },
    previousState: null,
    conversationContext,
    taskType: "generate",
    sizePreset: "4:5",
    resolution: "2K",
    referenceCount: 0,
  })

  assert.equal(result.orchestration.ready_for_generation, true)
  assert.match(result.orchestration.brief.subject, /美女/)
  assert.match(result.orchestration.generated_prompt || "", /美女/)
})

test("style continuation preserves the previous creative subject", async () => {
  mockedPlannerResponse = JSON.stringify({
    brief_delta: {
      goal: "Premium serum product visual",
      subject: "A premium facial serum bottle",
      style: "Premium minimalist brand visual",
      composition: "Centered product with generous whitespace",
      constraints: "",
    },
    missing_fields: [],
    conflicts: [],
    confidence: 0.9,
    next_question: "",
    ready_for_generation: true,
  })

  const result = await planImageAssistantTurn({
    prompt: "Transform the current image into a premium minimalist brand visual. Keep the key subject recognizable.",
    currentBrief: null,
    previousState: {
      brief: {
        usage_preset: "social_cover",
        usage_label: "Social cover 4:5",
        orientation: "portrait",
        resolution: "2K",
        size_preset: "4:5",
        ratio_confirmed: true,
        goal: "Generate a bikini woman playing beach volleyball",
        subject: "A bikini woman playing beach volleyball on a sunny beach",
        style: "",
        composition: "Portrait action shot with the player as the focal point",
        constraints: "",
      },
      missing_fields: ["style"],
      turn_count: 1,
      max_turns: 5,
      ready_for_generation: false,
      planner_strategy: "text_model",
      selected_skill: { id: "graphic-design-brief", label: "Graphic Design Brief", stage: "briefing" },
      tool_traces: [],
      reference_count: 0,
      recommended_mode: "generate",
      follow_up_question: "What style do you want?",
      prompt_questions: [],
      generated_prompt: null,
    },
    taskType: "generate",
    sizePreset: "4:5",
    resolution: "2K",
    referenceCount: 0,
  })

  assert.equal(result.orchestration.ready_for_generation, true)
  assert.equal(result.orchestration.brief.goal, "Generate a bikini woman playing beach volleyball")
  assert.equal(result.orchestration.brief.subject, "A bikini woman playing beach volleyball on a sunny beach")
  assert.match(result.orchestration.brief.style, /Premium minimalist/i)
  assert.match(result.orchestration.generated_prompt || "", /bikini woman playing beach volleyball/i)
  assert.doesNotMatch(result.orchestration.generated_prompt || "", /facial serum bottle/i)
})

test("completed ad brief routes to enterprise-ad-image", async () => {
  mockedPlannerResponse = JSON.stringify({
    brief_delta: {
      goal: "Campaign ad poster",
      subject: "Black and red industrial machine",
      style: "Premium industrial campaign visual",
      composition: "4:3 ad poster with center focal area and text-safe top zone",
      constraints: "Keep product geometry accurate",
    },
    missing_fields: [],
    conflicts: [],
    confidence: 0.95,
    next_question: "",
    ready_for_generation: true,
  })

  const result = await planImageAssistantTurn({
    prompt: "Create an ad poster for a machine campaign",
    currentBrief: {
      usage_preset: "ad_poster",
      usage_label: "Ad poster 4:3",
      orientation: "landscape",
      resolution: "2K",
      size_preset: "4:3",
      ratio_confirmed: true,
    },
    previousState: null,
    taskType: "generate",
    sizePreset: "4:3",
    resolution: "2K",
    referenceCount: 0,
  })

  assert.equal(plannerCalls, 1)
  assert.equal(result.orchestration.ready_for_generation, true)
  assert.equal(result.orchestration.selected_skill.id, "enterprise-ad-image")
  assert.ok(typeof result.orchestration.generated_prompt === "string" && result.orchestration.generated_prompt.length > 0)
})

test("one-shot prompt with ratio and resolution can skip guided Q1/Q2/Q3", async () => {
  mockedPlannerResponse = JSON.stringify({
    brief_delta: {
      goal: "Homepage hero visual",
      subject: "A red-black multi-head industrial lathe in a Tesla-like factory with one worker operating it",
      style: "Industrial cinematic look with cool contrast",
      composition: "16:9 landscape, centered focal machine with safe text area",
      constraints: "",
    },
    missing_fields: [],
    conflicts: [],
    confidence: 0.96,
    next_question: "",
    ready_for_generation: true,
  })

  const result = await planImageAssistantTurn({
    prompt: "Create a website banner 16:9 in 1K. Red-black multi-head lathe, Tesla-like factory, one worker operating it.",
    currentBrief: null,
    previousState: null,
    taskType: "generate",
    sizePreset: "16:9",
    resolution: "1K",
    referenceCount: 0,
  })

  assert.equal(plannerCalls, 1)
  assert.equal(result.orchestration.brief.usage_preset, "website_banner")
  assert.equal(result.orchestration.brief.orientation, "landscape")
  assert.equal(result.orchestration.brief.resolution, "1K")
  assert.equal(result.orchestration.brief.size_preset, "16:9")
  assert.equal(result.orchestration.brief.ratio_confirmed, true)
  assert.equal(result.orchestration.missing_fields.length, 0)
  assert.equal(result.orchestration.ready_for_generation, true)
  assert.ok(Array.isArray(result.orchestration.prompt_questions) && result.orchestration.prompt_questions.length === 0)
})

test("attached-reference generate respects explicit request resolution and ratio", async () => {
  mockedPlannerResponse = JSON.stringify({
    brief_delta: {
      goal: "Campaign poster from reference image",
      subject: "Reuse the uploaded reference image as the visual guide",
      style: "Premium campaign poster",
      composition: "4:5 vertical poster with clear headline-safe whitespace",
      constraints: "",
    },
    missing_fields: [],
    conflicts: [],
    confidence: 0.91,
    next_question: "",
    ready_for_generation: true,
  })

  const result = await planImageAssistantTurn({
    prompt: "Use this image as style reference and generate a new campaign poster",
    currentBrief: null,
    previousState: null,
    taskType: "generate",
    sizePreset: "4:5",
    resolution: "2K",
    referenceCount: 1,
  })

  assert.equal(result.orchestration.brief.resolution, "2K")
  assert.equal(result.orchestration.brief.size_preset, "4:5")
  assert.equal(result.orchestration.brief.ratio_confirmed, true)
  assert.equal(result.orchestration.missing_fields.includes("resolution"), false)
  assert.equal(result.orchestration.missing_fields.includes("ratio"), false)
  assert.equal(result.orchestration.ready_for_generation, true)
})

test("usage card selection does not overwrite an existing creative goal", async () => {
  mockedPlannerResponse = JSON.stringify({
    brief_delta: {},
    missing_fields: ["orientation", "resolution", "ratio", "style", "composition"],
    conflicts: [],
    confidence: 0.8,
    next_question: "Continue to the next step.",
    ready_for_generation: false,
  })

  const result = await planImageAssistantTurn({
    prompt: "Website banner 16:9",
    currentBrief: null,
    previousState: {
      brief: {
        usage_preset: "",
        usage_label: "",
        orientation: "",
        resolution: "",
        size_preset: "",
        ratio_confirmed: false,
        goal: "Launch visual that emphasizes premium industrial quality",
        subject: "Red-black multi-head lathe in a Tesla-like factory with one worker operating it",
        style: "",
        composition: "",
        constraints: "",
      },
      missing_fields: ["usage", "orientation", "resolution", "ratio", "style", "composition"],
      turn_count: 1,
      max_turns: 5,
      ready_for_generation: false,
      planner_strategy: "text_model",
      selected_skill: { id: "graphic-design-brief", label: "Graphic Design Brief", stage: "briefing" },
      tool_traces: [],
      reference_count: 0,
      recommended_mode: "generate",
      follow_up_question: "Q1 Pick the use case",
      prompt_questions: [
        {
          id: "usage",
          title: "Q1 Pick the use case",
          display: "cards",
          options: [
            {
              id: "website_banner",
              label: "Website banner 16:9",
              prompt_value: "Website banner 16:9",
              brief_patch: {
                usage_preset: "website_banner",
                usage_label: "Website banner 16:9",
                size_preset: "16:9",
                orientation: "landscape",
              },
              size_preset: "16:9",
            },
          ],
        },
      ],
      generated_prompt: null,
    },
    taskType: "generate",
    sizePreset: "16:9",
    resolution: "1K",
    referenceCount: 0,
  })

  assert.equal(result.orchestration.brief.goal, "Launch visual that emphasizes premium industrial quality")
  assert.equal(result.orchestration.brief.usage_preset, "website_banner")
  assert.equal(result.orchestration.brief.size_preset, "16:9")
  assert.equal(result.orchestration.brief.orientation, "landscape")
})

test("explicit ratio keeps delivery context aligned and generated prompt compact", async () => {
  mockedPlannerResponse = JSON.stringify({
    brief_delta: {
      usage_preset: "website_banner",
      usage_label: "Website banner 16:9",
      goal: "Generate a production-ready marketing image.",
      subject: "A red-and-black multi-head CNC machine operated by a worker inside a Tesla-style factory.",
      style: "Premium industrial campaign photography with realistic lighting and clean detail.",
      composition: "Vertical 4:5 hero poster with a strong focal hierarchy.",
      constraints: "",
    },
    missing_fields: [],
    conflicts: [],
    confidence: 0.93,
    next_question: "",
    ready_for_generation: true,
  })

  const result = await planImageAssistantTurn({
    prompt: [
      "Subject: A red-and-black multi-head CNC machine operated by a worker inside a Tesla-style factory.",
      "Style: Premium industrial campaign photography with realistic lighting and clean detail.",
      "Composition: Vertical 4:5 hero poster with a strong focal hierarchy.",
      "Resolution: 2K.",
      "Goal: Generate a production-ready marketing image.",
    ].join("\n"),
    currentBrief: null,
    previousState: null,
    taskType: "generate",
    sizePreset: "4:5",
    resolution: "2K",
    referenceCount: 0,
  })

  assert.equal(result.orchestration.brief.size_preset, "4:5")
  assert.equal(result.orchestration.brief.usage_preset, "social_cover")
  assert.ok(result.orchestration.generated_prompt?.includes("Delivery context: Social cover 4:5."))
  assert.equal(result.orchestration.generated_prompt?.includes("Website banner 16:9"), false)
  assert.ok((result.orchestration.generated_prompt?.length || 0) < 1800)
})

test("reference-edit prompts with long image urls do not overflow labeled-line parsing", async () => {
  const longSignedUrl = `https://cdn.example.com/generated/image-2.png?sig=${"a:b/".repeat(4000)}`

  const result = await planImageAssistantTurn({
    prompt: `将 ${longSignedUrl} 中的人物替换为 https://cdn.example.com/generated/image-3.png?token=stable 的人物，保留画面构图与风格。`,
    currentBrief: null,
    previousState: null,
    taskType: "edit",
    sizePreset: "16:9",
    resolution: "4K",
    referenceCount: 2,
  })

  assert.equal(result.orchestration.ready_for_generation, true)
  assert.ok((result.orchestration.generated_prompt?.length || 0) > 0)
})
