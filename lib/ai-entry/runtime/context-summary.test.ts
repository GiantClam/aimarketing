import assert from "node:assert/strict"
import test from "node:test"

import { buildPersistedConversationSummary } from "./context-summary"

test("persists a bounded structured summary while leaving the newest four turns to the window", () => {
  const messages = Array.from({ length: 20 }, (_, index) => ({
    role: index % 2 === 0 ? "user" as const : "assistant" as const,
    content: `${index === 0 ? "用户目标：" : ""}${"内容 ".repeat(500)}${index}`,
  }))
  const summary = buildPersistedConversationSummary(messages)
  assert.ok(summary)
  assert.match(summary, /用户目标/u)
  assert.match(summary, /已完成工作/u)
  assert.match(summary, /当前文件\/PPT 状态/u)
  assert.ok(summary.length <= 12_000)
})

test("returns no summary before the history needs compaction", () => {
  assert.equal(buildPersistedConversationSummary([
    { role: "user", content: "当前请求" },
    { role: "assistant", content: "当前响应" },
  ]), null)
})
