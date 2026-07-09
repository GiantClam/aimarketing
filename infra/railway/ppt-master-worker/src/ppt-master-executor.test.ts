import assert from "node:assert/strict"
import test from "node:test"

import { runExportJob, runPreviewJob, setPptWorkerExecutorDepsForTests } from "./ppt-master-executor.js"

test.afterEach(() => {
  setPptWorkerExecutorDepsForTests(null)
})

test("worker preview executor forwards request and preserves session id", async () => {
  let seenAllowMockFallback = false
  let seenPrompt = ""
  let seenResearchBrief: unknown = null
  let seenImages: unknown = null
  let seenModel: unknown = null
  let seenPreferredProviderId: unknown = null
  let seenNarrativeAngle: unknown = null
  let seenTemplateId: unknown = null

  setPptWorkerExecutorDepsForTests({
    generateLeadToolPptPreviewWithFallback: async (request, allowMockFallback) => {
      seenPrompt = request.prompt
      seenAllowMockFallback = allowMockFallback
      seenResearchBrief = request.researchBrief
      seenImages = request.images
      seenModel = request.model
      seenPreferredProviderId = request.preferredProviderId
      seenNarrativeAngle = request.narrativeAngle
      seenTemplateId = request.templateId

      return {
        title: "Railway Deck",
        scenario: request.scenario,
        language: request.language,
        generatedAt: "2026-06-24T08:00:00.000Z",
        outline: ["A", "B", "C", "D"],
        previewEngine: "ppt-master-project",
        previewSessionId: "session_worker_1",
        source: "live",
        variants: [],
      }
    },
  })

  const result = await runPreviewJob({
    requestId: "req_preview_1",
    prompt: "Build a railway deck",
    researchBrief: {
      topic: "Hormuz Strait shipping risk 2026",
      keyFacts: ["War-risk premiums rose"],
      implications: ["Buyers move inventory forward"],
    },
    scenario: "sales-deck",
    language: "zh-CN",
    model: "gpt-5.4",
    preferredProviderId: "enterprise-openai-compatible",
    templateMode: "single-template",
    templateId: "academic_defense",
    narrativeAngle: "executive-brief",
    pageCount: 8,
    images: [{ url: "https://example.com/cover.png", role: "cover" }],
    allowMockFallback: true,
    runtimeProfile: "railway-linux",
  })

  assert.equal(seenPrompt, "Build a railway deck")
  assert.equal(seenAllowMockFallback, true)
  assert.deepEqual(seenResearchBrief, {
    topic: "Hormuz Strait shipping risk 2026",
    keyFacts: ["War-risk premiums rose"],
    implications: ["Buyers move inventory forward"],
  })
  assert.deepEqual(seenImages, [{ url: "https://example.com/cover.png", role: "cover" }])
  assert.equal(seenModel, "gpt-5.4")
  assert.equal(seenPreferredProviderId, "enterprise-openai-compatible")
  assert.equal(seenNarrativeAngle, "executive-brief")
  assert.equal(seenTemplateId, "academic_defense")
  assert.equal(result.previewSessionId, "session_worker_1")
  assert.equal(result.generatedAt, "2026-06-24T08:00:00.000Z")
})

test("worker preview executor creates transient session id for mock fallback deck", async () => {
  setPptWorkerExecutorDepsForTests({
    generateLeadToolPptPreviewWithFallback: async (request) => ({
      title: "Mock Deck",
      scenario: request.scenario,
      language: request.language,
      generatedAt: "2026-06-24T09:00:00.000Z",
      outline: ["A", "B", "C", "D"],
      source: "mock",
      variants: [],
    }),
  })

  const result = await runPreviewJob({
    requestId: "req_preview_2",
    prompt: "Fallback please",
    scenario: "training",
    language: "en-US",
    templateMode: "auto-4",
    allowMockFallback: true,
    runtimeProfile: "railway-linux",
  })

  assert.match(result.previewSessionId, /^[0-9a-f-]{36}$/u)
  assert.equal(result.generatedAt, "2026-06-24T09:00:00.000Z")
})

test("worker export executor encodes pptx artifact as base64", async () => {
  setPptWorkerExecutorDepsForTests({
    exportPptMasterSessionVariant: async () => ({
      buffer: Buffer.from("pptx-binary"),
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      fileName: "railway-deck.pptx",
      slideCount: 6,
      variantName: "Variant A",
    }),
  })

  const result = await runExportJob({
    requestId: "req_export_1",
    previewSessionId: "session_worker_1",
    selectedVariantKey: "variant_a",
  })

  assert.equal(result.fileName, "railway-deck.pptx")
  assert.equal(result.slideCount, 6)
  assert.equal(result.variantName, "Variant A")
  assert.equal(Buffer.from(result.bufferBase64, "base64").toString("utf8"), "pptx-binary")
})
