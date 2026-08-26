import assert from "node:assert/strict"
import test from "node:test"

import { resolveTaskEntryHref } from "@/lib/platform/task-entry-routing"
import type { TaskEntryTask } from "@/lib/platform/task-entry-routing"

function task(input: Partial<TaskEntryTask> = {}): TaskEntryTask {
  return {
    source: "tool" as const,
    itemType: "tool",
    itemSlug: "tool-slug",
    latestRun: {
      id: 42,
      externalRunId: null,
    },
    ...input,
  }
}

test("task entry routing opens workflow results instead of generic task details", () => {
  assert.equal(
    resolveTaskEntryHref(task({ source: "workflow", itemType: "workflow", itemSlug: "brand-workflow" })),
    "/dashboard/workflows/runs/42",
  )
})

test("task entry routing restores media feature and platform run", () => {
  assert.equal(
    resolveTaskEntryHref(task({ source: "media", itemType: "capability", itemSlug: "text-to-video" })),
    "/dashboard/video?feature=text-to-video&runId=42",
  )
  assert.equal(
    resolveTaskEntryHref(task({ source: "media", itemType: "capability", itemSlug: "voice-synthesis" })),
    "/dashboard/capabilities?feature=voice-synthesis&runId=42",
  )
})

test("session-backed agent tasks open their feature session", () => {
  assert.equal(
    resolveTaskEntryHref(
      task({
        source: "agent",
        itemType: "ai_entry_opencode",
        itemSlug: "conversation-123",
        latestRun: { id: 42, externalRunId: "runtime-123" },
      }),
    ),
    "/dashboard/ai/conversation-123",
  )
  assert.equal(
    resolveTaskEntryHref(
      task({
        source: "agent",
        itemType: "writer_asset",
        itemSlug: "writer-session-123",
      }),
    ),
    "/dashboard/writer/writer-session-123",
  )
})

test("agent runs without a session and tools keep their task result page", () => {
  assert.equal(
    resolveTaskEntryHref(
      task({
        source: "agent",
        itemType: "ai_entry_opencode",
        itemSlug: "runtime-123",
        latestRun: { id: 42, externalRunId: "runtime-123" },
      }),
    ),
    "/dashboard/tasks/42",
  )
  assert.equal(resolveTaskEntryHref(task()), "/dashboard/tasks/42")
})
