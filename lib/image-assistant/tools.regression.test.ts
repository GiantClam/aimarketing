import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let plannerCalls = 0
let mockedPlannerResponse = JSON.stringify({
  brief: {
    goal: "Launch campaign visual",
    subject: "Modern AI workflow illustration",
    style: "Crisp editorial product art",
    composition: "16:9 hero with safe whitespace for headline",
    constraints: "",
  },
  reply_to_user: "",
  generated_prompt: "Final generation prompt",
  missing_fields: [],
  ready_for_generation: true,
  selected_skill: "canvas-design-execution",
})

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only") {
    return {}
  }
  if (request === "@/lib/writer/aiberm") {
    return {
      hasWriterTextProvider: () => true,
      generateTextWithWriterModel: async () => {
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
  mockedPlannerResponse = JSON.stringify({
    brief: {
      goal: "Launch campaign visual",
      subject: "Modern AI workflow illustration",
      style: "Crisp editorial product art",
      composition: "16:9 hero with safe whitespace for headline",
      constraints: "",
    },
    reply_to_user: "",
    generated_prompt: "Final generation prompt",
    missing_fields: [],
    ready_for_generation: true,
    selected_skill: "canvas-design-execution",
  })
})

test("planner can promote a complete brief into execution skill selection", async () => {
  const result = await planImageAssistantTurn({
    prompt: "Create a website hero image for an AI workflow launch campaign",
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
  assert.equal(result.orchestration.planner_strategy, "text_model")
  assert.equal(result.orchestration.ready_for_generation, true)
  assert.equal(result.orchestration.selected_skill.id, "canvas-design-execution")
  assert.equal(result.orchestration.generated_prompt, "Final generation prompt")
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
    brief: {
      goal: "Ad poster 4:3",
      subject: "Black and red industrial lathe",
      style: "",
      composition: "Keep a centered hero product with text-safe whitespace.",
      constraints: "",
    },
    reply_to_user: "Please share the style.",
    generated_prompt: "",
    missing_fields: ["style"],
    ready_for_generation: false,
    selected_skill: "graphic-design-brief",
  })

  const result = await planImageAssistantTurn({
    prompt: "继续",
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

test("planner can explicitly route completed ad briefs to enterprise-ad-image", async () => {
  mockedPlannerResponse = JSON.stringify({
    brief: {
      goal: "Campaign ad poster",
      subject: "Black and red industrial machine",
      style: "Premium industrial campaign visual",
      composition: "4:3 ad poster with center focal area and text-safe top zone",
      constraints: "Keep product geometry accurate",
    },
    reply_to_user: "",
    generated_prompt: "Enterprise ad generation prompt",
    missing_fields: [],
    ready_for_generation: true,
    selected_skill: "enterprise-ad-image",
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
