import assert from "node:assert/strict"
import test from "node:test"

import {
  buildPlatformMediaRuntimeEntriesFromState,
  getPlatformMediaCapabilityStateFromSnapshot,
  isPlatformMediaCapabilitySlug,
} from "@/lib/platform/media-runtime"
import type { MiniMaxAudioConfig } from "@/lib/platform/minimax-audio"
import type { PlatformRuntimeSnapshot } from "@/lib/platform/runtime"
import type { RunningHubConfig } from "@/lib/platform/runninghub"

const emptyRunningHubConfig: RunningHubConfig = {
  baseUrl: "https://www.runninghub.ai",
  apiKey: "",
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

const configuredMiniMax: MiniMaxAudioConfig = {
  baseUrl: "https://api.minimaxi.com/v1",
  apiKey: "minimax-key",
}

const emptyMiniMax: MiniMaxAudioConfig = {
  baseUrl: "https://api.minimaxi.com/v1",
  apiKey: "",
}

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

test("media runtime helper recognizes platform media capability slugs", () => {
  assert.equal(isPlatformMediaCapabilitySlug("ai-image"), true)
  assert.equal(isPlatformMediaCapabilitySlug("ai-video"), true)
  assert.equal(isPlatformMediaCapabilitySlug("ai-music"), true)
  assert.equal(isPlatformMediaCapabilitySlug("ai-chat"), false)
})

test("media runtime helper marks ai-image as runtime_disabled when task is present but off", () => {
  const state = getPlatformMediaCapabilityStateFromSnapshot(
    buildSnapshot({
      providers: [
        {
          id: "runninghub-image",
          scope: "image",
          configured: false,
          active: false,
          model: null,
          baseURL: null,
          role: "planned",
          capabilitySlugs: ["ai-image", "runninghub-media"],
          notes: ["Planned media provider."],
        },
      ],
      tasks: [
        {
          id: "ai-image-runtime",
          capabilitySlug: "ai-image",
          title: "AI image assistant queue",
          mode: "async",
          enabled: false,
          runtimeId: "image-assistant",
          statuses: ["queued", "running", "succeeded", "failed", "cancelled"],
          notes: ["Image queue disabled."],
        },
      ],
    }),
    "ai-image",
  )

  assert.equal(state.runtimeStatus, "runtime_disabled")
  assert.equal(state.task?.runtimeId, "image-assistant")
  assert.deepEqual(state.providers.map((provider) => provider.id), ["runninghub-image"])
})

test("media runtime helper keeps ai-video deferred when the task is explicitly deferred", () => {
  const state = getPlatformMediaCapabilityStateFromSnapshot(
    buildSnapshot({
      providers: [
        {
          id: "runninghub-video",
          scope: "video",
          configured: false,
          active: false,
          model: null,
          baseURL: null,
          role: "planned",
          capabilitySlugs: ["ai-video", "runninghub-media"],
          notes: ["Planned media provider."],
        },
      ],
      tasks: [
        {
          id: "ai-video-runtime",
          capabilitySlug: "ai-video",
          title: "AI video workspace",
          mode: "deferred",
          enabled: false,
          runtimeId: "dashboard-video",
          statuses: ["queued", "running", "succeeded", "failed", "cancelled"],
          notes: ["Video runtime deferred."],
        },
      ],
    }),
    "ai-video",
  )

  assert.equal(state.runtimeStatus, "deferred")
  assert.equal(state.task?.mode, "deferred")
  assert.deepEqual(state.providers.map((provider) => provider.id), ["runninghub-video"])
})

test("media runtime builder promotes RunningHub video/image and MiniMax audio targets into ready platform tasks", () => {
  const runtime = buildPlatformMediaRuntimeEntriesFromState({
    imageAvailability: {
      enabled: false,
      reason: "image_assistant_r2_config_missing",
      provider: "unavailable",
      models: {
        highQuality: "gpt-image-2",
        lowCost: "gpt-image-2",
      },
    },
    videoRuntimeEnabled: false,
    runningHubConfig: {
      ...emptyRunningHubConfig,
      apiKey: "test-key",
      image: {
        configured: true,
        endpoint: "/api/image/run",
      },
      video: {
        configured: true,
        endpoint: "/api/video/run",
      },
    },
    minimaxConfig: configuredMiniMax,
  })

  assert.equal(runtime.mediaRuntimeEnabled, true)
  assert.equal(runtime.runningHubImageConfigured, true)
  assert.equal(runtime.runningHubVideoConfigured, true)
  assert.equal(runtime.runningHubMusicConfigured, false)
  assert.equal(runtime.tasks.find((task) => task.capabilitySlug === "ai-image")?.runtimeId, "image-assistant")
  assert.equal(runtime.tasks.find((task) => task.capabilitySlug === "ai-image")?.enabled, false)
  assert.equal(runtime.tasks.find((task) => task.capabilitySlug === "ai-video")?.runtimeId, "runninghub-video")
  assert.equal(runtime.tasks.find((task) => task.capabilitySlug === "ai-video")?.enabled, true)
  assert.equal(runtime.tasks.find((task) => task.capabilitySlug === "ai-music")?.runtimeId, "minimax-audio")
  assert.equal(runtime.tasks.find((task) => task.capabilitySlug === "ai-music")?.enabled, true)
  assert.match(
    runtime.tasks.find((task) => task.capabilitySlug === "ai-music")?.notes.join(" ") ?? "",
    /audio_generation/,
  )
  assert.equal(runtime.providers.find((provider) => provider.id === "runninghub-image")?.role, "fallback")
  assert.equal(runtime.providers.find((provider) => provider.id === "runninghub-video")?.role, "primary")
  assert.equal(runtime.providers.find((provider) => provider.id === "minimax-audio")?.role, "primary")
})

test("media runtime keeps ai-music deferred when MiniMax audio is not configured", () => {
  const runtime = buildPlatformMediaRuntimeEntriesFromState({
    imageAvailability: {
      enabled: false,
      reason: "image_assistant_r2_config_missing",
      provider: "unavailable",
      models: {
        highQuality: "gpt-image-2",
        lowCost: "gpt-image-2",
      },
    },
    videoRuntimeEnabled: false,
    runningHubConfig: emptyRunningHubConfig,
    minimaxConfig: emptyMiniMax,
  })

  assert.equal(runtime.tasks.find((task) => task.capabilitySlug === "ai-music")?.mode, "deferred")
  assert.equal(runtime.providers.find((provider) => provider.id === "minimax-audio")?.configured, false)
})
