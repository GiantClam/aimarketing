import assert from "node:assert/strict"
import test from "node:test"

import { buildPermissionMap } from "@/lib/enterprise/constants"
import {
  resolvePlatformBindingTargetExecutionFromSnapshot,
  resolvePlatformCapabilityExecutionFromSnapshot,
} from "@/lib/platform/execution"
import type { PlatformRuntimeSnapshot } from "@/lib/platform/runtime"
import { getLocalizedPlatformCapabilities } from "@/lib/platform/catalog"

function buildSnapshot(overrides?: Partial<PlatformRuntimeSnapshot>): PlatformRuntimeSnapshot {
  return {
    generatedAt: "2026-06-06T00:00:00.000Z",
    activeTextProvider: "pptoken",
    providers: [],
    tasks: [],
    entitlements: [],
    ...overrides,
  }
}

test("capability execution marks AI chat as login_required for anonymous users", () => {
  const capability = getLocalizedPlatformCapabilities("en", "all").find((item) => item.slug === "ai-chat")
  assert.ok(capability)

  const state = resolvePlatformCapabilityExecutionFromSnapshot(
    capability,
    buildSnapshot({
      providers: [
        {
          id: "pptoken",
          scope: "text",
          configured: true,
          active: true,
          model: "gpt-5.4-mini",
          baseURL: null,
          role: "primary",
          capabilitySlugs: ["ai-chat"],
          notes: ["Primary text route."],
        },
      ],
      tasks: [
        {
          id: "ai-chat-runtime",
          capabilitySlug: "ai-chat",
          title: "AI chat workspace",
          mode: "interactive",
          enabled: true,
          runtimeId: "ai-entry",
          statuses: ["running", "succeeded", "failed", "cancelled"],
          notes: ["Streams through ai-entry."],
        },
      ],
      entitlements: [
        {
          feature: "expert_advisor",
          runtimeEnabled: true,
          accessModel: "enterprise_permission",
          capabilitySlugs: ["ai-chat"],
          notes: [],
        },
      ],
    }),
    "en",
    null,
    null,
  )

  assert.equal(state.runtimeStatus, "ready")
  assert.equal(state.accessState, "login_required")
  assert.deepEqual(state.activeProviderIds, ["pptoken"])
})

test("capability execution keeps AI PPT public_then_login before authentication", () => {
  const capability = getLocalizedPlatformCapabilities("en", "all").find((item) => item.slug === "ai-ppt")
  assert.ok(capability)

  const state = resolvePlatformCapabilityExecutionFromSnapshot(
    capability,
    buildSnapshot({
      tasks: [
        {
          id: "ai-ppt-preview-runtime",
          capabilitySlug: "ai-ppt",
          title: "AI PPT preview and export",
          mode: "hybrid",
          enabled: true,
          runtimeId: "ppt-master",
          statuses: ["running", "succeeded", "failed"],
          notes: ["Preview before login, export after login."],
        },
      ],
    }),
    "en",
    null,
    null,
  )

  assert.equal(state.runtimeStatus, "ready")
  assert.equal(state.accessState, "public_then_login")
  assert.equal(state.usesSharedCredits, true)
})

test("capability execution marks deferred video runtime correctly", () => {
  const capability = getLocalizedPlatformCapabilities("en", "all").find((item) => item.slug === "ai-video")
  assert.ok(capability)

  const state = resolvePlatformCapabilityExecutionFromSnapshot(
    capability,
    buildSnapshot({
      tasks: [
        {
          id: "ai-video-runtime",
          capabilitySlug: "ai-video",
          title: "AI video workspace",
          mode: "deferred",
          enabled: false,
          runtimeId: "planned",
          statuses: ["queued", "running", "succeeded", "failed", "cancelled"],
          notes: ["Deferred until runninghub lands."],
        },
      ],
      entitlements: [
        {
          feature: "video_generation",
          runtimeEnabled: false,
          accessModel: "enterprise_permission",
          capabilitySlugs: ["ai-video"],
          notes: [],
        },
      ],
    }),
    "en",
    null,
    null,
  )

  assert.equal(state.runtimeStatus, "deferred")
  assert.equal(state.accessState, "login_required")
})

test("capability execution marks missing workspace permission for image capability", () => {
  const capability = getLocalizedPlatformCapabilities("en", "all").find((item) => item.slug === "ai-image")
  assert.ok(capability)

  const state = resolvePlatformCapabilityExecutionFromSnapshot(
    capability,
    buildSnapshot({
      providers: [
        {
          id: "pptoken",
          scope: "image",
          configured: true,
          active: true,
          model: "gpt-image-2",
          baseURL: null,
          role: "fallback",
          capabilitySlugs: ["ai-image"],
          notes: ["Image fallback path."],
        },
      ],
      tasks: [
        {
          id: "ai-image-runtime",
          capabilitySlug: "ai-image",
          title: "AI image assistant queue",
          mode: "async",
          enabled: true,
          runtimeId: "image-assistant",
          statuses: ["queued", "running", "succeeded", "failed", "cancelled"],
          notes: ["Async image queue."],
        },
      ],
      entitlements: [
        {
          feature: "image_design_generation",
          runtimeEnabled: true,
          accessModel: "enterprise_permission",
          capabilitySlugs: ["ai-image"],
          notes: [],
        },
      ],
    }),
    "en",
    {
      id: 7,
      email: "user@example.com",
      name: "User",
      isDemo: false,
      enterpriseId: null,
      enterpriseCode: "ent-2",
      enterpriseName: "Enterprise 2",
      enterpriseRole: "member",
      enterpriseStatus: "active",
      permissions: {
        ...buildPermissionMap(true),
        website_generation: false,
        video_generation: false,
        image_design_generation: false,
      },
    },
    {
      plan: null,
      subscription: null,
      creditAccount: null,
      canSpendCredits: false,
    },
  )

  assert.equal(state.accessState, "permission_required")
})

