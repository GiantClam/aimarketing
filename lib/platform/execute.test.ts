import { NextRequest } from "next/server"
import assert from "node:assert/strict"
import test from "node:test"

import { buildPermissionMap } from "@/lib/enterprise/constants"
import {
  evaluatePlatformExecutionGate,
  normalizePlatformMediaExecutionPayload,
  normalizePlatformRegistryItemType,
  proxyPlatformExecutionRequest,
  resolvePlatformBindingExecutionProxyTarget,
  resolvePlatformCapabilityExecutionProxyTarget,
} from "@/lib/platform/execute"
import type { RunningHubConfig } from "@/lib/platform/runninghub"

const configuredRunningHub: RunningHubConfig = {
  baseUrl: "https://www.runninghub.cn",
  apiKey: "test-key",
  queryPath: "/openapi/v2/query",
  uploadPath: "/openapi/v2/media/upload/binary",
  workflowCreatePath: "/task/openapi/create",
  seedanceTextToVideoEndpoint: "/openapi/v2/rhart-video/text-to-video",
  seedanceImageToVideoEndpoint: "/openapi/v2/rhart-video/image-to-video",
  seedanceMiniTextToVideoEndpoint: "/openapi/v2/rhart-video/sparkvideo-2.0-mini/text-to-video",
  seedanceMiniImageToVideoEndpoint: "/openapi/v2/rhart-video/sparkvideo-2.0-mini/image-to-video",
  digitalHumanWorkflowId: "2019410250268418050",
  videoEnhanceWorkflowId: "2064172986302812162",
  image: {
    configured: true,
    endpoint: "/api/image/run",
  },
  video: {
    configured: true,
    endpoint: "/api/video/run",
  },
}

test("capability execute target maps AI PPT preview as public preview runtime", () => {
  assert.deepEqual(resolvePlatformCapabilityExecutionProxyTarget("ai-ppt", "preview"), {
    action: "preview",
    downstreamPath: "/api/tools/ai-ppt-preview/preview",
    requiresLogin: false,
  })
})

test("capability execute target maps AI image export to image assistant export route", () => {
  assert.deepEqual(resolvePlatformCapabilityExecutionProxyTarget("ai-image", "export"), {
    action: "export",
    downstreamPath: "/api/image-assistant/export",
    requiresLogin: true,
  })
})

test("capability execute target keeps AI image on image assistant even when RunningHub is configured", () => {
  assert.deepEqual(resolvePlatformCapabilityExecutionProxyTarget("ai-image", "generate", configuredRunningHub), {
    action: "generate",
    downstreamPath: "/api/image-assistant/generate",
    requiresLogin: true,
  })
})

test("capability execute target maps AI video workflow through shared media executor", () => {
  assert.deepEqual(resolvePlatformCapabilityExecutionProxyTarget("ai-video", "workflow"), {
    action: "workflow-plan",
    downstreamPath: "/api/video-agent/workflow",
    requiresLogin: true,
    bodyOverrides: {
      action: "plan",
    },
  })
})

test("capability execute target maps AI music into the shared media executor", () => {
  assert.deepEqual(resolvePlatformCapabilityExecutionProxyTarget("ai-music", "generate", configuredRunningHub), {
    action: "generate",
    downstreamPath: "/api/platform/media/run?target=ai-music&action=generate",
    requiresLogin: true,
  })
})

test("normalizePlatformMediaExecutionPayload adds capability metadata and a stable detail path", () => {
  assert.deepEqual(
    normalizePlatformMediaExecutionPayload({
      capabilitySlug: "ai-music",
      featureId: "voice-synthesis",
      data: {
        taskId: "42",
        provider: "minimax",
        status: "RUNNING",
        results: [{ url: "https://example.com/audio.mp3", outputType: "audio/mpeg" }],
      },
    }),
    {
      data: {
        runId: 42,
        taskId: "42",
        capabilitySlug: "ai-music",
        featureId: "voice-synthesis",
        provider: "minimax",
        status: "running",
        results: [{ url: "https://example.com/audio.mp3", outputType: "audio/mpeg", text: null, title: null }],
        detailPath: "/api/platform/media/tasks/42?target=ai-music",
        mediaTarget: "ai-music",
        requestedTarget: "voice-synthesis",
        endpoint: null,
        extra: null,
        raw: null,
      },
    },
  )
})

test("normalizePlatformMediaExecutionPayload infers provider and keeps external task ids", () => {
  assert.deepEqual(
    normalizePlatformMediaExecutionPayload({
      capabilitySlug: "ai-video",
      data: {
        taskId: "rh-task-1",
        status: "SUCCESS",
        requestedTarget: "text-to-video",
        results: [{ url: "https://example.com/video.mp4", outputType: "video/mp4", title: "Hero cut" }],
      },
    }),
    {
      data: {
        runId: undefined,
        taskId: "rh-task-1",
        capabilitySlug: "ai-video",
        featureId: "text-to-video",
        provider: "runninghub",
        status: "succeeded",
        results: [
          { url: "https://example.com/video.mp4", outputType: "video/mp4", text: null, title: "Hero cut" },
        ],
        detailPath: "/api/platform/media/tasks/rh-task-1?target=ai-video",
        mediaTarget: "ai-video",
        requestedTarget: "text-to-video",
        endpoint: null,
        extra: null,
        raw: null,
      },
    },
  )
})

