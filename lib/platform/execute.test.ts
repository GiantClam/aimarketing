import assert from "node:assert/strict"
import test from "node:test"

import { buildPermissionMap } from "@/lib/enterprise/constants"
import {
  evaluatePlatformExecutionGate,
  normalizePlatformRegistryItemType,
  resolvePlatformBindingExecutionProxyTarget,
  resolvePlatformCapabilityExecutionProxyTarget,
} from "@/lib/platform/execute"
import type { RunningHubConfig } from "@/lib/platform/runninghub"

const configuredRunningHub: RunningHubConfig = {
  baseUrl: "https://www.runninghub.ai",
  apiKey: "test-key",
  queryPath: "/openapi/v2/query",
  uploadPath: "/openapi/v2/media/upload/binary",
  workflowCreatePath: "/task/openapi/create",
  seedanceTextToVideoEndpoint: "/openapi/v2/rhart-video/text-to-video",
  seedanceImageToVideoEndpoint: "/openapi/v2/rhart-video/image-to-video",
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

test("capability execute target maps AI image into RunningHub when media provider is configured", () => {
  assert.deepEqual(resolvePlatformCapabilityExecutionProxyTarget("ai-image", "generate", configuredRunningHub), {
    action: "generate",
    downstreamPath: "/api/platform/media/run?target=ai-image&action=generate",
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
