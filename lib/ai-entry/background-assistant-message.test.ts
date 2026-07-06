import assert from "node:assert/strict"
import test from "node:test"

import { buildBackgroundAssistantCompletionMessage } from "./background-assistant-message"

test("background completion prefers structured preview content over stale assistant text", () => {
  const message = buildBackgroundAssistantCompletionMessage({
    pendingTaskId: "401",
    assistantText: "好的，用瑞士网格。现在生成预览。",
    toolName: "preview_ppt_deck",
    toolResult: {
      ok: true,
      previewSessionId: "preview-session-401",
      title: "董事会经营复盘",
      recommendedVariantKey: "variant-a",
      variants: [{ key: "variant-a", name: "Variant A" }],
    },
    resultParts: [],
    isZh: true,
  })

  assert.ok(message)
  assert.match(message?.content || "", /已生成 PPT 预览：/)
  assert.match(message?.content || "", /preview-session-401/)
})

test("background completion keeps queued status text when no final preview payload exists yet", () => {
  const message = buildBackgroundAssistantCompletionMessage({
    pendingTaskId: "402",
    assistantText: "已切换为后台生成：\n- 任务 ID: 402\n- 状态: 系统会持续轮询，完成后自动回填预览结果。",
    toolName: "preview_ppt_deck",
    toolResult: {
      ok: true,
      status: "queued",
      backgroundTask: {
        taskId: "402",
      },
    },
    resultParts: [],
    isZh: true,
  })

  assert.ok(message)
  assert.match(message?.content || "", /已切换为后台生成：/)
  assert.doesNotMatch(message?.content || "", /已生成 PPT 预览：/)
})
