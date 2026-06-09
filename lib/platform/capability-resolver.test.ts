import assert from "node:assert/strict"
import test from "node:test"

import { resolveLocalizedPlatformCapabilitiesFromSnapshot } from "@/lib/platform/capability-resolver"
import type { PlatformRuntimeSnapshot } from "@/lib/platform/runtime"

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

test("effective capability resolver upgrades bindings from runtime providers", () => {
  const items = resolveLocalizedPlatformCapabilitiesFromSnapshot(
    "en",
    "all",
    buildSnapshot({
      providers: [
        {
          id: "pptoken",
          scope: "text",
          configured: true,
          active: true,
          model: "gpt-5",
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
    }),
  )

  const chat = items.find((item) => item.slug === "ai-chat")
  assert.ok(chat)
  assert.equal(chat?.bindings[0]?.provider, "pptoken")
  assert.equal(chat?.bindings[0]?.status, "active")
  assert.ok(chat?.proofPoints.some((point) => point.includes("ai-entry")))
})

test("effective capability resolver downgrades disabled tasks to planned and redirects to capability hubs", () => {
  const items = resolveLocalizedPlatformCapabilitiesFromSnapshot(
    "en",
    "all",
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
          notes: ["Deferred for now."],
        },
      ],
    }),
  )

  const video = items.find((item) => item.slug === "ai-video")
  assert.ok(video)
  assert.equal(video?.status, "planned")
  assert.equal(video?.publicHref, "/capabilities")
  assert.equal(video?.workspaceHref, "/dashboard/capabilities")
})
