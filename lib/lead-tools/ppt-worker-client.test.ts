import assert from "node:assert/strict"
import test from "node:test"

import type { PptWorkerPreviewRequest } from "./ppt-worker-types"
import { requestPptWorkerExport, requestPptWorkerPreview } from "./ppt-worker-client"

test("ppt worker transport types are importable", () => {
  const request: PptWorkerPreviewRequest = {
    requestId: "req_1",
    prompt: "Build a sales deck for AI consulting",
    scenario: "sales-deck",
    language: "zh-CN",
    templateMode: "auto-4",
    allowMockFallback: false,
    runtimeProfile: "railway-linux",
  }

  assert.equal(request.runtimeProfile, "railway-linux")
})

test("ppt worker preview posts runtime profile, fallback mode, and auth token", async () => {
  const originalFetch = global.fetch
  const previousBaseUrl = process.env.PPT_WORKER_BASE_URL
  const previousToken = process.env.PPT_WORKER_INTERNAL_TOKEN
  const previousProfile = process.env.PPT_WORKER_RUNTIME_PROFILE
  const previousPollInterval = process.env.PPT_WORKER_PREVIEW_POLL_INTERVAL_MS
  const previousTimeout = process.env.PPT_WORKER_PREVIEW_TIMEOUT_MS

  try {
    process.env.PPT_WORKER_BASE_URL = "https://ppt-worker.example.com/"
    process.env.PPT_WORKER_INTERNAL_TOKEN = "secret-token"
    process.env.PPT_WORKER_RUNTIME_PROFILE = "railway-linux"
    process.env.PPT_WORKER_PREVIEW_POLL_INTERVAL_MS = "1"
    process.env.PPT_WORKER_PREVIEW_TIMEOUT_MS = "1000"

    const seen: Array<{ url?: string; body?: string; auth?: string; method?: string }> = []
    global.fetch = (async (input, init) => {
      const headers = init?.headers as Record<string, string> | undefined
      seen.push({
        url: String(input),
        body: String(init?.body || ""),
        auth: headers?.authorization ?? "",
        method: String(init?.method || "GET"),
      })

      if (String(input).endsWith("/preview")) {
        return {
          ok: true,
          status: 202,
          json: async () => ({
            jobId: "job_1",
            status: "queued",
          }),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          jobId: "job_1",
          status: "completed",
          previewSessionId: "session_1",
          generatedAt: "2026-06-24T00:00:00.000Z",
          deck: { title: "Deck" },
        }),
      } as Response
    }) as typeof fetch

    const result = await requestPptWorkerPreview({
      requestId: "req_1",
      prompt: "Build deck",
      researchBrief: {
        topic: "Hormuz Strait shipping risk 2026",
        keyFacts: ["War-risk premiums rose"],
      },
      scenario: "sales-deck",
      language: "zh-CN",
      model: "gpt-5.4",
      templateMode: "auto-4",
      narrativeAngle: "executive-brief",
      images: [{ url: "https://example.com/cover.png", role: "cover" }],
      allowMockFallback: true,
    })

    assert.equal(result.previewSessionId, "session_1")
    assert.equal(seen[0]?.url, "https://ppt-worker.example.com/preview")
    assert.equal(seen[0]?.method, "POST")
    assert.match(seen[0]?.body || "", /"runtimeProfile":"railway-linux"/)
    assert.match(seen[0]?.body || "", /"allowMockFallback":true/)
    assert.match(seen[0]?.body || "", /"researchBrief":\{"topic":"Hormuz Strait shipping risk 2026"/)
    assert.match(seen[0]?.body || "", /"model":"MiniMax-M3"/)
    assert.match(seen[0]?.body || "", /"narrativeAngle":"executive-brief"/)
    assert.match(seen[0]?.body || "", /"images":\[\{"url":"https:\/\/example.com\/cover\.png","role":"cover"\}\]/)
    assert.equal(seen[0]?.auth, "Bearer secret-token")
    assert.equal(seen[1]?.url, "https://ppt-worker.example.com/preview-jobs/job_1")
    assert.equal(seen[1]?.method, "GET")
  } finally {
    global.fetch = originalFetch

    if (previousBaseUrl === undefined) {
      delete process.env.PPT_WORKER_BASE_URL
    } else {
      process.env.PPT_WORKER_BASE_URL = previousBaseUrl
    }

    if (previousToken === undefined) {
      delete process.env.PPT_WORKER_INTERNAL_TOKEN
    } else {
      process.env.PPT_WORKER_INTERNAL_TOKEN = previousToken
    }

    if (previousProfile === undefined) {
      delete process.env.PPT_WORKER_RUNTIME_PROFILE
    } else {
      process.env.PPT_WORKER_RUNTIME_PROFILE = previousProfile
    }

    if (previousPollInterval === undefined) {
      delete process.env.PPT_WORKER_PREVIEW_POLL_INTERVAL_MS
    } else {
      process.env.PPT_WORKER_PREVIEW_POLL_INTERVAL_MS = previousPollInterval
    }

    if (previousTimeout === undefined) {
      delete process.env.PPT_WORKER_PREVIEW_TIMEOUT_MS
    } else {
      process.env.PPT_WORKER_PREVIEW_TIMEOUT_MS = previousTimeout
    }
  }
})

