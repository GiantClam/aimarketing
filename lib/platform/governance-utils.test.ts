import assert from "node:assert/strict"
import test from "node:test"

import type { PlatformRegistryControlEntry } from "@/lib/platform/control-plane"
import { summarizeRegistryCounts } from "@/lib/platform/governance-utils"

function createEntry(
  slug: string,
  config: Partial<PlatformRegistryControlEntry["config"]> = {},
): PlatformRegistryControlEntry {
  return {
    itemType: "agent",
    slug,
    title: slug,
    summary: slug,
    status: "live",
    defaultConfig: {
      enabled: true,
      publicVisible: true,
      workspaceVisible: true,
      bindingTarget: "ai-chat",
      bindingMode: "existing_runtime",
      notes: "",
    },
    config: {
      enabled: true,
      publicVisible: true,
      workspaceVisible: true,
      bindingTarget: "ai-chat",
      bindingMode: "existing_runtime",
      notes: "",
      ...config,
    },
    proofPoints: [],
    surfaceLabel: "Public + workspace",
    bindingOptions: [],
  }
}

test("summarizeRegistryCounts counts enabled, visibility, and deferred entries", () => {
  const summary = summarizeRegistryCounts([
    createEntry("alpha"),
    createEntry("beta", { enabled: false, publicVisible: false }),
    createEntry("gamma", { bindingMode: "deferred", workspaceVisible: false }),
  ])

  assert.deepEqual(summary, {
    total: 3,
    enabled: 2,
    publicVisible: 2,
    workspaceVisible: 2,
    deferred: 1,
  })
})
