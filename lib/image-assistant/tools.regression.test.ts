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

test.before(async () => {
  ;({ planImageAssistantTurn } = await import("./tools"))
})

test.beforeEach(() => {
  plannerCalls = 0
  structuredCalls = 0
  textCalls = 0
  structuredShouldThrow = false
  structuredFailFirstCallWithUserNotFound = false
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
  assert.equal(result.orchestration.ready_for_generation, false)
  assert.equal(result.orchestration.selected_skill.id, "graphic-design-brief")
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
