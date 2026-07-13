import assert from "node:assert/strict"
import test from "node:test"

import { previewRequestSchema } from "./types.js"

test("worker preview schema accepts official ppt-master layout ids", () => {
  const parsed = previewRequestSchema.parse({
    requestId: "req_layout_template",
    prompt: "Build an academic defense deck",
    scenario: "training",
    language: "zh-CN",
    preferredProviderId: "enterprise-openai-compatible",
    templateMode: "single-template",
    templateId: "academic_defense",
    allowMockFallback: false,
    runtimeProfile: "railway-linux",
  })

  assert.equal(parsed.templateId, "academic_defense")
  assert.equal(parsed.preferredProviderId, "enterprise-openai-compatible")
})

test("worker preview schema accepts official ppt-master example ids", () => {
  const parsed = previewRequestSchema.parse({
    requestId: "req_example_template",
    prompt: "Build a tech company introduction deck",
    scenario: "sales-deck",
    language: "zh-CN",
    templateMode: "single-template",
    templateId: "ppt169_general_dark_tech_claude_code_auto_mode",
    allowMockFallback: false,
    runtimeProfile: "railway-linux",
  })

  assert.equal(parsed.templateId, "ppt169_general_dark_tech_claude_code_auto_mode")
})

test("worker preview schema accepts pptoken GPT-5.6 Sol as a remote worker model", () => {
  const parsed = previewRequestSchema.parse({
    requestId: "req_deepseek_v4_pro",
    prompt: "Build a tech company introduction deck",
    scenario: "sales-deck",
    language: "zh-CN",
    model: "gpt-5.6-sol",
    templateMode: "single-template",
    templateId: "ppt169_general_dark_tech_claude_code_auto_mode",
    allowMockFallback: false,
    runtimeProfile: "railway-linux",
  })

  assert.equal(parsed.model, "gpt-5.6-sol")
})

test("worker preview schema accepts pptoken GPT-5.4 as a remote worker model", () => {
  const parsed = previewRequestSchema.parse({
    requestId: "req_gpt_5_4",
    prompt: "Build a tech company introduction deck",
    scenario: "sales-deck",
    language: "zh-CN",
    model: "gpt-5.4",
    templateMode: "single-template",
    templateId: "ppt169_general_dark_tech_claude_code_auto_mode",
    allowMockFallback: false,
    runtimeProfile: "railway-linux",
  })

  assert.equal(parsed.model, "gpt-5.4")
})

test("worker preview schema accepts DeepSeek v4 flash", () => {
  const parsed = previewRequestSchema.parse({
    requestId: "req_deepseek_v4_flash",
    prompt: "Build a tech company introduction deck",
    scenario: "sales-deck",
    language: "zh-CN",
    model: "deepseek-v4-flash",
    templateMode: "single-template",
    templateId: "ppt169_general_dark_tech_claude_code_auto_mode",
    allowMockFallback: false,
    runtimeProfile: "railway-linux",
  })

  assert.equal(parsed.model, "deepseek-v4-flash")
})

test("worker preview schema normalizes the legacy OpenAI mini model alias", () => {
  const parsed = previewRequestSchema.parse({
    requestId: "req_openai_gpt_5_4_mini",
    prompt: "Build a tech company introduction deck",
    scenario: "sales-deck",
    language: "zh-CN",
    model: "openai/gpt-5.4-mini",
    templateMode: "single-template",
    templateId: "ppt169_general_dark_tech_claude_code_auto_mode",
    allowMockFallback: false,
    runtimeProfile: "railway-linux",
  })

  assert.equal(parsed.model, "deepseek-v4-pro")
})

test("worker preview schema accepts explicit runtime slide overrides", () => {
  const parsed = previewRequestSchema.parse({
    requestId: "req_runtime_slide_override",
    prompt: "Build a tech company introduction deck",
    scenario: "sales-deck",
    language: "zh-CN",
    runtimeSlideModel: "gpt-5.4",
    runtimeSlideProvider: "pptoken",
    templateMode: "single-template",
    templateId: "ppt169_general_dark_tech_claude_code_auto_mode",
    allowMockFallback: false,
    runtimeProfile: "railway-linux",
  })

  assert.equal(parsed.runtimeSlideModel, "gpt-5.4")
  assert.equal(parsed.runtimeSlideProvider, "pptoken")
})

test("worker preview schema still rejects unknown template ids", () => {
  assert.throws(
    () =>
      previewRequestSchema.parse({
        requestId: "req_unknown_template",
        prompt: "Build a deck",
        scenario: "training",
        language: "zh-CN",
        templateMode: "single-template",
        templateId: "not-a-template",
        allowMockFallback: false,
        runtimeProfile: "railway-linux",
      }),
    /Unknown PPT template/,
  )
})
