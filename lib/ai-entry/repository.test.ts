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

test("generic AI entry title filters exclude agent-scoped conversations", async () => {
  const { getAiEntryConversationTitleFilters } = await import("./repository")

  assert.deepEqual(
    getAiEntryConversationTitleFilters("chat", null),
    {
      titlePrefix: "[ai-entry] ",
      excludeAgentPrefix: "[ai-entry] [agent:",
    },
  )
})

test("agent AI entry title filters only include the requested agent scope", async () => {
  const { getAiEntryConversationTitleFilters } = await import("./repository")

  assert.deepEqual(
    getAiEntryConversationTitleFilters("chat", "executive-ppt"),
    {
      titlePrefix: "[ai-entry] [agent:executive-ppt] ",
      excludeAgentPrefix: null,
    },
  )
})

test("agent conversations use the first user prompt as title on first turn", async () => {
  const { resolveAiEntryConversationTitleUpdate } = await import("./repository")

  assert.equal(
    resolveAiEntryConversationTitleUpdate({
      currentTitle: "[ai-entry] [agent:executive-growth] 增长顾问",
      userPrompt: "请分析增长问题",
      existingMessageCount: 0,
      scope: "chat",
      agentId: "executive-growth",
    }),
    "[ai-entry] [agent:executive-growth] 请分析增长问题",
  )
})

test("non-agent conversations still retitle from first prompt", async () => {
  const { resolveAiEntryConversationTitleUpdate } = await import("./repository")

  assert.equal(
    resolveAiEntryConversationTitleUpdate({
      currentTitle: "[ai-entry] New chat",
      userPrompt: "帮我起草一封邮件给客户",
      existingMessageCount: 0,
      scope: "chat",
      agentId: null,
    }),
    "[ai-entry] 帮我起草一封邮件给客户",
  )
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
  assert.deepEqual(page.conversation_state, {
    ppt: {
      latestPreview: null,
      latestExport: null,
      phase: "idle",
    },
  })
})

test("AI entry message history returns structured conversation state", async () => {
  const { listAiEntryMessages } = await import("./repository")

  selectRowsQueue = [
    [
      {
        id: 42,
        title: "[ai-entry] [agent:executive-ppt] PPT plan",
        currentModelId: "gpt-5",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      },
    ],
  ]
  executeRows = [
    {
      id: 101,
      role: "assistant",
      content:
        "已生成 PPT 预览：\n<!-- ai-entry-ppt-preview-context:{\"previewSessionId\":\"preview-session-1\",\"defaultVariantKey\":\"variant-b\",\"variantKeys\":[\"variant-a\",\"variant-b\"]} -->",
      createdAt: new Date("2024-01-02T03:04:09.000Z"),
    },
    {
      id: 102,
      role: "assistant",
      content:
        "已生成 PPT 成品：\n<!-- ai-entry-ppt-export-context:{\"previewSessionId\":\"preview-session-1\",\"selectedVariantKey\":\"variant-b\",\"artifactId\":118} -->",
      createdAt: new Date("2024-01-02T03:05:09.000Z"),
    },
  ]

  const page = await listAiEntryMessages(
    7,
    "42",
    200,
    "chat",
    "executive-ppt",
  )

  assert.ok(page)
  assert.deepEqual(page.conversation_state, {
    ppt: {
      latestPreview: {
        previewSessionId: "preview-session-1",
        defaultVariantKey: "variant-b",
        variantKeys: ["variant-a", "variant-b"],
      },
      latestExport: {
        previewSessionId: "preview-session-1",
        selectedVariantKey: "variant-b",
        artifactId: 118,
      },
      phase: "exported",
    },
  })
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
