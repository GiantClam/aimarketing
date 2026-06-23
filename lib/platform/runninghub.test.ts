import assert from "node:assert/strict"
import test from "node:test"

import {
  hasRunningHubMediaExecution,
  isRunningHubConfiguredForTarget,
  queryRunningHubTask,
  resolveRunningHubProviderTarget,
  submitRunningHubRawTask,
  submitRunningHubTask,
  type RunningHubConfig,
} from "@/lib/platform/runninghub"

const baseConfig: RunningHubConfig = {
  baseUrl: "https://www.runninghub.cn",
  apiKey: "test-key",
  queryPath: "/openapi/v2/query",
  uploadPath: "/openapi/v2/media/upload/binary",
  workflowCreatePath: "/task/openapi/create",
  seedanceTextToVideoEndpoint: null,
  seedanceImageToVideoEndpoint: null,
  seedanceMiniTextToVideoEndpoint: "/openapi/v2/rhart-video/sparkvideo-2.0-mini/text-to-video",
  seedanceMiniImageToVideoEndpoint: "/openapi/v2/rhart-video/sparkvideo-2.0-mini/image-to-video",
  digitalHumanWorkflowId: null,
  videoEnhanceWorkflowId: null,
  image: {
    configured: false,
    endpoint: null,
  },
  video: {
    configured: false,
    endpoint: null,
  },
}

test("runninghub helpers detect configured image and video targets independently", () => {
  const config: RunningHubConfig = {
    ...baseConfig,
    image: {
      configured: true,
      endpoint: "/api/image/run",
    },
  }

  assert.equal(isRunningHubConfiguredForTarget("ai-image", config), true)
  assert.equal(isRunningHubConfiguredForTarget("ai-video", config), false)
  assert.equal(hasRunningHubMediaExecution(config), true)
})

test("runninghub visual ad target prefers the configured video provider when both are not equal", () => {
  const config: RunningHubConfig = {
    ...baseConfig,
    image: {
      configured: true,
      endpoint: "/api/image/run",
    },
    video: {
      configured: true,
      endpoint: "/api/video/run",
    },
  }

  assert.deepEqual(resolveRunningHubProviderTarget("visual-ad-pipeline", config), {
    requestedTarget: "visual-ad-pipeline",
    providerTarget: "ai-video",
    configured: true,
    endpoint: "/api/video/run",
  })
})

test("runninghub submit/query helpers unwrap envelope responses with nested data", async () => {
  const previousFetch = globalThis.fetch
  const previousApiKey = process.env.RUNNINGHUB_API_KEY
  const previousBaseUrl = process.env.RUNNINGHUB_BASE_URL
  const previousImageEndpoint = process.env.RUNNINGHUB_IMAGE_ENDPOINT
  const previousVideoEndpoint = process.env.RUNNINGHUB_VIDEO_ENDPOINT
  const previousQueryPath = process.env.RUNNINGHUB_QUERY_PATH
  const previousUploadPath = process.env.RUNNINGHUB_UPLOAD_PATH

  process.env.RUNNINGHUB_API_KEY = "test-key"
  process.env.RUNNINGHUB_BASE_URL = "https://mock.runninghub.local"
  process.env.RUNNINGHUB_IMAGE_ENDPOINT = "/image"
  process.env.RUNNINGHUB_VIDEO_ENDPOINT = "/video"
  process.env.RUNNINGHUB_QUERY_PATH = "/query"
  process.env.RUNNINGHUB_UPLOAD_PATH = "/upload"

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith("/image")) {
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            taskId: "mock-task-1",
            status: "QUEUED",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }

    if (url.endsWith("/query")) {
      assert.equal(init?.method, "POST")
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            taskId: "mock-task-1",
            status: "SUCCESS",
            results: [{ url: "https://example.com/output.png" }],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }

    return new Response("not found", { status: 404 })
  }

  try {
    const submit = await submitRunningHubTask({
      mediaTarget: "ai-image",
      payload: { prompt: "AI Marketing hero image" },
    })
    assert.equal(submit.taskId, "mock-task-1")
    assert.equal(submit.status, "QUEUED")

    const query = await queryRunningHubTask("mock-task-1")
    assert.equal(query?.taskId, "mock-task-1")
    assert.equal(query?.status, "SUCCESS")
    assert.deepEqual(query?.results, [{ url: "https://example.com/output.png" }])
  } finally {
    globalThis.fetch = previousFetch

    if (previousApiKey == null) delete process.env.RUNNINGHUB_API_KEY
    else process.env.RUNNINGHUB_API_KEY = previousApiKey

    if (previousBaseUrl == null) delete process.env.RUNNINGHUB_BASE_URL
    else process.env.RUNNINGHUB_BASE_URL = previousBaseUrl

    if (previousImageEndpoint == null) delete process.env.RUNNINGHUB_IMAGE_ENDPOINT
    else process.env.RUNNINGHUB_IMAGE_ENDPOINT = previousImageEndpoint

    if (previousVideoEndpoint == null) delete process.env.RUNNINGHUB_VIDEO_ENDPOINT
    else process.env.RUNNINGHUB_VIDEO_ENDPOINT = previousVideoEndpoint
    if (previousQueryPath == null) delete process.env.RUNNINGHUB_QUERY_PATH
    else process.env.RUNNINGHUB_QUERY_PATH = previousQueryPath
    if (previousUploadPath == null) delete process.env.RUNNINGHUB_UPLOAD_PATH
    else process.env.RUNNINGHUB_UPLOAD_PATH = previousUploadPath
  }
})

