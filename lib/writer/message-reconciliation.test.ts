import test from "node:test"
import assert from "node:assert/strict"

import { reconcilePendingWriterMessages } from "./message-reconciliation"

const message = (id: string, role: "user" | "assistant", content: string) => ({ id, role, content })
const pending = {
  prompt: "将上述文章改为英文，图片不变",
  generatingContent: "正在生成草稿...",
  optimisticUserMessageId: "writer_user_new",
  optimisticAssistantMessageId: "writer_assistant_new",
}

test("replaces a stale server answer for the pending prompt with the optimistic loading turn", () => {
  const current = [
    message("user_old", "user", "之前的请求"),
    message("assistant_old", "assistant", "之前的回复"),
    message("writer_user_new", "user", pending.prompt),
    message("writer_assistant_new", "assistant", pending.generatingContent),
  ]
  const server = [
    message("user_old", "user", "之前的请求"),
    message("assistant_old", "assistant", "之前的回复"),
    message("user_540", "user", pending.prompt),
    message("assistant_540", "assistant", "上一条错误回复"),
  ]

  assert.deepEqual(reconcilePendingWriterMessages(server, current, pending), [
    message("user_old", "user", "之前的请求"),
    message("assistant_old", "assistant", "之前的回复"),
    message("user_540", "user", pending.prompt),
    message("writer_assistant_new", "assistant", pending.generatingContent),
  ])
})

test("keeps the optimistic turn when the server has not persisted it yet", () => {
  const current = [
    message("user_old", "user", "之前的请求"),
    message("assistant_old", "assistant", "之前的回复"),
    message("writer_user_new", "user", pending.prompt),
    message("writer_assistant_new", "assistant", pending.generatingContent),
  ]

  assert.deepEqual(reconcilePendingWriterMessages(current.slice(0, 2), current, pending), current)
})
