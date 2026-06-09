import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let selectRowsQueue: unknown[][] = []
let executeRows: unknown[] = []

function nextSelectRows() {
  return Promise.resolve(selectRowsQueue.shift() || [])
}

const dbChain = {
  from() {
    return dbChain
  },
  leftJoin() {
    return dbChain
  },
  where() {
    return dbChain
  },
  groupBy() {
    return dbChain
  },
  orderBy() {
    return dbChain
  },
  limit() {
    return nextSelectRows()
  },
}

const fakeDb = {
  select() {
    return dbChain
  },
  execute() {
    return Promise.resolve({ rows: executeRows })
  },
}

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "@/lib/db") {
    return { db: fakeDb }
  }
  return originalLoad.call(this, request, parent, isMain)
}

test.after(() => {
  nodeModule._load = originalLoad
})

test("AI entry message history preserves database timestamps", async () => {
  const { listAiEntryMessages } = await import("./repository")
  const conversationCreatedAt = new Date("2024-01-01T00:00:00.000Z")
  const userCreatedAt = new Date("2024-01-02T03:04:05.000Z")
  const assistantCreatedAt = new Date("2024-01-02T03:04:09.000Z")

  selectRowsQueue = [
    [
      {
        id: 42,
        title: "[ai-entry] [agent:business-recruitment-specialist] Hiring plan",
        currentModelId: "gpt-5",
        createdAt: conversationCreatedAt,
      },
    ],
  ]
  executeRows = [
    { id: 100, role: "user", content: "Need a recruiter scorecard", createdAt: userCreatedAt },
    { id: 101, role: "assistant", content: "Here is a scorecard", createdAt: assistantCreatedAt },
  ]

  const page = await listAiEntryMessages(
    7,
    "42",
    200,
    "chat",
    "business-recruitment-specialist",
  )

  assert.ok(page)
  assert.deepEqual(
    page.data.map((message) => message.created_at),
    [
      Math.floor(userCreatedAt.getTime() / 1000),
      Math.floor(assistantCreatedAt.getTime() / 1000),
    ],
  )
})

test("AI entry conversation history uses latest message time as updated_at", async () => {
  const { listAiEntryConversations } = await import("./repository")
  const createdAt = new Date("2024-01-01T00:00:00.000Z")
  const latestMessageCreatedAt = new Date("2024-01-05T08:30:00.000Z")

  selectRowsQueue = [
    [
      {
        id: 42,
        title: "[ai-entry] [agent:business-recruitment-specialist] Hiring plan",
        currentModelId: "gpt-5",
        createdAt,
        latestMessageCreatedAt,
      },
    ],
  ]
  executeRows = []

  const page = await listAiEntryConversations(
    7,
    20,
    null,
    "chat",
    "business-recruitment-specialist",
  )

  assert.equal(page.data[0]?.created_at, Math.floor(createdAt.getTime() / 1000))
  assert.equal(page.data[0]?.updated_at, Math.floor(latestMessageCreatedAt.getTime() / 1000))
  assert.equal(page.data[0]?.name, "Hiring plan")
})