test("capability execute target preserves ai-music voice synthesis action", () => {
  assert.deepEqual(resolvePlatformCapabilityExecutionProxyTarget("ai-music", "voice-synthesis"), {
    action: "voice-synthesis",
    downstreamPath: "/api/platform/media/run?target=ai-music&action=voice-synthesis",
    requiresLogin: true,
  })
})

test("binding execute target maps content repurpose to writer runtime", () => {
  assert.deepEqual(resolvePlatformBindingExecutionProxyTarget("content-repurpose", "execute"), {
    action: "chat",
    downstreamPath: "/api/writer/chat",
    requiresLogin: true,
  })
})

test("binding execute target maps campaign launch to PPT preview runtime", () => {
  assert.deepEqual(resolvePlatformBindingExecutionProxyTarget("campaign-launch", "preview"), {
    action: "preview",
    downstreamPath: "/api/tools/ai-ppt-preview/preview",
    requiresLogin: false,
  })
})

test("binding execute target maps visual ad pipeline into shared media executor", () => {
  assert.deepEqual(resolvePlatformBindingExecutionProxyTarget("visual-ad-pipeline", "workflow-keyframes"), {
    action: "workflow-keyframes",
    downstreamPath: "/api/video-agent/workflow",
    requiresLogin: true,
    bodyOverrides: {
      action: "keyframes",
    },
  })
})

test("binding execute target maps visual ad pipeline to RunningHub media run when configured", () => {
  assert.deepEqual(
    resolvePlatformBindingExecutionProxyTarget("visual-ad-pipeline", "workflow-keyframes", configuredRunningHub),
    {
      action: "workflow-keyframes",
      downstreamPath: "/api/platform/media/run?target=ai-video&action=workflow-keyframes",
      requiresLogin: true,
    },
  )
})

test("proxyPlatformExecutionRequest preserves SSE streams without buffering them into a single payload", async () => {
  const originalFetch = globalThis.fetch

  try {
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"event":"conversation_init"}\n\n'))
            controller.enqueue(new TextEncoder().encode('data: {"event":"message","answer":"hi"}\n\n'))
            controller.close()
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache, no-transform",
          },
        },
      )

    const proxied = await proxyPlatformExecutionRequest(
      new NextRequest("http://localhost:3000/api/platform/capabilities/ai-chat/execute?action=chat"),
      {
        action: "chat",
        downstreamPath: "/api/ai/chat",
        requiresLogin: true,
      },
      JSON.stringify({ message: "hello", stream: true }),
      {
        "x-platform-capability-slug": "ai-chat",
      },
    )

    assert.equal(proxied.status, 200)
    assert.equal(proxied.headers.get("content-type"), "text/event-stream; charset=utf-8")
    assert.equal(proxied.headers.get("x-platform-proxy-target"), "/api/ai/chat")

    const text = await proxied.text()
    assert.match(text, /conversation_init/)
    assert.match(text, /"answer":"hi"/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("execution gate blocks deferred runtime before proxying", () => {
  const result = evaluatePlatformExecutionGate({
    currentUser: null,
    requiresLogin: false,
    runtimeStatus: "deferred",
    accessState: "public_then_login",
  })

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.response.status, 409)
})

test("execution gate blocks anonymous login-required execution", () => {
  const result = evaluatePlatformExecutionGate({
    currentUser: null,
    requiresLogin: true,
    runtimeStatus: "ready",
    accessState: "login_required",
  })

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.response.status, 401)
})

test("execution gate allows authenticated ready execution", () => {
  const result = evaluatePlatformExecutionGate({
    currentUser: {
      id: 1,
      email: "demo@example.com",
      name: "Demo",
      isDemo: true,
      enterpriseId: null,
      enterpriseCode: "demo-enterprise",
      enterpriseName: "Demo Enterprise",
      enterpriseRole: "admin",
      enterpriseStatus: "active",
      permissions: buildPermissionMap(true),
    },
    requiresLogin: true,
    runtimeStatus: "ready",
    accessState: "authorized",
  })

  assert.deepEqual(result, { ok: true })
})

test("execution gate blocks shared-credit execution when billing enforcement is enabled and credits are exhausted", () => {
  const previous = process.env.BILLING_CREDITS_ENFORCEMENT
  process.env.BILLING_CREDITS_ENFORCEMENT = "true"

  try {
    const result = evaluatePlatformExecutionGate({
      currentUser: {
        id: 1,
        email: "demo@example.com",
        name: "Demo",
        isDemo: true,
        enterpriseId: null,
        enterpriseCode: "demo-enterprise",
        enterpriseName: "Demo Enterprise",
        enterpriseRole: "admin",
        enterpriseStatus: "active",
        permissions: buildPermissionMap(true),
      },
      requiresLogin: true,
      runtimeStatus: "ready",
      accessState: "authorized",
      usesSharedCredits: true,
      billingCanSpendCredits: false,
    })

    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.response.status, 402)
  } finally {
    if (previous == null) {
      delete process.env.BILLING_CREDITS_ENFORCEMENT
    } else {
      process.env.BILLING_CREDITS_ENFORCEMENT = previous
    }
  }
})

test("normalizes registry item type aliases used by platform routes", () => {
  assert.equal(normalizePlatformRegistryItemType("mcp"), "mcp_service")
  assert.equal(normalizePlatformRegistryItemType("mcp-services"), "mcp_service")
  assert.equal(normalizePlatformRegistryItemType("plugin"), "plugin")
  assert.equal(normalizePlatformRegistryItemType("unknown"), null)
})
