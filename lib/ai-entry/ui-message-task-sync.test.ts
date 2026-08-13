import assert from "node:assert/strict"
import test from "node:test"

import { createAiEntryUIMessageFromParts } from "@/lib/ai-entry/ui-message"
import { mergeTaskRunSummariesIntoMessages } from "@/lib/ai-entry/ui-message-task-sync"

test("replaces a persisted queued task snapshot with its terminal summary", () => {
  const messages = [createAiEntryUIMessageFromParts({
    id: "assistant-1",
    role: "assistant",
    text: "任务已提交",
    parts: [{
      type: "task-run",
      id: "task-680",
      taskRun: {
        task_id: "680",
        status: "pending",
        task_type: "opencode_agent_run",
        conversation_id: "486",
        agent_id: "executive-ppt",
        created_at: 100,
        updated_at: 100,
        started_at: null,
        stage: "runtime_queued",
        stage_label: "任务已排队",
        progress_current: 0,
        progress_total: 4,
        last_heartbeat_at: 100,
        finished_at: null,
        preview_session_id: null,
        request_label: null,
        result_summary: null,
        selected_template_id: null,
        selected_template_label: null,
        error_code: null,
        error_message: null,
        error: null,
        events: [],
      },
    }],
  })]

  const updated = mergeTaskRunSummariesIntoMessages(messages, [{
    task_id: "680",
    status: "failed",
    stage: "runtime_running",
    stage_label: "智能体任务失败",
    error: "runtime_context_hash_mismatch",
    error_message: "runtime_context_hash_mismatch",
  }])

  const taskPart = updated[0]?.parts[0]
  assert.equal(taskPart?.type, "data-task-run")
  if (taskPart?.type === "data-task-run") {
    assert.equal(taskPart.data.taskRun.status, "failed")
    assert.equal(taskPart.data.taskRun.error, "runtime_context_hash_mismatch")
    assert.equal(taskPart.data.taskRun.progress_total, 4)
  }
})
