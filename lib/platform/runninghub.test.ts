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
  baseUrl: "https://www.runninghub.ai",
  apiKey: "test-key",
  queryPath: "/openapi/v2/query",
  uploadPath: "/openapi/v2/media/upload/binary",
  workflowCreatePath: "/task/openapi/create",
  seedanceTextToVideoEndpoint: null,
  seedanceImageToVideoEndpoint: null,
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
