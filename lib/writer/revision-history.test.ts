import { strict as assert } from "node:assert"
import test from "node:test"

import { listWriterRevisionHistory, selectLatestWriterRevision } from "./revision-history"

test("revision history excludes pending and legacy messages and keeps one item per revision", () => {
  const items = [
    { id: "pending", role: "assistant" as const, content: "正在生成", revision: null },
    { id: "legacy", role: "assistant" as const, content: "旧文章" },
    { id: "r2-old", role: "assistant" as const, content: "旧修订", revision: 2 },
    { id: "r1", role: "assistant" as const, content: "第一版", revision: 1 },
    { id: "r2-active", role: "assistant" as const, content: "第二版", revision: 2, isActiveDraft: true },
    { id: "user", role: "user" as const, content: "继续修改", revision: 3 },
  ]

  assert.deepEqual(listWriterRevisionHistory(items).map((item) => [item.revision, item.id]), [
    [1, "r1"],
    [2, "r2-active"],
  ])
})

test("active revision is the default, with latest validated fallback", () => {
  const items = [
    { id: "r1", role: "assistant" as const, content: "第一版", revision: 1 },
    { id: "r2", role: "assistant" as const, content: "第二版", revision: 2 },
  ]

  assert.equal(selectLatestWriterRevision(items, 1)?.id, "r1")
  assert.equal(selectLatestWriterRevision(items, 99)?.id, "r2")
  assert.equal(selectLatestWriterRevision([], 1), null)
})