test("ppt worker preview preserves supported worker models", async () => {
  const originalFetch = global.fetch
  const previousBaseUrl = process.env.PPT_WORKER_BASE_URL
  const previousPollInterval = process.env.PPT_WORKER_PREVIEW_POLL_INTERVAL_MS
  const previousTimeout = process.env.PPT_WORKER_PREVIEW_TIMEOUT_MS

  try {
    process.env.PPT_WORKER_BASE_URL = "https://ppt-worker.example.com"
    process.env.PPT_WORKER_PREVIEW_POLL_INTERVAL_MS = "1"
    process.env.PPT_WORKER_PREVIEW_TIMEOUT_MS = "1000"

    let requestBody = ""
    global.fetch = (async (input, init) => {
      if (String(input).endsWith("/preview")) {
        requestBody = String(init?.body || "")
        return {
          ok: true,
          status: 202,
          json: async () => ({
            jobId: "job_2",
            status: "queued",
          }),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          jobId: "job_2",
          status: "completed",
          previewSessionId: "session_2",
          generatedAt: "2026-06-24T00:00:00.000Z",
          deck: { title: "Deck" },
        }),
      } as Response
    }) as typeof fetch

    await requestPptWorkerPreview({
      requestId: "req_supported_model",
      prompt: "Build deck",
      scenario: "sales-deck",
      language: "zh-CN",
      model: "MiniMax-M2.7-highspeed",
      templateMode: "auto-4",
      allowMockFallback: false,
    })

    assert.match(requestBody, /"model":"MiniMax-M2\.7-highspeed"/)
  } finally {
    global.fetch = originalFetch

    if (previousBaseUrl === undefined) {
      delete process.env.PPT_WORKER_BASE_URL
    } else {
      process.env.PPT_WORKER_BASE_URL = previousBaseUrl
    }

    if (previousPollInterval === undefined) {
      delete process.env.PPT_WORKER_PREVIEW_POLL_INTERVAL_MS
    } else {
      process.env.PPT_WORKER_PREVIEW_POLL_INTERVAL_MS = previousPollInterval
    }

    if (previousTimeout === undefined) {
      delete process.env.PPT_WORKER_PREVIEW_TIMEOUT_MS
    } else {
      process.env.PPT_WORKER_PREVIEW_TIMEOUT_MS = previousTimeout
    }
  }
})