test("runninghub raw submit surfaces business errors returned with http 200", async () => {
  const previousFetch = globalThis.fetch

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        taskId: "",
        status: "",
        errorCode: "1014",
        errorMessage: "Access Denied: Standard Model API is restricted to Enterprise-Shared API Keys only.",
        results: null,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )

  try {
    await assert.rejects(
      submitRunningHubRawTask({
        endpoint: "/video",
        payload: { prompt: "AI Marketing hero video" },
        config: {
          ...baseConfig,
          video: {
            configured: true,
            endpoint: "/video",
          },
        },
      }),
      /Enterprise-Shared API Keys only/,
    )
  } finally {
    globalThis.fetch = previousFetch
  }
})

test("runninghub task submit/query helpers honor an explicit config override", async () => {
  const previousFetch = globalThis.fetch

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url === "https://enterprise.runninghub.local/enterprise-image") {
      assert.equal(init?.method, "POST")
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            taskId: "enterprise-task-1",
            status: "QUEUED",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }

    if (url === "https://enterprise.runninghub.local/enterprise-query") {
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            taskId: "enterprise-task-1",
            status: "SUCCESS",
            results: [{ url: "https://enterprise.example.com/output.mp4" }],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }

    return new Response("not found", { status: 404 })
  }

  try {
    const config: RunningHubConfig = {
      ...baseConfig,
      baseUrl: "https://enterprise.runninghub.local",
      queryPath: "/enterprise-query",
      image: {
        configured: true,
        endpoint: "/enterprise-image",
      },
    }

    const submit = await submitRunningHubTask({
      mediaTarget: "ai-image",
      payload: { prompt: "Enterprise image task" },
      config,
    })
    assert.equal(submit.taskId, "enterprise-task-1")

    const query = await queryRunningHubTask("enterprise-task-1", config)
    assert.equal(query?.status, "SUCCESS")
    assert.deepEqual(query?.results, [{ url: "https://enterprise.example.com/output.mp4" }])
  } finally {
    globalThis.fetch = previousFetch
  }
})

test("runninghub seedream text-to-image submit normalizes image payload for standard model api", async () => {
  const previousFetch = globalThis.fetch
  let capturedBody: Record<string, unknown> | null = null

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url === "https://enterprise.runninghub.local/openapi/v2/seedream-v5-lite/text-to-image") {
      capturedBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            taskId: "enterprise-seedream-task-1",
            status: "RUNNING",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }

    return new Response("not found", { status: 404 })
  }

  try {
    await submitRunningHubTask({
      mediaTarget: "ai-image",
      payload: {
        prompt: "Enterprise image task",
        imageSize: "2048x1152",
        candidateCount: 2,
        model: "seedream-v5-text-to-image",
        providerLock: "runninghub",
      },
      config: {
        ...baseConfig,
        baseUrl: "https://enterprise.runninghub.local",
        image: {
          configured: true,
          endpoint: "/openapi/v2/seedream-v5-lite/text-to-image",
        },
      },
    })

    assert.deepEqual(capturedBody, {
      prompt: "Enterprise image task",
      width: 2048,
      height: 1152,
      maxImages: 2,
      sequentialImageGeneration: "auto",
    })
  } finally {
    globalThis.fetch = previousFetch
  }
})

test("runninghub seedream image-to-image submit maps reference urls into imageUrls", async () => {
  const previousFetch = globalThis.fetch
  let capturedBody: Record<string, unknown> | null = null

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url === "https://enterprise.runninghub.local/openapi/v2/seedream-v5-lite/image-to-image") {
      capturedBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            taskId: "enterprise-seedream-task-2",
            status: "RUNNING",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }

    return new Response("not found", { status: 404 })
  }

  try {
    await submitRunningHubTask({
      mediaTarget: "ai-image",
      payload: {
        prompt: "Blend the references into a new poster",
        imageSize: "2048x2048",
        referenceImageUrls: ["https://example.com/ref-a.png", "https://example.com/ref-b.png"],
        inputImageUrl: "https://example.com/ref-a.png",
        candidateCount: 1,
      },
      config: {
        ...baseConfig,
        baseUrl: "https://enterprise.runninghub.local",
        image: {
          configured: true,
          endpoint: "/openapi/v2/seedream-v5-lite/image-to-image",
        },
      },
    })

    assert.deepEqual(capturedBody, {
      prompt: "Blend the references into a new poster",
      width: 2048,
      height: 2048,
      maxImages: 1,
      sequentialImageGeneration: "disabled",
      imageUrls: ["https://example.com/ref-a.png", "https://example.com/ref-b.png"],
    })
  } finally {
    globalThis.fetch = previousFetch
  }
})

test("runninghub raw submit keeps generic missing-task error when envelope is success-shaped but empty", async () => {
  const previousFetch = globalThis.fetch

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        code: 0,
        message: "success",
        data: null,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )

  try {
    await assert.rejects(
      submitRunningHubRawTask({
        endpoint: "/video",
        payload: { prompt: "AI Marketing hero video" },
        config: {
          ...baseConfig,
          video: {
            configured: true,
            endpoint: "/video",
          },
        },
      }),
      /runninghub_task_id_missing/,
    )
  } finally {
    globalThis.fetch = previousFetch
  }
})
