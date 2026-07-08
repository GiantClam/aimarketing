import assert from "node:assert/strict"
import test from "node:test"

import {
  AI_ENTRY_CONVERSATION_SUMMARY_POLL_BLURRED_INTERVAL_MS,
  AI_ENTRY_CONVERSATION_SUMMARY_POLL_FOCUSED_INTERVAL_MS,
  AI_ENTRY_TASK_POLL_BLURRED_INTERVAL_MS,
  AI_ENTRY_TASK_POLL_FOCUSED_INTERVAL_MS,
  getAiEntryTaskElapsedSeconds,
  isAiEntryTaskHeartbeatStale,
  resolveAiEntryConversationSummaryPollIntervalMs,
  resolveAiEntryTaskPollIntervalMs,
} from "./task-run-runtime"

test("task polling interval follows page visibility", () => {
  assert.equal(
    resolveAiEntryTaskPollIntervalMs({ isDocumentVisible: true }),
    AI_ENTRY_TASK_POLL_FOCUSED_INTERVAL_MS,
  )
  assert.equal(
    resolveAiEntryTaskPollIntervalMs({ isDocumentVisible: false }),
    AI_ENTRY_TASK_POLL_BLURRED_INTERVAL_MS,
  )
})

test("conversation summary polling interval follows page visibility", () => {
  assert.equal(
    resolveAiEntryConversationSummaryPollIntervalMs({ isDocumentVisible: true }),
    AI_ENTRY_CONVERSATION_SUMMARY_POLL_FOCUSED_INTERVAL_MS,
  )
  assert.equal(
    resolveAiEntryConversationSummaryPollIntervalMs({ isDocumentVisible: false }),
    AI_ENTRY_CONVERSATION_SUMMARY_POLL_BLURRED_INTERVAL_MS,
  )
})

test("task elapsed seconds uses started time for running tasks", () => {
  assert.equal(
    getAiEntryTaskElapsedSeconds(
      {
        created_at: 100,
        started_at: 110,
        updated_at: 120,
        finished_at: null,
        status: "running",
      },
      150_000,
    ),
    40,
  )
})

test("task heartbeat stale check only applies to active tasks", () => {
  assert.equal(
    isAiEntryTaskHeartbeatStale(
      {
        status: "running",
        last_heartbeat_at: 100,
        updated_at: 100,
      },
      146_000,
    ),
    true,
  )
  assert.equal(
    isAiEntryTaskHeartbeatStale(
      {
        status: "success",
        last_heartbeat_at: 100,
        updated_at: 100,
      },
      146_000,
    ),
    false,
  )
})
