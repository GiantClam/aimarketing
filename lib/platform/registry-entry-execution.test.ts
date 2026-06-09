import assert from "node:assert/strict"
import test from "node:test"

import { resolveRegistryEntryExecution, summarizeRegistryEntryExecution } from "@/lib/platform/registry-entry-execution"
import type { PlatformCapabilityExecutionState } from "@/lib/platform/execution"
import type { PlatformRegistryControlEntry } from "@/lib/platform/control-plane"

function buildExecutionState(
  overrides?: Partial<PlatformCapabilityExecutionState>,
): PlatformCapabilityExecutionState {
  return {
    capabilitySlug: "ai-chat",
    kind: "text",
    title: "AI Chat Workspace",
    summary: "Shared chat runtime.",
    publicHref: "/tools/ai-chat",
    workspaceHref: "/dashboard/ai",
    runtimeStatus: "ready",
    accessState: "login_required",
    activeProviderIds: ["pptoken"],
    fallbackProviderIds: [],
    plannedProviderIds: [],
    task: {
      id: "ai-chat-runtime",
      runtimeId: "ai-entry",
      mode: "interactive",
      enabled: true,
      statuses: ["running", "succeeded", "failed", "cancelled"],
    },
    entitlements: [],
    usesSharedCredits: true,
    billing: null,
    notes: ["Shared execution note."],
    ...overrides,
  }
}

function buildRegistryEntry(
  overrides?: Partial<PlatformRegistryControlEntry>,
): PlatformRegistryControlEntry {
  return {
    itemType: "agent",
    slug: "growth-marketing-agent",
    title: "Growth Marketing Agent",
    summary: "Agent summary",
    status: "live",
    publicHref: "/agents",
    workspaceHref: "/dashboard/agent-platform",
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
    },
    proofPoints: ["Registry proof point."],
    surfaceLabel: "Public + workspace",
    bindingOptions: [],
    ...overrides,
  }
}

test("registry entry execution uses mapped capability execution status", () => {
  const summary = summarizeRegistryEntryExecution(
    buildRegistryEntry(),
    "en",
    new Map([["ai-chat", buildExecutionState()]]),
  )

  assert.equal(summary.label, "Runtime ready · Login required")
  assert.ok(summary.notes.includes("Shared execution note."))
})

test("registry entry execution keeps deferred binding mode explicit", () => {
  const summary = summarizeRegistryEntryExecution(
    buildRegistryEntry({
      config: {
        enabled: true,
        publicVisible: true,
        workspaceVisible: true,
        bindingTarget: "agent-platform",
        bindingMode: "deferred",
        notes: "",
      },
    }),
    "en",
    new Map(),
  )

  assert.equal(summary.label, "Deferred · AGENT-PLATFORM")
})

test("registry entry execution promotes deferred bindings when runtime is actually ready", () => {
  const summary = summarizeRegistryEntryExecution(
    buildRegistryEntry({
      itemType: "plugin",
      slug: "runninghub-media",
      config: {
        enabled: true,
        publicVisible: true,
        workspaceVisible: true,
        bindingTarget: "visual-ad-pipeline",
        bindingMode: "deferred",
        notes: "",
      },
      defaultConfig: {
        enabled: true,
        publicVisible: true,
        workspaceVisible: true,
        bindingTarget: "visual-ad-pipeline",
        bindingMode: "deferred",
        notes: "",
      },
    }),
    "en",
    new Map([["visual-ad-pipeline", buildExecutionState({
      capabilitySlug: "visual-ad-pipeline",
      runtimeStatus: "ready",
      accessState: "authorized",
      title: "Visual Ad Pipeline",
      summary: "Shared media workflow.",
    })]]),
  )

  assert.equal(summary.label, "Runtime ready · Authorized")
})

test("registry entry execution exposes binding, runtime, and launch paths", () => {
  const resolved = resolveRegistryEntryExecution(
    buildRegistryEntry(),
    "en",
    new Map([["ai-chat", buildExecutionState()]]),
  )

  assert.equal(resolved.bindingTarget, "ai-chat")
  assert.equal(resolved.bindingMode, "existing_runtime")
  assert.equal(resolved.mappedCapabilitySlug, "ai-chat")
  assert.equal(resolved.runtimeStatus, "ready")
  assert.equal(resolved.accessState, "login_required")
  assert.equal(resolved.publicLaunchPath, "/api/platform/launch?type=agent&slug=growth-marketing-agent&surface=public&locale=en")
  assert.equal(resolved.workspaceLaunchPath, "/api/platform/launch?type=agent&slug=growth-marketing-agent&surface=workspace&locale=en")
})

test("registry entry execution keeps workflow-specific target slugs instead of collapsing to ai-chat", () => {
  const resolved = resolveRegistryEntryExecution(
    buildRegistryEntry({
      itemType: "workflow",
      slug: "content-repurpose",
      config: {
        enabled: true,
        publicVisible: true,
        workspaceVisible: true,
        bindingTarget: "content-repurpose",
        bindingMode: "existing_runtime",
        notes: "",
      },
      defaultConfig: {
        enabled: true,
        publicVisible: true,
        workspaceVisible: true,
        bindingTarget: "content-repurpose",
        bindingMode: "existing_runtime",
        notes: "",
      },
    }),
    "en",
    new Map([["content-repurpose", buildExecutionState({
      capabilitySlug: "content-repurpose",
      title: "Content Repurpose",
      summary: "Writer-backed workflow.",
    })]]),
  )

  assert.equal(resolved.bindingTarget, "content-repurpose")
  assert.equal(resolved.mappedCapabilitySlug, "content-repurpose")
})
