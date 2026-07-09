import assert from "node:assert/strict"
import test from "node:test"

import { previewRequestSchema } from "./types.js"

test("worker preview schema accepts expanded ppt-master template ids", () => {
  const parsed = previewRequestSchema.parse({
    requestId: "req_expanded_template",
    prompt: "Build an academic defense deck",
    scenario: "training",
    language: "zh-CN",
    templateMode: "single-template",
    templateId: "academic-defense",
    allowMockFallback: false,
    runtimeProfile: "railway-linux",
  })

  assert.equal(parsed.templateId, "academic-defense")
})

test("worker preview schema accepts vendor ppt-master template ids", () => {
  const parsed = previewRequestSchema.parse({
    requestId: "req_vendor_template",
    prompt: "Build a tech company introduction deck",
    scenario: "sales-deck",
    language: "zh-CN",
    templateMode: "single-template",
    templateId: "smart_red",
    allowMockFallback: false,
    runtimeProfile: "railway-linux",
  })

  assert.equal(parsed.templateId, "smart_red")
})

test("worker preview schema accepts DeepSeek v4 pro as a remote worker model", () => {
  const parsed = previewRequestSchema.parse({
    requestId: "req_deepseek_v4_pro",
    prompt: "Build a tech company introduction deck",
    scenario: "sales-deck",
    language: "zh-CN",
    model: "deepseek-v4-pro",
    templateMode: "single-template",
    templateId: "smart_red",
    allowMockFallback: false,
    runtimeProfile: "railway-linux",
  })

  assert.equal(parsed.model, "deepseek-v4-pro")
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
