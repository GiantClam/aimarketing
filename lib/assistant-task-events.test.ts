import assert from "node:assert/strict"
import test from "node:test"

import { settlePendingTaskEvents, type PendingTaskEvent } from "./assistant-task-events"

const events: PendingTaskEvent[] = [
  { type: "provider", label: "模型路由", status: "running", at: 1 },
  { type: "runtime:render", label: "PPT Agent 过程", status: "running", at: 2 },
  { type: "response", label: "Response complete", status: "completed", at: 3 },
  { type: "warning", label: "Warning", status: "info", at: 4 },
]

test("settles stale running task events at a terminal response", () => {
  assert.deepEqual(
    settlePendingTaskEvents(events),
    [
      { ...events[0], status: "completed" },
      { ...events[1], status: "completed" },
      events[2],
      events[3],
    ],
  )
})

test("can mark running events failed without changing informational events", () => {
  assert.deepEqual(
    settlePendingTaskEvents(events, "failed"),
    [
      { ...events[0], status: "failed" },
      { ...events[1], status: "failed" },
      events[2],
      events[3],
    ],
  )
})
