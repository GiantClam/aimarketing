import assert from "node:assert/strict"
import test from "node:test"

import { parseAiEntryTaskRunSummary } from "./task-runs"

test("parseAiEntryTaskRunSummary normalizes a running PPT preview task", () => {
  const summary = parseAiEntryTaskRunSummary({
    id: 901,
    status: "running",
    payload: JSON.stringify({
      kind: "ai_entry_ppt_preview",
      conversationId: "42",
      agentId: "executive-ppt",
      isZh: true,
      input: {
        title: "季度经营复盘",
        templateId: "deck-china-telecom",
      },
    }),
    result: JSON.stringify({
      stage: "variant_generating",
      stageLabel: "正在生成预览方向",
      progressCurrent: 2,
      progressTotal: 5,
      events: [
        {
          type: "background_generation_running",
          label: "正在生成预览",
          status: "running",
          at: 1_720_000_000,
        },
      ],
    }),
    createdAt: new Date("2024-01-02T03:05:09.000Z"),
    updatedAt: new Date("2024-01-02T03:05:19.000Z"),
    startedAt: new Date("2024-01-02T03:05:10.000Z"),
  })

  assert.ok(summary)
  assert.equal(summary?.task_id, "901")
  assert.equal(summary?.stage, "variant_generating")
  assert.equal(summary?.stage_label, "正在生成预览方向")
  assert.equal(summary?.request_label, "季度经营复盘")
  assert.equal(summary?.selected_template_id, "deck-china-telecom")
  assert.equal(summary?.selected_template_label, "中国电信")
  assert.equal(summary?.events.length, 1)
})

test("parseAiEntryTaskRunSummary infers a failed terminal stage", () => {
  const summary = parseAiEntryTaskRunSummary({
    id: 902,
    status: "failed",
    payload: {
      kind: "ai_entry_ppt_preview",
      conversationId: "42",
      agentId: "executive-ppt",
      isZh: false,
    },
    result: {
      error: "ppt_preview_failed",
    },
    createdAt: new Date("2024-01-02T03:05:09.000Z"),
    updatedAt: new Date("2024-01-02T03:06:19.000Z"),
  })

  assert.ok(summary)
  assert.equal(summary?.stage, "variant_generating")
  assert.equal(summary?.stage_label, "Preview failed")
  assert.equal(summary?.progress_current, 2)
  assert.equal(summary?.error, "ppt_preview_failed")
})