test("ppt worker export posts selected variant and decodes success payload", async () => {
  const originalFetch = global.fetch
  const previousBaseUrl = process.env.PPT_WORKER_BASE_URL

  try {
    process.env.PPT_WORKER_BASE_URL = "https://ppt-worker.example.com"

    let seen: { url?: string; body?: string } = {}
    global.fetch = (async (input, init) => {
      seen = {
        url: String(input),
        body: String(init?.body || ""),
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          fileName: "deck.pptx",
          contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          slideCount: 8,
          variantName: "Variant A",
          bufferBase64: Buffer.from("ppt-bytes").toString("base64"),
        }),
      } as Response
    }) as typeof fetch

    const result = await requestPptWorkerExport({
      requestId: "req_export_1",
      previewSessionId: "session_1",
      selectedVariantKey: "variant_a",
    })

    assert.equal(result.fileName, "deck.pptx")
    assert.equal(seen.url, "https://ppt-worker.example.com/export")
    assert.match(seen.body || "", /"selectedVariantKey":"variant_a"/)
  } finally {
    global.fetch = originalFetch

    if (previousBaseUrl === undefined) {
      delete process.env.PPT_WORKER_BASE_URL
    } else {
      process.env.PPT_WORKER_BASE_URL = previousBaseUrl
    }
  }
})

test("ppt worker preview fails clearly when base url is missing", async () => {
  const previousBaseUrl = process.env.PPT_WORKER_BASE_URL

  try {
    delete process.env.PPT_WORKER_BASE_URL

    await assert.rejects(
      () =>
        requestPptWorkerPreview({
          requestId: "req_missing_url",
          prompt: "Build deck",
          researchBrief: "Use live search findings",
          scenario: "sales-deck",
          language: "zh-CN",
          templateMode: "auto-4",
          allowMockFallback: false,
        }),
      /ppt_worker_base_url_missing/,
    )
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.PPT_WORKER_BASE_URL
    } else {
      process.env.PPT_WORKER_BASE_URL = previousBaseUrl
    }
  }
})

test("ppt worker preview surfaces failed async jobs", async () => {
  const originalFetch = global.fetch
  const previousBaseUrl = process.env.PPT_WORKER_BASE_URL
  const previousPollInterval = process.env.PPT_WORKER_PREVIEW_POLL_INTERVAL_MS
  const previousTimeout = process.env.PPT_WORKER_PREVIEW_TIMEOUT_MS

  try {
    process.env.PPT_WORKER_BASE_URL = "https://ppt-worker.example.com"
    process.env.PPT_WORKER_PREVIEW_POLL_INTERVAL_MS = "1"
    process.env.PPT_WORKER_PREVIEW_TIMEOUT_MS = "1000"

    global.fetch = (async (input) => {
      if (String(input).endsWith("/preview")) {
        return {
          ok: true,
          status: 202,
          json: async () => ({
            jobId: "job_failed",
            status: "queued",
          }),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          jobId: "job_failed",
          status: "failed",
          message: "provider_quota_exceeded",
        }),
      } as Response
    }) as typeof fetch

    await assert.rejects(
      () =>
        requestPptWorkerPreview({
          requestId: "req_failed",
          prompt: "Build deck",
          scenario: "sales-deck",
          language: "zh-CN",
          templateMode: "auto-4",
          allowMockFallback: false,
        }),
      /provider_quota_exceeded/,
    )
  } finally {
    global.fetch = originalFetch

    if (previousBaseUrl === undefined) {
      delete process.env.PPT_WORKER_BASE_URL
    } else {
      process.env.PPT_WORKER_BASE_URL = previousBaseUrl
    }

    if (previousPollInterval === undefined) {
      delete process.env.PPT_WORKER_PREVIEW_POLL_INTERVAL_MS
    } else {
      process.env.PPT_WORKER_PREVIEW_POLL_INTERVAL_MS = previousPollInterval
    }

    if (previousTimeout === undefined) {
      delete process.env.PPT_WORKER_PREVIEW_TIMEOUT_MS
    } else {
      process.env.PPT_WORKER_PREVIEW_TIMEOUT_MS = previousTimeout
    }
  }
})