test("capability execution attaches billing snapshot for signed-in AI chat users", () => {
  const capability = getLocalizedPlatformCapabilities("en", "all").find((item) => item.slug === "ai-chat")
  assert.ok(capability)

  const state = resolvePlatformCapabilityExecutionFromSnapshot(
    capability,
    buildSnapshot({
      providers: [
        {
          id: "pptoken",
          scope: "text",
          configured: true,
          active: true,
          model: "gpt-5.4-mini",
          baseURL: null,
          role: "primary",
          capabilitySlugs: ["ai-chat"],
          notes: ["Primary text route."],
        },
      ],
      entitlements: [
        {
          feature: "expert_advisor",
          runtimeEnabled: true,
          accessModel: "enterprise_permission",
          capabilitySlugs: ["ai-chat"],
          notes: [],
        },
      ],
    }),
    "en",
    {
      id: 7,
      email: "user@example.com",
      name: "User",
      isDemo: false,
      enterpriseId: null,
      enterpriseCode: "ent-2",
      enterpriseName: "Enterprise 2",
      enterpriseRole: "admin",
      enterpriseStatus: "active",
      permissions: buildPermissionMap(true),
    },
    {
      plan: null,
      subscription: {
        id: 1,
        planCode: "free",
        status: "active",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
      creditAccount: {
        id: 1,
        balance: 120,
        reservedBalance: 20,
        availableCredits: 100,
      },
      canSpendCredits: true,
    },
  )

  assert.equal(state.accessState, "authorized")
  assert.equal(state.billing?.availableCredits, 100)
  assert.equal(state.billing?.canSpendCredits, true)
  assert.ok(state.notes.some((note) => note.includes("Available credits")))
})

test("binding target execution keeps content-repurpose on writer runtime instead of ai-chat", () => {
  const state = resolvePlatformBindingTargetExecutionFromSnapshot(
    "content-repurpose",
    buildSnapshot({
      providers: [
        {
          id: "writer:dify",
          scope: "text",
          configured: true,
          active: true,
          model: null,
          baseURL: null,
          role: "primary",
          capabilitySlugs: ["content-repurpose", "agent-platform"],
          notes: ["Writer runtime is ready."],
        },
      ],
      tasks: [
        {
          id: "content-repurpose-runtime",
          capabilitySlug: "content-repurpose",
          title: "Content repurpose workflow",
          mode: "async",
          enabled: true,
          runtimeId: "writer:dify",
          statuses: ["queued", "running", "succeeded", "failed", "cancelled"],
          notes: ["Writer queue handles repurpose jobs."],
        },
      ],
      entitlements: [
        {
          feature: "copywriting_generation",
          runtimeEnabled: true,
          accessModel: "enterprise_permission",
          capabilitySlugs: ["content-repurpose", "campaign-launch"],
          notes: [],
        },
      ],
    }),
    "en",
    null,
    null,
  )

  assert.equal(state.bindingTarget, "content-repurpose")
  assert.equal(state.runtimeStatus, "ready")
  assert.equal(state.accessState, "login_required")
  assert.equal(state.task.runtimeId, "writer:dify")
})

test("binding target execution keeps campaign-launch public_then_login with PPT runtime", () => {
  const state = resolvePlatformBindingTargetExecutionFromSnapshot(
    "campaign-launch",
    buildSnapshot({
      providers: [
        {
          id: "lead-tools",
          scope: "tooling",
          configured: true,
          active: true,
          model: "gpt-5.4 -> gpt-5.4",
          baseURL: null,
          role: "primary",
          capabilitySlugs: ["ai-ppt", "campaign-launch"],
          notes: ["PPT runtime ready."],
        },
      ],
      tasks: [
        {
          id: "campaign-launch-runtime",
          capabilitySlug: "campaign-launch",
          title: "Campaign launch workflow",
          mode: "hybrid",
          enabled: true,
          runtimeId: "ppt-master",
          statuses: ["running", "succeeded", "failed"],
          notes: ["PPT preview powers launch workflows."],
        },
      ],
      entitlements: [
        {
          feature: "copywriting_generation",
          runtimeEnabled: true,
          accessModel: "public_then_login",
          capabilitySlugs: ["content-repurpose", "campaign-launch"],
          notes: [],
        },
      ],
    }),
    "en",
    null,
    null,
  )

  assert.equal(state.bindingTarget, "campaign-launch")
  assert.equal(state.runtimeStatus, "ready")
  assert.equal(state.accessState, "public_then_login")
  assert.equal(state.task.runtimeId, "ppt-master")
})

test("binding target execution keeps campaign-launch public_then_login even when its runtime has protected entitlements", () => {
  const state = resolvePlatformBindingTargetExecutionFromSnapshot(
    "campaign-launch",
    buildSnapshot({
      tasks: [
        {
          id: "campaign-launch-runtime",
          capabilitySlug: "campaign-launch",
          title: "Campaign launch workflow",
          mode: "hybrid",
          enabled: true,
          runtimeId: "ppt-master",
          statuses: ["running", "succeeded", "failed"],
          notes: ["PPT preview powers launch workflows."],
        },
      ],
      entitlements: [
        {
          feature: "copywriting_generation",
          runtimeEnabled: true,
          accessModel: "enterprise_permission",
          capabilitySlugs: ["content-repurpose", "campaign-launch"],
          notes: [],
        },
      ],
    }),
    "en",
    null,
    null,
  )

  assert.equal(state.accessState, "public_then_login")
})
