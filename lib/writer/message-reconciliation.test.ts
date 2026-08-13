import test from "node:test"
import assert from "node:assert/strict"

import { hasCompletedPendingWriterResponse, reconcilePendingWriterMessages } from "./message-reconciliation"

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

test("infers the pending prompt before the task store entry exists", () => {
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

  assert.deepEqual(
    reconcilePendingWriterMessages(server, current, {
      prompt: "",
      generatingContent: pending.generatingContent,
    }),
    [
      message("user_old", "user", "之前的请求"),
      message("assistant_old", "assistant", "之前的回复"),
      message("user_540", "user", pending.prompt),
      message("writer_assistant_new", "assistant", pending.generatingContent),
    ],
  )
})

test("recognizes a completed server response persisted before task status recovery", () => {
  assert.equal(
    hasCompletedPendingWriterResponse(
      [
        {
          role: "assistant",
          query: pending.prompt,
          answer: "这是一篇已经落库的完整草稿，应该解除本地生成中状态。",
          created_at: 1_000,
        },
      ],
      {
        prompt: pending.prompt,
        generatingContent: pending.generatingContent,
        taskCreatedAt: 1_000_000,
      },
    ),
    true,
  )
  assert.equal(
    hasCompletedPendingWriterResponse(
      [
        {
          role: "assistant",
          query: pending.prompt,
          answer: "Request failed: transient database error",
          created_at: 1_000,
        },
      ],
      {
        prompt: pending.prompt,
        generatingContent: pending.generatingContent,
        taskCreatedAt: 1_000_000,
      },
    ),
    false,
  )
})
