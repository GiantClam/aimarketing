import assert from "node:assert/strict"
import test from "node:test"

import { createInMemoryPptPreviewJobStore } from "./job-store.js"
import { routeRequest, setWorkerRouteDepsForTests } from "./routes.js"

test.afterEach(() => {
  setWorkerRouteDepsForTests(null)
  delete process.env.PPT_WORKER_INTERNAL_TOKEN
})

test("worker health route returns ok", async () => {
  const response = await routeRequest(new Request("http://worker.local/health", { method: "GET" }))
  assert.equal(response.status, 200)

  const payload = await response.json()
  assert.equal(payload.ok, true)
  assert.equal(payload.service, "ppt-master-worker")
  assert.equal(payload.readiness.repoConfigured, false)
  assert.equal(payload.readiness.repoReady, false)
  assert.equal(payload.readiness.productionTemplateReady, false)
})

test("worker fonts route returns injected font status", async () => {
  setWorkerRouteDepsForTests({
    checkFonts: async () => ({
      requiredFonts: ["Noto Sans CJK SC"],
      missing: [],
    }),
  })

  const response = await routeRequest(new Request("http://worker.local/fonts/check", { method: "GET" }))
  assert.equal(response.status, 200)

  const payload = await response.json()
  assert.deepEqual(payload, {
    requiredFonts: ["Noto Sans CJK SC"],
    missing: [],
  })
})

test("worker rejects unauthorized requests when token is configured", async () => {
  process.env.PPT_WORKER_INTERNAL_TOKEN = "secret-token"

  const response = await routeRequest(new Request("http://worker.local/health", { method: "GET" }))
  assert.equal(response.status, 401)

  const payload = await response.json()
  assert.equal(payload.message, "unauthorized")
})

test("worker preview route validates payload and calls preview executor", async () => {
  let seenRequestId = ""
  let seenTemplateId: string | undefined
  let seenPreferredProviderId: string | undefined

  setWorkerRouteDepsForTests({
    previewJobStore: createInMemoryPptPreviewJobStore(),
    runPreviewJob: async (request) => {
      seenRequestId = request.requestId
      seenTemplateId = request.templateId
      seenPreferredProviderId = request.preferredProviderId
      return {
        previewSessionId: "session_1",
        generatedAt: "2026-06-24T00:00:00.000Z",
        deck: {
          title: "Deck",
        },
      }
    },
  })

  const response = await routeRequest(
    new Request("http://worker.local/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "req_1",
        prompt: "Build deck",
        scenario: "sales-deck",
        language: "zh-CN",
        preferredProviderId: "enterprise-openai-compatible",
        templateMode: "single-template",
        templateId: "academic_defense",
        allowMockFallback: false,
        runtimeProfile: "railway-linux",
      }),
    }),
  )

  assert.equal(response.status, 202)

  const payload = await response.json()
  assert.equal(payload.status, "queued")
  assert.match(payload.jobId, /^[0-9a-f-]{36}$/u)

  assert.equal(seenRequestId, "req_1")
  assert.equal(seenTemplateId, "academic_defense")
  assert.equal(seenPreferredProviderId, "enterprise-openai-compatible")

  let statusPayload: any = null
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const statusResponse = await routeRequest(
      new Request(`http://worker.local/preview-jobs/${payload.jobId}`, {
        method: "GET",
      }),
    )

    assert.equal(statusResponse.status, 200)
    statusPayload = await statusResponse.json()
    if (statusPayload.status === "completed") {
      break
    }

    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  assert.equal(statusPayload?.status, "completed")
  assert.equal(statusPayload?.previewSessionId, "session_1")
})

test("worker export route validates payload and calls export executor", async () => {
  let seenVariantKey = ""

  setWorkerRouteDepsForTests({
    runExportJob: async (request) => {
      seenVariantKey = request.selectedVariantKey
      return {
        fileName: "deck.pptx",
        contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        slideCount: 8,
        variantName: "Variant A",
        bufferBase64: Buffer.from("ppt-bytes").toString("base64"),
      }
    },
  })

  const response = await routeRequest(
    new Request("http://worker.local/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "req_2",
        previewSessionId: "session_1",
        selectedVariantKey: "variant_a",
      }),
    }),
  )

  assert.equal(response.status, 200)
  assert.equal(seenVariantKey, "variant_a")

  const payload = await response.json()
  assert.equal(payload.fileName, "deck.pptx")
})

test("worker returns 400 for invalid preview payload", async () => {
  const response = await routeRequest(
    new Request("http://worker.local/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "",
      }),
    }),
  )

  assert.equal(response.status, 400)
  const payload = await response.json()
  assert.equal(payload.message, "bad_request")
  assert.ok(Array.isArray(payload.issues))
})

test("worker preview status returns 404 for unknown job", async () => {
  const response = await routeRequest(new Request("http://worker.local/preview-jobs/missing-job", { method: "GET" }))
  assert.equal(response.status, 404)

  const payload = await response.json()
  assert.equal(payload.message, "not_found")
})
