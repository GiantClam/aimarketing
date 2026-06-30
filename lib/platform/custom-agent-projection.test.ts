import assert from "node:assert/strict"
import test from "node:test"

import {
  buildCustomAgentProjectionConfig,
  mergeCustomAgentProjectionMetadata,
  readCustomAgentWorkflowArchiveMetadata,
  readCustomAgentProjectionMetadata,
} from "@/lib/platform/custom-agent-projection"

test("readCustomAgentProjectionMetadata normalizes menu exposure and visibility policy defaults", () => {
  const parsed = readCustomAgentProjectionMetadata(null)
  assert.deepEqual(parsed, {
    menuExposure: false,
    visibilityPolicy: {
      publicVisible: false,
      workspaceVisible: true,
      bindingTarget: "agent-platform",
      bindingMode: "existing_runtime",
    },
  })
})

test("mergeCustomAgentProjectionMetadata preserves unrelated metadata while updating projection controls", () => {
  const merged = mergeCustomAgentProjectionMetadata({
    metadata: { foo: "bar", recentTestRecords: [{ id: "1" }] },
    menuExposure: true,
    visibilityPolicy: {
      publicVisible: true,
      workspaceVisible: false,
      bindingTarget: "campaign-launch",
      bindingMode: "existing_runtime",
    },
  })

  assert.equal((merged as Record<string, unknown>).foo, "bar")
  assert.equal(merged.menuExposure, true)
  assert.deepEqual(merged.visibilityPolicy, {
    publicVisible: true,
    workspaceVisible: false,
    bindingTarget: "campaign-launch",
    bindingMode: "existing_runtime",
  })
})

test("buildCustomAgentProjectionConfig falls back to linked workflow slug when binding target stays generic", () => {
  const config = buildCustomAgentProjectionConfig({
    metadata: {
      menuExposure: true,
      visibilityPolicy: {
        publicVisible: false,
        workspaceVisible: true,
        bindingTarget: "agent-platform",
        bindingMode: "existing_runtime",
      },
    },
    linkedWorkflowSlug: "campaign-launch",
  })

  assert.deepEqual(config, {
    menuExposure: true,
    publicVisible: false,
    workspaceVisible: true,
    bindingTarget: "campaign-launch",
    bindingMode: "existing_runtime",
  })
})

test("readCustomAgentWorkflowArchiveMetadata normalizes workflow archive flags", () => {
  const metadata = readCustomAgentWorkflowArchiveMetadata({
    workflowArchived: true,
    workflowArchivedAt: "2026-06-30T09:10:00.000Z",
  })

  assert.deepEqual(metadata, {
    workflowArchived: true,
    workflowArchivedAt: "2026-06-30T09:10:00.000Z",
  })
})
