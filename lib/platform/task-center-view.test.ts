import assert from "node:assert/strict"
import test from "node:test"

import {
  buildNormalizedRuns,
  buildTaskCenterTasks,
  filterTaskCenterTasks,
  formatDuration,
  getRunId,
  type WorkspaceTaskCenterItem,
} from "@/lib/platform/task-center-view"

function makeRun(overrides: Partial<WorkspaceTaskCenterItem> = {}): WorkspaceTaskCenterItem {
  return {
    id: overrides.id ?? 1,
    kind: overrides.kind ?? "workflow",
    itemType: overrides.itemType ?? "workflow",
    itemSlug: overrides.itemSlug ?? "campaign-launch",
    status: overrides.status ?? "succeeded",
    externalSystem: overrides.externalSystem ?? null,
    externalRunId: overrides.externalRunId ?? null,
    startedAt: overrides.startedAt ?? "2026-07-20T10:00:00.000Z",
    finishedAt: overrides.finishedAt ?? "2026-07-20T10:05:00.000Z",
    createdAt: overrides.createdAt ?? "2026-07-20T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-20T10:05:00.000Z",
  }
}

test("buildTaskCenterTasks groups repeated runs under one task and keeps latest execution", () => {
  const runs = buildNormalizedRuns([
    makeRun({
      id: 11,
      itemSlug: "campaign-launch",
      status: "failed",
      updatedAt: "2026-07-19T08:00:00.000Z",
      finishedAt: "2026-07-19T08:04:00.000Z",
    }),
    makeRun({
      id: 12,
      itemSlug: "campaign-launch",
      status: "running",
      finishedAt: null,
      updatedAt: "2026-07-20T09:00:00.000Z",
    }),
    makeRun({
      id: 13,
      itemSlug: "seo-refresh",
      status: "succeeded",
      updatedAt: "2026-07-18T09:00:00.000Z",
    }),
  ])

  const tasks = buildTaskCenterTasks(runs)

  assert.equal(tasks.length, 2)
  assert.equal(tasks[0]?.displayName, "Campaign Launch")
  assert.equal(tasks[0]?.runCount, 2)
  assert.equal(tasks[0]?.normalizedStatus, "running")
  assert.equal(tasks[0]?.failedRunCount, 1)
  assert.equal(tasks[0]?.runningRunCount, 1)
  assert.equal(tasks[0]?.latestRun.id, 12)
  assert.equal(getRunId(tasks[0]!.latestRun), "RUN-00012")
})

test("filterTaskCenterTasks filters by task query and latest task status", () => {
  const tasks = buildTaskCenterTasks(
    buildNormalizedRuns([
      makeRun({
        id: 21,
        itemSlug: "campaign-launch",
        status: "succeeded",
        updatedAt: "2026-07-20T09:00:00.000Z",
      }),
      makeRun({
        id: 22,
        itemSlug: "video-generator",
        kind: "media",
        itemType: "capability",
        status: "failed",
        updatedAt: "2026-07-20T11:00:00.000Z",
      }),
    ]),
  )

  const failedOnly = filterTaskCenterTasks(tasks, {
    query: "",
    status: "failed",
    source: "all",
    dateRange: "7d",
    sort: "newest",
  })
  const queryOnly = filterTaskCenterTasks(tasks, {
    query: "campaign",
    status: "all",
    source: "all",
    dateRange: "7d",
    sort: "newest",
  })

  assert.equal(failedOnly.length, 1)
  assert.equal(failedOnly[0]?.displayName, "Video Generator")
  assert.equal(queryOnly.length, 1)
  assert.equal(queryOnly[0]?.displayName, "Campaign Launch")
})

test("formatDuration keeps task duration display stable", () => {
  assert.equal(formatDuration(305000), "00:05:05")
  assert.equal(formatDuration(null), "00:00:00")
})
