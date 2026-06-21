import assert from "node:assert/strict"
import test from "node:test"

import {
  buildImageAssistantProviderPlan,
  generateOrEditImages,
  getImageAssistantAvailability,
} from "./aiberm"

test("image assistant provider plan prefers pptoken then aiberm then crazyroute", () => {
  const plan = buildImageAssistantProviderPlan({
    hasPptoken: true,
    hasAiberm: true,
    hasCrazyroute: true,
  })

  assert.deepEqual(plan, ["pptoken", "aiberm", "crazyroute"])
})

test("image assistant provider plan omits unavailable deprecated fallbacks", () => {
  const plan = buildImageAssistantProviderPlan({
    hasPptoken: false,
    hasAiberm: true,
    hasCrazyroute: false,
  })

  assert.deepEqual(plan, ["aiberm"])
})

test("image assistant provider plan respects a locked pptoken provider", () => {
  const plan = buildImageAssistantProviderPlan({
    hasPptoken: true,
    hasAiberm: true,
    hasCrazyroute: true,
    providerLock: "pptoken",
  })

  assert.deepEqual(plan, ["pptoken"])
})

test("image assistant fixtures preserve a request for 9 generated candidates", async () => {
  const originalFixtures = process.env.IMAGE_ASSISTANT_FIXTURES
  process.env.IMAGE_ASSISTANT_FIXTURES = "true"

  try {
    const result = await generateOrEditImages({
      prompt: "Generate a family of nine related product ads",
      resolution: "2K",
      sizePreset: "16:9",
      candidateCount: 9,
    })

    assert.equal(result.images.length, 9)
    assert.equal(new Set(result.images).size, 9)
  } finally {
    if (originalFixtures === undefined) {
      delete process.env.IMAGE_ASSISTANT_FIXTURES
    } else {
      process.env.IMAGE_ASSISTANT_FIXTURES = originalFixtures
    }
  }
})

test("image assistant availability honors an enterprise google runtime override", () => {
  const availability = getImageAssistantAvailability({
    runtimeProviderConfig: {
      kind: "google",
      config: {
        apiKey: "enterprise-google-key",
        model: "gemini-2.5-flash-image",
      },
      model: "gemini-2.5-flash-image",
    },
  })

  assert.equal(availability.enabled, true)
  assert.equal(availability.provider, "google")
  assert.equal(availability.models.highQuality, "gemini-2.5-flash-image")
})

test("image assistant availability honors an enterprise runninghub runtime override", () => {
  const availability = getImageAssistantAvailability({
    runtimeProviderConfig: {
      kind: "runninghub",
      config: {
        baseUrl: "https://enterprise.runninghub.local",
        apiKey: "enterprise-runninghub-key",
        queryPath: "/openapi/v2/query",
        uploadPath: "/openapi/v2/media/upload/binary",
        workflowCreatePath: "/task/openapi/create",
        seedanceTextToVideoEndpoint: null,
        seedanceImageToVideoEndpoint: null,
        digitalHumanWorkflowId: null,
        videoEnhanceWorkflowId: null,
        image: {
          configured: true,
          endpoint: "/image",
        },
        video: {
          configured: false,
          endpoint: null,
        },
      },
      model: "runninghub-image-workflow",
    },
  })

  assert.equal(availability.enabled, true)
  assert.equal(availability.provider, "runninghub")
  assert.equal(availability.models.highQuality, "runninghub-image-workflow")
})

test("image assistant runninghub runtime supports image-to-image generation with uploaded references", async () => {
  const previousFetch = globalThis.fetch
  const fetchCalls: Array<{ url: string; method: string; bodyText?: string | null }> = []

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    const method = String(init?.method || "GET").toUpperCase()
    const bodyText = typeof init?.body === "string" ? init.body : null
    fetchCalls.push({ url, method, bodyText })

    if (url === "https://enterprise.runninghub.local/openapi/v2/media/upload/binary") {
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            type: "image/png",
            fileName: "uploaded-reference.png",
            download_url: "https://enterprise.example.com/uploaded-reference.png",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }

    if (url === "https://enterprise.runninghub.local/image") {
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            taskId: "runninghub-image-task-1",
            status: "QUEUED",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }

    if (url === "https://enterprise.runninghub.local/openapi/v2/query") {
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            taskId: "runninghub-image-task-1",
            status: "SUCCESS",
            results: [{ url: "https://enterprise.example.com/generated-output.png" }],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }

    return new Response("not found", { status: 404 })
  }

  try {
    const result = await generateOrEditImages({
      prompt: "Turn this product photo into a warm editorial ad",
      taskType: "edit",
      resolution: "2K",
      referenceImages: [
        {
          kind: "inline",
          assetId: "reference-asset-1",
          mimeType: "image/png",
          base64Data: Buffer.from("reference-image").toString("base64"),
        },
      ],
      runtimeProviderConfig: {
        kind: "runninghub",
        config: {
          baseUrl: "https://enterprise.runninghub.local",
          apiKey: "enterprise-runninghub-key",
          queryPath: "/openapi/v2/query",
          uploadPath: "/openapi/v2/media/upload/binary",
          workflowCreatePath: "/task/openapi/create",
          seedanceTextToVideoEndpoint: null,
          seedanceImageToVideoEndpoint: null,
          digitalHumanWorkflowId: null,
          videoEnhanceWorkflowId: null,
          image: {
            configured: true,
            endpoint: "/image",
          },
          video: {
            configured: false,
            endpoint: null,
          },
        },
        model: "runninghub-image-workflow",
      },
    })

    assert.equal(result.provider, "runninghub")
    assert.equal(result.images.length, 1)
    assert.equal(result.images[0], "https://enterprise.example.com/generated-output.png")

    const submitCall = fetchCalls.find((call) => call.url === "https://enterprise.runninghub.local/image")
    assert.equal(Boolean(submitCall), true)
    const submitPayload = JSON.parse(String(submitCall?.bodyText || "{}")) as Record<string, unknown>
    assert.equal(submitPayload.mode, "img2img")
    assert.equal(submitPayload.inputImageUrl, "https://enterprise.example.com/uploaded-reference.png")
    assert.deepEqual(submitPayload.referenceImageUrls, ["https://enterprise.example.com/uploaded-reference.png"])
  } finally {
    globalThis.fetch = previousFetch
  }
})
